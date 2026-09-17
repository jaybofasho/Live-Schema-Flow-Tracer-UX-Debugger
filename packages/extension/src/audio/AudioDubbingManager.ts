import { FlowGraphModel, SessionTimelineItem } from '../graph/FlowGraphModel';

export interface SpeechTranscriptItem {
  id: string;
  step: number;
  timestampMs: number;
  durationMs: number;
  text: string;
  confidence: number;
  speaker?: string;
  audioClipUri?: string;
}

export interface AudioTrackMetadata {
  id: string;
  durationSec: number;
  sampleRate: number;
  format: 'audio/webm' | 'audio/wav' | 'audio/mp3';
  audioDataUri?: string; // base64 encoded audio track
  transcripts: SpeechTranscriptItem[];
  recordedAt?: string;
}

export class AudioDubbingManager {
  /**
   * Generates a context-aware intelligent voiceover narration string for a given timeline step.
   * Useful when microphone speech-to-text is running or as an automated starting point.
   */
  public static generateIntelligentNarration(item: SessionTimelineItem): string {
    const stepNum = item.step;
    const actionType = item.type.replace('EVENT_', '').toLowerCase();
    const comp = item.componentName || (item.details?.target?.componentName) || '';
    const tag = item.details?.target?.tagName || '';
    const text = item.details?.target?.innerText || item.label;
    const route = item.flowPositionName || (item.details?.url ? new URL(item.details.url, 'http://localhost').pathname : '');

    switch (item.type) {
      case 'EVENT_CLICK':
        if (comp && text) {
          return `In Step ${stepNum}, click on the ${text.trim()} button inside the ${comp} component to proceed.`;
        } else if (comp) {
          return `In Step ${stepNum}, interact with the ${comp} component.`;
        } else if (text) {
          return `In Step ${stepNum}, click on "${text.trim()}".`;
        }
        return `In Step ${stepNum}, trigger a click action on the active screen.`;

      case 'EVENT_NAVIGATE':
        return `Next, in Step ${stepNum}, the user navigates to "${route || item.label}", loading the corresponding application view.`;

      case 'EVENT_INPUT':
      case 'EVENT_CHANGE':
        const inputName = item.details?.target?.id || comp || 'field';
        return `In Step ${stepNum}, input data into the ${inputName} field.`;

      case 'EVENT_SUBMIT':
        return `In Step ${stepNum}, submit the form to send data to the backend handler.`;

      default:
        return `Step ${stepNum}: Perform ${actionType} action on ${comp || route || 'interface'}.`;
    }
  }

  /**
   * Formats speech transcripts into a formatted Markdown document
   * suitable for pasting into PR descriptions, Jira tickets, Notion, or documentation.
   */
  public static toMarkdownTranscript(
    title: string,
    transcripts: SpeechTranscriptItem[],
    model?: FlowGraphModel
  ): string {
    const dateStr = new Date().toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    const lines: string[] = [
      `# 🎙️ Audio Transcript & UX Walkthrough Record`,
      `**Session:** ${title}  `,
      `**Generated:** ${dateStr}  `,
      `**Total Steps Transcribed:** ${transcripts.length}  `,
      ``,
      `---`,
      ``,
      `## Step-by-Step Written Transcript`,
      ``
    ];

    if (transcripts.length === 0) {
      lines.push(`_No voiceover transcripts recorded for this session._`);
      return lines.join('\n');
    }

    // Sort transcripts chronologically
    const sorted = [...transcripts].sort((a, b) => a.timestampMs - b.timestampMs || a.step - b.step);

    sorted.forEach((t) => {
      const min = Math.floor(t.timestampMs / 60000);
      const sec = Math.floor((t.timestampMs % 60000) / 1000);
      const timeStr = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
      const speaker = t.speaker || 'Narrator';

      // Correlate with timeline item if model available
      const timelineItem = model?.timeline?.find((item) => item.step === t.step);
      const actionLabel = timelineItem ? ` [${timelineItem.type}: ${timelineItem.label}]` : '';

      lines.push(`### \`[${timeStr}]\` Step #${t.step}${actionLabel}`);
      lines.push(`> **${speaker}:** "${t.text}"`);
      if (timelineItem?.flowPositionName) {
        lines.push(`- **Flow Position:** \`${timelineItem.flowPositionName}\``);
      }
      if (timelineItem?.componentName) {
        lines.push(`- **Component:** \`${timelineItem.componentName}\``);
      }
      lines.push(``);
    });

    lines.push(`---`);
    lines.push(`*Recorded and transcribed with Antigravity Flow Tracer.*`);

    return lines.join('\n');
  }

