import * as vscode from 'vscode';
import { FlowGraphModel } from '../graph/FlowGraphModel';
import { DebugController } from '../dap/DebugController';
import { MermaidExporter } from '../export/MermaidExporter';
import { PlaywrightExporter } from '../export/PlaywrightExporter';
import { MermaidSchemaParser } from '../parser/MermaidSchemaParser';
import { VideoRecordingExporter, VideoExportConfig } from '../export/VideoRecordingExporter';

export class FlowPanel {
  public static currentPanel: FlowPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];
  private model: FlowGraphModel;
  private debugController: DebugController;
  private isRecording: boolean = false;
  private isPaused: boolean = false;

  public static createOrShow(
    extensionUri: vscode.Uri,
    model: FlowGraphModel,
    debugController: DebugController,
    isRecording: boolean = false,
    isPaused: boolean = false
  ): FlowPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (FlowPanel.currentPanel) {
      FlowPanel.currentPanel.panel.reveal(column);
      FlowPanel.currentPanel.updateData(isRecording, isPaused);
      return FlowPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'flowtracer.flowLens',
      'Live Flow Tracer & UX Debugger',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri]
      }
    );

    panel.iconPath = vscode.Uri.joinPath(extensionUri, 'resources', 'icon.svg');

    FlowPanel.currentPanel = new FlowPanel(panel, extensionUri, model, debugController, isRecording, isPaused);
    return FlowPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    model: FlowGraphModel,
    debugController: DebugController,
    isRecording: boolean = false,
    isPaused: boolean = false
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.model = model;
    this.debugController = debugController;
    this.isRecording = isRecording;
    this.isPaused = isPaused;

    this.panel.webview.html = this.getHtmlForWebview();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      async (message: any) => {
        switch (message.command) {
          case 'startFlowTrace':
            if (message.url) {
              await vscode.commands.executeCommand('flowtracer.startRecorder', message.url);
            } else {
              await vscode.commands.executeCommand('flowtracer.startRecorder');
            }
            break;

          case 'stopFlowTrace':
            await vscode.commands.executeCommand('flowtracer.stopRecorder');
            break;

          case 'pauseFlowTrace':
            await vscode.commands.executeCommand('flowtracer.pauseRecorder');
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
            await this.debugController.setInlineBreakpoint(
              message.filePath,
              message.componentName,
              message.handlerName,
              message.lineNumber
            );
            break;

          case 'debugOperation':
            await vscode.commands.executeCommand('flowtracer.debugOperation');
            break;

          case 'exportMermaid':
            const mermaidCode = MermaidExporter.export(this.model);
            const docM = await vscode.workspace.openTextDocument({
              content: mermaidCode,
              language: 'markdown'
            });
            await vscode.window.showTextDocument(docM);
            vscode.window.showInformationMessage('Mermaid diagram generated!');
            break;

          case 'exportPlaywright':
            const specCode = PlaywrightExporter.export(this.model);
            const docP = await vscode.workspace.openTextDocument({
              content: specCode,
              language: 'typescript'
            });
            await vscode.window.showTextDocument(docP);
            vscode.window.showInformationMessage('Playwright E2E spec generated!');
            break;

          case 'mergeFlows':
            await vscode.commands.executeCommand('flowtracer.mergeFlows');
            break;

          case 'uploadSchema':
            await vscode.commands.executeCommand('flowtracer.uploadSchema');
            break;

          case 'saveVideoExport':
            await vscode.commands.executeCommand('flowtracer.exportVideo', message.config);
            break;

          case 'previewActionHighlights':
            const previewFrames = VideoRecordingExporter.generateActionHighlightFrames(this.model, message.config);
            this.panel.webview.postMessage({
              command: 'SET_STORYBOARD_PREVIEW',
              frames: previewFrames
            });
            break;

          case 'addComment':
            if (message.nodeId && message.text) {
              this.model.addCommentToNode(message.nodeId, message.text, message.author || 'User');
              this.updateData();
              vscode.window.showInformationMessage(`Comment added to node "${message.nodeId}".`);
            }
            break;

          case 'editNode':
            if (message.nodeId && message.updates) {
              this.model.updateNodeData(message.nodeId, message.updates);
              this.updateData();
              vscode.window.showInformationMessage(`Node "${message.nodeId}" updated.`);
            }
            break;

          case 'getSchemaSource':
            const source = MermaidExporter.export(this.model);
            this.panel.webview.postMessage({
              command: 'SET_SCHEMA_SOURCE',
              source,
              schemaType: this.model.schemaType
            });
            break;

          case 'saveSchemaSource':
            if (message.source) {
              try {
                const parsed = MermaidSchemaParser.parse(message.source, this.model.sessionId);
                this.model.loadFromModel(parsed.model);
                this.updateData();
                vscode.window.showInformationMessage(`Schema updated (${this.model.nodes.size} nodes, ${this.model.edges.length} edges).`);
              } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to parse schema: ${err.message}`);
              }
            }
            break;

          case 'saveSpeechTranscript':
            if (message.transcript) {
              this.model.addSpeechTranscript(message.transcript);
              this.updateData();
            }
            break;

          case 'clearSpeechTranscripts':
            this.model.clearSpeechTranscripts();
            this.updateData();
            vscode.window.showInformationMessage('Speech transcripts cleared.');
            break;

          case 'saveAudioTrack':
            if (message.track) {
              this.model.setAudioTrack(message.track);
              this.updateData();
              vscode.window.showInformationMessage(`Audio voiceover track saved (${message.track.durationSec.toFixed(1)}s).`);
            }
            break;

          case 'copyTranscript':
            const fmt = message.format || 'markdown';
            const copyContent = this.model.getFormattedTranscript(fmt);
            await vscode.env.clipboard.writeText(copyContent);
            vscode.window.showInformationMessage(`Copied ${fmt.toUpperCase()} transcript to clipboard (${this.model.speechTranscripts.length} entries).`);
            break;

          case 'openExternalUrl':
            if (message.url) {
              try {
                vscode.env.openExternal(vscode.Uri.parse(message.url));
              } catch (e: any) {
                vscode.window.showErrorMessage(`Failed to open URL: ${e.message}`);
              }
            }
            break;

          case 'showInfoNotification':
            if (message.text) {
              vscode.window.showInformationMessage(message.text);
            }
            break;

          case 'ready':
            this.updateData();
            break;
        }
      },
      null,
      this.disposables
    );
  }

  public showPreviewDocker(url?: string): void {
    this.panel.reveal(vscode.ViewColumn.One);
    this.panel.webview.postMessage({
      command: 'SHOW_PREVIEW_DOCKER',
      url: url || this.model.landingPage?.url || 'http://localhost:8081'
    });
  }

  public openVideoStudio(): void {
    this.panel.reveal(vscode.ViewColumn.One);
    this.panel.webview.postMessage({
      command: 'OPEN_VIDEO_STUDIO'
    });
  }

  public togglePreviewDocker(): void {
    this.panel.reveal(vscode.ViewColumn.One);
    this.panel.webview.postMessage({
      command: 'TOGGLE_PREVIEW_DOCKER'
    });
  }

  public updateData(isRecording?: boolean, isPaused?: boolean): void {
    if (typeof isRecording === 'boolean') this.isRecording = isRecording;
    if (typeof isPaused === 'boolean') this.isPaused = isPaused;
    if (this.panel) {
      this.panel.webview.postMessage({
        command: 'UPDATE_GRAPH',
        data: this.model.toJSON(),
        isRecording: this.isRecording,
        isPaused: this.isPaused
      });
    }
  }

  public dispose(): void {
    FlowPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const x = this.disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private getHtmlForWebview(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Live Flow Tracer & UX Debugger</title>
  <style>
    :root {
      --bg-base: #0a0e17;
      --bg-surface: rgba(18, 24, 38, 0.85);
      --bg-card: rgba(26, 35, 54, 0.7);
      --border-subtle: rgba(255, 255, 255, 0.08);
      --border-accent: rgba(56, 189, 248, 0.4);
      --accent-cyan: #38bdf8;
      --accent-indigo: #818cf8;
      --accent-emerald: #34d399;
      --accent-pink: #f472b6;
      --accent-purple: #c084fc;
      --accent-rose: #fb7185;
      --text-primary: #f8fafc;
      --text-muted: #94a3b8;
      --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background-color: var(--bg-base);
      color: var(--text-primary);
      font-family: var(--font-family);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      height: 100vh;
      user-select: none;
    }

    /* Header Bar */
    header {
      background: var(--bg-surface);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border-subtle);
      padding: 10px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      z-index: 10;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .pulse-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--accent-emerald);
      box-shadow: 0 0 10px var(--accent-emerald);
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0% { transform: scale(0.9); opacity: 0.8; }
      50% { transform: scale(1.3); opacity: 1; box-shadow: 0 0 16px var(--accent-emerald); }
      100% { transform: scale(0.9); opacity: 0.8; }
    }

    .brand h1 {
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.5px;
      background: linear-gradient(135deg, #fff, var(--accent-cyan));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .badge-session {
      font-size: 11px;
      padding: 3px 8px;
      background: rgba(56, 189, 248, 0.15);
      border: 1px solid rgba(56, 189, 248, 0.3);
      color: var(--accent-cyan);
      border-radius: 4px;
      font-family: monospace;
    }

    .actions {
      display: flex;
      gap: 8px;
    }

    button {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      color: var(--text-primary);
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }

    button:hover {
      background: rgba(56, 189, 248, 0.2);
      border-color: var(--accent-cyan);
      box-shadow: 0 0 12px rgba(56, 189, 248, 0.25);
    }

    button.btn-primary {
      background: linear-gradient(135deg, #0284c7, #2563eb);
      border-color: #38bdf8;
    }

    /* Flow Position Tracker Bar */
    .pos-tracker-bar {
      background: rgba(15, 23, 42, 0.95);
      border-bottom: 1px solid var(--border-subtle);
      padding: 6px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      z-index: 9;
    }

    .pos-tracker-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* Main Content Area */
    .main-container {
      display: flex;
      flex: 1;
      overflow: hidden;
      position: relative;
    }

    /* Graph Canvas */
    #graphCanvas {
      flex: 1;
      position: relative;
      background: radial-gradient(circle at 50% 50%, #111827 0%, #030712 100%);
      overflow: auto;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 60px;
    }

    /* Node Graph Grid */
    .flow-grid {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 50px;
      position: relative;
    }

    .flow-node {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      backdrop-filter: blur(10px);
      border-radius: 10px;
      width: 250px;
      padding: 14px;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
      cursor: pointer;
      position: relative;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .flow-node:hover {
      transform: translateY(-3px);
      border-color: var(--accent-cyan);
      box-shadow: 0 12px 35px rgba(56, 189, 248, 0.25);
    }

    .flow-node.active {
      border-color: var(--accent-cyan);
      box-shadow: 0 0 20px rgba(56, 189, 248, 0.4);
    }

    .flow-node.landing-root {
      border-color: rgba(52, 211, 153, 0.6);
      box-shadow: 0 0 25px rgba(52, 211, 153, 0.2);
    }

    .flow-node.junction-node {
      border-color: rgba(192, 132, 252, 0.6);
      background: rgba(192, 132, 252, 0.08);
      box-shadow: 0 0 25px rgba(192, 132, 252, 0.25);
    }

    .flow-node.return-node {
      border-color: rgba(244, 114, 182, 0.5);
      background: rgba(244, 114, 182, 0.06);
    }

    .node-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .node-pill {
      font-size: 9px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .pill-screen { background: rgba(56, 189, 248, 0.2); color: var(--accent-cyan); }
    .pill-landing { background: rgba(52, 211, 153, 0.2); color: var(--accent-emerald); border: 1px solid rgba(52, 211, 153, 0.4); }
    .pill-junction { background: rgba(192, 132, 252, 0.25); color: #c084fc; border: 1px solid rgba(192, 132, 252, 0.4); }
    .pill-return { background: rgba(244, 114, 182, 0.25); color: var(--accent-pink); border: 1px solid rgba(244, 114, 182, 0.4); }
    .pill-viewport { background: rgba(129, 140, 248, 0.2); color: var(--accent-indigo); font-family: monospace; }
    .pill-action { background: rgba(129, 140, 248, 0.2); color: var(--accent-indigo); }
    .pill-handler { background: rgba(52, 211, 153, 0.2); color: var(--accent-emerald); }
    .pill-breakpoint { background: rgba(244, 114, 182, 0.2); color: var(--accent-pink); }
    .pill-note { background: rgba(251, 113, 133, 0.2); color: var(--accent-rose); }

    .node-step {
      font-size: 11px;
      color: var(--text-muted);
      font-family: monospace;
    }

    .node-title {
      font-size: 13px;
      font-weight: 600;
      color: #fff;
      margin-bottom: 4px;
      word-break: break-word;
    }

    .node-subtitle {
      font-size: 11px;
      color: var(--text-muted);
      font-family: monospace;
      word-break: break-all;
    }

    .connector-arrow {
      position: absolute;
      right: -36px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--accent-cyan);
      font-size: 18px;
      opacity: 0.7;
    }

    /* Inspector Sidebar */
    aside.inspector {
      width: 320px;
      background: var(--bg-surface);
      backdrop-filter: blur(16px);
      border-left: 1px solid var(--border-subtle);
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow-y: auto;
    }

    .inspector h3 {
      font-size: 13px;
      text-transform: uppercase;
      color: var(--text-muted);
      letter-spacing: 0.8px;
      margin-bottom: 6px;
    }

    .prop-row {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 10px;
    }

    .prop-label {
      font-size: 10px;
      color: var(--text-muted);
      text-transform: uppercase;
    }

    .prop-value {
      font-size: 12px;
      color: var(--text-primary);
      background: rgba(0, 0, 0, 0.3);
      padding: 6px 10px;
      border-radius: 6px;
      font-family: monospace;
      word-break: break-all;
    }

    /* Timeline Scrubber */
    footer.timeline-bar {
      background: var(--bg-surface);
      border-top: 1px solid var(--border-subtle);
      padding: 10px 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      z-index: 10;
    }

    .timeline-steps {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
      overflow-x: auto;
      padding: 4px 0;
    }

    .timeline-pill {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 11px;
      cursor: pointer;
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .timeline-pill:hover, .timeline-pill.selected {
      border-color: var(--accent-cyan);
      background: rgba(56, 189, 248, 0.2);
    }

    /* Video Recording Studio Drawer */
    .format-selector-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(88px, 1fr));
      gap: 8px;
      margin-bottom: 14px;
    }

    .format-pill {
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 8px 6px;
      text-align: center;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      transition: all 0.15s ease;
    }

    .format-pill:hover {
      border-color: rgba(56, 189, 248, 0.4);
      background: rgba(56, 189, 248, 0.08);
    }

    .format-pill.selected {
      border-color: var(--accent-cyan);
      background: rgba(56, 189, 248, 0.18);
      box-shadow: 0 0 12px rgba(56, 189, 248, 0.25);
    }

    .format-pill .format-icon {
      font-size: 16px;
    }

    .format-pill .format-name {
      font-size: 11px;
      font-weight: 700;
      color: #fff;
    }

    .format-pill .format-ext {
      font-size: 9px;
      color: var(--text-muted);
      font-family: monospace;
    }

    .preset-selector-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(78px, 1fr));
      gap: 6px;
      margin-bottom: 14px;
    }

    .preset-btn {
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid var(--border-subtle);
      border-radius: 4px;
      padding: 6px 4px;
      text-align: center;
      cursor: pointer;
      font-size: 10px;
      color: var(--text-muted);
      font-weight: 600;
      transition: all 0.15s ease;
    }

    .preset-btn:hover {
      border-color: rgba(192, 132, 252, 0.4);
      color: #f1f5f9;
    }

    .preset-btn.selected {
      border-color: var(--accent-purple);
      background: rgba(192, 132, 252, 0.2);
      color: #e9d5ff;
      box-shadow: 0 0 8px rgba(192, 132, 252, 0.25);
    }

    /* File Size Estimator Card */
    .size-est-card {
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.9));
      border: 1px solid rgba(56, 189, 248, 0.3);
      border-radius: 8px;
      padding: 12px 14px;
      margin-bottom: 14px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    }

    .size-est-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
    }

    .size-est-title {
      font-size: 11px;
      font-weight: 700;
      color: var(--accent-cyan);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .size-est-number {
      font-size: 22px;
      font-weight: 800;
      color: #38bdf8;
      font-family: monospace;
      text-shadow: 0 0 10px rgba(56, 189, 248, 0.4);
    }

    .size-est-range {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 2px;
    }

    .size-est-meta {
      font-size: 10px;
      color: #94a3b8;
      font-family: monospace;
      margin-top: 6px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .size-est-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;
    }

    .badge-tag {
      font-size: 9px;
      padding: 2px 6px;
      border-radius: 9999px;
      font-weight: 600;
      letter-spacing: 0.3px;
    }

    .badge-tag.email-safe {
      background: rgba(52, 211, 153, 0.15);
      border: 1px solid rgba(52, 211, 153, 0.4);
      color: #34d399;
    }

    .badge-tag.slack-ready {
      background: rgba(56, 189, 248, 0.15);
      border: 1px solid rgba(56, 189, 248, 0.4);
      color: #38bdf8;
    }

    .badge-tag.demo-hd {
      background: rgba(192, 132, 252, 0.15);
      border: 1px solid rgba(192, 132, 252, 0.4);
      color: #c084fc;
    }

    /* Storyboard Strip */
    .storyboard-strip {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding: 8px 4px;
      max-height: 140px;
      background: rgba(3, 7, 18, 0.6);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      margin-top: 8px;
    }

    .storyboard-frame {
      flex: 0 0 120px;
      background: #090e1a;
      border: 1px solid var(--border-subtle);
      border-radius: 4px;
      padding: 4px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .storyboard-frame svg {
      width: 100%;
      height: 64px;
      border-radius: 2px;
    }

    .storyboard-frame-label {
      font-size: 9px;
      color: #e2e8f0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    /* ========================================================= */
    /* Scalable, Moveable, Collapsable Localhost Preview Docker  */
    /* ========================================================= */
    .preview-docker-container {
      position: absolute;
      top: 24px;
      right: 380px;
      width: 440px;
      height: 740px;
      min-width: 320px;
      min-height: 400px;
      max-width: 96%;
      max-height: 94%;
      background: rgba(10, 15, 29, 0.96);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(0, 240, 255, 0.4);
      border-radius: 12px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.75), 0 0 25px rgba(0, 240, 255, 0.15);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      z-index: 500;
      transition: box-shadow 0.2s ease, border-color 0.2s ease;
      container-type: inline-size;
      container-name: docker;
    }

    .preview-docker-container.docked {
      right: 0 !important;
      left: auto !important;
      top: 0 !important;
      bottom: 0 !important;
      height: 100% !important;
      max-height: 100% !important;
      border-radius: 0 !important;
      border-top: none;
      border-bottom: none;
      border-right: none;
      box-shadow: -8px 0 35px rgba(0, 0, 0, 0.8), 0 0 20px rgba(0, 240, 255, 0.12);
    }

    .preview-docker-container.maximized {
      top: 10px !important;
      bottom: 10px !important;
      left: 10px !important;
      right: 10px !important;
      width: calc(100% - 20px) !important;
      height: calc(100% - 20px) !important;
    }

    /* Docker Header / Move Drag Handle */
    .preview-docker-header {
      height: 36px;
      background: #0f172a;
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 8px;
      cursor: grab;
      user-select: none;
      flex-shrink: 0;
      gap: 4px;
      overflow: hidden;
      min-width: 0;
    }

    .preview-docker-header.dragging {
      cursor: grabbing;
    }

    .docker-title-area {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      font-weight: 700;
      color: #fff;
      flex-shrink: 1;
      min-width: 0;
      overflow: hidden;
    }

    .preview-drag-grip {
      color: var(--text-muted);
      font-size: 12px;
      letter-spacing: -2px;
      margin-right: 1px;
      flex-shrink: 0;
    }

    .preview-live-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--accent-emerald);
      box-shadow: 0 0 8px var(--accent-emerald);
      display: inline-block;
      flex-shrink: 0;
    }

    .preview-live-dot.pulse {
      animation: pulse 2s infinite;
    }

    .docker-title-text {
      letter-spacing: 0.5px;
      color: #f8fafc;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex-shrink: 1;
      min-width: 0;
    }

    .docker-port-badge {
      font-size: 9px;
      padding: 2px 5px;
      border-radius: 4px;
      background: rgba(56, 189, 248, 0.15);
      border: 1px solid rgba(56, 189, 248, 0.35);
      color: var(--accent-cyan);
      font-family: monospace;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .docker-header-actions {
      display: flex;
      align-items: center;
      gap: 3px;
      flex-shrink: 0;
      min-width: 0;
    }

    .docker-select {
      background: #030712;
      border: 1px solid var(--border-subtle);
      border-radius: 4px;
      color: #e2e8f0;
      font-size: 10px;
      padding: 2px 4px;
      cursor: pointer;
      outline: none;
      max-width: 120px;
      min-width: 48px;
      white-space: nowrap;
      text-overflow: ellipsis;
      overflow: hidden;
      flex-shrink: 1;
    }

    .docker-select:hover {
      border-color: var(--accent-cyan);
    }

    #previewZoomSelect {
      max-width: 52px;
      min-width: 38px;
    }

    .docker-icon-btn {
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted);
      border-radius: 4px;
      padding: 2px 4px;
      font-size: 11px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
      line-height: 1;
      min-width: 18px;
      height: 22px;
      flex-shrink: 0;
    }

    .docker-icon-btn:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
      border-color: var(--border-subtle);
    }

    .docker-icon-btn.active {
      color: var(--accent-cyan);
      background: rgba(56, 189, 248, 0.15);
      border-color: rgba(56, 189, 248, 0.4);
    }

    .docker-icon-btn.close-btn:hover {
      background: rgba(239, 68, 68, 0.2);
      color: #f87171;
      border-color: rgba(239, 68, 68, 0.4);
    }

    /* Container Queries & Responsive Classes for Dynamic Header Truncation */
    @container docker (max-width: 580px) {
      .docker-title-text {
        font-size: 10px;
      }
      .docker-select {
        max-width: 90px;
        font-size: 9px;
      }
      .docker-trace-btn {
        padding: 2px 6px;
      }
    }
    .preview-docker-header.header-compact .docker-title-text {
      font-size: 10px;
    }
    .preview-docker-header.header-compact .docker-select {
      max-width: 90px;
      font-size: 9px;
    }
    .preview-docker-header.header-compact .docker-trace-btn {
      padding: 2px 6px;
    }

    @container docker (max-width: 480px) {
      .preview-docker-header {
        padding: 0 6px;
        gap: 2px;
      }
      .docker-title-area {
        gap: 3px;
      }
      .docker-title-text {
        display: none !important;
      }
      .docker-trace-btn {
        margin-left: 2px;
        padding: 2px 5px;
        font-size: 9px;
        letter-spacing: 0;
      }
      .docker-select {
        max-width: 72px;
        padding: 2px 2px;
        font-size: 9px;
      }
      #previewZoomSelect {
        max-width: 44px;
      }
      .docker-icon-btn {
        padding: 2px 3px;
        min-width: 17px;
        font-size: 10px;
      }
      .url-protocol-prefix {
        display: none;
      }
      .bezel-btn-text {
        display: none;
      }
    }
    .preview-docker-header.header-tight {
      padding: 0 6px;
      gap: 2px;
    }
    .preview-docker-header.header-tight .docker-title-area {
      gap: 3px;
    }
    .preview-docker-header.header-tight .docker-title-text {
      display: none !important;
    }
    .preview-docker-header.header-tight .docker-trace-btn {
      margin-left: 2px;
      padding: 2px 5px;
      font-size: 9px;
      letter-spacing: 0;
    }
    .preview-docker-header.header-tight .docker-select {
      max-width: 72px;
      padding: 2px 2px;
      font-size: 9px;
    }
    .preview-docker-header.header-tight #previewZoomSelect {
      max-width: 44px;
    }
    .preview-docker-header.header-tight .docker-icon-btn {
      padding: 2px 3px;
      min-width: 17px;
      font-size: 10px;
    }
    .preview-docker-header.header-tight ~ .preview-address-bar .url-protocol-prefix,
    .preview-docker-header.header-tight ~ .preview-address-bar .bezel-btn-text {
      display: none;
    }

    @container docker (max-width: 380px) {
      .preview-docker-header {
        padding: 0 4px;
      }
      .preview-drag-grip {
        display: none;
      }
      .docker-port-badge {
        display: none !important;
      }
      .docker-trace-btn {
        font-size: 8.5px;
        padding: 2px 4px;
      }
      .docker-select {
        max-width: 52px;
      }
      #previewZoomSelect {
        max-width: 38px !important;
      }
      .docker-header-actions {
        gap: 1px;
      }
      .docker-icon-btn {
        min-width: 15px;
        font-size: 9px;
        padding: 2px 2px;
      }
    }
    .preview-docker-header.header-micro {
      padding: 0 4px;
    }
    .preview-docker-header.header-micro .preview-drag-grip {
      display: none;
    }
    .preview-docker-header.header-micro .docker-port-badge {
      display: none !important;
    }
    .preview-docker-header.header-micro .docker-trace-btn {
      font-size: 8.5px;
      padding: 2px 4px;
    }
    .preview-docker-header.header-micro .docker-select {
      max-width: 52px;
    }
    .preview-docker-header.header-micro #previewZoomSelect {
      max-width: 38px !important;
    }
    .preview-docker-header.header-micro .docker-header-actions {
      gap: 1px;
    }
    .preview-docker-header.header-micro .docker-icon-btn {
      min-width: 15px;
      font-size: 9px;
      padding: 2px 2px;
    }
    .preview-docker-header.header-micro ~ .preview-address-bar .url-protocol-prefix,
    .preview-docker-header.header-micro ~ .preview-address-bar .bezel-btn-text {
      display: none;
    }

    /* Address Bar */
    .preview-address-bar {
      height: 36px;
      background: #080d1a;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      flex-shrink: 0;
    }

    .url-input-wrapper {
      flex: 1;
      display: flex;
      align-items: center;
      background: #030712;
      border: 1px solid var(--border-subtle);
      border-radius: 4px;
      overflow: hidden;
    }

    .url-input-wrapper:focus-within {
      border-color: var(--accent-cyan);
      box-shadow: 0 0 8px rgba(56, 189, 248, 0.2);
    }

    .url-protocol-prefix {
      font-size: 10px;
      color: var(--text-muted);
      padding-left: 6px;
      user-select: none;
    }

    .docker-url-input {
      flex: 1;
      background: transparent;
      border: none;
      color: #fff;
      font-size: 11px;
      font-family: monospace;
      padding: 4px 6px;
      outline: none;
    }

    .url-go-btn {
      background: rgba(56, 189, 248, 0.15);
      border: none;
      border-left: 1px solid var(--border-subtle);
      color: var(--accent-cyan);
      font-size: 10px;
      font-weight: 700;
      padding: 4px 8px;
      cursor: pointer;
    }

    .url-go-btn:hover {
      background: rgba(56, 189, 248, 0.3);
    }

    .docker-pill-btn {
      background: rgba(56, 189, 248, 0.1);
      border: 1px solid rgba(56, 189, 248, 0.3);
      color: var(--accent-cyan);
      border-radius: 4px;
      font-size: 10px;
      padding: 3px 7px;
      cursor: pointer;
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .docker-pill-btn:hover {
      background: rgba(56, 189, 248, 0.2);
    }

    /* Quick Routes Strip */
    .preview-routes-bar {
      height: 26px;
      background: #050811;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 2px 10px;
      overflow-x: auto;
      flex-shrink: 0;
    }

    .routes-label {
      font-size: 9px;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      margin-right: 2px;
      flex-shrink: 0;
    }

    .route-chip {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #94a3b8;
      border-radius: 3px;
      padding: 1px 6px;
      font-size: 9px;
      font-family: monospace;
      cursor: pointer;
      white-space: nowrap;
      flex-shrink: 0;
      transition: all 0.15s ease;
    }

    .route-chip:hover {
      background: rgba(56, 189, 248, 0.15);
      border-color: rgba(56, 189, 248, 0.4);
      color: var(--accent-cyan);
    }

    /* Docker Body & Viewport */
    .preview-docker-body {
      flex: 1;
      position: relative;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #030712;
      padding: 10px;
    }

    .device-bezel-frame {
      width: 100%;
      height: 100%;
      position: relative;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: #000;
      box-sizing: border-box;
      transition: border 0.2s, border-radius 0.2s;
    }

    .device-bezel-frame.bezel-active {
      border: 8px solid #1e293b;
      border-radius: 36px;
      box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.25), 0 16px 36px rgba(0, 0, 0, 0.85);
    }

    .device-bezel-frame:not(.bezel-active) {
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
    }

    .device-dynamic-island {
      display: none;
      width: 76px;
      height: 16px;
      background: #000;
      border-radius: 10px;
      position: absolute;
      top: 6px;
      left: calc(50% - 38px);
      z-index: 10;
      box-shadow: 0 0 4px rgba(0,0,0,0.8);
      pointer-events: none;
    }

    .device-bezel-frame.bezel-active .device-dynamic-island {
      display: block;
    }

    #previewIframe {
      width: 100%;
      height: 100%;
      border: none;
      background: #05060A;
      display: block;
      flex: 1;
    }

    /* Iframe pointer events shield during drag/resize */
    .iframe-shield {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 100;
      display: none;
    }

    /* Docker Footer */
    .preview-docker-footer {
      height: 24px;
      background: #090e1a;
      border-top: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 8px;
      font-size: 10px;
      color: var(--text-muted);
      flex-shrink: 0;
      user-select: none;
    }

    .footer-left-info {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .footer-badge {
      font-size: 9px;
      padding: 1px 5px;
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.04);
      color: #94a3b8;
      font-family: monospace;
    }

    .footer-badge.status-live {
      color: var(--accent-emerald);
      border: 1px solid rgba(52, 211, 153, 0.3);
      background: rgba(52, 211, 153, 0.08);
    }

    .footer-right-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .footer-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 9px;
      cursor: pointer;
      padding: 1px 4px;
      border-radius: 3px;
    }

    .footer-btn:hover {
      color: #fff;
      background: rgba(255, 255, 255, 0.08);
    }

    .preview-resize-handle {
      width: 14px;
      height: 14px;
      cursor: nwse-resize;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.7;
      transition: opacity 0.15s ease;
    }

    .preview-resize-handle:hover {
      opacity: 1;
      filter: drop-shadow(0 0 4px var(--accent-cyan));
    }

    /* Collapsed Floating Dock Pill */
    .preview-dock-pill {
      position: absolute;
      bottom: 44px;
      right: 380px;
      z-index: 550;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(15, 23, 42, 0.94);
      border: 1px solid var(--accent-cyan);
      border-radius: 30px;
      padding: 7px 16px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6), 0 0 18px rgba(56, 189, 248, 0.35);
      font-size: 11px;
      font-weight: 600;
      color: #fff;
      user-select: none;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .preview-dock-pill:hover {
      transform: translateY(-2px);
      box-shadow: 0 14px 38px rgba(0, 0, 0, 0.7), 0 0 24px rgba(56, 189, 248, 0.55);
      border-color: #7dd3fc;
    }

    .dock-pill-expand-icon {
      font-size: 13px;
      color: var(--accent-cyan);
    }

    /* Header Dedicated Flow Trace Button */
    .btn-header-trace {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      letter-spacing: 0.02em;
    }

    .btn-header-trace.idle {
      background: linear-gradient(135deg, rgba(244, 63, 94, 0.16), rgba(225, 29, 72, 0.26));
      border: 1px solid #f43f5e;
      color: #fda4af;
      box-shadow: 0 0 10px rgba(244, 63, 94, 0.25);
    }

    .btn-header-trace.idle:hover {
      background: linear-gradient(135deg, rgba(244, 63, 94, 0.3), rgba(225, 29, 72, 0.45));
      border-color: #fb7185;
      color: #fff;
      box-shadow: 0 0 16px rgba(244, 63, 94, 0.45);
      transform: translateY(-1px);
    }

    .btn-header-trace.recording {
      background: linear-gradient(135deg, #e11d48, #be123c);
      border: 1px solid #fda4af;
      color: #fff;
      box-shadow: 0 0 16px rgba(244, 63, 94, 0.7);
      animation: tracePulse 1.5s infinite;
    }

    .btn-header-trace.recording:hover {
      background: linear-gradient(135deg, #f43f5e, #e11d48);
      box-shadow: 0 0 22px rgba(244, 63, 94, 0.9);
    }

    /* Docker Header Dedicated Trace Button */
    .docker-trace-btn {
      margin-left: 8px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 10px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      letter-spacing: 0.02em;
    }

    .docker-trace-btn.idle {
      background: rgba(244, 63, 94, 0.15);
      border: 1px solid rgba(244, 63, 94, 0.6);
      color: #fda4af;
    }

    .docker-trace-btn.idle:hover {
      background: rgba(244, 63, 94, 0.3);
      border-color: #f43f5e;
      color: #fff;
      box-shadow: 0 0 10px rgba(244, 63, 94, 0.4);
    }

    .docker-trace-btn.recording {
      background: #e11d48;
      border: 1px solid #fda4af;
      color: #fff;
      box-shadow: 0 0 12px rgba(244, 63, 94, 0.75);
      animation: tracePulse 1.5s infinite;
    }

    .docker-trace-btn.recording:hover {
      background: #f43f5e;
      box-shadow: 0 0 18px rgba(244, 63, 94, 0.9);
    }

    @keyframes tracePulse {
      0%, 100% {
        box-shadow: 0 0 10px rgba(244, 63, 94, 0.5);
      }
      50% {
        box-shadow: 0 0 20px rgba(244, 63, 94, 0.9);
      }
    }
  </style>
</head>
<body>

  <header>
    <div class="brand">
      <div class="pulse-dot" id="headerPulseDot"></div>
      <h1>LIVE FLOW TRACER & UX DEBUGGER</h1>
      <span class="badge-session" id="sessionLabel">IDLE</span>
      <span class="badge-session" id="viewportBadge" style="display: none; border-color: rgba(56, 189, 248, 0.4); color: var(--accent-cyan);"></span>
    </div>
    <div class="actions">
      <button id="btnHeaderTraceToggle" class="btn-header-trace idle" title="Start Live Recording of User Flows">⏺ Start Flow Trace</button>
      <button id="btnTogglePreview" style="border-color: #00f0ff; color: #00f0ff; background: rgba(0, 240, 255, 0.12); font-weight: 600;">📱 Localhost Preview</button>
      <button id="btnUploadSchema" style="border-color: #34d399; color: #34d399;">📁 Upload Schema</button>
      <button id="btnEditSchema" style="border-color: #f59e0b; color: #f59e0b;">✏️ Edit Source</button>
      <button id="btnMergeFlows" style="border-color: var(--accent-purple); color: var(--accent-purple);">🔗 Merge Flows</button>
      <button id="btnMermaid">📊 Export Mermaid (.mmd)</button>
      <button id="btnPlaywright">🎭 Export Playwright (.spec.ts)</button>
      <button id="btnVideoStudio" style="border-color: #f43f5e; color: #f43f5e; background: rgba(244, 63, 94, 0.1);">🎬 Video Studio (MP4 / Dubbing)</button>
    </div>
  </header>

  <!-- Flow Position & Breadcrumb Tracker Bar -->
  <div class="pos-tracker-bar" id="posTrackerBar">
    <div class="pos-tracker-left">
      <span style="color: var(--accent-indigo); font-size: 13px;">📍</span>
      <strong id="posCurrentTitle" style="font-size: 11px; color: #fff;">Landing / Entry</strong>
      <span style="color: var(--border-subtle);">|</span>
      <span id="posBreadcrumbTrail" style="font-family: monospace; font-size: 11px; color: var(--text-muted);">Landing</span>
    </div>
    <div id="unifiedFlowBadge" style="display: none; font-size: 10px; padding: 2px 8px; border-radius: 4px; background: rgba(192, 132, 252, 0.15); border: 1px solid rgba(192, 132, 252, 0.4); color: #c084fc;">
      🔀 Unified Schema
    </div>
  </div>

  <div class="main-container">
    <div id="graphCanvas">
      <div class="flow-grid" id="flowGrid">
        <div style="color: var(--text-muted); font-size: 13px;">Waiting for user interactions or recorded session...</div>
      </div>
    </div>

    <aside class="inspector" id="inspector">
      <h3>Step Inspector</h3>
      <div id="inspectorDetails">
        <p style="color: var(--text-muted); font-size: 12px;">Select a node in the graph to inspect AST metadata, component source, and dynamic breakpoints.</p>
      </div>
    </aside>

    <!-- Moveable, Scalable, Collapsable Localhost Preview Docker -->
    <div id="localhostPreviewDocker" class="preview-docker-container" style="display: none;">
      <!-- Iframe Shield to capture drag/resize over iframe -->
      <div id="previewIframeShield" class="iframe-shield"></div>

      <!-- Docker Header (Drag Handle) -->
      <div id="previewDockerHeader" class="preview-docker-header">
        <div class="docker-title-area">
          <span class="preview-drag-grip" title="Drag to move preview window">⋮⋮</span>
          <span class="preview-live-dot pulse" id="previewLiveBeacon" title="Localhost Dev Server Status"></span>
          <span class="docker-title-text" id="dockerTitleText">LOCAL PREVIEW</span>
          <span class="docker-port-badge" id="previewPortBadge">localhost:8081</span>
          <button id="btnDockerTraceToggle" class="docker-trace-btn idle" title="Start Live Flow Trace from preview (Mac: ⌃⌘R or ⌥⌘R | Win: Alt+Shift+R)">⏺ Start Trace</button>
        </div>

        <div class="docker-header-actions">
          <!-- Preset Selector -->
          <select id="previewPresetSelect" class="docker-select" title="Switch Device Viewing Preset">
            <option value="mobile-iphone-16-pro" selected>📱 iPhone 16 Pro (393×852)</option>
            <option value="mobile-pixel-9">📱 Pixel 9 (412×915)</option>
            <option value="tablet-ipad-air">📟 iPad Air (820×1180)</option>
            <option value="desktop-laptop">💻 Laptop (1280×800)</option>
            <option value="desktop-fhd">💻 Desktop (1920×1080)</option>
            <option value="compact">⚡ Compact (360×640)</option>
            <option value="custom">⚙️ Custom Scale</option>
          </select>

          <!-- Rotate orientation -->
          <button id="btnPreviewRotate" class="docker-icon-btn" title="Rotate / Swap Orientation (Portrait / Landscape)">🔄</button>

          <!-- Scale zoom multiplier -->
          <select id="previewZoomSelect" class="docker-select" title="Scale Zoom Multiplier">
            <option value="1">100%</option>
            <option value="0.85">85%</option>
            <option value="0.75" selected>75%</option>
            <option value="0.6">60%</option>
            <option value="0.5">50%</option>
            <option value="fit">Fit</option>
          </select>

          <!-- Dock to Side / Floating Toggle -->
          <button id="btnPreviewDockToggle" class="docker-icon-btn" title="Toggle Docked Side Panel vs Floating Window">📌</button>

          <!-- Minimize / Collapse to Pill -->
          <button id="btnPreviewMinimize" class="docker-icon-btn" title="Minimize / Collapse Preview Window">—</button>

          <!-- Maximize / Restore -->
          <button id="btnPreviewMaximize" class="docker-icon-btn" title="Maximize Height / Restore">⛶</button>

          <!-- Close -->
          <button id="btnPreviewClose" class="docker-icon-btn close-btn" title="Close Preview Window">✕</button>
        </div>
      </div>

      <!-- Address Bar & Quick Route Chips -->
      <div class="preview-address-bar">
        <button id="btnPreviewReload" class="docker-icon-btn" title="Reload / Refresh Localhost Screen">🔄</button>
        <div class="url-input-wrapper">
          <span class="url-protocol-prefix">http://</span>
          <input type="text" id="previewUrlInput" class="docker-url-input" value="http://localhost:8081" placeholder="localhost:8081..." spellcheck="false" />
          <button id="btnPreviewGo" class="url-go-btn" title="Navigate to URL">Go</button>
        </div>
        <button id="btnPreviewBezelToggle" class="docker-pill-btn" title="Toggle Mobile Phone Bezel / Borderless Frame"><span>📱</span><span class="bezel-btn-text"> Bezel</span></button>
        <button id="btnPreviewExternal" class="docker-icon-btn" title="Open in External Browser">↗️</button>
      </div>

      <!-- Quick Routes Bar -->
      <div class="preview-routes-bar" id="previewQuickRoutes">
        <span class="routes-label">Routes:</span>
        <button class="route-chip" data-path="/">/ (Home)</button>
        <button class="route-chip" data-path="/join">/join</button>
        <button class="route-chip" data-path="/onboarding">/onboarding</button>
        <button class="route-chip" data-path="/(tabs)/draft">/draft</button>
        <button class="route-chip" data-path="/profile-setup">/profile</button>
      </div>

      <!-- Docker Body / Viewport Frame -->
      <div id="previewDockerBody" class="preview-docker-body">
        <div id="previewDeviceFrame" class="device-bezel-frame bezel-active">
          <!-- Optional Dynamic Island / Notch -->
          <div id="deviceDynamicIsland" class="device-dynamic-island"></div>

          <!-- The Live Localhost Iframe -->
          <iframe id="previewIframe" src="http://localhost:8081" allow="geolocation; microphone; camera; display-capture"></iframe>

          <!-- Fallback / Server Disconnected Overlay -->
          <div id="previewOfflineOverlay" class="preview-offline-overlay" style="display: none; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(3, 7, 18, 0.92); z-index: 20; flex-direction: column; align-items: center; justify-content: center; padding: 24px; text-align: center;">
            <div style="font-size: 32px; margin-bottom: 8px;">🌐</div>
            <h3 style="font-size: 13px; color: #fff; margin-bottom: 6px;">Waiting for Localhost Server...</h3>
            <p style="font-size: 11px; color: var(--text-muted); margin-bottom: 12px; max-width: 280px;">Could not connect to <span id="offlineTargetUrl" style="color: var(--accent-cyan); font-family: monospace;">http://localhost:8081</span>.</p>
            <div style="background: rgba(255,255,255,0.05); border: 1px dashed var(--border-subtle); border-radius: 6px; padding: 8px 12px; font-size: 10px; color: #e2e8f0; margin-bottom: 14px; text-align: left;">
              <strong>Tip:</strong> Run <code style="color: var(--accent-cyan); font-family: monospace;">npm run web</code> in your terminal to start Expo Web on port 8081.
            </div>
            <div style="display: flex; gap: 8px;">
              <button id="btnRetryConnection" class="btn-primary" style="padding: 5px 12px; font-size: 11px;">🔄 Retry</button>
              <button id="btnSwitchPort3000" style="padding: 5px 12px; font-size: 11px; background: rgba(255,255,255,0.06); border: 1px solid var(--border-subtle); color: #fff; border-radius: 4px; cursor: pointer;">Try Port 3000</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Docker Footer & Resize Handle -->
      <div class="preview-docker-footer">
        <div class="footer-left-info">
          <span id="footerDimLabel" class="footer-badge">393 × 852 px</span>
          <span id="footerScaleLabel" class="footer-badge">75% Zoom</span>
          <span id="footerStatusLabel" class="footer-badge status-live">Live</span>
        </div>
        <div class="footer-right-actions">
          <button id="btnResetPreviewPos" class="footer-btn" title="Reset to Default Floating Position">📍 Center</button>
          <!-- Corner Resize Handle -->
          <div id="previewResizeHandle" class="preview-resize-handle" title="Drag corner to scale preview window">
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="9" y1="1" x2="1" y2="9" stroke="var(--accent-cyan)" stroke-width="1.5" stroke-linecap="round" />
              <line x1="9" y1="5" x2="5" y2="9" stroke="var(--accent-cyan)" stroke-width="1.5" stroke-linecap="round" />
            </svg>
          </div>
        </div>
      </div>
    </div>

    <!-- Collapsed Floating Dock Pill -->
    <div id="previewDockPill" class="preview-dock-pill" style="display: none;" title="Click to expand Localhost Preview Window">
      <span class="preview-live-dot pulse"></span>
      <span class="dock-pill-title" id="dockPillTitle">Localhost Preview (8081)</span>
      <span class="dock-pill-expand-icon">⤢</span>
    </div>
  </div>

  <!-- Schema Source Editor Drawer -->
  <div id="schemaEditorDrawer" style="display: none; position: fixed; top: 50px; right: 0; bottom: 38px; width: 500px; background: #0b1120; border-left: 1px solid var(--border-subtle); box-shadow: -8px 0 32px rgba(0,0,0,0.7); z-index: 1000; flex-direction: column;">
    <div style="padding: 12px 16px; border-bottom: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: space-between; background: #0f172a;">
      <div style="font-size: 12px; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 8px;">
        <span>✏️ Schema Source Editor</span>
        <span id="editorFormatBadge" style="font-size: 9px; padding: 2px 6px; border-radius: 4px; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.4); color: var(--accent-cyan);">MERMAID / ERD</span>
      </div>
      <button id="btnCloseEditor" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 16px; padding: 2px 6px;">✕</button>
    </div>
    <div style="padding: 8px 16px; font-size: 11px; color: var(--text-muted); background: #090e1a; border-bottom: 1px solid rgba(255,255,255,0.05);">
      Edit Flowchart, ERD (erDiagram), State Diagram, or JSON below. Changes will live-sync to the visual graph.
    </div>
    <textarea id="schemaSourceText" placeholder="Paste or edit Mermaid/ERD syntax here..." style="flex: 1; width: 100%; box-sizing: border-box; background: #030712; color: #e2e8f0; font-family: monospace; font-size: 12px; padding: 14px; border: none; resize: none; outline: none; line-height: 1.5;"></textarea>
    <div style="padding: 12px 16px; border-top: 1px solid var(--border-subtle); background: #0f172a; display: flex; justify-content: flex-end; gap: 8px;">
      <button id="btnCancelEditor" style="background: transparent; border: 1px solid var(--border-subtle); color: var(--text-muted); padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 11px;">Cancel</button>
      <button id="btnApplyEditor" style="background: var(--accent-indigo); border: 1px solid rgba(129, 140, 248, 0.5); color: #fff; padding: 6px 14px; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 11px;">✓ Apply & Sync Graph</button>
    </div>
  </div>

  <!-- Video Recording Studio Drawer -->
  <div id="videoStudioDrawer" style="display: none; position: fixed; top: 50px; right: 0; bottom: 38px; width: 520px; background: #0b1120; border-left: 1px solid var(--border-subtle); box-shadow: -8px 0 32px rgba(0,0,0,0.7); z-index: 1000; flex-direction: column; overflow-y: auto;">
    <div style="padding: 12px 16px; border-bottom: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: space-between; background: #0f172a; flex-shrink: 0;">
      <div style="font-size: 13px; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 8px;">
        <span>🎥 Recording & Video Studio</span>
        <span style="font-size: 9px; padding: 2px 6px; border-radius: 4px; background: rgba(244, 63, 94, 0.15); border: 1px solid rgba(244, 63, 94, 0.4); color: #fb7185;">EXPORT & MARKETING</span>
      </div>
      <button id="btnCloseVideoStudio" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 16px; padding: 2px 6px;">✕</button>
    </div>

    <div style="padding: 16px; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 14px;">
      <!-- Format Selection -->
      <div>
        <label style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); display: block; margin-bottom: 6px;">1. Export Format</label>
        <div class="format-selector-grid" id="formatPillsContainer">
          <div class="format-pill selected" data-format="mp4">
            <span class="format-icon">🎬</span>
            <span class="format-name">MP4</span>
            <span class="format-ext">.mp4</span>
          </div>
          <div class="format-pill" data-format="webm">
            <span class="format-icon">🌐</span>
            <span class="format-name">WebM</span>
            <span class="format-ext">.webm</span>
          </div>
          <div class="format-pill" data-format="gif">
            <span class="format-icon">🎞️</span>
            <span class="format-name">GIF</span>
            <span class="format-ext">.gif</span>
          </div>
          <div class="format-pill" data-format="frames">
            <span class="format-icon">🖼️</span>
            <span class="format-name">Frames</span>
            <span class="format-ext">.svg/.png</span>
          </div>
          <div class="format-pill" data-format="html5">
            <span class="format-icon">⚡</span>
            <span class="format-name">HTML5</span>
            <span class="format-ext">.html</span>
          </div>
        </div>
      </div>

      <!-- Compression Presets -->
      <div>
        <label style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); display: block; margin-bottom: 6px;">2. Compression Presets</label>
        <div class="preset-selector-grid" id="presetBtnsContainer">
          <button class="preset-btn" data-preset="ultra">Ultra (HQ)</button>
          <button class="preset-btn" data-preset="high">High</button>
          <button class="preset-btn selected" data-preset="balanced">Balanced</button>
          <button class="preset-btn" data-preset="compact">Compact</button>
          <button class="preset-btn" data-preset="maximum">Max Comp</button>
        </div>
      </div>

      <!-- Live File Size Estimator Card -->
      <div class="size-est-card">
        <div class="size-est-header">
          <span class="size-est-title">📊 Live File Size Estimator</span>
          <span id="estCodecPill" style="font-size: 9px; font-family: monospace; color: var(--accent-cyan); background: rgba(56, 189, 248, 0.15); padding: 2px 6px; border-radius: 4px;">H.264 / AAC</span>
        </div>
        <div style="display: flex; align-items: baseline; gap: 8px;">
          <span class="size-est-number" id="estSizeVal">1.8 MB</span>
          <span class="size-est-range" id="estRangeVal">(1.4 MB – 2.2 MB)</span>
        </div>
        <div class="size-est-meta" id="estMetaVal">
          <span>⏱ Duration: 6.0s</span> •
          <span>🎞 Total Frames: 180</span> •
          <span>⚡ Bitrate: 2,400 kbps</span>
        </div>
        <div class="size-est-badges" id="estBadgesVal">
          <span class="badge-tag email-safe">✉️ EMAIL SAFE (&lt;10MB)</span>
          <span class="badge-tag slack-ready">💬 SLACK READY (&lt;25MB)</span>
        </div>
      </div>

      <!-- Advanced Video Settings -->
      <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 12px; display: flex; flex-direction: column; gap: 10px;">
        <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);">3. Advanced Settings & Overlays</span>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div>
            <label style="font-size: 10px; color: var(--text-muted); display: block; margin-bottom: 4px;">Resolution Scale</label>
            <select id="videoScaleSelect" style="width: 100%; background: #030712; border: 1px solid var(--border-subtle); border-radius: 4px; color: #fff; padding: 6px; font-size: 11px;">
              <option value="1.0">100% (Original)</option>
              <option value="0.75">75% (HD Scale)</option>
              <option value="0.5">50% (Mobile/Web)</option>
              <option value="0.25">25% (Thumbnail/Preview)</option>
              <option value="1080p">1920×1080 (1080p)</option>
              <option value="720p">1280×720 (720p)</option>
              <option value="480p">854×480 (480p)</option>
            </select>
          </div>
          <div>
            <label style="font-size: 10px; color: var(--text-muted); display: block; margin-bottom: 4px;">Framerate (FPS)</label>
            <select id="videoFpsSelect" style="width: 100%; background: #030712; border: 1px solid var(--border-subtle); border-radius: 4px; color: #fff; padding: 6px; font-size: 11px;">
              <option value="15">15 fps (Compact)</option>
              <option value="24">24 fps (Cinematic)</option>
              <option value="30" selected>30 fps (Standard)</option>
              <option value="60">60 fps (Smooth 60Hz)</option>
            </select>
          </div>
        </div>

        <div>
          <div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--text-muted); margin-bottom: 4px;">
            <span>Step Dwell Time</span>
            <span id="dwellTimeLabel" style="color: #38bdf8; font-family: monospace;">1200 ms</span>
          </div>
          <input type="range" id="videoDwellSlider" min="400" max="3500" step="100" value="1200" style="width: 100%; cursor: pointer;" />
        </div>

        <div>
          <label style="font-size: 10px; color: var(--text-muted); display: block; margin-bottom: 4px;">Marketing Title / Watermark</label>
          <input type="text" id="videoMarketingTitle" placeholder="e.g. Live App Flow Demo" value="Live Flow UX Demo" style="width: 100%; box-sizing: border-box; background: #030712; border: 1px solid var(--border-subtle); border-radius: 4px; color: #fff; padding: 6px 8px; font-size: 11px;" />
        </div>

        <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 4px;">
          <label style="display: flex; align-items: center; gap: 8px; font-size: 11px; cursor: pointer; color: #e2e8f0;">
            <input type="checkbox" id="chkActionHighlights" checked />
            <span>✨ Action Highlights (Glowing Cursor Beacon & Step Badges)</span>
          </label>
          <label style="display: flex; align-items: center; gap: 8px; font-size: 11px; cursor: pointer; color: #e2e8f0;">
            <input type="checkbox" id="chkFlowPosition" checked />
            <span>📍 Overlay UX Flow Position Badge (e.g. [LANDING] ➔ [AUTH])</span>
          </label>
        </div>
      </div>

      <!-- Action Highlights Storyboard Preview -->
      <div>
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <label style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);">4. Action Highlights Storyboard</label>
          <button id="btnPreviewStoryboard" style="background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.4); color: var(--accent-cyan); padding: 3px 8px; border-radius: 4px; font-size: 10px; cursor: pointer; font-weight: 600;">🔍 Preview Frames</button>
        </div>
        <div class="storyboard-strip" id="storyboardContainer">
          <div style="color: var(--text-muted); font-size: 11px; padding: 8px; align-self: center;">Click "Preview Frames" to render SVG action highlight storyboard cards.</div>
        </div>
      </div>

      <!-- 5. Microphone Dubbing & Speech-to-Text Written Records -->
      <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(168, 85, 247, 0.3); border-radius: 6px; padding: 12px; display: flex; flex-direction: column; gap: 10px;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <label style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #c084fc; display: flex; align-items: center; gap: 6px;">
            <span>🎙️ 5. Audio Dubbing &amp; Speech-to-Text</span>
            <span style="font-size: 9px; padding: 1px 5px; border-radius: 3px; background: rgba(168, 85, 247, 0.2); border: 1px solid rgba(168, 85, 247, 0.4); color: #d8b4fe;">VOICEOVER + STT</span>
          </label>
          <span id="micStatusBadge" style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: rgba(100, 116, 139, 0.2); color: #94a3b8; font-family: monospace;">READY</span>
        </div>

        <div style="display: flex; flex-direction: column; gap: 6px;">
          <label style="display: flex; align-items: center; gap: 8px; font-size: 11px; cursor: pointer; color: #e2e8f0;">
            <input type="checkbox" id="chkAudioDub" />
            <span>🎙️ Dub Over Microphone Audio Track (128 kbps)</span>
          </label>
          <label style="display: flex; align-items: center; gap: 8px; font-size: 11px; cursor: pointer; color: #e2e8f0;">
            <input type="checkbox" id="chkSpeechToText" checked />
            <span>📝 Speech-to-Text Annotations mapped to Flow Steps</span>
          </label>
        </div>

        <!-- VU Level Meter & Recording Controls -->
        <div style="background: #070c18; border: 1px solid var(--border-subtle); border-radius: 4px; padding: 8px; display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 10px; color: var(--text-muted); width: 65px;">MIC LEVEL:</span>
            <div style="flex: 1; height: 8px; background: rgba(255,255,255,0.06); border-radius: 4px; overflow: hidden;">
              <div id="vuMeterBar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #34d399, #facc15, #f43f5e); transition: width 0.08s ease-out;"></div>
            </div>
            <span id="micTimerLabel" style="font-size: 10px; font-family: monospace; color: #38bdf8; width: 40px; text-align: right;">00:00</span>
          </div>

          <div style="display: flex; gap: 6px;">
            <button id="btnStartVoiceover" style="flex: 1; background: rgba(244, 63, 94, 0.2); border: 1px solid rgba(244, 63, 94, 0.5); color: #fb7185; padding: 5px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
              <span>⏺ Record</span>
            </button>
            <button id="btnPauseVoiceover" style="background: #1e293b; border: 1px solid var(--border-subtle); color: #fff; padding: 5px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;">
              <span>⏸ Pause</span>
            </button>
            <button id="btnStopVoiceover" style="background: #1e293b; border: 1px solid var(--border-subtle); color: #fff; padding: 5px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;">
              <span>⏹ Stop</span>
            </button>
            <button id="btnClearVoiceover" style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171; padding: 5px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;" title="Clear Audio Track and Transcripts">
              <span>🗑 Clear</span>
            </button>
          </div>
        </div>

        <!-- Live STT Preview Card -->
        <div style="background: #030712; border: 1px dashed rgba(168, 85, 247, 0.4); border-radius: 4px; padding: 8px;">
          <div style="font-size: 9px; font-weight: 700; color: #a855f7; margin-bottom: 3px; display: flex; justify-content: space-between;">
            <span>LIVE SPEECH RECOGNITION (STT)</span>
            <span id="sttConfidenceLabel" style="font-family: monospace; color: var(--text-muted);">95% confidence</span>
          </div>
          <div id="liveSttText" style="font-size: 11px; color: #e2e8f0; font-style: italic; min-height: 28px; display: flex; align-items: center;">
            Speak into your microphone or click "Record" to annotate user flow steps...
          </div>
        </div>

        <!-- Written Records Copy-Paste Section -->
        <div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <span style="font-size: 10px; font-weight: 700; color: #e2e8f0;">WRITTEN RECORDS (COPY &amp; PASTE):</span>
            <div style="display: flex; gap: 4px;">
              <button id="btnCopyMdTrans" style="background: #1e293b; border: 1px solid var(--border-subtle); color: #fff; padding: 3px 6px; border-radius: 3px; font-size: 9px; font-weight: 600; cursor: pointer;" title="Copy Markdown table for PRs and Documentation">📋 Markdown</button>
              <button id="btnCopyPlainTrans" style="background: #1e293b; border: 1px solid var(--border-subtle); color: #fff; padding: 3px 6px; border-radius: 3px; font-size: 9px; font-weight: 600; cursor: pointer;" title="Copy Plain Text for Slack/Chat">📋 Plain Text</button>
              <button id="btnCopyJiraTrans" style="background: #1e293b; border: 1px solid var(--border-subtle); color: #fff; padding: 3px 6px; border-radius: 3px; font-size: 9px; font-weight: 600; cursor: pointer;" title="Copy Jira Issue Table Markup">📋 Jira</button>
            </div>
          </div>
          <div id="drawerTranscriptsContainer" style="max-height: 140px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; background: #030712; border: 1px solid var(--border-subtle); border-radius: 4px; padding: 6px;">
            <div style="color: var(--text-muted); font-size: 10px; text-align: center; padding: 8px;">No transcripts recorded yet. Record audio or flows to auto-generate step transcriptions.</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom Actions -->
    <div style="padding: 12px 16px; border-top: 1px solid var(--border-subtle); background: #0f172a; display: flex; justify-content: flex-end; gap: 10px; flex-shrink: 0;">
      <button id="btnCancelVideoStudio" style="background: transparent; border: 1px solid var(--border-subtle); color: var(--text-muted); padding: 6px 14px; border-radius: 4px; cursor: pointer; font-size: 11px;">Cancel</button>
      <button id="btnExecuteVideoExport" style="background: linear-gradient(135deg, #f43f5e, #e11d48); border: 1px solid rgba(244, 63, 94, 0.5); color: #fff; padding: 6px 18px; border-radius: 4px; cursor: pointer; font-weight: 700; font-size: 11px; display: flex; align-items: center; gap: 6px; box-shadow: 0 0 12px rgba(244, 63, 94, 0.3);">
        <span>🎬 Export & Save Recording</span>
      </button>
    </div>
  </div>

  <footer class="timeline-bar">
    <span style="font-size: 11px; font-weight: 700; color: var(--accent-cyan);">TIMELINE</span>
    <div class="timeline-steps" id="timelineSteps"></div>
  </footer>

  <script>
    const vscode = acquireVsCodeApi();
    let currentData = { nodes: [], edges: [], timeline: [] };
    let selectedNode = null;
    let isRecording = false;
    let isPaused = false;

    // Video Recording Studio State
    let exportConfig = {
      format: 'mp4',
      preset: 'balanced',
      scale: 1.0,
      targetResolution: null,
      fps: 30,
      dwellTimeMs: 1200,
      actionHighlights: true,
      includeFlowPosition: true,
      includeAudioDub: false,
      includeTranscripts: true,
      marketingTitle: 'Live Flow UX Demo'
    };

    function updateSessionUI() {
      const sessionLabel = document.getElementById('sessionLabel');
      const headerPulseDot = document.getElementById('headerPulseDot');
      const btnHeaderTrace = document.getElementById('btnHeaderTraceToggle');
      const btnDockerTrace = document.getElementById('btnDockerTraceToggle');
      const stepCount = (currentData && currentData.timeline) ? currentData.timeline.length : 0;

      if (isRecording) {
        if (isPaused) {
          if (sessionLabel) {
            sessionLabel.innerText = '⏸ PAUSED (' + stepCount + ')';
            sessionLabel.style.borderColor = '#f59e0b';
            sessionLabel.style.color = '#fbbf24';
            sessionLabel.style.background = 'rgba(245, 158, 11, 0.15)';
          }
        } else {
          if (sessionLabel) {
            sessionLabel.innerText = '🔴 RECORDING (' + stepCount + ')';
            sessionLabel.style.borderColor = '#f43f5e';
            sessionLabel.style.color = '#fda4af';
            sessionLabel.style.background = 'rgba(244, 63, 94, 0.18)';
          }
        }
        if (headerPulseDot) {
          headerPulseDot.style.background = '#f43f5e';
          headerPulseDot.style.boxShadow = '0 0 10px #f43f5e';
        }
        if (btnHeaderTrace) {
          btnHeaderTrace.className = 'btn-header-trace recording';
          btnHeaderTrace.innerHTML = '⏹ Stop Flow Trace (' + stepCount + ')';
        }
        if (btnDockerTrace) {
          btnDockerTrace.className = 'docker-trace-btn recording';
          btnDockerTrace.innerHTML = '⏹ Stop Trace (' + stepCount + ')';
        }
      } else {
        if (sessionLabel) {
          sessionLabel.innerText = stepCount > 0 ? 'IDLE (' + stepCount + ' STEPS)' : 'IDLE';
          sessionLabel.style.borderColor = 'rgba(255, 255, 255, 0.15)';
          sessionLabel.style.color = 'var(--text-muted)';
          sessionLabel.style.background = 'rgba(255, 255, 255, 0.05)';
        }
        if (headerPulseDot) {
          headerPulseDot.style.background = 'var(--accent-cyan)';
          headerPulseDot.style.boxShadow = '0 0 8px var(--accent-cyan)';
        }
        if (btnHeaderTrace) {
          btnHeaderTrace.className = 'btn-header-trace idle';
          btnHeaderTrace.innerHTML = '⏺ Start Flow Trace';
        }
        if (btnDockerTrace) {
          btnDockerTrace.className = 'docker-trace-btn idle';
          btnDockerTrace.innerHTML = '⏺ Start Trace';
        }
      }

      if (window.updateDockerHeaderResponsive) {
        window.updateDockerHeaderResponsive();
      }
    }

    const isMac = typeof navigator !== 'undefined' && (/Mac|iPod|iPhone|iPad/.test(navigator.platform) || /Macintosh/.test(navigator.userAgent));

    const btnHeaderTrace = document.getElementById('btnHeaderTraceToggle');
    if (btnHeaderTrace) {
      btnHeaderTrace.title = isMac
        ? 'Toggle Live Recording (Mac: ⌃⌘R or ⌥⌘R)'
        : 'Toggle Live Recording (Win/Linux: Alt+Shift+R)';
      btnHeaderTrace.addEventListener('click', () => {
        if (isRecording) {
          vscode.postMessage({ command: 'stopFlowTrace' });
        } else {
          const urlInput = document.getElementById('previewUrlInput');
          const targetUrl = (urlInput && urlInput.value) ? urlInput.value.trim() : undefined;
          vscode.postMessage({ command: 'startFlowTrace', url: targetUrl });
        }
      });
    }

    const sessionLabelElem = document.getElementById('sessionLabel');
    if (sessionLabelElem) {
      sessionLabelElem.title = isMac
        ? 'Session Status (Mac: ⌃⌘P or ⌥⌘P to pause/resume)'
        : 'Session Status (Win/Linux: Alt+Shift+P to pause/resume)';
    }

    // Canvas & Preview in-webview hotkeys listener
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
        vscode.postMessage({ command: 'pauseFlowTrace' });
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
        if (isRecording) {
          vscode.postMessage({ command: 'stopFlowTrace' });
        } else {
          const urlInput = document.getElementById('previewUrlInput');
          const targetUrl = (urlInput && urlInput.value) ? urlInput.value.trim() : undefined;
          vscode.postMessage({ command: 'startFlowTrace', url: targetUrl });
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

    document.getElementById('btnUploadSchema').addEventListener('click', () => {
      vscode.postMessage({ command: 'uploadSchema' });
    });

    const drawer = document.getElementById('schemaEditorDrawer');
    const sourceText = document.getElementById('schemaSourceText');
    const videoDrawer = document.getElementById('videoStudioDrawer');

    // Video Studio Drawer Open/Close
    document.getElementById('btnVideoStudio').addEventListener('click', () => {
      videoDrawer.style.display = 'flex';
      recalculateEstimate();
    });

    document.getElementById('btnCloseVideoStudio').addEventListener('click', () => {
      videoDrawer.style.display = 'none';
    });

    document.getElementById('btnCancelVideoStudio').addEventListener('click', () => {
      videoDrawer.style.display = 'none';
    });

    // Format pills selector
    const formatPills = document.querySelectorAll('#formatPillsContainer .format-pill');
    formatPills.forEach(pill => {
      pill.addEventListener('click', () => {
        formatPills.forEach(p => p.classList.remove('selected'));
        pill.classList.add('selected');
        exportConfig.format = pill.getAttribute('data-format');
        recalculateEstimate();
      });
    });

    // Preset buttons selector
    const presetBtns = document.querySelectorAll('#presetBtnsContainer .preset-btn');
    presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        presetBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        exportConfig.preset = btn.getAttribute('data-preset');
        recalculateEstimate();
      });
    });

    // Scale selector
    const scaleSelect = document.getElementById('videoScaleSelect');
    scaleSelect.addEventListener('change', () => {
      const val = scaleSelect.value;
      if (val.endsWith('p')) {
        const h = parseInt(val, 10);
        const w = Math.round(h * (16 / 9));
        exportConfig.targetResolution = { width: w, height: h };
        exportConfig.scale = h / 1080;
      } else {
        exportConfig.scale = parseFloat(val);
        exportConfig.targetResolution = null;
      }
      recalculateEstimate();
    });

    // FPS selector
    const fpsSelect = document.getElementById('videoFpsSelect');
    fpsSelect.addEventListener('change', () => {
      exportConfig.fps = parseInt(fpsSelect.value, 10);
      recalculateEstimate();
    });

    // Dwell slider
    const dwellSlider = document.getElementById('videoDwellSlider');
    const dwellLabel = document.getElementById('dwellTimeLabel');
    dwellSlider.addEventListener('input', () => {
      exportConfig.dwellTimeMs = parseInt(dwellSlider.value, 10);
      dwellLabel.innerText = exportConfig.dwellTimeMs + ' ms';
      recalculateEstimate();
    });

    // Marketing title & checkboxes
    document.getElementById('videoMarketingTitle').addEventListener('input', (e) => {
      exportConfig.marketingTitle = e.target.value;
    });

    document.getElementById('chkActionHighlights').addEventListener('change', (e) => {
      exportConfig.actionHighlights = e.target.checked;
    });

    document.getElementById('chkFlowPosition').addEventListener('change', (e) => {
      exportConfig.includeFlowPosition = e.target.checked;
    });

    const chkAudioDub = document.getElementById('chkAudioDub');
    if (chkAudioDub) {
      chkAudioDub.addEventListener('change', (e) => {
        exportConfig.includeAudioDub = e.target.checked;
        recalculateEstimate();
      });
    }

    const chkSpeechToText = document.getElementById('chkSpeechToText');
    if (chkSpeechToText) {
      chkSpeechToText.addEventListener('change', (e) => {
        exportConfig.includeTranscripts = e.target.checked;
      });
    }

    // Preview Storyboard
    document.getElementById('btnPreviewStoryboard').addEventListener('click', () => {
      vscode.postMessage({
        command: 'previewActionHighlights',
        config: exportConfig
      });
    });

    // Export Execution
    document.getElementById('btnExecuteVideoExport').addEventListener('click', () => {
      vscode.postMessage({
        command: 'saveVideoExport',
        config: exportConfig
      });
      videoDrawer.style.display = 'none';
    });

    // 🎙️ Microphone Audio Dubbing & Speech-to-Text State
    let audioStream = null;
    let mediaRecorder = null;
    let audioChunks = [];
    let audioContext = null;
    let analyser = null;
    let vuInterval = null;
    let timerInterval = null;
    let recordStartTime = 0;
    let speechRecognition = null;
    let activeStepIndex = 1;

    const micStatusBadge = document.getElementById('micStatusBadge');
    const vuMeterBar = document.getElementById('vuMeterBar');
    const micTimerLabel = document.getElementById('micTimerLabel');
    const liveSttText = document.getElementById('liveSttText');
    const sttConfidenceLabel = document.getElementById('sttConfidenceLabel');
    const btnStartVoice = document.getElementById('btnStartVoiceover');
    const btnPauseVoice = document.getElementById('btnPauseVoiceover');
    const btnStopVoice = document.getElementById('btnStopVoiceover');
    const btnClearVoice = document.getElementById('btnClearVoiceover');
    const drawerTranscriptsContainer = document.getElementById('drawerTranscriptsContainer');

    function updateMicStatus(status, text, color) {
      if (!micStatusBadge) return;
      micStatusBadge.innerText = text;
      micStatusBadge.style.color = color || '#38bdf8';
      micStatusBadge.style.borderColor = color || 'rgba(56, 189, 248, 0.4)';
    }

    function initSpeechRecognition() {
      const SpeechClass = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechClass) {
        if (liveSttText) liveSttText.innerText = 'Speech recognition API not supported in this runtime environment (will generate intelligent contextual fallback transcriptions).';
        return null;
      }
      try {
        const recognizer = new SpeechClass();
        recognizer.continuous = true;
        recognizer.interimResults = true;
        recognizer.lang = 'en-US';

        recognizer.onresult = (event) => {
          let interimText = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            const confidence = Math.round((event.results[i][0].confidence || 0.95) * 100);
            if (sttConfidenceLabel) sttConfidenceLabel.innerText = confidence + '% confidence';

            if (event.results[i].isFinal) {
              if (liveSttText) liveSttText.innerText = '"' + transcript.trim() + '"';
              const stepNum = activeStepIndex || 1;
              vscode.postMessage({
                command: 'saveSpeechTranscript',
                transcript: {
                  id: 'speech_' + Date.now(),
                  step: stepNum,
                  timestampMs: Date.now() - recordStartTime,
                  durationMs: exportConfig.dwellTimeMs || 1200,
                  text: transcript.trim(),
                  confidence: event.results[i][0].confidence || 0.95,
                  speaker: 'Narrator'
                }
              });
              activeStepIndex = (currentData && currentData.timeline && activeStepIndex < currentData.timeline.length)
                ? activeStepIndex + 1
                : activeStepIndex;
            } else {
              interimText += transcript;
            }
          }
          if (interimText && liveSttText) {
            liveSttText.innerText = '🎙️ "' + interimText.trim() + '"...';
          }
        };

        recognizer.onerror = (e) => {
          console.warn('[STT] Speech recognition notice:', e.error);
        };

        return recognizer;
      } catch (err) {
        console.warn('[STT] Init error:', err);
        return null;
      }
    }

    if (btnStartVoice) {
      btnStartVoice.addEventListener('click', async () => {
        try {
          if (!audioStream) {
            audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          }

          // Audio VU Analyzer
          try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
              audioContext = new AudioCtx();
              const sourceNode = audioContext.createMediaStreamSource(audioStream);
              analyser = audioContext.createAnalyser();
              analyser.fftSize = 64;
              sourceNode.connect(analyser);

              const pcmData = new Uint8Array(analyser.frequencyBinCount);
              clearInterval(vuInterval);
              vuInterval = setInterval(() => {
                if (analyser && vuMeterBar) {
                  analyser.getByteFrequencyData(pcmData);
                  let sum = 0;
                  for (let i = 0; i < pcmData.length; i++) sum += pcmData[i];
                  const avg = sum / pcmData.length;
                  const pct = Math.min(100, Math.round((avg / 128) * 100));
                  vuMeterBar.style.width = pct + '%';
                }
              }, 60);
            }
          } catch (e) {
            console.warn('[AudioContext] Could not attach analyzer:', e);
          }

          audioChunks = [];
          mediaRecorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm' });
          mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) audioChunks.push(e.data);
          };
          mediaRecorder.start(250);

          recordStartTime = Date.now();
          clearInterval(timerInterval);
          timerInterval = setInterval(() => {
            const elapsedSec = Math.floor((Date.now() - recordStartTime) / 1000);
            const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
            const secs = String(elapsedSec % 60).padStart(2, '0');
            if (micTimerLabel) micTimerLabel.innerText = mins + ':' + secs;
          }, 1000);

          if (!speechRecognition) {
            speechRecognition = initSpeechRecognition();
          }
          if (speechRecognition) {
            try { speechRecognition.start(); } catch (_) {}
          }

          updateMicStatus('rec', 'RECORDING', '#fb7185');
          if (chkAudioDub) chkAudioDub.checked = true;
          exportConfig.includeAudioDub = true;
          recalculateEstimate();
        } catch (err) {
          console.warn('[AudioDub] Mic access error, activating intelligent mock simulation:', err);
          updateMicStatus('mock', 'SIMULATED', '#facc15');
          if (liveSttText) {
            liveSttText.innerText = 'Simulating intelligent voiceover narration based on AST flow steps...';
          }
          // Fallback: auto-generate intelligent transcripts for timeline
          if (currentData && currentData.timeline) {
            currentData.timeline.forEach((item, idx) => {
              const stepNum = item.step || (idx + 1);
              vscode.postMessage({
                command: 'saveSpeechTranscript',
                transcript: {
                  id: 'trans_auto_' + stepNum,
                  step: stepNum,
                  timestampMs: idx * 1200,
                  durationMs: 1200,
                  text: 'In step ' + stepNum + ', user performs ' + (item.label || item.type) + ' in ' + (item.flowPositionName || 'app') + '.',
                  confidence: 0.98,
                  speaker: 'Narrator'
                }
              });
            });
          }
        }
      });
    }

    if (btnPauseVoice) {
      btnPauseVoice.addEventListener('click', () => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          mediaRecorder.pause();
          updateMicStatus('paused', 'PAUSED', '#facc15');
          if (speechRecognition) try { speechRecognition.stop(); } catch (_) {}
        } else if (mediaRecorder && mediaRecorder.state === 'paused') {
          mediaRecorder.resume();
          updateMicStatus('rec', 'RECORDING', '#fb7185');
          if (speechRecognition) try { speechRecognition.start(); } catch (_) {}
        }
      });
    }

    if (btnStopVoice) {
      btnStopVoice.addEventListener('click', () => {
        clearInterval(timerInterval);
        clearInterval(vuInterval);
        if (vuMeterBar) vuMeterBar.style.width = '0%';
        if (speechRecognition) try { speechRecognition.stop(); } catch (_) {}

        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
          mediaRecorder.onstop = () => {
            const blob = new Blob(audioChunks, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.onloadend = () => {
              const dataUri = reader.result;
              const durationSec = Math.max(1, (Date.now() - recordStartTime) / 1000);
              exportConfig.audioDataUri = dataUri;
              vscode.postMessage({
                command: 'saveAudioTrack',
                track: {
                  id: 'audio_' + Date.now(),
                  durationSec,
                  sampleRate: 48000,
                  format: 'audio/webm',
                  audioDataUri: dataUri,
                  transcripts: currentData.speechTranscripts || [],
                  recordedAt: new Date().toISOString()
                }
              });
              updateMicStatus('saved', 'SAVED', '#34d399');
            };
            reader.readAsDataURL(blob);
          };
        } else {
          updateMicStatus('saved', 'STOPPED', '#94a3b8');
        }
      });
    }

    if (btnClearVoice) {
      btnClearVoice.addEventListener('click', () => {
        audioChunks = [];
        delete exportConfig.audioDataUri;
        if (micTimerLabel) micTimerLabel.innerText = '00:00';
        if (liveSttText) liveSttText.innerText = 'Speak into your microphone or click "Record" to annotate user flow steps...';
        updateMicStatus('ready', 'READY', '#94a3b8');
        vscode.postMessage({ command: 'clearSpeechTranscripts' });
      });
    }

    // Transcript Copy Buttons
    if (document.getElementById('btnCopyMdTrans')) {
      document.getElementById('btnCopyMdTrans').addEventListener('click', () => {
        vscode.postMessage({ command: 'copyTranscript', format: 'markdown' });
      });
    }
    if (document.getElementById('btnCopyPlainTrans')) {
      document.getElementById('btnCopyPlainTrans').addEventListener('click', () => {
        vscode.postMessage({ command: 'copyTranscript', format: 'plain' });
      });
    }
    if (document.getElementById('btnCopyJiraTrans')) {
      document.getElementById('btnCopyJiraTrans').addEventListener('click', () => {
        vscode.postMessage({ command: 'copyTranscript', format: 'jira' });
      });
    }

    function renderDrawerTranscripts() {
      if (!drawerTranscriptsContainer) return;
      const transcripts = (currentData && currentData.speechTranscripts) || [];
      if (transcripts.length === 0) {
        drawerTranscriptsContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 10px; text-align: center; padding: 8px;">No transcripts recorded yet. Record audio or flows to auto-generate step transcriptions.</div>';
        return;
      }

      drawerTranscriptsContainer.innerHTML = transcripts.map(function(t, idx) {
        return '<div style="display: flex; align-items: flex-start; justify-content: space-between; background: #0f172a; border: 1px solid var(--border-subtle); border-radius: 4px; padding: 6px 8px; gap: 8px;">' +
          '<div style="flex: 1;">' +
            '<div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">' +
              '<span style="font-size: 9px; font-weight: 700; color: #c084fc;">Step #' + (t.step !== undefined ? t.step : (idx + 1)) + '</span>' +
              '<span style="font-size: 9px; color: var(--text-muted); font-family: monospace;">' + ((t.timestampMs || idx * 1200) / 1000).toFixed(1) + 's</span>' +
            '</div>' +
            '<div style="font-size: 11px; color: #e2e8f0; line-height: 1.3;">' + t.text + '</div>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    function recalculateEstimate() {
      const steps = (currentData && currentData.timeline && currentData.timeline.length > 0) ? currentData.timeline.length : 5;
      const dwellMs = exportConfig.dwellTimeMs || 1200;
      const durationSec = Math.max(1, Math.round(((steps * dwellMs) + 1000) / 100) / 10);
      const fps = exportConfig.fps || 30;
      const totalFrames = Math.round(durationSec * fps);

      let scale = 1.0;
      if (typeof exportConfig.scale === 'number') {
        scale = exportConfig.scale;
      } else if (exportConfig.targetResolution) {
        scale = (exportConfig.targetResolution.height || 720) / 1080;
      }

      const baseBitrates = {
        ultra: 6500,
        high: 4000,
        balanced: 2200,
        compact: 900,
        maximum: 450
      };
      const baseBr = baseBitrates[exportConfig.preset] || 2200;

      const codecMultipliers = {
        mp4: 1.0,
        webm: 0.85,
        gif: 3.2,
        frames: 1.8,
        html5: 0.4
      };
      const codecMult = codecMultipliers[exportConfig.format] || 1.0;

      const effectiveBitrate = Math.round(baseBr * Math.max(0.2, scale) * (fps / 30) * codecMult);
      let estimatedBytes = Math.round((effectiveBitrate * 1000 * durationSec) / 8);

      if (exportConfig.includeAudioDub && exportConfig.format !== 'gif' && exportConfig.format !== 'frames') {
        const audioBytes = Math.round((128 * 1000 * durationSec) / 8);
        estimatedBytes += audioBytes;
      }

      function fmtBytes(bytes) {
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
      }

      const estSizeVal = document.getElementById('estSizeVal');
      const estRangeVal = document.getElementById('estRangeVal');
      const estMetaVal = document.getElementById('estMetaVal');
      const estBadgesVal = document.getElementById('estBadgesVal');
      const estCodecPill = document.getElementById('estCodecPill');

      if (estSizeVal) estSizeVal.innerText = fmtBytes(estimatedBytes);
      if (estRangeVal) estRangeVal.innerText = '(' + fmtBytes(Math.round(estimatedBytes * 0.8)) + ' – ' + fmtBytes(Math.round(estimatedBytes * 1.25)) + ')';
      if (estMetaVal) {
        estMetaVal.innerHTML = '<span>⏱ Duration: ' + durationSec.toFixed(1) + 's</span> • ' +
          '<span>🎞 Frames: ' + totalFrames + '</span> • ' +
          '<span>⚡ Bitrate: ' + effectiveBitrate.toLocaleString() + ' kbps</span>';
      }

      if (estCodecPill) {
        const codecNames = {
          mp4: 'H.264 / AAC',
          webm: 'VP9 / Opus',
          gif: 'Palette GIF',
          frames: 'SVG Vector / PNG',
          html5: 'Standalone HTML5'
        };
        estCodecPill.innerText = codecNames[exportConfig.format] || exportConfig.format.toUpperCase();
      }

      if (estBadgesVal) {
        let badgesHtml = '';
        if (estimatedBytes < 10 * 1024 * 1024) {
          badgesHtml += '<span class="badge-tag email-safe">✉️ EMAIL SAFE (&lt;10MB)</span>';
        }
        if (estimatedBytes < 25 * 1024 * 1024) {
          badgesHtml += '<span class="badge-tag slack-ready">💬 SLACK READY (&lt;25MB)</span>';
        }
        if (exportConfig.preset === 'ultra' || exportConfig.preset === 'high') {
          badgesHtml += '<span class="badge-tag demo-hd">✨ HIGH-RES DEMO</span>';
        }
        if (exportConfig.includeAudioDub) {
          badgesHtml += '<span class="badge-tag demo-hd" style="background: rgba(168, 85, 247, 0.2); border-color: rgba(168, 85, 247, 0.5); color: #c084fc;">🎙️ AUDIO DUBBED</span>';
        }
        estBadgesVal.innerHTML = badgesHtml;
      }
    }

    document.getElementById('btnEditSchema').addEventListener('click', () => {
      vscode.postMessage({ command: 'getSchemaSource' });
    });

    document.getElementById('btnCloseEditor').addEventListener('click', () => {
      drawer.style.display = 'none';
    });

    document.getElementById('btnCancelEditor').addEventListener('click', () => {
      drawer.style.display = 'none';
    });

    document.getElementById('btnApplyEditor').addEventListener('click', () => {
      if (sourceText.value) {
        vscode.postMessage({
          command: 'saveSchemaSource',
          source: sourceText.value
        });
        drawer.style.display = 'none';
      }
    });

    document.getElementById('btnMermaid').addEventListener('click', () => {
      vscode.postMessage({ command: 'exportMermaid' });
    });

    document.getElementById('btnPlaywright').addEventListener('click', () => {
      vscode.postMessage({ command: 'exportPlaywright' });
    });

    document.getElementById('btnMergeFlows').addEventListener('click', () => {
      vscode.postMessage({ command: 'mergeFlows' });
    });

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.command === 'UPDATE_GRAPH') {
        currentData = msg.data;
        if (typeof msg.isRecording === 'boolean') isRecording = msg.isRecording;
        if (typeof msg.isPaused === 'boolean') isPaused = msg.isPaused;
        updateSessionUI();
        renderGraph();
        renderTimeline();
        renderDrawerTranscripts();
        recalculateEstimate();
        if (selectedNode) {
          const refreshed = currentData.nodes.find(n => n.id === selectedNode.id);
          if (refreshed) selectNode(refreshed);
        }
        if (currentData.landingPage && currentData.landingPage.url && window.previewDockerControl) {
          const urlInput = document.getElementById('previewUrlInput');
          if (urlInput && (urlInput.value === 'http://localhost:8081' || !urlInput.value)) {
            window.previewDockerControl.navigate(currentData.landingPage.url);
          }
        }
      } else if (msg.command === 'SHOW_PREVIEW_DOCKER') {
        if (window.previewDockerControl) {
          window.previewDockerControl.show(msg.url);
        }
      } else if (msg.command === 'TOGGLE_PREVIEW_DOCKER') {
        if (window.previewDockerControl) {
          window.previewDockerControl.toggle();
        }
      } else if (msg.command === 'OPEN_VIDEO_STUDIO') {
        videoDrawer.style.display = 'flex';
        recalculateEstimate();
      } else if (msg.command === 'SET_SCHEMA_SOURCE') {
        drawer.style.display = 'flex';
        sourceText.value = msg.source || '';
        if (msg.schemaType) {
          document.getElementById('editorFormatBadge').innerText = msg.schemaType;
        }
      } else if (msg.command === 'SET_STORYBOARD_PREVIEW') {
        const container = document.getElementById('storyboardContainer');
        if (container && msg.frames && msg.frames.length > 0) {
          container.innerHTML = msg.frames.map(function(f) {
            return '<div class="storyboard-frame">' +
              f.svg +
              '<div class="storyboard-frame-label">#' + f.step + ' ' + f.action + '</div>' +
            '</div>';
          }).join('');
        }
      }
    });

    function renderGraph() {
      const grid = document.getElementById('flowGrid');
      const vpBadge = document.getElementById('viewportBadge');
      const posTitle = document.getElementById('posCurrentTitle');
      const posTrail = document.getElementById('posBreadcrumbTrail');
      const flowBadge = document.getElementById('unifiedFlowBadge');

      if (currentData.currentPosition) {
        posTitle.innerText = currentData.currentPosition.name || currentData.currentPosition.route || 'Active Screen';
        const crumbs = currentData.activeBreadcrumb || currentData.currentPosition.breadcrumb || [];
        posTrail.innerText = crumbs.join(' ➔ ');
      }

      if (currentData.flowNames && currentData.flowNames.length > 1) {
        flowBadge.style.display = 'inline-block';
        flowBadge.innerText = '🔀 Unified Schema (' + currentData.flowNames.length + ' Flows)';
      } else {
        flowBadge.style.display = 'none';
      }

      if (currentData.viewport) {
        vpBadge.style.display = 'inline-block';
        vpBadge.innerText = (currentData.viewport.icon || '') + ' ' + (currentData.viewport.presetName || currentData.viewport.category.toUpperCase()) + ' (' + currentData.viewport.width + '×' + currentData.viewport.height + ')';
      } else {
        vpBadge.style.display = 'none';
      }

      if (!currentData.nodes || currentData.nodes.length === 0) {
        grid.innerHTML = '<div style="color: var(--text-muted); font-size: 13px;">No recorded steps yet. Click around the app under test!</div>';
        return;
      }

      grid.innerHTML = '';
      currentData.nodes.forEach((node, idx) => {
        const isLanding = node.id === 'screen_root' || node.step === 0;
        const isJunction = node.data?.isJunction;
        const isReturn = node.data?.isReturnCycle;

        const div = document.createElement('div');
        let extraClass = '';
        let pillClass = 'pill-' + (node.type || 'action');
        let badgeText = node.data?.badge || node.type;

        if (isLanding) {
          extraClass = ' landing-root';
          pillClass = 'pill-landing';
          badgeText = 'TOP OF SCHEMA: LANDING';
        } else if (isJunction) {
          extraClass = ' junction-node';
          pillClass = 'pill-junction';
          badgeText = '🔀 JUNCTION';
        } else if (isReturn) {
          extraClass = ' return-node';
          pillClass = 'pill-return';
          badgeText = '⮌ RETURN';
        }

        div.className = 'flow-node' + (selectedNode?.id === node.id ? ' active' : '') + extraClass;

        let vpPill = '';
        if (isLanding && node.data?.viewport) {
          const vp = node.data.viewport;
          vpPill = '<div style="margin-top: 6px;"><span class="node-pill pill-viewport">' + (vp.icon || '📱') + ' ' + (vp.presetName || vp.category.toUpperCase()) + ' (' + vp.width + '×' + vp.height + ')</span></div>';
        }

        let commentPill = '';
        if (node.data?.comments && node.data.comments.length > 0) {
          commentPill = '<span class="node-pill" style="background: rgba(167, 139, 250, 0.2); border-color: rgba(167, 139, 250, 0.4); color: #a78bfa;">💬 ' + node.data.comments.length + '</span>';
        }

        div.innerHTML =
          '<div class="node-header">' +
            '<span class="node-pill ' + pillClass + '">' + badgeText + '</span>' +
            commentPill +
            '<span class="node-step">#' + (node.step !== undefined ? node.step : (idx + 1)) + '</span>' +
          '</div>' +
          '<div class="node-title">' + (node.data?.title || node.label) + '</div>' +
          '<div class="node-subtitle">' + (node.data?.subtitle || '') + '</div>' +
          vpPill +
          (idx < currentData.nodes.length - 1 ? '<span class="connector-arrow">➔</span>' : '');

        div.addEventListener('click', () => {
          selectNode(node);
        });

        grid.appendChild(div);
      });
    }

    function selectNode(node) {
      selectedNode = node;
      renderGraph();

      const container = document.getElementById('inspectorDetails');
      const d = node.data || {};
      const isLanding = node.id === 'screen_root' || node.step === 0;

      let html =
        '<div class="prop-row">' +
          '<span class="prop-label">Node Title</span>' +
          '<span class="prop-value">' + (d.title || node.label) + '</span>' +
        '</div>' +
        '<div class="prop-row">' +
          '<span class="prop-label">Type</span>' +
          '<span class="prop-value">' + node.type + (isLanding ? ' (Top of Schema)' : '') + '</span>' +
        '</div>';

      if (d.flowPositionName) {
        html +=
          '<div class="prop-row">' +
            '<span class="prop-label">UX Flow Position</span>' +
            '<span class="prop-value" style="color: var(--accent-cyan);">' +
              '📍 ' + d.flowPositionName + ' [' + (d.flowPhase || 'FLOW') + ']' +
            '</span>' +
          '</div>';
      }

      if (d.flowNames && d.flowNames.length > 1) {
        html +=
          '<div class="prop-row">' +
            '<span class="prop-label">Tied Flow Schemas</span>' +
            '<span class="prop-value" style="color: var(--accent-purple);">' +
              '🔀 ' + d.flowNames.join(' + ') +
            '</span>' +
          '</div>';
      }

      if (d.viewport) {
        const vp = d.viewport;
        html +=
          '<div class="prop-row">' +
            '<span class="prop-label">Device Viewport & Proportions</span>' +
            '<span class="prop-value" style="color: var(--accent-cyan);">' +
              (vp.icon || '') + ' ' + (vp.presetName || vp.category.toUpperCase()) + ' (' + vp.width + '×' + vp.height + ' @ ' + vp.deviceScaleFactor + 'x, ' + vp.orientation + ')' +
            '</span>' +
          '</div>';
      }

      if (d.attributes && d.attributes.length > 0) {
        html +=
          '<div style="margin-top: 10px; border-top: 1px solid var(--border-subtle); padding-top: 8px;">' +
            '<div style="font-size: 11px; font-weight: 700; color: #38bdf8; margin-bottom: 6px;">Entity Attributes</div>' +
            '<div style="background: #070c18; border: 1px solid var(--border-subtle); border-radius: 4px; padding: 6px 8px; font-family: monospace; font-size: 11px; max-height: 120px; overflow-y: auto;">' +
              d.attributes.map(a => '<div><span style="color: #94a3b8;">' + a.type + '</span> <strong style="color: #fff;">' + a.name + '</strong>' + (a.key ? ' <span style="color: #f59e0b;">(' + a.key + ')</span>' : '') + '</div>').join('') +
            '</div>' +
          '</div>';
      }

      if (d.componentName) {
        html +=
          '<div class="prop-row">' +
            '<span class="prop-label">React / Vue Component</span>' +
            '<span class="prop-value">&lt;' + d.componentName + ' /&gt;</span>' +
          '</div>';
      }

      if (d.selector) {
        html +=
          '<div class="prop-row">' +
            '<span class="prop-label">DOM Selector</span>' +
            '<span class="prop-value">' + d.selector + '</span>' +
          '</div>';
      }

      if (d.filePath) {
        html +=
          '<div class="prop-row">' +
            '<span class="prop-label">Source File</span>' +
            '<span class="prop-value">' + d.filePath + ':' + (d.lineNumber || 1) + '</span>' +
          '</div>';
      }

      if (d.handlerName) {
        html +=
          '<div class="prop-row">' +
            '<span class="prop-label">Handler Function</span>' +
            '<span class="prop-value">' + d.handlerName + '()</span>' +
          '</div>';
      }

      if (d.coords) {
        html +=
          '<div class="prop-row">' +
            '<span class="prop-label">Screen Coordinates</span>' +
            '<span class="prop-value">(' + d.coords.x + ', ' + d.coords.y + ')</span>' +
          '</div>';
      }

      // 1. Interactive Node Edit Form
      const safeTitle = (d.title || node.label || '').replace(/"/g, '&quot;');
      const safeSubtitle = (d.subtitle || '').replace(/"/g, '&quot;');
      const safeBadge = (d.badge || '').replace(/"/g, '&quot;');

      html +=
        '<div style="margin-top: 12px; border-top: 1px solid var(--border-subtle); padding-top: 10px;">' +
          '<div style="font-size: 11px; font-weight: 700; color: #cbd5e1; margin-bottom: 8px;">✏️ Edit Node Properties</div>' +
          '<div style="display: flex; flex-direction: column; gap: 6px;">' +
            '<div>' +
              '<label style="font-size: 10px; color: var(--text-muted);">Title</label>' +
              '<input type="text" id="editNodeTitle" value="' + safeTitle + '" style="width: 100%; box-sizing: border-box; background: #0f172a; border: 1px solid var(--border-subtle); border-radius: 4px; padding: 4px 6px; color: #fff; font-size: 11px;" />' +
            '</div>' +
            '<div>' +
              '<label style="font-size: 10px; color: var(--text-muted);">Subtitle / Description</label>' +
              '<input type="text" id="editNodeSubtitle" value="' + safeSubtitle + '" style="width: 100%; box-sizing: border-box; background: #0f172a; border: 1px solid var(--border-subtle); border-radius: 4px; padding: 4px 6px; color: #fff; font-size: 11px;" />' +
            '</div>' +
            '<div>' +
              '<label style="font-size: 10px; color: var(--text-muted);">Badge / Tag</label>' +
              '<input type="text" id="editNodeBadge" value="' + safeBadge + '" style="width: 100%; box-sizing: border-box; background: #0f172a; border: 1px solid var(--border-subtle); border-radius: 4px; padding: 4px 6px; color: #fff; font-size: 11px;" />' +
            '</div>' +
            '<button id="btnSaveNodeEdit" style="margin-top: 4px; background: #1e293b; border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8; border-radius: 4px; padding: 5px 8px; cursor: pointer; font-size: 11px; font-weight: 600;">Save Node Properties</button>' +
          '</div>' +
        '</div>';

      // 2. Comments & Annotations Section
      const comments = d.comments || [];
      let commentsListHtml = '';
      if (comments.length === 0) {
        commentsListHtml = '<div style="font-size: 11px; color: var(--text-muted); font-style: italic;">No comments on this node yet.</div>';
      } else {
        commentsListHtml = comments.map(c =>
          '<div style="background: rgba(49, 46, 129, 0.25); border: 1px solid rgba(167, 139, 250, 0.3); border-radius: 4px; padding: 6px 8px;">' +
            '<div style="display: flex; justify-content: space-between; font-size: 10px; color: #a78bfa; margin-bottom: 2px;">' +
              '<strong>' + (c.author || 'User') + '</strong>' +
              '<span>' + new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</span>' +
            '</div>' +
            '<div style="font-size: 11px; color: #f1f5f9; line-height: 1.4;">' + c.text + '</div>' +
          '</div>'
        ).join('');
      }

      html +=
        '<div style="margin-top: 14px; border-top: 1px solid var(--border-subtle); padding-top: 10px;">' +
          '<div style="font-size: 11px; font-weight: 700; color: #cbd5e1; margin-bottom: 8px;">💬 Comments & Annotations (' + comments.length + ')</div>' +
          '<div style="display: flex; flex-direction: column; gap: 6px; max-height: 140px; overflow-y: auto;">' +
            commentsListHtml +
          '</div>' +
          '<div style="margin-top: 8px; display: flex; gap: 6px;">' +
            '<input type="text" id="inputNodeComment" placeholder="Add a comment on this node..." style="flex: 1; background: #0f172a; border: 1px solid var(--border-subtle); border-radius: 4px; padding: 4px 8px; color: #fff; font-size: 11px;" />' +
            '<button id="btnPostComment" style="background: var(--accent-indigo); border: none; color: #fff; border-radius: 4px; padding: 4px 10px; cursor: pointer; font-size: 11px; font-weight: 600;">Post</button>' +
          '</div>' +
        '</div>';

      // 3. Actions (Jump to source, Set Breakpoint)
      html +=
        '<div style="display: flex; flex-direction: column; gap: 8px; margin-top: 14px; border-top: 1px solid var(--border-subtle); padding-top: 10px;">' +
          (d.filePath ? '<button class="btn-primary" id="btnJumpSource">📄 Jump to Source in Editor</button>' : '') +
          (!isLanding ? '<button style="border-color: var(--accent-pink); color: var(--accent-pink);" id="btnSetBreakpoint">🛑 Set Dynamic Breakpoint</button>' : '') +
        '</div>';

      container.innerHTML = html;

      // Event listeners for Save Node & Post Comment
      const btnSaveNode = document.getElementById('btnSaveNodeEdit');
      if (btnSaveNode) {
        btnSaveNode.addEventListener('click', () => {
          const newTitle = document.getElementById('editNodeTitle').value;
          const newSubtitle = document.getElementById('editNodeSubtitle').value;
          const newBadge = document.getElementById('editNodeBadge').value;
          vscode.postMessage({
            command: 'editNode',
            nodeId: node.id,
            updates: {
              title: newTitle,
              subtitle: newSubtitle,
              badge: newBadge
            }
          });
        });
      }

      const btnPostComment = document.getElementById('btnPostComment');
      if (btnPostComment) {
        btnPostComment.addEventListener('click', () => {
          const input = document.getElementById('inputNodeComment');
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

      const btnJump = document.getElementById('btnJumpSource');
      if (btnJump) {
        btnJump.addEventListener('click', () => {
          vscode.postMessage({
            command: 'openFile',
            filePath: d.filePath,
            lineNumber: d.lineNumber
          });
        });
      }

      const btnBreak = document.getElementById('btnSetBreakpoint');
      if (btnBreak) {
        btnBreak.addEventListener('click', () => {
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

    function renderTimeline() {
      const bar = document.getElementById('timelineSteps');
      bar.innerHTML = '';
      (currentData.timeline || []).forEach((item) => {
        const pill = document.createElement('div');
        pill.className = 'timeline-pill' + (selectedNode?.step === item.step ? ' selected' : '');
        pill.innerHTML = '<strong>#' + item.step + '</strong> <span>' + item.label + '</span>';
        pill.addEventListener('click', () => {
          const matched = currentData.nodes.find(n => n.step === item.step);
          if (matched) selectNode(matched);
        });
        bar.appendChild(pill);
      });
    }

    function initLocalhostPreviewDocker() {
      const docker = document.getElementById('localhostPreviewDocker');
      if (!docker) return;

      const dockerHeader = document.getElementById('previewDockerHeader');
      const iframeShield = document.getElementById('previewIframeShield');
      const iframe = document.getElementById('previewIframe');
      const urlInput = document.getElementById('previewUrlInput');
      const btnGo = document.getElementById('btnPreviewGo');
      const btnReload = document.getElementById('btnPreviewReload');
      const presetSelect = document.getElementById('previewPresetSelect');
      const btnRotate = document.getElementById('btnPreviewRotate');
      const zoomSelect = document.getElementById('previewZoomSelect');
      const btnDockToggle = document.getElementById('btnPreviewDockToggle');
      const btnMinimize = document.getElementById('btnPreviewMinimize');
      const btnMaximize = document.getElementById('btnPreviewMaximize');
      const btnClose = document.getElementById('btnPreviewClose');
      const btnBezel = document.getElementById('btnPreviewBezelToggle');
      const btnExternal = document.getElementById('btnPreviewExternal');
      const deviceFrame = document.getElementById('previewDeviceFrame');
      const resizeHandle = document.getElementById('previewResizeHandle');
      const dimLabel = document.getElementById('footerDimLabel');
      const scaleLabel = document.getElementById('footerScaleLabel');
      const statusLabel = document.getElementById('footerStatusLabel');
      const portBadge = document.getElementById('previewPortBadge');
      const liveBeacon = document.getElementById('previewLiveBeacon');
      const dockPill = document.getElementById('previewDockPill');
      const dockPillTitle = document.getElementById('dockPillTitle');
      const btnResetPos = document.getElementById('btnResetPreviewPos');
      const btnToggleHeader = document.getElementById('btnTogglePreview');
      const offlineOverlay = document.getElementById('previewOfflineOverlay');
      const offlineTargetUrl = document.getElementById('offlineTargetUrl');
      const btnRetryConn = document.getElementById('btnRetryConnection');
      const btnPort3000 = document.getElementById('btnSwitchPort3000');
      const btnDockerTrace = document.getElementById('btnDockerTraceToggle');

      if (btnDockerTrace) {
        btnDockerTrace.addEventListener('mousedown', (e) => e.stopPropagation());
        btnDockerTrace.addEventListener('click', (e) => {
          e.stopPropagation();
          if (isRecording) {
            vscode.postMessage({ command: 'stopFlowTrace' });
          } else {
            const targetUrl = (urlInput && urlInput.value) ? urlInput.value.trim() : 'http://localhost:8081';
            vscode.postMessage({ command: 'startFlowTrace', url: targetUrl });
          }
        });
      }

      const PRESET_DIMS = {
        'mobile-iphone-16-pro': { w: 393, h: 852 },
        'mobile-pixel-9': { w: 412, h: 915 },
        'tablet-ipad-air': { w: 820, h: 1180 },
        'desktop-laptop': { w: 1280, h: 800 },
        'desktop-fhd': { w: 1920, h: 1080 },
        'compact': { w: 360, h: 640 }
      };

      let currentZoom = 0.75;
      let savedFloatingRect = null;
      let isDragging = false;
      let dragStartX = 0;
      let dragStartY = 0;
      let dockerStartLeft = 0;
      let dockerStartTop = 0;

      function updateDimensionsLabel(customW, customH) {
        if (customW && customH) {
          dimLabel.innerText = Math.round(customW) + ' × ' + Math.round(customH) + ' px';
          return;
        }
        const w = Math.max(100, Math.round(docker.offsetWidth - 24));
        const h = Math.max(100, Math.round(docker.offsetHeight - 122));
        dimLabel.innerText = w + ' × ' + h + ' px';
      }

      function updatePortBadge(url) {
        try {
          const parsed = new URL(url);
          portBadge.innerText = parsed.host || 'localhost:8081';
          if (offlineTargetUrl) offlineTargetUrl.innerText = url;
        } catch (e) {
          portBadge.innerText = 'preview';
        }
        if (typeof updateHeaderResponsive === 'function') {
          updateHeaderResponsive();
        }
      }

      function updateHeaderResponsive(width) {
        const w = width !== undefined ? width : docker.offsetWidth;
        if (!dockerHeader) return;
        dockerHeader.classList.remove('header-wide', 'header-compact', 'header-tight', 'header-micro');

        const titleText = document.getElementById('dockerTitleText');
        const btnDockerTrace = document.getElementById('btnDockerTraceToggle');
        const portBadgeElem = document.getElementById('previewPortBadge');
        const stepCount = (currentData && currentData.timeline) ? currentData.timeline.length : 0;

        let portStr = '8081';
        try {
          const parsed = new URL(urlInput.value);
          portStr = parsed.port || parsed.host || '8081';
        } catch (e) {}

        if (w <= 380) {
          dockerHeader.classList.add('header-micro');
          if (titleText) titleText.style.display = 'none';
          if (portBadgeElem) portBadgeElem.style.display = 'none';
          if (btnDockerTrace) {
            btnDockerTrace.innerHTML = isRecording ? '⏹ ' + stepCount : '⏺ Trace';
          }
        } else if (w <= 480) {
          dockerHeader.classList.add('header-tight');
          if (titleText) titleText.style.display = 'none';
          if (portBadgeElem) {
            portBadgeElem.style.display = 'inline-block';
            portBadgeElem.innerText = ':' + portStr;
          }
          if (btnDockerTrace) {
            btnDockerTrace.innerHTML = isRecording ? '⏹ ' + stepCount : '⏺ Trace';
          }
        } else if (w <= 580) {
          dockerHeader.classList.add('header-compact');
          if (titleText) {
            titleText.style.display = 'inline-block';
            titleText.innerText = 'PREVIEW';
          }
          if (portBadgeElem) {
            portBadgeElem.style.display = 'inline-block';
            portBadgeElem.innerText = ':' + portStr;
          }
          if (btnDockerTrace) {
            btnDockerTrace.innerHTML = isRecording ? '⏹ Stop (' + stepCount + ')' : '⏺ Start Trace';
          }
        } else {
          dockerHeader.classList.add('header-wide');
          if (titleText) {
            titleText.style.display = 'inline-block';
            titleText.innerText = 'LOCAL PREVIEW';
          }
          if (portBadgeElem) {
            portBadgeElem.style.display = 'inline-block';
            portBadgeElem.innerText = 'localhost:' + portStr;
          }
          if (btnDockerTrace) {
            btnDockerTrace.innerHTML = isRecording ? '⏹ Stop Trace (' + stepCount + ')' : '⏺ Start Trace';
          }
        }
      }

      window.updateDockerHeaderResponsive = updateHeaderResponsive;

      if (window.ResizeObserver) {
        const headerResizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            updateHeaderResponsive(entry.contentRect.width);
          }
        });
        headerResizeObserver.observe(docker);
      }

      function updateDockPillTitle() {
        try {
          const parsed = new URL(urlInput.value);
          dockPillTitle.innerText = 'Localhost Preview (' + (parsed.port || parsed.host || '8081') + ')';
        } catch (e) {
          dockPillTitle.innerText = 'Localhost Preview';
        }
      }

      function navigatePreview(rawUrl) {
        if (!rawUrl) return;
        let url = rawUrl.trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'http://' + url;
        }
        urlInput.value = url;
        iframe.src = url;
        updatePortBadge(url);
        updateDockPillTitle();
      }

      function applyPreset(presetKey, zoom) {
        const p = PRESET_DIMS[presetKey];
        if (!p) return;
        const z = zoom !== undefined ? zoom : currentZoom;
        const chromeW = 24;
        const chromeH = 122;
        const targetW = Math.max(320, Math.min(window.innerWidth - 40, Math.round(p.w * z) + chromeW));
        const targetH = Math.max(400, Math.min(window.innerHeight - 80, Math.round(p.h * z) + chromeH));

        docker.style.width = targetW + 'px';
        docker.style.height = targetH + 'px';
        updateDimensionsLabel(p.w, p.h);

        const island = document.getElementById('deviceDynamicIsland');
        if (island) {
          island.style.display = (presetKey.startsWith('mobile') && deviceFrame.classList.contains('bezel-active')) ? 'block' : 'none';
        }
      }

      // Dragging Implementation
      if (dockerHeader) {
        dockerHeader.addEventListener('mousedown', (e) => {
          if (e.target.closest('button') || e.target.closest('select') || e.target.closest('input')) {
            return;
          }
          if (docker.classList.contains('docked') || docker.classList.contains('maximized')) {
            return;
          }
          isDragging = true;
          dockerHeader.classList.add('dragging');
          if (iframeShield) iframeShield.style.display = 'block';

          const rect = docker.getBoundingClientRect();
          const parentRect = docker.parentElement.getBoundingClientRect();

          dockerStartLeft = rect.left - parentRect.left;
          dockerStartTop = rect.top - parentRect.top;
          dragStartX = e.clientX;
          dragStartY = e.clientY;

          docker.style.left = dockerStartLeft + 'px';
          docker.style.top = dockerStartTop + 'px';
          docker.style.right = 'auto';
          docker.style.bottom = 'auto';

          window.addEventListener('mousemove', onDragMove);
          window.addEventListener('mouseup', onDragEnd);
          e.preventDefault();
        });
      }

      function onDragMove(e) {
        if (!isDragging) return;
        const deltaX = e.clientX - dragStartX;
        const deltaY = e.clientY - dragStartY;

        const parentRect = docker.parentElement.getBoundingClientRect();
        const maxLeft = parentRect.width - docker.offsetWidth;
        const maxTop = parentRect.height - 40;

        const newLeft = Math.max(0, Math.min(maxLeft, dockerStartLeft + deltaX));
        const newTop = Math.max(0, Math.min(maxTop, dockerStartTop + deltaY));

        docker.style.left = newLeft + 'px';
        docker.style.top = newTop + 'px';
      }

      function onDragEnd() {
        if (!isDragging) return;
        isDragging = false;
        if (dockerHeader) dockerHeader.classList.remove('dragging');
        if (iframeShield) iframeShield.style.display = 'none';
        window.removeEventListener('mousemove', onDragMove);
        window.removeEventListener('mouseup', onDragEnd);
      }

      // Resizing Implementation
      let isResizing = false;
      let resizeStartX = 0;
      let resizeStartY = 0;
      let startW = 0;
      let startH = 0;

      if (resizeHandle) {
        resizeHandle.addEventListener('mousedown', (e) => {
          if (docker.classList.contains('docked') || docker.classList.contains('maximized')) {
            return;
          }
          isResizing = true;
          if (iframeShield) iframeShield.style.display = 'block';

          startW = docker.offsetWidth;
          startH = docker.offsetHeight;
          resizeStartX = e.clientX;
          resizeStartY = e.clientY;

          window.addEventListener('mousemove', onResizeMove);
          window.addEventListener('mouseup', onResizeEnd);
          e.preventDefault();
          e.stopPropagation();
        });
      }

      function onResizeMove(e) {
        if (!isResizing) return;
        const deltaX = e.clientX - resizeStartX;
        const deltaY = e.clientY - resizeStartY;

        const newW = Math.max(320, Math.min(window.innerWidth - 60, startW + deltaX));
        const newH = Math.max(400, Math.min(window.innerHeight - 60, startH + deltaY));

        docker.style.width = newW + 'px';
        docker.style.height = newH + 'px';

        updateDimensionsLabel();
        if (presetSelect) presetSelect.value = 'custom';
      }

      function onResizeEnd() {
        if (!isResizing) return;
        isResizing = false;
        if (iframeShield) iframeShield.style.display = 'none';
        window.removeEventListener('mousemove', onResizeMove);
        window.removeEventListener('mouseup', onResizeEnd);
      }

      // Preset selector
      if (presetSelect) {
        presetSelect.addEventListener('change', () => {
          const val = presetSelect.value;
          if (PRESET_DIMS[val]) {
            applyPreset(val, currentZoom);
          }
        });
      }

      // Rotation
      if (btnRotate) {
        btnRotate.addEventListener('click', () => {
          const curW = docker.offsetWidth;
          const curH = docker.offsetHeight;
          docker.style.width = curH + 'px';
          docker.style.height = curW + 'px';
          if (presetSelect) presetSelect.value = 'custom';
          updateDimensionsLabel();
        });
      }

      // Zoom selector
      if (zoomSelect) {
        zoomSelect.addEventListener('change', () => {
          const val = zoomSelect.value;
          if (val === 'fit') {
            currentZoom = 0.65;
            if (scaleLabel) scaleLabel.innerText = 'Fit Zoom';
          } else {
            currentZoom = parseFloat(val) || 1.0;
            if (scaleLabel) scaleLabel.innerText = Math.round(currentZoom * 100) + '% Zoom';
          }

          if (presetSelect) {
            const presetKey = presetSelect.value;
            if (PRESET_DIMS[presetKey]) {
              applyPreset(presetKey, currentZoom);
            }
          }
        });
      }

      // Docking toggle
      if (btnDockToggle) {
        btnDockToggle.addEventListener('click', () => {
          if (docker.classList.contains('docked')) {
            docker.classList.remove('docked');
            btnDockToggle.classList.remove('active');
            if (savedFloatingRect) {
              docker.style.left = savedFloatingRect.left + 'px';
              docker.style.top = savedFloatingRect.top + 'px';
              docker.style.width = savedFloatingRect.width + 'px';
              docker.style.height = savedFloatingRect.height + 'px';
              docker.style.right = 'auto';
            }
          } else {
            savedFloatingRect = {
              left: docker.offsetLeft,
              top: docker.offsetTop,
              width: docker.offsetWidth,
              height: docker.offsetHeight
            };
            docker.classList.remove('maximized');
            if (btnMaximize) btnMaximize.classList.remove('active');
            docker.classList.add('docked');
            btnDockToggle.classList.add('active');
          }
          updateDimensionsLabel();
        });
      }

      // Maximize toggle
      if (btnMaximize) {
        btnMaximize.addEventListener('click', () => {
          if (docker.classList.contains('maximized')) {
            docker.classList.remove('maximized');
            btnMaximize.classList.remove('active');
            if (savedFloatingRect) {
              docker.style.left = savedFloatingRect.left + 'px';
              docker.style.top = savedFloatingRect.top + 'px';
              docker.style.width = savedFloatingRect.width + 'px';
              docker.style.height = savedFloatingRect.height + 'px';
              docker.style.right = 'auto';
            }
          } else {
            savedFloatingRect = {
              left: docker.offsetLeft,
              top: docker.offsetTop,
              width: docker.offsetWidth,
              height: docker.offsetHeight
            };
            docker.classList.remove('docked');
            if (btnDockToggle) btnDockToggle.classList.remove('active');
            docker.classList.add('maximized');
            btnMaximize.classList.add('active');
          }
          updateDimensionsLabel();
        });
      }

      // Minimize / Collapse
      if (btnMinimize) {
        btnMinimize.addEventListener('click', () => {
          docker.style.display = 'none';
          if (dockPill) dockPill.style.display = 'flex';
          updateDockPillTitle();
        });
      }

      // Restore from Dock Pill
      if (dockPill) {
        dockPill.addEventListener('click', () => {
          dockPill.style.display = 'none';
          docker.style.display = 'flex';
          updateDimensionsLabel();
        });
      }

      // Close
      if (btnClose) {
        btnClose.addEventListener('click', () => {
          docker.style.display = 'none';
          if (dockPill) dockPill.style.display = 'none';
        });
      }

      // Center / Reset position
      if (btnResetPos) {
        btnResetPos.addEventListener('click', () => {
          docker.classList.remove('docked');
          docker.classList.remove('maximized');
          if (btnDockToggle) btnDockToggle.classList.remove('active');
          if (btnMaximize) btnMaximize.classList.remove('active');

          const parentRect = docker.parentElement.getBoundingClientRect();
          const defaultW = 440;
          const defaultH = 740;

          docker.style.width = defaultW + 'px';
          docker.style.height = defaultH + 'px';
          docker.style.left = Math.max(10, Math.round((parentRect.width - defaultW) / 2)) + 'px';
          docker.style.top = Math.max(10, Math.round((parentRect.height - defaultH) / 2)) + 'px';
          docker.style.right = 'auto';
          updateDimensionsLabel();
        });
      }

      // Header Button Toggle
      if (btnToggleHeader) {
        btnToggleHeader.addEventListener('click', () => {
          if (docker.style.display === 'none' && (!dockPill || dockPill.style.display === 'none')) {
            docker.style.display = 'flex';
            updateDimensionsLabel();
          } else if (docker.style.display !== 'none') {
            docker.style.display = 'none';
          } else if (dockPill && dockPill.style.display !== 'none') {
            dockPill.style.display = 'none';
            docker.style.display = 'flex';
            updateDimensionsLabel();
          }
        });
      }

      // Address Bar Navigation
      if (btnGo) {
        btnGo.addEventListener('click', () => {
          navigatePreview(urlInput.value.trim());
        });
      }

      if (urlInput) {
        urlInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            navigatePreview(urlInput.value.trim());
          }
        });
      }

      if (btnReload) {
        btnReload.addEventListener('click', () => {
          const cur = iframe.src;
          iframe.src = '';
          setTimeout(() => {
            iframe.src = cur;
          }, 50);
        });
      }

      if (btnBezel) {
        btnBezel.addEventListener('click', () => {
          deviceFrame.classList.toggle('bezel-active');
          btnBezel.classList.toggle('active');
          const island = document.getElementById('deviceDynamicIsland');
          if (island) {
            island.style.display = (deviceFrame.classList.contains('bezel-active') && presetSelect && presetSelect.value.startsWith('mobile')) ? 'block' : 'none';
          }
        });
      }

      if (btnExternal) {
        btnExternal.addEventListener('click', () => {
          vscode.postMessage({
            command: 'openExternalUrl',
            url: urlInput.value.trim()
          });
        });
      }

      // Route chips
      const routeChips = document.querySelectorAll('.route-chip');
      routeChips.forEach(chip => {
        chip.addEventListener('click', () => {
          const path = chip.getAttribute('data-path');
          try {
            const currentUrl = new URL(urlInput.value);
            currentUrl.pathname = path;
            navigatePreview(currentUrl.toString());
          } catch (e) {
            navigatePreview('http://localhost:8081' + path);
          }
        });
      });

      // Iframe load & error handling
      if (iframe) {
        iframe.addEventListener('load', () => {
          if (offlineOverlay) offlineOverlay.style.display = 'none';
          if (statusLabel) {
            statusLabel.innerText = 'Live';
            statusLabel.className = 'footer-badge status-live';
          }
          if (liveBeacon) liveBeacon.style.background = 'var(--accent-emerald)';
        });
      }

      if (btnRetryConn) {
        btnRetryConn.addEventListener('click', () => {
          if (offlineOverlay) offlineOverlay.style.display = 'none';
          iframe.src = urlInput.value;
        });
      }

      if (btnPort3000) {
        btnPort3000.addEventListener('click', () => {
          if (offlineOverlay) offlineOverlay.style.display = 'none';
          try {
            const u = new URL(urlInput.value);
            u.port = '3000';
            navigatePreview(u.toString());
          } catch (e) {
            navigatePreview('http://localhost:3000');
          }
        });
      }

      // Expose public control functions
      window.previewDockerControl = {
        show: function(url) {
          docker.style.display = 'flex';
          if (dockPill) dockPill.style.display = 'none';
          if (url) navigatePreview(url);
          updateDimensionsLabel();
        },
        toggle: function() {
          if (docker.style.display === 'none') {
            docker.style.display = 'flex';
            if (dockPill) dockPill.style.display = 'none';
            updateDimensionsLabel();
          } else {
            docker.style.display = 'none';
          }
        },
        navigate: navigatePreview
      };

      // Initial dimension calculation & port display
      updateDimensionsLabel();
      updatePortBadge(urlInput.value);
    }

    // Initialize Localhost Preview Docker
    initLocalhostPreviewDocker();

    // Inform extension webview is loaded
    vscode.postMessage({ command: 'ready' });
  </script>
</body>
</html>`;
  }
}
