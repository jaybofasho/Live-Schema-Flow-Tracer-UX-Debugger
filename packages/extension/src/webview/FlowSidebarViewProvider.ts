import * as vscode from 'vscode';
import { FlowGraphModel } from '../graph/FlowGraphModel';
import { DebugController } from '../dap/DebugController';
import { LandingPageDetector, LandingPageCandidate } from '../discovery/LandingPageDetector';
import { DEVICE_PRESETS, DEFAULT_VIEWPORT, ViewportConfig, DevicePreset } from '../device/DevicePresets';
import { FlowPanel } from './FlowPanel';
import { LicenseManager } from '../license/LicenseManager';

export class FlowSidebarViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'flowtracer.flowLensSidebar';
  private _view?: vscode.WebviewView;
  private _licenseManager?: LicenseManager;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _model: FlowGraphModel,
    private readonly _debugController: DebugController,
    licenseManager?: LicenseManager
  ) {
    this._licenseManager = licenseManager;
  }

  public setLicenseManager(lm: LicenseManager): void {
    this._licenseManager = lm;
  }

  private _isRecording: boolean = false;
  private _isPaused: boolean = false;

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview();

    webviewView.webview.onDidReceiveMessage(async (message: any) => {
      switch (message.command) {
        case 'confirmAndLaunch':
          await vscode.commands.executeCommand(
            'flowtracer.startRecorderWithConfig',
            message.landingPage,
            message.viewport
          );
          break;

        case 'startRecorder':
          await vscode.commands.executeCommand('flowtracer.startRecorder');
          break;

        case 'stopRecorder':
          await vscode.commands.executeCommand('flowtracer.stopRecorder');
          break;

        case 'pauseRecorder':
          await vscode.commands.executeCommand('flowtracer.pauseRecorder');
          break;

        case 'openFullFlow':
          await vscode.commands.executeCommand('flowtracer.openFlowViewer');
          break;

        case 'openLocalhostPreview':
          await vscode.commands.executeCommand('flowtracer.openLocalhostPreview');
          break;

        case 'mergeFlows':
          await vscode.commands.executeCommand('flowtracer.mergeFlows');
          break;

        case 'uploadSchema':
          await vscode.commands.executeCommand('flowtracer.uploadSchema');
          break;

        case 'loadProject':
          await vscode.commands.executeCommand('flowtracer.loadProject');
          break;

        case 'addComment':
          if (message.nodeId && message.text) {
            this._model.addCommentToNode(message.nodeId, message.text, message.author || 'User');
            this.updateData();
            if (FlowPanel.currentPanel) FlowPanel.currentPanel.updateData();
          }
          break;

        case 'editNode':
          if (message.nodeId && message.updates) {
            this._model.updateNodeData(message.nodeId, message.updates);
            this.updateData();
            if (FlowPanel.currentPanel) FlowPanel.currentPanel.updateData();
          }
          break;

        case 'exportSession':
          await vscode.commands.executeCommand('flowtracer.exportSession');
          break;

        case 'exportVideo':
          await vscode.commands.executeCommand('flowtracer.exportVideo');
          break;

        case 'copyTranscript':
          await vscode.commands.executeCommand('flowtracer.copyTranscript', message.format);
          break;

        case 'recordVoiceover':
          await vscode.commands.executeCommand('flowtracer.recordVoiceover');
          break;

        case 'activateLicense':
          await vscode.commands.executeCommand('flowtracer.activateLicense');
          break;

        case 'checkLicenseStatus':
          await vscode.commands.executeCommand('flowtracer.checkLicenseStatus');
          break;

        case 'openFile':
          if (message.filePath) {
            try {
              const uri = vscode.Uri.file(message.filePath);
              const doc = await vscode.workspace.openTextDocument(uri);
              const line = message.lineNumber ? Math.max(0, message.lineNumber - 1) : 0;
              const pos = new vscode.Position(line, 0);
              await vscode.window.showTextDocument(doc, {
                selection: new vscode.Range(pos, pos)
              });
            } catch (e) {
              vscode.window.showErrorMessage(`Failed to open file: ${message.filePath}`);
            }
          }
          break;

        case 'debugStep':
          await this._debugController.setInlineBreakpoint(
            message.filePath,
            message.componentName,
            message.handlerName,
            message.lineNumber
          );
          break;

        case 'debugOperation':
          await vscode.commands.executeCommand('flowtracer.debugOperation');
          break;

        case 'refreshLandingPages':
          await this.sendStartupConfig();
          break;

        case 'ready':
          await this.sendStartupConfig();
          this.updateData();
          break;
      }
    });
  }

  public async sendStartupConfig(): Promise<void> {
    if (this._view) {
      const landingPages = await LandingPageDetector.discoverLandingPages();
      this._view.webview.postMessage({
        command: 'STARTUP_CONFIG',
        landingPages,
        presets: DEVICE_PRESETS,
        defaultViewport: DEFAULT_VIEWPORT
      });
    }
  }

  public async updateData(isRecording?: boolean, isPaused?: boolean): Promise<void> {
    if (typeof isRecording === 'boolean') this._isRecording = isRecording;
    if (typeof isPaused === 'boolean') this._isPaused = isPaused;
    const isPro = this._licenseManager ? await this._licenseManager.isProUser() : false;
    if (this._view) {
      this._view.webview.postMessage({
        command: 'UPDATE_GRAPH',
        data: this._model.toJSON(),
        isRecording: this._isRecording,
        isPaused: this._isPaused,
        isPro
      });
      this._view.webview.postMessage({
        command: 'SET_LICENSE_STATE',
        isPro
      });
    }
  }

  private _getHtmlForWebview(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Antigravity Flow Lens Sidebar</title>
  <style>
    :root {
      --bg-base: var(--vscode-sideBar-background, #0f172a);
      --bg-card: rgba(255, 255, 255, 0.04);
      --bg-card-hover: rgba(56, 189, 248, 0.08);
      --border-subtle: var(--vscode-sideBar-border, rgba(255, 255, 255, 0.08));
      --accent-cyan: #38bdf8;
      --accent-indigo: #818cf8;
      --accent-emerald: #34d399;
      --accent-pink: #f472b6;
      --accent-purple: #c084fc;
      --accent-rose: #fb7185;
      --accent-amber: #fbbf24;
      --text-primary: var(--vscode-foreground, #f8fafc);
      --text-muted: var(--vscode-descriptionForeground, #94a3b8);
      --font-family: var(--vscode-font-family, system-ui, -apple-system, sans-serif);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background-color: var(--bg-base);
      color: var(--text-primary);
      font-family: var(--font-family);
      padding: 12px;
      font-size: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      user-select: none;
    }

    /* Header & Status Card */
    .header-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .brand-title {
      font-weight: 700;
      font-size: 13px;
      background: linear-gradient(135deg, #ffffff, var(--accent-cyan));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 9999px;
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.3);
      color: var(--accent-cyan);
      font-family: monospace;
    }

    .status-badge.recording {
      background: rgba(239, 68, 68, 0.15);
      border-color: rgba(239, 68, 68, 0.4);
      color: #f87171;
    }

    .status-badge.paused {
      background: rgba(245, 158, 11, 0.15);
      border-color: rgba(245, 158, 11, 0.4);
      color: #fbbf24;
    }

    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--accent-cyan);
      box-shadow: 0 0 6px var(--accent-cyan);
    }

    .status-badge.recording .status-dot {
      background: #f87171;
      box-shadow: 0 0 8px #f87171;
      animation: pulse 1.5s infinite;
    }

    .status-badge.paused .status-dot {
      background: #fbbf24;
      box-shadow: 0 0 8px #fbbf24;
      animation: none;
    }

    @keyframes pulse {
      0% { transform: scale(0.9); opacity: 0.8; }
      50% { transform: scale(1.3); opacity: 1; }
      100% { transform: scale(0.9); opacity: 0.8; }
    }

    /* Flow Position Banner */
    .pos-card {
      background: rgba(129, 140, 248, 0.08);
      border: 1px solid rgba(129, 140, 248, 0.3);
      border-radius: 8px;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .pos-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .pos-label {
      font-size: 10px;
      font-weight: 700;
      color: var(--accent-indigo);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .pos-phase-badge {
      font-size: 9px;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 4px;
      background: rgba(129, 140, 248, 0.2);
      color: var(--accent-indigo);
      font-family: monospace;
    }

    .pos-name {
      font-size: 12px;
      font-weight: 600;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .pos-crumbs {
      font-size: 10px;
      color: var(--text-muted);
      font-family: monospace;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Startup Confirmation Box */
    .startup-card {
      background: linear-gradient(180deg, rgba(30, 41, 59, 0.5) 0%, rgba(15, 23, 42, 0.8) 100%);
      border: 1px solid rgba(56, 189, 248, 0.25);
      border-radius: 8px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .startup-card.hidden {
      display: none;
    }

    .startup-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--accent-cyan);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .landing-select-container {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .label-micro {
      font-size: 10px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    select, input[type="text"], input[type="number"] {
      width: 100%;
      background: rgba(0, 0, 0, 0.35);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      color: var(--text-primary);
      padding: 6px 8px;
      font-size: 11px;
      font-family: inherit;
      outline: none;
      transition: border-color 0.15s ease;
    }

    select:focus, input:focus {
      border-color: var(--accent-cyan);
    }

    /* Category Tabs */
    .prop-tabs {
      display: flex;
      gap: 4px;
      background: rgba(0, 0, 0, 0.25);
      padding: 3px;
      border-radius: 6px;
    }

    .prop-tab {
      flex: 1;
      padding: 5px 2px;
      font-size: 10px;
      font-weight: 600;
      border: none;
      background: transparent;
      color: var(--text-muted);
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      transition: all 0.15s ease;
    }

    .prop-tab:hover {
      color: var(--text-primary);
      background: rgba(255, 255, 255, 0.05);
    }

    .prop-tab.active {
      background: var(--accent-cyan);
      color: #0f172a;
      box-shadow: 0 1px 4px rgba(0,0,0,0.3);
    }

    /* Preset Grid */
    .preset-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      max-height: 125px;
      overflow-y: auto;
      padding-right: 2px;
    }

    .preset-pill {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 5px;
      padding: 5px 8px;
      font-size: 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      transition: all 0.12s ease;
    }

    .preset-pill:hover {
      border-color: var(--accent-cyan);
      background: var(--bg-card-hover);
    }

    .preset-pill.active {
      border-color: var(--accent-cyan);
      background: rgba(56, 189, 248, 0.15);
      box-shadow: 0 0 8px rgba(56, 189, 248, 0.2);
    }

    .preset-name {
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .preset-res {
      font-family: monospace;
      color: var(--accent-cyan);
      font-size: 10px;
    }

    /* Dynamic Resolution Row */
    .dynamic-panel {
      display: none;
      flex-direction: column;
      gap: 8px;
      padding: 4px 0;
    }

    .dynamic-panel.visible {
      display: flex;
    }

    .res-inputs {
      display: grid;
      grid-template-columns: 1fr auto 1fr auto;
      align-items: center;
      gap: 4px;
    }

    .rotate-btn {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      color: var(--text-primary);
      padding: 6px 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
    }

    .rotate-btn:hover {
      border-color: var(--accent-cyan);
      color: var(--accent-cyan);
    }

    .active-spec-badge {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(0, 0, 0, 0.3);
      padding: 6px 10px;
      border-radius: 6px;
      border-left: 3px solid var(--accent-cyan);
      font-size: 11px;
      font-family: monospace;
    }

    /* Range slider */
    .slider-row {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    input[type="range"] {
      width: 100%;
      accent-color: var(--accent-cyan);
      cursor: pointer;
    }

    /* Buttons */
    .btn-group {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }

    button {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      color: var(--text-primary);
      padding: 7px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.15s ease;
    }

    button:hover {
      border-color: var(--accent-cyan);
      background: var(--bg-card-hover);
      box-shadow: 0 0 10px rgba(56, 189, 248, 0.2);
    }

    button.btn-primary {
      background: linear-gradient(135deg, #0284c7, #2563eb);
      color: #fff;
      border-color: #38bdf8;
      font-weight: 600;
    }

    button.btn-launch {
      background: linear-gradient(135deg, #059669, #0284c7);
      color: #fff;
      border-color: #34d399;
      font-weight: 700;
      font-size: 12px;
      padding: 9px;
      box-shadow: 0 2px 10px rgba(5, 150, 105, 0.3);
    }

    button.btn-launch:hover {
      box-shadow: 0 0 15px rgba(52, 211, 153, 0.4);
      transform: translateY(-1px);
    }

    button.btn-danger {
      border-color: var(--accent-rose);
      color: var(--accent-rose);
    }

    button.btn-danger:hover {
      background: rgba(251, 113, 133, 0.15);
      box-shadow: 0 0 10px rgba(251, 113, 133, 0.3);
    }

    /* Step Timeline Section */
    .section-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--text-muted);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .steps-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 200px;
      overflow-y: auto;
      padding-right: 2px;
    }

    .step-item {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 8px 10px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 3px;
      transition: all 0.15s ease;
    }

    .step-item:hover {
      border-color: var(--accent-cyan);
      background: var(--bg-card-hover);
    }

    .step-item.active {
      border-color: var(--accent-cyan);
      background: rgba(56, 189, 248, 0.12);
      box-shadow: 0 0 10px rgba(56, 189, 248, 0.25);
    }

    .step-item.landing-root {
      border-color: rgba(52, 211, 153, 0.5);
      background: rgba(52, 211, 153, 0.08);
    }

    .step-item.junction-node {
      border-color: rgba(192, 132, 252, 0.6);
      background: rgba(192, 132, 252, 0.08);
      box-shadow: 0 0 10px rgba(192, 132, 252, 0.2);
    }

    .step-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .step-badge {
      font-size: 9px;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 3px;
      text-transform: uppercase;
    }

    .badge-screen { background: rgba(56, 189, 248, 0.2); color: var(--accent-cyan); }
    .badge-landing { background: rgba(52, 211, 153, 0.2); color: var(--accent-emerald); }
    .badge-junction { background: rgba(192, 132, 252, 0.2); color: var(--accent-purple); border: 1px solid rgba(192, 132, 252, 0.4); }
    .badge-return { background: rgba(244, 114, 182, 0.2); color: var(--accent-pink); border: 1px solid rgba(244, 114, 182, 0.4); }
    .badge-action { background: rgba(129, 140, 248, 0.2); color: var(--accent-indigo); }
    .badge-handler { background: rgba(52, 211, 153, 0.2); color: var(--accent-emerald); }
    .badge-breakpoint { background: rgba(244, 114, 182, 0.2); color: var(--accent-pink); }

    .step-title {
      font-weight: 600;
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .step-sub {
      font-size: 10px;
      color: var(--text-muted);
      font-family: monospace;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Inspector Card */
    .inspector-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .info-row {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .info-label {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
    }

    .info-value {
      font-size: 11px;
      font-family: monospace;
      background: rgba(0, 0, 0, 0.25);
      padding: 4px 8px;
      border-radius: 4px;
      word-break: break-all;
    }

    .inspector-actions {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 6px;
    }
  </style>
</head>
<body>

  <!-- Brand & Session Header -->
  <div class="header-card">
    <div class="title-row">
      <div class="brand-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-30 12 12)" stroke="#38bdf8" stroke-width="1.5"/>
          <ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(30 12 12)" stroke="#818cf8" stroke-width="1.5"/>
          <circle cx="12" cy="12" r="2.5" fill="#38bdf8"/>
        </svg>
        ANTIGRAVITY TRACER
      </div>
      <div style="display: flex; gap: 6px; align-items: center;">
        <div class="status-badge" id="proBadge" style="cursor: pointer; background: rgba(234, 179, 8, 0.12); border-color: rgba(234, 179, 8, 0.35); color: #facc15;" title="Click to view license status or activate Pro">
          <span id="proBadgeText">FREE</span>
        </div>
        <div class="status-badge" id="statusPill">
          <span class="status-dot"></span>
          <span id="statusText">IDLE</span>
        </div>
      </div>
    </div>

    <!-- Active UX Position Banner -->
    <div class="pos-card" id="posCard" style="display: none;">
      <div class="pos-top">
        <span class="pos-label">📍 Flow Position</span>
        <span class="pos-phase-badge" id="posPhaseBadge">LANDING</span>
      </div>
      <div class="pos-name" id="posName">Landing / Entry</div>
      <div class="pos-crumbs" id="posCrumbs">Landing</div>
    </div>

    <!-- Active Session Action Buttons (visible when recording) -->
    <div class="btn-group" id="activeControls" style="display: none;">
      <button id="btnPause" title="Pause / Resume Ghost Mouse Pin">⏸ Ghost Pin <span id="pauseShortcutLabel" style="font-size: 10px; opacity: 0.85;">(Alt+Shift+P)</span></button>
      <button class="btn-danger" id="btnStop">⏹ Stop Session</button>
      <button id="btnUploadActive" style="grid-column: span 2; border-color: #34d399; color: #34d399;">📁 Upload / Import Schema</button>
      <button id="btnMergeFlows" style="grid-column: span 2; border-color: var(--accent-purple); color: var(--accent-purple);">🔗 Merge App Flow Schema</button>
      <button id="btnOpenLocalhostPreviewActive" style="grid-column: span 2; border-color: #00f0ff; color: #00f0ff; background: rgba(0, 240, 255, 0.12); font-weight: 600;">📱 Localhost Preview (Center Editor)</button>
      <button id="btnOpenFull" style="grid-column: span 2;">🔍 Open Flow Lens Canvas</button>
      <button id="btnExport" style="grid-column: span 2;">📊 Export Mermaid / Playwright</button>
      <button id="btnExportVideo" style="grid-column: span 2; border-color: #f43f5e; color: #f43f5e; background: rgba(244, 63, 94, 0.1);">🎬 Video Studio (MP4 / Dubbing)</button>
      <div style="grid-column: span 2; display: flex; gap: 6px;">
        <button id="btnSidebarVoiceover" style="flex: 1; border-color: #a855f7; color: #c084fc; background: rgba(168, 85, 247, 0.1);">🎙️ Dub Audio</button>
        <button id="btnSidebarCopyTrans" style="flex: 1; border-color: #34d399; color: #34d399; background: rgba(52, 211, 153, 0.1);">📋 Copy Transcript</button>
      </div>
    </div>
  </div>

  <!-- Startup & Device Proportion Confirmation Card -->
  <div class="startup-card" id="startupCard">
    <div class="startup-title">
      <span>🚀 App Startup Confirmation</span>
      <span style="font-size: 9px; color: var(--accent-emerald); font-weight: 600;">TOP OF SCHEMA</span>
    </div>

    <!-- Landing Page Selector -->
    <div class="landing-select-container">
      <div class="label-micro">
        <span>Opening / Landing Page</span>
        <a href="#" id="btnRefreshLanding" style="color: var(--accent-cyan); text-decoration: none; font-size: 9px;">⟳ Scan</a>
      </div>
      <select id="landingPageSelect">
        <option value="" disabled selected>Detecting workspace landing page...</option>
      </select>
      <div id="landingDetails" style="font-size: 10px; color: var(--text-muted); font-family: monospace; word-break: break-all;"></div>
    </div>

    <!-- Viewing Proportions & Presets -->
    <div class="label-micro">
      <span>Viewing Proportions</span>
      <span id="viewportCategoryLabel" style="color: var(--accent-cyan);">WEB</span>
    </div>

    <div class="prop-tabs">
      <button class="prop-tab active" data-category="web">💻 Web</button>
      <button class="prop-tab" data-category="mobile">📱 Mobile</button>
      <button class="prop-tab" data-category="tablet">📟 Tablet</button>
      <button class="prop-tab" data-category="dynamic">⚙️ Dynamic</button>
    </div>

    <!-- Preset Lists -->
    <div class="preset-list" id="presetListContainer"></div>

    <!-- Dynamic Resolution Controls -->
    <div class="dynamic-panel" id="dynamicPanel">
      <div class="res-inputs">
        <input type="number" id="inputWidth" placeholder="Width" value="1920" min="320" max="3840" />
        <span style="color: var(--text-muted);">×</span>
        <input type="number" id="inputHeight" placeholder="Height" value="1080" min="320" max="2400" />
        <button class="rotate-btn" id="btnRotate" title="Swap Orientation (Landscape / Portrait)">🔄</button>
      </div>

      <div class="slider-row">
        <div class="label-micro">
          <span>Fluid Breakpoint Scrubber</span>
          <span id="sliderWidthLabel" style="font-family: monospace; color: var(--accent-cyan);">1920px</span>
        </div>
        <input type="range" id="widthSlider" min="360" max="2560" value="1920" step="10" />
      </div>

      <div style="display: flex; gap: 6px; align-items: center;">
        <span class="label-micro" style="margin: 0;">Scale / DPR:</span>
        <select id="dprSelect" style="width: auto; flex: 1;">
          <option value="1">1x (Standard)</option>
          <option value="2">2x (Retina)</option>
          <option value="3">3x (Super Retina)</option>
        </select>
      </div>
    </div>

    <!-- Active Viewport Spec Badge -->
    <div class="active-spec-badge">
      <span id="activeDeviceName" style="color: var(--text-primary);">Desktop FHD</span>
      <span id="activeResolution" style="color: var(--accent-cyan);">1920×1080 (16:9)</span>
    </div>

    <!-- Launch Button -->
    <button class="btn-launch" id="btnConfirmLaunch">
      ⏺ Start Live Flow Trace
    </button>
    <button id="btnLoadProjectStartup" style="margin-top: 6px; background: rgba(56, 189, 248, 0.12); border: 1px solid var(--accent-cyan); color: var(--accent-cyan); font-size: 11px; font-weight: 600;">
      ⚡ Load Active Project (Flows & ERD)
    </button>
    <button id="btnOpenLocalhostPreviewStartup" style="margin-top: 6px; background: rgba(0, 240, 255, 0.12); border: 1px solid #00f0ff; color: #00f0ff; font-size: 11px; font-weight: 600;">
      📱 Open Localhost Preview (Center Editor)
    </button>
    <button id="btnUploadStartup" style="margin-top: 6px; background: transparent; border: 1px dashed #34d399; color: #34d399; font-size: 11px;">
      📁 Upload Schema (Mermaid / ERD / JSON)
    </button>
  </div>

  <!-- Recorded Steps Timeline -->
  <div class="section-title">
    <span>Recorded Interactions</span>
    <span id="stepCount" style="font-family: monospace;">0 Steps</span>
  </div>

  <div class="steps-list" id="stepsList">
    <div style="color: var(--text-muted); font-size: 11px; text-align: center; padding: 20px 0;">
      No recorded steps yet.<br>Confirm landing page & click Launch!
    </div>
  </div>

  <!-- Step Inspector -->
  <div class="section-title">Step Inspector</div>
  <div class="inspector-card" id="inspectorCard">
    <div style="color: var(--text-muted); font-size: 11px; text-align: center; padding: 10px 0;">
      Select an interaction step above to inspect React/Vue AST and set dynamic breakpoints.
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    let allLandingPages = [];
    let selectedLandingPage = null;

    let allPresets = [];
    let currentCategory = 'web';
    let currentViewport = {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false,
      orientation: 'landscape',
      presetId: 'web-fhd',
      presetName: 'Desktop FHD (1920×1080)',
      category: 'web'
    };

    let currentData = { nodes: [], edges: [], timeline: [], positions: [] };
    let selectedNode = null;
    let isSessionActive = false;
    let isSessionPaused = false;

    // Listen for extension events
    window.addEventListener('message', event => {
      const msg = event.data;

      if (msg.command === 'STARTUP_CONFIG') {
        allLandingPages = msg.landingPages || [];
        allPresets = msg.presets || [];
        if (msg.defaultViewport && !currentViewport.presetId) {
          currentViewport = msg.defaultViewport;
        }
        renderLandingPages();
        renderPresets();
        updateActiveSpecBadge();
      }

      if (msg.command === 'UPDATE_GRAPH') {
        currentData = msg.data || { nodes: [], edges: [], timeline: [] };
        isSessionActive = !!msg.isRecording;
        isSessionPaused = !!msg.isPaused;
        updateSessionState();
        updatePositionBanner();
        renderSteps();
        if (selectedNode) {
          const fresh = (currentData.nodes || []).find(n => n.id === selectedNode.id);
        if (msg.isPro !== undefined) {
          updateProBadge(!!msg.isPro);
        }
      }

      if (msg.command === 'SET_LICENSE_STATE') {
        updateProBadge(!!msg.isPro);
      }
    });

    function updateProBadge(isPro) {
      const proBadge = document.getElementById('proBadge');
      const proBadgeText = document.getElementById('proBadgeText');
      if (!proBadge || !proBadgeText) return;
      if (isPro) {
        proBadge.style.background = 'rgba(168, 85, 247, 0.15)';
        proBadge.style.borderColor = 'rgba(168, 85, 247, 0.4)';
        proBadge.style.color = '#c084fc';
        proBadgeText.textContent = '⚡ PRO';
      } else {
        proBadge.style.background = 'rgba(234, 179, 8, 0.12)';
        proBadge.style.borderColor = 'rgba(234, 179, 8, 0.35)';
        proBadge.style.color = '#facc15';
        proBadgeText.textContent = 'FREE';
      }
    }

    function updateSessionState() {
      const statusPill = document.getElementById('statusPill');
      const statusText = document.getElementById('statusText');
      const startupCard = document.getElementById('startupCard');
      const activeControls = document.getElementById('activeControls');
      const btnStop = document.getElementById('btnStop');
      const btnPause = document.getElementById('btnPause');

      if (isSessionActive) {
        if (isSessionPaused) {
          statusPill.className = 'status-badge paused';
          statusText.innerText = 'PAUSED (' + (currentData.timeline ? currentData.timeline.length : 0) + ')';
        } else {
          statusPill.className = 'status-badge recording';
          statusText.innerText = 'REC (' + (currentData.timeline ? currentData.timeline.length : 0) + ')';
        }
        startupCard.classList.add('hidden');
        activeControls.style.display = 'grid';
        if (btnStop) btnStop.style.display = 'block';
        if (btnPause) btnPause.style.display = 'block';
      } else {
        statusPill.className = 'status-badge';
        statusText.innerText = (currentData.timeline && currentData.timeline.length > 0) ? 'IDLE (' + currentData.timeline.length + ')' : 'IDLE';
        startupCard.classList.remove('hidden');
        if (currentData.nodes && currentData.nodes.length > 0) {
          activeControls.style.display = 'grid';
          if (btnStop) btnStop.style.display = 'none';
          if (btnPause) btnPause.style.display = 'none';
        } else {
          activeControls.style.display = 'none';
        }
      }
    }

    function updatePositionBanner() {
      const banner = document.getElementById('posCard');
      const posName = document.getElementById('posName');
      const posCrumbs = document.getElementById('posCrumbs');
      const posPhase = document.getElementById('posPhaseBadge');

      if (isSessionActive && currentData.currentPosition) {
        banner.style.display = 'flex';
        posName.innerText = '📍 ' + (currentData.currentPosition.name || currentData.currentPosition.route || 'Active Screen');
        posPhase.innerText = currentData.currentPosition.phase || 'FLOW';
        const crumbs = currentData.activeBreadcrumb || currentData.currentPosition.breadcrumb || [];
        posCrumbs.innerText = crumbs.join(' ➔ ');
      } else {
        banner.style.display = 'none';
      }
    }

    function renderLandingPages() {
      const select = document.getElementById('landingPageSelect');
      const details = document.getElementById('landingDetails');

      select.innerHTML = '';
      if (allLandingPages.length === 0) {
        select.innerHTML = '<option value="">Default: http://localhost:3000</option>';
        selectedLandingPage = { title: 'Local Web App', url: 'http://localhost:3000' };
        details.innerText = 'http://localhost:3000';
        return;
      }

      allLandingPages.forEach((item, index) => {
        const opt = document.createElement('option');
        opt.value = item.id;
        const tag = item.isRecommended ? '★ [RECOMMENDED] ' : '';
        const comp = item.componentName ? ' (' + item.componentName + ')' : '';
        opt.innerText = tag + item.title + comp;
        if (item.isRecommended || index === 0) {
          opt.selected = true;
          selectedLandingPage = item;
        }
        select.appendChild(opt);
      });

      if (selectedLandingPage) {
        details.innerText = selectedLandingPage.filePath || selectedLandingPage.url || '';
      }

      select.addEventListener('change', () => {
        const found = allLandingPages.find(p => p.id === select.value);
        if (found) {
          selectedLandingPage = found;
          details.innerText = found.filePath || found.url || '';
        }
      });
    }

    function renderPresets() {
      const container = document.getElementById('presetListContainer');
      const dynamicPanel = document.getElementById('dynamicPanel');

      if (currentCategory === 'dynamic') {
        container.style.display = 'none';
        dynamicPanel.classList.add('visible');
        return;
      }

      container.style.display = 'flex';
      dynamicPanel.classList.remove('visible');
      container.innerHTML = '';

      const filtered = allPresets.filter(p => p.category === currentCategory);
      filtered.forEach(preset => {
        const pill = document.createElement('div');
        pill.className = 'preset-pill' + (currentViewport.presetId === preset.id ? ' active' : '');
        pill.innerHTML = \`
          <span class="preset-name">\${preset.icon || ''} \${preset.name}</span>
          <span class="preset-res">\${preset.width}×\${preset.height}</span>
        \`;

        pill.addEventListener('click', () => {
          currentViewport = {
            width: preset.width,
            height: preset.height,
            deviceScaleFactor: preset.deviceScaleFactor,
            mobile: preset.mobile,
            orientation: preset.width >= preset.height ? 'landscape' : 'portrait',
            presetId: preset.id,
            presetName: preset.name,
            category: preset.category
          };

          document.getElementById('inputWidth').value = preset.width;
          document.getElementById('inputHeight').value = preset.height;
          document.getElementById('widthSlider').value = preset.width;
          document.getElementById('sliderWidthLabel').innerText = preset.width + 'px';

          renderPresets();
          updateActiveSpecBadge();
        });

        container.appendChild(pill);
      });
    }

    function updateActiveSpecBadge() {
      const nameEl = document.getElementById('activeDeviceName');
      const resEl = document.getElementById('activeResolution');

      const name = currentViewport.presetName || 'Custom Device';
      const icon = currentViewport.category === 'mobile' ? '📱 ' : (currentViewport.category === 'tablet' ? '📟 ' : '💻 ');
      nameEl.innerText = icon + name;
      resEl.innerText = currentViewport.width + '×' + currentViewport.height + ' (' + currentViewport.orientation + ')';
    }

    // Category Tabs
    document.querySelectorAll('.prop-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.prop-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentCategory = tab.getAttribute('data-category');
        document.getElementById('viewportCategoryLabel').innerText = currentCategory.toUpperCase();
        renderPresets();
      });
    });

    // Dynamic inputs
    const inW = document.getElementById('inputWidth');
    const inH = document.getElementById('inputHeight');
    const slider = document.getElementById('widthSlider');
    const sliderLabel = document.getElementById('sliderWidthLabel');

    function syncDynamicResolution(w, h) {
      currentViewport.width = parseInt(w, 10) || 1280;
      currentViewport.height = parseInt(h, 10) || 800;
      currentViewport.orientation = currentViewport.width >= currentViewport.height ? 'landscape' : 'portrait';
      currentViewport.presetId = 'custom';
      currentViewport.presetName = 'Dynamic (' + currentViewport.width + '×' + currentViewport.height + ')';
      currentViewport.category = currentViewport.width <= 480 ? 'mobile' : (currentViewport.width <= 1024 ? 'tablet' : 'web');
      currentViewport.mobile = currentViewport.width <= 768;

      updateActiveSpecBadge();
    }

    inW.addEventListener('input', () => {
      slider.value = inW.value;
      sliderLabel.innerText = inW.value + 'px';
      syncDynamicResolution(inW.value, inH.value);
    });

    inH.addEventListener('input', () => {
      syncDynamicResolution(inW.value, inH.value);
    });

    slider.addEventListener('input', () => {
      inW.value = slider.value;
      sliderLabel.innerText = slider.value + 'px';
      syncDynamicResolution(slider.value, inH.value);
    });

    document.getElementById('btnRotate').addEventListener('click', () => {
      const tmp = inW.value;
      inW.value = inH.value;
      inH.value = tmp;
      slider.value = inW.value;
      sliderLabel.innerText = inW.value + 'px';
      syncDynamicResolution(inW.value, inH.value);
    });

    document.getElementById('dprSelect').addEventListener('change', (e) => {
      currentViewport.deviceScaleFactor = parseFloat(e.target.value) || 1;
    });

    // Confirm & Launch Button
    document.getElementById('btnConfirmLaunch').addEventListener('click', () => {
      vscode.postMessage({
        command: 'confirmAndLaunch',
        landingPage: selectedLandingPage,
        viewport: currentViewport
      });
    });

    // Refresh landing pages button
    document.getElementById('btnRefreshLanding').addEventListener('click', (e) => {
      e.preventDefault();
      vscode.postMessage({ command: 'refreshLandingPages' });
    });

    // Platform-aware hotkey labels & shortcut detection
    const isMac = typeof navigator !== 'undefined' && (/Mac|iPod|iPhone|iPad/.test(navigator.platform) || /Macintosh/.test(navigator.userAgent));
    const pauseShortcutLabel = document.getElementById('pauseShortcutLabel');
    if (pauseShortcutLabel) {
      pauseShortcutLabel.innerText = isMac ? '(⌃⌘P / ⌥⇧P)' : '(Alt+Shift+P)';
    }
    const btnPauseElem = document.getElementById('btnPause');
    if (btnPauseElem) {
      btnPauseElem.title = isMac
        ? 'Pause / Resume Ghost Mouse Pin (Mac: ⌃⌘P or ⌥⌘P or Option+Shift+P)'
        : 'Pause / Resume Ghost Mouse Pin (Win/Linux: Alt+Shift+P)';
    }

    // In-webview keyboard shortcuts listener
    window.addEventListener('keydown', (e) => {
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const key = e.key.toLowerCase();
      const isMacPlatform = isMac;

      // Pause/Resume Ghost Pin:
      // Mac: Ctrl+Cmd+P, Cmd+Option+P, Option+Shift+P
      // Win/Linux: Alt+Shift+P, Ctrl+Alt+P
      const isPause = isMacPlatform
        ? ((e.ctrlKey && e.metaKey && key === 'p') || (e.metaKey && e.altKey && key === 'p') || (e.altKey && e.shiftKey && key === 'p'))
        : ((e.altKey && e.shiftKey && key === 'p') || (e.ctrlKey && e.altKey && key === 'p'));

      if (isPause) {
        e.preventDefault();
        vscode.postMessage({ command: 'pauseRecorder' });
        return;
      }

      // Start/Stop Live Flow Trace:
      // Mac: Ctrl+Cmd+R, Cmd+Option+R
      // Win/Linux: Alt+Shift+R
      const isTrace = isMacPlatform
        ? ((e.ctrlKey && e.metaKey && key === 'r') || (e.metaKey && e.altKey && key === 'r'))
        : (e.altKey && e.shiftKey && key === 'r');

      if (isTrace) {
        e.preventDefault();
        if (isSessionActive) {
          vscode.postMessage({ command: 'stopRecorder' });
        } else {
          vscode.postMessage({ command: 'startRecorder' });
        }
        return;
      }

      // Dynamic Breakpoint:
      // Mac: Ctrl+Cmd+D, Cmd+Option+D, Option+Shift+D
      // Win/Linux: Alt+Shift+D
      const isDebug = isMacPlatform
        ? ((e.ctrlKey && e.metaKey && key === 'd') || (e.metaKey && e.altKey && key === 'd') || (e.altKey && e.shiftKey && key === 'd'))
        : (e.altKey && e.shiftKey && key === 'd');

      if (isDebug) {
        e.preventDefault();
        vscode.postMessage({ command: 'debugOperation' });
        return;
      }
    });

    // Standard session buttons
    document.getElementById('btnPause').addEventListener('click', () => {
      vscode.postMessage({ command: 'pauseRecorder' });
    });

    document.getElementById('btnStop').addEventListener('click', () => {
      vscode.postMessage({ command: 'stopRecorder' });
    });

    document.getElementById('btnOpenFull').addEventListener('click', () => {
      vscode.postMessage({ command: 'openFullFlow' });
    });

    document.getElementById('btnMergeFlows').addEventListener('click', () => {
      vscode.postMessage({ command: 'mergeFlows' });
    });

    document.getElementById('btnExport').addEventListener('click', () => {
      vscode.postMessage({ command: 'exportSession' });
    });

    const btnExpVid = document.getElementById('btnExportVideo');
    if (btnExpVid) {
      btnExpVid.addEventListener('click', () => {
        vscode.postMessage({ command: 'exportVideo' });
      });
    }

    const btnVoice = document.getElementById('btnSidebarVoiceover');
    if (btnVoice) {
      btnVoice.addEventListener('click', () => {
        vscode.postMessage({ command: 'recordVoiceover' });
      });
    }

    const btnCopyT = document.getElementById('btnSidebarCopyTrans');
    if (btnCopyT) {
      btnCopyT.addEventListener('click', () => {
        vscode.postMessage({ command: 'copyTranscript', format: 'markdown' });
      });
    }

    const proBadgeEl = document.getElementById('proBadge');
    if (proBadgeEl) {
      proBadgeEl.addEventListener('click', () => {
        vscode.postMessage({ command: 'checkLicenseStatus' });
      });
    }

    const btnUploadA = document.getElementById('btnUploadActive');
    if (btnUploadA) {
      btnUploadA.addEventListener('click', () => {
        vscode.postMessage({ command: 'uploadSchema' });
      });
    }

    const btnUploadS = document.getElementById('btnUploadStartup');
    if (btnUploadS) {
      btnUploadS.addEventListener('click', () => {
        vscode.postMessage({ command: 'uploadSchema' });
      });
    }

    const btnLoadProj = document.getElementById('btnLoadProjectStartup');
    if (btnLoadProj) {
      btnLoadProj.addEventListener('click', () => {
        vscode.postMessage({ command: 'loadProject' });
      });
    }

    const btnPrevActive = document.getElementById('btnOpenLocalhostPreviewActive');
    if (btnPrevActive) {
      btnPrevActive.addEventListener('click', () => {
        vscode.postMessage({ command: 'openLocalhostPreview' });
      });
    }

    const btnPrevStartup = document.getElementById('btnOpenLocalhostPreviewStartup');
    if (btnPrevStartup) {
      btnPrevStartup.addEventListener('click', () => {
        vscode.postMessage({ command: 'openLocalhostPreview' });
      });
    }

    // Step Rendering
    function renderSteps() {
      const list = document.getElementById('stepsList');
      const countLabel = document.getElementById('stepCount');
      const nodes = currentData.nodes || [];

      countLabel.innerText = nodes.length + ' Steps';

      if (nodes.length === 0) {
        list.innerHTML =
          '<div style="color: var(--text-muted); font-size: 11px; text-align: center; padding: 20px 0;">' +
            'No recorded steps yet.<br>Confirm landing page & click Launch!' +
          '</div>';
        return;
      }

      list.innerHTML = '';
      nodes.forEach((node, idx) => {
        const item = document.createElement('div');
        const isLanding = node.id === 'screen_root' || node.step === 0;
        const isJunction = node.data?.isJunction;
        const isReturn = node.data?.isReturnCycle;

        let extraClass = '';
        let badgeType = 'action';
        let badgeText = node.data?.badge || 'ACTION';

        if (isLanding) {
          extraClass = ' landing-root';
          badgeType = 'landing';
          badgeText = 'TOP OF SCHEMA';
        } else if (isJunction) {
          extraClass = ' junction-node';
          badgeType = 'junction';
          badgeText = '🔀 JUNCTION';
        } else if (isReturn) {
          badgeType = 'return';
          badgeText = '⮌ RETURN';
        } else {
          badgeType = node.type || 'action';
        }

        let commentBadge = '';
        if (node.data?.comments && node.data.comments.length > 0) {
          commentBadge = '<span style="font-size: 9px; padding: 1px 4px; border-radius: 3px; background: rgba(167, 139, 250, 0.2); color: #a78bfa;">💬 ' + node.data.comments.length + '</span>';
        }

        item.className = 'step-item' + (selectedNode?.id === node.id ? ' active' : '') + extraClass;

        item.innerHTML =
          '<div class="step-top">' +
            '<div style="display: flex; gap: 4px; align-items: center;">' +
              '<span class="step-badge badge-' + badgeType + '">' + badgeText + '</span>' +
              commentBadge +
            '</div>' +
            '<span style="font-size: 10px; color: var(--text-muted); font-family: monospace;">#' + (node.step !== undefined ? node.step : idx) + '</span>' +
          '</div>' +
          '<div class="step-title">' + (node.data?.title || node.label) + '</div>' +
          '<div class="step-sub">' + (node.data?.subtitle || node.data?.selector || '') + '</div>';

        item.addEventListener('click', () => {
          selectNode(node);
        });

        list.appendChild(item);
      });
    }

    function selectNode(node) {
      selectedNode = node;
      renderSteps();

      const card = document.getElementById('inspectorCard');
      const d = node.data || {};
      const isLanding = node.id === 'screen_root' || node.step === 0;

      let html =
        '<div class="info-row">' +
          '<span class="info-label">Title / Action</span>' +
          '<span class="info-value">' + (d.title || node.label) + '</span>' +
        '</div>';

      if (d.flowPositionName) {
        html +=
          '<div class="info-row">' +
            '<span class="info-label">UX Flow Position</span>' +
            '<span class="info-value" style="color: var(--accent-cyan);">' +
              '📍 ' + d.flowPositionName + ' [' + (d.flowPhase || 'FLOW') + ']' +
            '</span>' +
          '</div>';
      }

      if (d.flowNames && d.flowNames.length > 1) {
        html +=
          '<div class="info-row">' +
            '<span class="info-label">Connected / Merged Flows</span>' +
            '<span class="info-value" style="color: var(--accent-purple);">' +
              '🔀 ' + d.flowNames.join(' + ') +
            '</span>' +
          '</div>';
      }

      if (isLanding && d.viewport) {
        html +=
          '<div class="info-row">' +
            '<span class="info-label">Device Viewing Proportions</span>' +
            '<span class="info-value" style="color: var(--accent-cyan);">' +
              (d.viewport.presetName || d.viewport.category.toUpperCase()) + ' (' + d.viewport.width + '×' + d.viewport.height + ' @ ' + d.viewport.deviceScaleFactor + 'x)' +
            '</span>' +
          '</div>';
      }

      if (d.attributes && d.attributes.length > 0) {
        html +=
          '<div style="margin-top: 8px; border-top: 1px solid var(--border-subtle); padding-top: 6px;">' +
            '<div style="font-size: 10px; font-weight: 700; color: #38bdf8; margin-bottom: 4px;">Entity Attributes</div>' +
            '<div style="background: #070c18; border: 1px solid var(--border-subtle); border-radius: 4px; padding: 4px 6px; font-family: monospace; font-size: 10px; max-height: 100px; overflow-y: auto;">' +
              d.attributes.map(a => '<div><span style="color: #94a3b8;">' + a.type + '</span> <strong style="color: #fff;">' + a.name + '</strong>' + (a.key ? ' <span style="color: #f59e0b;">(' + a.key + ')</span>' : '') + '</div>').join('') +
            '</div>' +
          '</div>';
      }

      if (d.componentName) {
        html +=
          '<div class="info-row">' +
            '<span class="info-label">Fiber Component</span>' +
            '<span class="info-value" style="color: var(--accent-cyan);">&lt;' + d.componentName + ' /&gt;</span>' +
          '</div>';
      }

      if (d.selector) {
        html +=
          '<div class="info-row">' +
            '<span class="info-label">DOM Selector</span>' +
            '<span class="info-value">' + d.selector + '</span>' +
          '</div>';
      }

      if (d.filePath) {
        html +=
          '<div class="info-row">' +
            '<span class="info-label">Source Code Location</span>' +
            '<span class="info-value">' + d.filePath + ':' + (d.lineNumber || 1) + '</span>' +
          '</div>';
      }

      if (d.handlerName) {
        html +=
          '<div class="info-row">' +
            '<span class="info-label">Handler Function</span>' +
            '<span class="info-value" style="color: var(--accent-emerald);">' + d.handlerName + '()</span>' +
          '</div>';
      }

      // Comments list and quick add
      const comments = d.comments || [];
      let commentsListHtml = '';
      if (comments.length === 0) {
        commentsListHtml = '<div style="font-size: 10px; color: var(--text-muted); font-style: italic;">No comments yet.</div>';
      } else {
        commentsListHtml = comments.map(c =>
          '<div style="background: rgba(49, 46, 129, 0.25); border: 1px solid rgba(167, 139, 250, 0.3); border-radius: 4px; padding: 4px 6px; margin-bottom: 4px;">' +
            '<div style="display: flex; justify-content: space-between; font-size: 9px; color: #a78bfa;">' +
              '<strong>' + (c.author || 'User') + '</strong>' +
              '<span>' + new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</span>' +
            '</div>' +
            '<div style="font-size: 10px; color: #f1f5f9; line-height: 1.3;">' + c.text + '</div>' +
          '</div>'
        ).join('');
      }

      html +=
        '<div style="margin-top: 10px; border-top: 1px solid var(--border-subtle); padding-top: 8px;">' +
          '<div style="font-size: 10px; font-weight: 700; color: #cbd5e1; margin-bottom: 4px;">💬 Comments (' + comments.length + ')</div>' +
          '<div style="max-height: 100px; overflow-y: auto;">' + commentsListHtml + '</div>' +
          '<div style="margin-top: 6px; display: flex; gap: 4px;">' +
            '<input type="text" id="inputSidebarComment" placeholder="Add comment..." style="flex: 1; background: #0f172a; border: 1px solid var(--border-subtle); border-radius: 4px; padding: 3px 6px; color: #fff; font-size: 10px;" />' +
            '<button id="btnPostSidebarComment" style="background: var(--accent-indigo); border: none; color: #fff; border-radius: 4px; padding: 3px 8px; cursor: pointer; font-size: 10px; font-weight: 600;">Post</button>' +
          '</div>' +
        '</div>';

      html +=
        '<div class="inspector-actions">' +
          (d.filePath ? '<button class="btn-primary" id="btnJump">📄 Jump to Source File</button>' : '') +
          (!isLanding ? '<button style="border-color: var(--accent-pink); color: var(--accent-pink);" id="btnDebug">🛑 Dynamic Breakpoint</button>' : '') +
        '</div>';

      card.innerHTML = html;

      const btnPostComment = document.getElementById('btnPostSidebarComment');
      if (btnPostComment) {
        btnPostComment.addEventListener('click', () => {
          const input = document.getElementById('inputSidebarComment');
          if (input && input.value.trim()) {
            vscode.postMessage({
              command: 'addComment',
              nodeId: node.id,
              text: input.value.trim(),
              author: 'Developer'
            });
            input.value = '';
          }
        });
      }

      const btnJump = document.getElementById('btnJump');
      if (btnJump) {
        btnJump.addEventListener('click', () => {
          vscode.postMessage({
            command: 'openFile',
            filePath: d.filePath,
            lineNumber: d.lineNumber
          });
        });
      }

      const btnDebug = document.getElementById('btnDebug');
      if (btnDebug) {
        btnDebug.addEventListener('click', () => {
          vscode.postMessage({
            command: 'debugStep',
            filePath: d.filePath,
            componentName: d.componentName,
            handlerName: d.handlerName,
            lineNumber: d.lineNumber
          });
        });
      }
    }

    // Tell extension we are ready to receive initial config
    vscode.postMessage({ command: 'ready' });
  </script>
</body>
</html>`;
  }
}
