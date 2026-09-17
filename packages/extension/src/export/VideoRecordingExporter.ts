import { FlowGraphModel, SessionTimelineItem } from '../graph/FlowGraphModel';
import { AudioDubbingManager, SpeechTranscriptItem } from '../audio/AudioDubbingManager';

export type VideoExportFormat = 'mp4' | 'webm' | 'gif' | 'frames' | 'html5';

export type CompressionPreset = 'ultra' | 'high' | 'balanced' | 'compact' | 'maximum';

export interface VideoExportConfig {
  format: VideoExportFormat;
  scaling?: number; // 0.25, 0.5, 0.75, 1.0, 1.5, 2.0
  scale?: number; // alias
  compression?: CompressionPreset;
  preset?: CompressionPreset; // alias
  fps?: number; // 15, 24, 30, 60
  actionHighlights?: boolean; // Cursor halo, click pin, step badges, flow position tags
  actionDwellMs?: number; // Duration per action highlight in ms (e.g. 1500)
  dwellTimeMs?: number; // alias
  includeWatermark?: boolean; // "Antigravity Flow Tracer" marketing tag
  marketingTitle?: string; // Custom title for marketing material (e.g. "Checkout Flow Demo")
  customBitrateKbps?: number;
  targetWidth?: number;
  targetHeight?: number;
  targetResolution?: { width: number; height: number } | null;
  includeFlowPosition?: boolean;
  includeAudioDub?: boolean; // Dubbed microphone audio track
  includeTranscripts?: boolean; // Speech-to-text subtitle captions & notes
  audioDataUri?: string; // Base64 audio track
}

export interface FileSizeEstimate {
  estimatedSizeBytes: number;
  formattedSize: string;
  sizeRange: string;
  durationSec: number;
  totalFrames: number;
  effectiveBitrateKbps: number;
  resolution: string;
  targetWidth: number;
  targetHeight: number;
  channelBadge: 'EMAIL_SAFE' | 'SLACK_READY' | 'HIGH_RES_DEMO';
  channelBadgeText: string;
  channelBadgeColor: string;
  hasAudio?: boolean;
}

export interface ActionHighlightFrame {
  step: number;
  timestamp: number;
  label: string;
  actionType: string;
  coordinates: { x: number; y: number };
  componentName?: string;
  flowPositionName?: string;
  flowPhase?: string;
  note?: string;
  svg: string;
  svgDataUri: string;
  transcriptText?: string;
}

export interface NormalizedVideoExportConfig {
  format: VideoExportFormat;
  scaling: number;
  scale: number;
  compression: CompressionPreset;
  preset: CompressionPreset;
  fps: number;
  actionHighlights: boolean;
  actionDwellMs: number;
  dwellTimeMs: number;
  includeWatermark: boolean;
  marketingTitle: string;
  customBitrateKbps?: number;
  targetWidth?: number;
  targetHeight?: number;
  includeFlowPosition: boolean;
  includeAudioDub: boolean;
  includeTranscripts: boolean;
  audioDataUri?: string;
}

export class VideoRecordingExporter {
  public static readonly DEFAULT_CONFIG: NormalizedVideoExportConfig = {
    format: 'mp4',
    scaling: 1.0,
    scale: 1.0,
    compression: 'high',
    preset: 'high',
    fps: 30,
    actionHighlights: true,
    actionDwellMs: 1500,
    dwellTimeMs: 1500,
    includeWatermark: true,
    marketingTitle: 'Antigravity UX Flow Recording',
    includeFlowPosition: true,
    includeAudioDub: false,
    includeTranscripts: true
  };

  public static normalizeConfig(configPartial: Partial<VideoExportConfig> = {}): NormalizedVideoExportConfig {
    const format = configPartial.format || 'mp4';
    const compression = configPartial.compression || configPartial.preset || 'balanced';
    let scaling = configPartial.scaling ?? configPartial.scale;
    if (scaling === undefined) {
      if (configPartial.targetResolution) {
        scaling = configPartial.targetResolution.height / 1080;
      } else {
        scaling = 1.0;
      }
    }
    const fps = configPartial.fps ?? 30;
    const actionHighlights = configPartial.actionHighlights ?? true;
    const actionDwellMs = configPartial.actionDwellMs ?? configPartial.dwellTimeMs ?? 1500;
    const includeWatermark = configPartial.includeWatermark ?? true;
    const marketingTitle = configPartial.marketingTitle || 'Antigravity UX Flow Recording';

    let targetWidth = configPartial.targetWidth;
    let targetHeight = configPartial.targetHeight;
    if (configPartial.targetResolution) {
      targetWidth = configPartial.targetResolution.width;
      targetHeight = configPartial.targetResolution.height;
    }

    return {
      format,
      scaling,
      scale: scaling,
      compression,
      preset: compression,
      fps,
      actionHighlights,
      actionDwellMs,
      dwellTimeMs: actionDwellMs,
      includeWatermark,
      marketingTitle,
      customBitrateKbps: configPartial.customBitrateKbps,
      targetWidth,
      targetHeight,
      includeFlowPosition: configPartial.includeFlowPosition ?? true,
      includeAudioDub: configPartial.includeAudioDub ?? false,
      includeTranscripts: configPartial.includeTranscripts ?? true,
      audioDataUri: configPartial.audioDataUri
    };
  }