  /**
   * Formats speech transcripts into a clean plain text log.
   */
  public static toPlainTextTranscript(transcripts: SpeechTranscriptItem[]): string {
    const sorted = [...transcripts].sort((a, b) => a.timestampMs - b.timestampMs || a.step - b.step);
    return sorted
      .map((t) => {
        const min = Math.floor(t.timestampMs / 60000);
        const sec = Math.floor((t.timestampMs % 60000) / 1000);
        const timeStr = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        return `[${timeStr}] (Step #${t.step}) ${t.speaker ? t.speaker + ': ' : ''}"${t.text}"`;
      })
      .join('\n\n');
  }

  /**
   * Formats transcripts into standard SubRip Subtitle (.srt) format.
   * Useful for video editing (Premiere, Final Cut, Loom, YouTube).
   */
  public static toSrtSubtitles(transcripts: SpeechTranscriptItem[]): string {
    const sorted = [...transcripts].sort((a, b) => a.timestampMs - b.timestampMs || a.step - b.step);

    return sorted
      .map((t, idx) => {
        const startMs = t.timestampMs;
        const endMs = startMs + Math.max(1500, t.durationMs || 2500);

        const formatSrtTime = (ms: number): string => {
          const h = Math.floor(ms / 3600000);
          const m = Math.floor((ms % 3600000) / 60000);
          const s = Math.floor((ms % 60000) / 1000);
          const milli = ms % 1000;
          return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(milli).padStart(3, '0')}`;
        };

        return `${idx + 1}\n${formatSrtTime(startMs)} --> ${formatSrtTime(endMs)}\n${t.text}\n`;
      })
      .join('\n');
  }

  /**
   * Formats transcripts into Jira markup syntax.
   */
  public static toJiraIssueFormat(
    title: string,
    transcripts: SpeechTranscriptItem[],
    model?: FlowGraphModel
  ): string {
    const sorted = [...transcripts].sort((a, b) => a.timestampMs - b.timestampMs || a.step - b.step);
    const lines: string[] = [
      `h3. 🎙️ Audio Transcript & Action Flow Record: ${title}`,
      `||Step||Timestamp||Action / Component||Spoken Voiceover||`,
    ];

    sorted.forEach((t) => {
      const min = Math.floor(t.timestampMs / 60000);
      const sec = Math.floor((t.timestampMs % 60000) / 1000);
      const timeStr = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
      const item = model?.timeline?.find((i) => i.step === t.step);
      const actionDesc = item ? `${item.type}: ${item.label}` : `Step #${t.step}`;
      lines.push(`|#${t.step}|${timeStr}|${actionDesc}|"${t.text}"|`);
    });

    return lines.join('\n');
  }

  /**
   * Generates a sample Web Audio WAV base64 string for testing or fallback audio playback.
   */
  public static createSampleAudioDataUri(durationSec: number = 2): string {
    // Generates a lightweight valid PCM WAV file (1 sec of 440Hz beep at 8kHz sample rate)
    const sampleRate = 8000;
    const numSamples = Math.floor(sampleRate * Math.min(5, durationSec));
    const headerSize = 44;
    const buffer = Buffer.alloc(headerSize + numSamples);

    // RIFF chunk descriptor
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + numSamples, 4);
    buffer.write('WAVE', 8);

    // fmt sub-chunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // subchunk1 size
    buffer.writeUInt16LE(1, 20); // audio format (PCM)
    buffer.writeUInt16LE(1, 22); // num channels (mono)
    buffer.writeUInt32LE(sampleRate, 24); // sample rate
    buffer.writeUInt32LE(sampleRate, 28); // byte rate (sampleRate * numChannels * bitsPerSample/8)
    buffer.writeUInt16LE(1, 32); // block align
    buffer.writeUInt16LE(8, 34); // bits per sample (8 bit unsigned)

    // data sub-chunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(numSamples, 40);

    // Write samples: gentle tone
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const val = Math.floor(128 + 40 * Math.sin(2 * Math.PI * 440 * t));
      buffer.writeUInt8(val, 44 + i);
    }

    return `data:audio/wav;base64,${buffer.toString('base64')}`;
  }
}