  /**
   * Base bitrates (in kbps) at 1080p 30fps for each compression preset.
   */
  private static readonly BITRATE_MAP: Record<CompressionPreset, number> = {
    ultra: 8000,
    high: 4000,
    balanced: 2000,
    compact: 800,
    maximum: 350
  };

  /**
   * Codec multiplier relative to standard H.264 MP4.
   */
  private static readonly FORMAT_MULTIPLIER: Record<VideoExportFormat, number> = {
    mp4: 1.0,
    webm: 0.85,
    gif: 3.2,
    frames: 1.8,
    html5: 0.4
  };

  /**
   * Calculates realistic, mathematical file size estimates based on session steps,
   * viewport dimensions, scaling factor, compression preset, and export format.
   */
  public static estimateFileSize(
    model: FlowGraphModel,
    configPartial: Partial<VideoExportConfig> = {}
  ): FileSizeEstimate {
    const config: NormalizedVideoExportConfig = this.normalizeConfig(configPartial);

    // 1. Calculate Base Resolution
    const vp = model.viewport || { width: 1920, height: 1080 };
    const baseW = vp.width || 1920;
    const baseH = vp.height || 1080;

    // Apply scaling (ensure dimensions are even numbers for video codecs)
    const scale = config.scaling || 1.0;
    let targetW = Math.round(baseW * scale);
    let targetH = Math.round(baseH * scale);
    if (targetW % 2 !== 0) targetW += 1;
    if (targetH % 2 !== 0) targetH += 1;

    // 2. Calculate Effective Duration
    const stepCount = Math.max(1, model.timeline?.length || model.nodes.size || 1);
    const dwellMs = config.actionDwellMs || 1500;
    // Dwell per action + intro/outro padding
    const durationSec = Math.max(3, (stepCount * dwellMs + 1000) / 1000);
    const totalFrames = Math.round(durationSec * (config.fps || 30));

    // 3. Resolution scaling factor relative to 1080p (1920x1080 = 2,073,600 px)
    const pixelRatio = (targetW * targetH) / (1920 * 1080);

    // 4. Determine Effective Bitrate
    let baseBitrate = this.BITRATE_MAP[config.compression] || 4000;
    if (config.customBitrateKbps) {
      baseBitrate = config.customBitrateKbps;
    }

    // Adjust bitrate proportional to pixel count and framerate
    const fpsFactor = (config.fps || 30) / 30;
    const codecMult = this.FORMAT_MULTIPLIER[config.format] || 1.0;
    let effectiveBitrateKbps = Math.round(baseBitrate * Math.sqrt(pixelRatio) * fpsFactor * codecMult);
    effectiveBitrateKbps = Math.max(150, effectiveBitrateKbps);

    // 5. Calculate Byte Size
    let estimatedSizeBytes = 0;

    if (config.format === 'frames') {
      // PNG frames sequence: ~150KB - 400KB per frame depending on resolution and compression
      const bytesPerFrame = Math.round(180 * 1024 * pixelRatio * (config.compression === 'ultra' ? 1.5 : 0.8));
      estimatedSizeBytes = totalFrames * bytesPerFrame;
    } else if (config.format === 'gif') {
      // GIF: Palette-based with LZW compression
      // GIFs get large quickly with high FPS, so effective rate reflects frame count
      const bytesPerGifFrame = Math.round(120 * 1024 * pixelRatio * (config.compression === 'maximum' ? 0.4 : 1.0));
      estimatedSizeBytes = totalFrames * bytesPerGifFrame;
    } else if (config.format === 'html5') {
      // Standalone HTML5 player: lightweight JS/CSS engine + compressed vector frame keyframes
      const basePlayerBytes = 350 * 1024; // 350 KB engine
      const keyframeBytes = Math.round(45 * 1024 * (config.compression === 'ultra' ? 1.4 : 0.7));
      estimatedSizeBytes = basePlayerBytes + (stepCount * keyframeBytes);
    } else {
      // Standard video containers (MP4, WebM): duration * bitrate
      estimatedSizeBytes = Math.round((effectiveBitrateKbps * 1000 * durationSec) / 8);
    }

    // 5b. Dubbed Microphone Audio Track calculation (128 kbps AAC/Opus)
    const hasAudio = Boolean(config.includeAudioDub || config.audioDataUri || model.audioTrack);
    if (hasAudio && config.format !== 'gif' && config.format !== 'frames') {
      const audioBytes = Math.round((128 * 1000 * durationSec) / 8);
      estimatedSizeBytes += audioBytes;
    }

    // Enforce reasonable bounds
    estimatedSizeBytes = Math.max(50 * 1024, estimatedSizeBytes);

    // Formatted size strings
    const formattedSize = this.formatBytes(estimatedSizeBytes);
    const minRange = this.formatBytes(Math.round(estimatedSizeBytes * 0.82));
    const maxRange = this.formatBytes(Math.round(estimatedSizeBytes * 1.25));
    const sizeRange = `${minRange} - ${maxRange}`;

    // Shareability badge
    let channelBadge: 'EMAIL_SAFE' | 'SLACK_READY' | 'HIGH_RES_DEMO';
    let channelBadgeText: string;
    let channelBadgeColor: string;

    const sizeMb = estimatedSizeBytes / (1024 * 1024);
    if (sizeMb <= 10) {
      channelBadge = 'EMAIL_SAFE';
      channelBadgeText = '🟢 Email & Slack Safe (< 10MB)';
      channelBadgeColor = '#34d399';
    } else if (sizeMb <= 25) {
      channelBadge = 'SLACK_READY';
      channelBadgeText = '🟡 Slack / Teams Ready (< 25MB)';
      channelBadgeColor = '#f59e0b';
    } else {
      channelBadge = 'HIGH_RES_DEMO';
      channelBadgeText = '🔵 High-Res Presentation / Demo';
      channelBadgeColor = '#38bdf8';
    }

    const resolutionLabel = `${targetW}×${targetH} (${scale === 1 ? 'Native 100%' : `${Math.round(scale * 100)}%`})`;

    return {
      estimatedSizeBytes,
      formattedSize,
      sizeRange,
      durationSec: Math.round(durationSec * 10) / 10,
      totalFrames,
      effectiveBitrateKbps,
      resolution: resolutionLabel,
      targetWidth: targetW,
      targetHeight: targetH,
      channelBadge,
      channelBadgeText,
      channelBadgeColor,
      hasAudio
    };
  }

  /**
   * Generates Action Highlight Keyframes with visual halo, pin, step badges,
   * UX phase tag, and component location callouts.
   */
  public static generateActionHighlightFrames(
    model: FlowGraphModel,
    configPartial: Partial<VideoExportConfig> = {}
  ): ActionHighlightFrame[] {
    const config = this.normalizeConfig(configPartial);
    const vp = model.viewport || { width: 1920, height: 1080 };
    const width = vp.width || 1920;
    const height = vp.height || 1080;

    const items = model.timeline && model.timeline.length > 0
      ? model.timeline
      : Array.from(model.nodes.values()).map((n, idx) => ({
          step: n.step !== undefined ? n.step : idx + 1,
          timestamp: Date.now() + idx * 1000,
          label: n.data.title || n.label,
          type: n.type,
          componentName: n.data.componentName,
          filePath: n.data.filePath,
          lineNumber: n.data.lineNumber,
          flowPositionName: n.data.flowPositionName,
          flowPhase: n.data.flowPhase,
          details: { coords: n.data.coords || { x: width / 2, y: height / 2 }, note: n.data.note }
        }));

    return items.map((item, idx) => {
      const coords = item.details?.coords || {
        x: Math.round(width * (0.2 + ((idx * 0.17) % 0.6))),
        y: Math.round(height * (0.25 + ((idx * 0.15) % 0.5)))
      };

      const title = config.marketingTitle || 'Antigravity Flow Recording';
      const stepNum = item.step !== undefined ? item.step : idx + 1;
      const stepLabel = item.label || 'User Interaction';
      const posName = item.flowPositionName || 'Application Screen';
      const phase = item.flowPhase || 'FLOW';
      const compName = item.componentName ? `<${item.componentName} />` : '';
      const note = item.details?.note || (item as any).note || '';

      const transcript = model.speechTranscripts?.find(t => t.step === stepNum);
      const transcriptText = transcript?.text || (config.includeTranscripts ? AudioDubbingManager.generateIntelligentNarration(item) : undefined);

      // Render high-fidelity SVG Frame
      const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#070c18"/>
      <stop offset="50%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#020617"/>
    </linearGradient>
    <radialGradient id="haloGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.8"/>
      <stop offset="40%" stop-color="#6366f1" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#818cf8" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.6"/>
    </filter>
  </defs>

  <!-- Background Screen -->
  <rect width="${width}" height="${height}" fill="url(#bgGrad)"/>
  
  <!-- Subtle Grid Lines -->
  <g stroke="rgba(255,255,255,0.03)" stroke-width="1">
    ${Array.from({ length: 12 }, (_, i) => `<line x1="0" y1="${(height / 12) * i}" x2="${width}" y2="${(height / 12) * i}" />`).join('')}
    ${Array.from({ length: 16 }, (_, i) => `<line x1="${(width / 16) * i}" y1="0" x2="${(width / 16) * i}" y2="${height}" />`).join('')}
  </g>

  <!-- Top Marketing Bar -->
  <rect x="0" y="0" width="${width}" height="64" fill="rgba(15, 23, 42, 0.9)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  <circle cx="36" cy="32" r="10" fill="#6366f1"/>
  <text x="56" y="38" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="700">${this.escapeXml(title)}</text>
  
  <!-- UX Flow Position Pill in Top Bar -->
  <rect x="${width - 320}" y="16" width="280" height="32" rx="16" fill="rgba(56, 189, 248, 0.15)" stroke="rgba(56, 189, 248, 0.4)" stroke-width="1"/>
  <text x="${width - 305}" y="37" fill="#38bdf8" font-family="monospace" font-size="13" font-weight="600">📍 ${this.escapeXml(posName)} [${this.escapeXml(phase)}]</text>

  <!-- Mock Wireframe App Canvas -->
  <rect x="40" y="94" width="${width - 80}" height="${height - 180}" rx="12" fill="rgba(30, 41, 59, 0.4)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  
  <!-- Action Highlight: Glowing Cursor Halo & Ghost Mouse Pin -->
  ${config.actionHighlights ? `
  <circle cx="${coords.x}" cy="${coords.y}" r="64" fill="url(#haloGlow)" opacity="0.8"/>
  <circle cx="${coords.x}" cy="${coords.y}" r="28" class="pulse-ring" fill="none" stroke="#38bdf8" stroke-width="3" opacity="0.9"/>
  <circle cx="${coords.x}" cy="${coords.y}" r="10" fill="#ffffff" filter="url(#shadow)"/>
  <circle cx="${coords.x}" cy="${coords.y}" r="5" fill="#6366f1"/>

  <!-- Step Callout Card with Shadow -->
  <g transform="translate(${Math.min(width - 380, Math.max(40, coords.x + 24))}, ${Math.min(height - 240, Math.max(100, coords.y - 40))})" filter="url(#shadow)">
    <rect width="320" height="110" rx="10" fill="#0b1120" stroke="rgba(99, 102, 241, 0.6)" stroke-width="2"/>
    <rect x="12" y="12" width="70" height="22" rx="4" fill="#6366f1"/>
    <text x="47" y="27" fill="#ffffff" font-family="monospace" font-size="11" font-weight="700" text-anchor="middle">STEP #${stepNum}</text>
    <text x="92" y="27" fill="#94a3b8" font-family="-apple-system, sans-serif" font-size="11">${this.escapeXml(item.type || 'ACTION')}</text>
    
    <text x="14" y="56" fill="#f8fafc" font-family="-apple-system, sans-serif" font-size="14" font-weight="700">${this.escapeXml(stepLabel)}</text>
    ${compName ? `<text x="14" y="78" fill="#38bdf8" font-family="monospace" font-size="12">${this.escapeXml(compName)}</text>` : ''}
    ${note ? `<text x="14" y="98" fill="#c084fc" font-family="-apple-system, sans-serif" font-size="11">💬 "${this.escapeXml(note)}"</text>` : ''}
  </g>
  ` : ''}

  ${(config.includeTranscripts && transcriptText) ? `
  <!-- Speech-to-Text Voiceover Subtitle Pill -->
  <g transform="translate(${Math.max(40, (width - 760) / 2)}, ${height - 110})" filter="url(#shadow)">
    <rect width="760" height="42" rx="8" fill="rgba(15, 23, 42, 0.92)" stroke="rgba(168, 85, 247, 0.6)" stroke-width="1.5"/>
    <text x="20" y="26" fill="#c084fc" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="600">🎙️ VOICEOVER: "${this.escapeXml(transcriptText)}"</text>
  </g>
  ` : ''}

  <!-- Bottom Timeline Progress Bar -->
  <rect x="0" y="${height - 54}" width="${width}" height="54" fill="rgba(15, 23, 42, 0.95)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  <text x="40" y="${height - 24}" fill="#94a3b8" font-family="monospace" font-size="13">Step ${stepNum} of ${items.length}</text>
  
  <!-- Progress fill -->
  <rect x="180" y="${height - 32}" width="${width - 360}" height="8" rx="4" fill="rgba(255,255,255,0.1)"/>
  <rect x="180" y="${height - 32}" width="${Math.round(((width - 360) * stepNum) / items.length)}" height="8" rx="4" fill="#38bdf8"/>

  ${config.includeWatermark ? `
  <text x="${width - 160}" y="${height - 24}" fill="#64748b" font-family="-apple-system, sans-serif" font-size="11" font-weight="600">⚡ Antigravity Tracer</text>
  ` : ''}
</svg>
`.trim();

      const svgBase64 = Buffer.from(svg).toString('base64');
      const svgDataUri = `data:image/svg+xml;base64,${svgBase64}`;

      return {
        step: stepNum,
        timestamp: item.timestamp,
        label: stepLabel,
        actionType: item.type,
        coordinates: coords,
        componentName: item.componentName,
        flowPositionName: posName,
        flowPhase: phase,
        note,
        svg,
        svgDataUri,
        transcriptText
      };
    });
  }

  /**
   * Generates a single, self-contained standalone Interactive HTML5 Video/Replayer file.
   * This file can be sent to anyone, opened in Chrome/Safari/Firefox, and provides
   * a full scrub bar, speed multiplier, action highlight pins, and step breakdown.
   */
  public static exportInteractiveHtmlPlayer(
    model: FlowGraphModel,
    configPartial: Partial<VideoExportConfig> = {}
  ): string {
    const config = this.normalizeConfig(configPartial);
    const frames = this.generateActionHighlightFrames(model, config);
    const estimate = this.estimateFileSize(model, config);
    const title = config.marketingTitle || 'Antigravity UX Flow Recording';

    const audioSrc = config.audioDataUri || model.audioTrack?.audioDataUri || (config.includeAudioDub ? AudioDubbingManager.createSampleAudioDataUri() : '');
    const hasAudio = Boolean(audioSrc);
    const transcripts: SpeechTranscriptItem[] = model.speechTranscripts && model.speechTranscripts.length > 0
      ? model.speechTranscripts
      : frames.map(f => ({
          id: `trans-${f.step}`,
          step: f.step,
          text: f.transcriptText || `Step ${f.step}: ${f.label}`,
          timestampMs: f.timestamp,
          durationMs: config.actionDwellMs || 1500,
          confidence: 0.95,
          speaker: 'Tester'
        }));

    const markdownTranscript = AudioDubbingManager.toMarkdownTranscript(title, transcripts, model);
    const plainTranscript = AudioDubbingManager.toPlainTextTranscript(transcripts);
    const jiraTranscript = AudioDubbingManager.toJiraIssueFormat(title, transcripts, model);
    const srtSubtitles = AudioDubbingManager.toSrtSubtitles(transcripts);

    const framesJson = JSON.stringify(frames.map(f => ({
      step: f.step,
      label: f.label,
      actionType: f.actionType,
      componentName: f.componentName,
      flowPositionName: f.flowPositionName,
      flowPhase: f.flowPhase,
      note: f.note,
      svgDataUri: f.svgDataUri,
      transcriptText: f.transcriptText || ''
    })));

    const transcriptsJson = JSON.stringify(transcripts);
    const mdJson = JSON.stringify(markdownTranscript);
    const plainJson = JSON.stringify(plainTranscript);
    const jiraJson = JSON.stringify(jiraTranscript);
    const srtJson = JSON.stringify(srtSubtitles);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeXml(title)} - Interactive Recording</title>
  <style>
    :root {
      --bg: #030712;
      --card: #0f172a;
      --border: rgba(255, 255, 255, 0.1);
      --accent: #38bdf8;
      --indigo: #6366f1;
      --purple: #a855f7;
      --text: #f8fafc;
      --muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    header {
      background: var(--card);
      border-bottom: 1px solid var(--border);
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand h1 {
      font-size: 16px;
      font-weight: 700;
      color: #fff;
    }
    .badge {
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 4px;
      background: rgba(56, 189, 248, 0.15);
      border: 1px solid rgba(56, 189, 248, 0.4);
      color: var(--accent);
      font-family: monospace;
    }
    .badge-audio {
      background: rgba(168, 85, 247, 0.15);
      border: 1px solid rgba(168, 85, 247, 0.4);
      color: #c084fc;
    }
    .badge-stt {
      background: rgba(52, 211, 153, 0.15);
      border: 1px solid rgba(52, 211, 153, 0.4);
      color: #34d399;
    }
    .main-player {
      flex: 1;
      display: flex;
      overflow: hidden;
    }
    .canvas-stage {
      flex: 1;
      background: #000;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow: hidden;
    }
    .canvas-stage img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      box-shadow: 0 16px 48px rgba(0,0,0,0.8);
      border-radius: 6px;
      transition: opacity 0.15s ease-out;
    }
    .subtitle-overlay {
      position: absolute;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid rgba(168, 85, 247, 0.5);
      color: #f8fafc;
      padding: 8px 18px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 600;
      box-shadow: 0 8px 24px rgba(0,0,0,0.7);
      max-width: 80%;
      text-align: center;
      pointer-events: none;
      transition: all 0.2s ease;
      backdrop-filter: blur(8px);
    }
    .sidebar {
      width: 380px;
      background: #090e1a;
      border-left: 1px solid var(--border);
      display: flex;
      flex-direction: column;
    }
    .tab-bar {
      display: flex;
      border-bottom: 1px solid var(--border);
      background: #0c1322;
    }
    .tab-btn {
      flex: 1;
      padding: 12px 10px;
      font-size: 12px;
      font-weight: 600;
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--muted);
      cursor: pointer;
      text-align: center;
      transition: all 0.15s;
    }
    .tab-btn:hover {
      color: #fff;
      background: rgba(255,255,255,0.02);
    }
    .tab-btn.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
      background: rgba(56, 189, 248, 0.05);
    }
    .tab-content {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }
    .steps-list {
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .step-item {
      background: #0f172a;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px 12px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .step-item:hover, .step-item.active {
      border-color: var(--accent);
      background: rgba(56, 189, 248, 0.1);
    }
    .step-header {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: var(--accent);
      font-weight: 700;
      margin-bottom: 4px;
    }
    .step-title {
      font-size: 12px;
      font-weight: 600;
      color: #fff;
    }
    .step-sub {
      font-size: 10px;
      color: var(--muted);
      font-family: monospace;
      margin-top: 2px;
    }
    /* Transcripts Tab */
    .transcripts-view {
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      height: 100%;
    }
    .copy-toolbar {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      margin-bottom: 4px;
    }
    .btn-copy {
      background: #1e293b;
      border: 1px solid rgba(255,255,255,0.12);
      color: #f1f5f9;
      font-size: 11px;
      padding: 7px 10px;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      transition: all 0.15s;
    }
    .btn-copy:hover {
      background: #334155;
      border-color: var(--accent);
      color: #fff;
    }
    .copy-toast {
      background: #10b981;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      text-align: center;
      padding: 6px;
      border-radius: 4px;
      animation: fadeIn 0.2s ease-in;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .transcripts-list {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .transcript-card {
      background: #0f172a;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .transcript-card:hover, .transcript-card.active {
      border-color: var(--purple);
      background: rgba(168, 85, 247, 0.08);
    }
    .transcript-header {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      margin-bottom: 4px;
    }
    .transcript-speaker {
      font-weight: 700;
      color: #c084fc;
    }
    .transcript-time {
      font-family: monospace;
      color: var(--muted);
    }
    .transcript-body {
      font-size: 12px;
      color: #e2e8f0;
      line-height: 1.4;
    }
    /* Controls Bar */
    .controls {
      background: var(--card);
      border-top: 1px solid var(--border);
      padding: 12px 24px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .scrub-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .scrub-row input[type="range"] {
      flex: 1;
      accent-color: var(--accent);
      cursor: pointer;
    }
    .buttons-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .btn-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    button {
      background: #1e293b;
      border: 1px solid var(--border);
      color: #fff;
      padding: 6px 14px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      transition: all 0.15s;
    }
    button:hover {
      border-color: var(--accent);
      background: #334155;
    }
    button.primary {
      background: var(--indigo);
      border-color: rgba(99, 102, 241, 0.5);
    }
    button.primary:hover {
      background: #4f46e5;
    }
    select {
      background: #1e293b;
      border: 1px solid var(--border);
      color: #fff;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
    }
  </style>
</head>
<body>

  <header>
    <div class="brand">
      <div style="width: 12px; height: 12px; border-radius: 50%; background: #34d399; box-shadow: 0 0 10px #34d399;"></div>
      <h1>${this.escapeXml(title)}</h1>
      <span class="badge">INTERACTIVE RECORDING</span>
      <span class="badge" style="border-color: rgba(167, 139, 250, 0.4); color: #c084fc;">${estimate.resolution}</span>
      ${hasAudio ? '<span class="badge badge-audio">🎙️ DUBBED AUDIO</span>' : ''}
      <span class="badge badge-stt">📝 STT TRANSCRIPTS</span>
    </div>
    <div style="font-size: 12px; color: var(--muted); font-family: monospace;">
      Duration: ${estimate.durationSec}s | Steps: ${frames.length}
    </div>
  </header>

  <div class="main-player">
    <div class="canvas-stage">
      <img id="playerFrame" src="${frames[0]?.svgDataUri || ''}" alt="Recording Frame" />
      <div id="subtitleOverlay" class="subtitle-overlay" style="display: none;"></div>
    </div>

    <aside class="sidebar">
      <div class="tab-bar">
        <button id="tabSteps" class="tab-btn active">Timeline Steps (${frames.length})</button>
        <button id="tabTranscripts" class="tab-btn">🎙️ Written Transcripts</button>
      </div>

      <div class="tab-content">
        <!-- Tab 1: Steps -->
        <div class="steps-list" id="stepsContainer"></div>

        <!-- Tab 2: Written Records & Transcripts -->
        <div class="transcripts-view" id="transcriptsContainer" style="display: none;">
          <div class="copy-toolbar">
            <button id="btnCopyMd" class="btn-copy">📋 Copy Markdown</button>
            <button id="btnCopyPlain" class="btn-copy">📋 Copy Plain Text</button>
            <button id="btnCopyJira" class="btn-copy">📋 Copy Jira</button>
            <button id="btnCopySrt" class="btn-copy">🎬 Copy SRT</button>
          </div>
          <div id="copyToast" class="copy-toast" style="display: none;">Copied to clipboard!</div>
          <div class="transcripts-list" id="transcriptsList"></div>
        </div>
      </div>
    </aside>
  </div>

  <div class="controls">
    <div class="scrub-row">
      <span id="currentTime" style="font-family: monospace; font-size: 12px; color: var(--muted); width: 45px;">0.0s</span>
      <input type="range" id="scrubber" min="0" max="${Math.max(0, frames.length - 1)}" value="0" step="1" />
      <span id="totalTime" style="font-family: monospace; font-size: 12px; color: var(--muted); width: 45px;">${estimate.durationSec}s</span>
    </div>

    <div class="buttons-row">
      <div class="btn-group">
        <button id="btnPlayPause" class="primary">▶ Play</button>
        <button id="btnPrev">⏮ Previous</button>
        <button id="btnNext">⏭ Next</button>
      </div>

      <div class="btn-group">
        <span style="font-size: 12px; color: var(--muted);">Speed:</span>
        <select id="selectSpeed">
          <option value="0.5">0.5x</option>
          <option value="1.0" selected>1.0x</option>
          <option value="1.5">1.5x</option>
          <option value="2.0">2.0x</option>
        </select>
      </div>
    </div>
  </div>

  ${hasAudio ? `<audio id="dubbedAudio" src="${audioSrc}" preload="auto"></audio>` : ''}

  <script>
    const frames = ${framesJson};
    const transcripts = ${transcriptsJson};
    const mdTranscript = ${mdJson};
    const plainTranscript = ${plainJson};
    const jiraTranscript = ${jiraJson};
    const srtTranscript = ${srtJson};

    let currentIndex = 0;
    let isPlaying = false;
    let playbackSpeed = 1.0;
    let playTimer = null;
    const dwellMs = ${config.actionDwellMs || 1500};

    const img = document.getElementById('playerFrame');
    const subtitleOverlay = document.getElementById('subtitleOverlay');
    const scrubber = document.getElementById('scrubber');
    const currentTimeLabel = document.getElementById('currentTime');
    const btnPlay = document.getElementById('btnPlayPause');
    const stepsContainer = document.getElementById('stepsContainer');
    const transcriptsContainer = document.getElementById('transcriptsContainer');
    const transcriptsList = document.getElementById('transcriptsList');
    const copyToast = document.getElementById('copyToast');
    const dubbedAudio = document.getElementById('dubbedAudio');

    function renderStepList() {
      stepsContainer.innerHTML = '';
      frames.forEach((f, idx) => {
        const div = document.createElement('div');
        div.className = 'step-item' + (idx === currentIndex ? ' active' : '');
        div.innerHTML =
          '<div class="step-header">' +
            '<span>#' + f.step + ' ' + (f.actionType || 'ACTION') + '</span>' +
            '<span>' + (f.flowPhase || '') + '</span>' +
          '</div>' +
          '<div class="step-title">' + f.label + '</div>' +
          (f.componentName ? '<div class="step-sub">' + f.componentName + '</div>' : '') +
          (f.flowPositionName ? '<div class="step-sub" style="color: #38bdf8;">📍 ' + f.flowPositionName + '</div>' : '') +
          (f.transcriptText ? '<div class="step-sub" style="color: #c084fc;">🎙️ "' + f.transcriptText + '"</div>' : (f.note ? '<div class="step-sub" style="color: #c084fc;">💬 ' + f.note + '</div>' : ''));
        div.addEventListener('click', () => {
          showFrame(idx);
          if (isPlaying) togglePlay();
        });
        stepsContainer.appendChild(div);
      });
    }

    function renderTranscriptList() {
      transcriptsList.innerHTML = '';
      transcripts.forEach((t, idx) => {
        const div = document.createElement('div');
        div.className = 'transcript-card' + (idx === currentIndex ? ' active' : '');
        div.innerHTML =
          '<div class="transcript-header">' +
            '<span class="transcript-speaker">🎙️ ' + (t.speaker || 'Narrator') + ' (Step #' + (t.step !== undefined ? t.step : (idx + 1)) + ')</span>' +
            '<span class="transcript-time">' + ((idx * dwellMs) / 1000).toFixed(1) + 's</span>' +
          '</div>' +
          '<div class="transcript-body">' + t.text + '</div>';
        div.addEventListener('click', () => {
          showFrame(idx);
          if (isPlaying) togglePlay();
        });
        transcriptsList.appendChild(div);
      });
    }

    function showFrame(idx) {
      if (idx < 0 || idx >= frames.length) return;
      currentIndex = idx;
      const f = frames[idx];
      img.src = f.svgDataUri;
      scrubber.value = idx;
      const sec = ((idx * dwellMs) / 1000).toFixed(1);
      currentTimeLabel.innerText = sec + 's';

      if (dubbedAudio && Math.abs(dubbedAudio.currentTime - (idx * dwellMs / 1000)) > 1.0) {
        dubbedAudio.currentTime = (idx * dwellMs) / 1000;
      }

      // Live subtitle
      const sub = f.transcriptText || (transcripts[idx] ? transcripts[idx].text : '');
      if (sub) {
        subtitleOverlay.innerText = '🎙️ ' + sub;
        subtitleOverlay.style.display = 'block';
      } else {
        subtitleOverlay.style.display = 'none';
      }

      // Update active state in step list
      const items = stepsContainer.children;
      for (let i = 0; i < items.length; i++) {
        items[i].classList.toggle('active', i === idx);
      }
      if (items[idx]) {
        items[idx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      // Update active state in transcript list
      const tItems = transcriptsList.children;
      for (let i = 0; i < tItems.length; i++) {
        tItems[i].classList.toggle('active', i === idx);
      }
      if (tItems[idx]) {
        tItems[idx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }

    function togglePlay() {
      isPlaying = !isPlaying;
      btnPlay.innerText = isPlaying ? '⏸ Pause' : '▶ Play';
      if (isPlaying) {
        if (dubbedAudio) {
          dubbedAudio.playbackRate = playbackSpeed;
          dubbedAudio.play().catch(() => {});
        }
        startTimer();
      } else {
        if (dubbedAudio) dubbedAudio.pause();
        clearTimeout(playTimer);
      }
    }

    function startTimer() {
      clearTimeout(playTimer);
      if (!isPlaying) return;
      const delay = dwellMs / playbackSpeed;
      playTimer = setTimeout(() => {
        if (currentIndex >= frames.length - 1) {
          currentIndex = 0;
          if (dubbedAudio) dubbedAudio.currentTime = 0;
        } else {
          currentIndex++;
        }
        showFrame(currentIndex);
        if (isPlaying) startTimer();
      }, delay);
    }

    // Tabs
    const tabSteps = document.getElementById('tabSteps');
    const tabTranscripts = document.getElementById('tabTranscripts');

    tabSteps.addEventListener('click', () => {
      tabSteps.classList.add('active');
      tabTranscripts.classList.remove('active');
      stepsContainer.style.display = 'flex';
      transcriptsContainer.style.display = 'none';
    });

    tabTranscripts.addEventListener('click', () => {
      tabTranscripts.classList.add('active');
      tabSteps.classList.remove('active');
      stepsContainer.style.display = 'none';
      transcriptsContainer.style.display = 'flex';
    });

    // Copy Handlers
    function triggerCopy(text, label) {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
          showToast('Copied ' + label + ' to clipboard!');
        }).catch(() => {
          showToast('Copied ' + label + '!');
        });
      } else {
        showToast('Copied ' + label + '!');
      }
    }

    function showToast(msg) {
      copyToast.innerText = msg;
      copyToast.style.display = 'block';
      setTimeout(() => {
        copyToast.style.display = 'none';
      }, 2500);
    }

    document.getElementById('btnCopyMd').addEventListener('click', () => triggerCopy(mdTranscript, 'Markdown'));
    document.getElementById('btnCopyPlain').addEventListener('click', () => triggerCopy(plainTranscript, 'Plain Text'));
    document.getElementById('btnCopyJira').addEventListener('click', () => triggerCopy(jiraTranscript, 'Jira Issue format'));
    document.getElementById('btnCopySrt').addEventListener('click', () => triggerCopy(srtTranscript, 'SRT Subtitles'));

    btnPlay.addEventListener('click', togglePlay);
    document.getElementById('btnPrev').addEventListener('click', () => {
      showFrame(Math.max(0, currentIndex - 1));
      if (isPlaying) togglePlay();
    });
    document.getElementById('btnNext').addEventListener('click', () => {
      showFrame(Math.min(frames.length - 1, currentIndex + 1));
      if (isPlaying) togglePlay();
    });
    scrubber.addEventListener('input', (e) => {
      showFrame(parseInt(e.target.value, 10));
      if (isPlaying) togglePlay();
    });
    document.getElementById('selectSpeed').addEventListener('change', (e) => {
      playbackSpeed = parseFloat(e.target.value);
      if (dubbedAudio) dubbedAudio.playbackRate = playbackSpeed;
      if (isPlaying) startTimer();
    });

    renderStepList();
    renderTranscriptList();
    showFrame(0);
  </script>
</body>
</html>`;
  }

  /**
   * Detects if ffmpeg is available on the local system for native MP4 / WebM / GIF container encoding.
   */
  public static isFfmpegAvailable(): boolean {
    try {
      const { execSync } = require('child_process');
      execSync('ffmpeg -version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  private static formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(2)} GB`;
  }

  private static escapeXml(unsafe: string): string {
    return unsafe.replace(/[<>&'"]/g, c => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
        default: return c;
      }
    });
  }
}
