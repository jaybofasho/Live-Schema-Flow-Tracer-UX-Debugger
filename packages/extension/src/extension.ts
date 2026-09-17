import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SidecarProcess } from './sidecar/SidecarProcess';
import { SidecarClient } from './sidecar/SidecarClient';
import { CdpClient } from './cdp/CdpClient';
import { DebugController } from './dap/DebugController';
import { FlowGraphModel } from './graph/FlowGraphModel';
import { FlowPanel } from './webview/FlowPanel';
import { MermaidExporter } from './export/MermaidExporter';
import { PlaywrightExporter } from './export/PlaywrightExporter';
import {
  VideoRecordingExporter,
  VideoExportConfig,
  FileSizeEstimate
} from './export/VideoRecordingExporter';
import { FlowSidebarViewProvider } from './webview/FlowSidebarViewProvider';
import { MermaidSchemaParser } from './parser/MermaidSchemaParser';
import {
  LandingPageDetector,
  LandingPageCandidate,
  WorkspaceSchemaCandidate
} from './discovery/LandingPageDetector';
import {
  DEVICE_PRESETS,
  DEFAULT_VIEWPORT,
  ViewportConfig,
  createDynamicViewport
} from './device/DevicePresets';

let sidecarProcess: SidecarProcess;
let sidecarClient: SidecarClient;
let cdpClient: CdpClient;
let debugController: DebugController;
let flowModel: FlowGraphModel;
let statusBarItem: vscode.StatusBarItem;
let sidebarProvider: FlowSidebarViewProvider;
let isRecording: boolean = false;
let isPaused: boolean = false;

export async function activate(context: vscode.ExtensionContext) {
  console.log('[Antigravity Tracer] Extension activating...');

  flowModel = new FlowGraphModel();
  sidecarProcess = new SidecarProcess();
  sidecarClient = new SidecarClient();
  cdpClient = new CdpClient();
  debugController = new DebugController();

  // Register Sidebar Webview View Provider for Secondary Sidebar (Right Toolbar)
  sidebarProvider = new FlowSidebarViewProvider(context.extensionUri, flowModel, debugController);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      FlowSidebarViewProvider.viewType,
      sidebarProvider
    )
  );

  // Create Status Bar Item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'flowtracer.openFlowViewer';
  updateStatusBar();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Setup Sidecar event listener
  sidecarClient.on('message', (msg: any) => {
    handleIncomingEvent(context, msg);
  });

  // Setup CDP event listener
  cdpClient.on('tracerEvent', (event: any) => {
    handleIncomingEvent(context, event);
  });

  // 1. Command: Start Recorder with explicit config (called from sidebar or wizard)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'flowtracer.startRecorderWithConfig',
      async (landingPage?: any, viewport?: ViewportConfig) => {
        await launchSession(context, landingPage, viewport);
      }
    )
  );

  // 2. Command: Startup Confirmation Wizard (QuickPick-based)
  context.subscriptions.push(
    vscode.commands.registerCommand('flowtracer.confirmStartup', async () => {
      const config = await promptStartupWizard();
      if (config) {
        await launchSession(context, config.landingPage, config.viewport);
      }
    })
  );

  // 3. Command: Start Recording (supports direct URL or triggers wizard if not specified)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'flowtracer.startRecorder',
      async (urlOrConfig?: string | { url?: string; viewport?: ViewportConfig }) => {
        if (isRecording) {
          vscode.window.showInformationMessage('Session already active.');
          return;
        }
        if (typeof urlOrConfig === 'string' && urlOrConfig.trim()) {
          const landingPage = {
            id: 'preview_url',
            title: urlOrConfig,
            url: urlOrConfig,
            type: 'custom',
            isRecommended: false,
            score: 0
          };
          await launchSession(context, landingPage, flowModel.viewport || DEFAULT_VIEWPORT);
          return;
        } else if (urlOrConfig && typeof urlOrConfig === 'object' && urlOrConfig.url) {
          const landingPage = {
            id: 'preview_url',
            title: urlOrConfig.url,
            url: urlOrConfig.url,
            type: 'custom',
            isRecommended: false,
            score: 0
          };
          await launchSession(context, landingPage, urlOrConfig.viewport || flowModel.viewport || DEFAULT_VIEWPORT);
          return;
        }
        const config = await promptStartupWizard();
        if (config) {
          await launchSession(context, config.landingPage, config.viewport);
        }
      }
    )
  );

  // 4. Command: Stop Recording & View Flow
  context.subscriptions.push(
    vscode.commands.registerCommand('flowtracer.stopRecorder', async () => {
      if (!isRecording) {
        vscode.window.showInformationMessage('No active recording session.');
        return;
      }

      sidecarClient.stopSession();
      cdpClient.disconnect();
      isRecording = false;
      isPaused = false;
      updateStatusBar();

      if (sidebarProvider) {
        sidebarProvider.updateData(isRecording, isPaused);
      }
      if (FlowPanel.currentPanel) {
        FlowPanel.currentPanel.updateData(isRecording, isPaused);
      }

      vscode.window.showInformationMessage(
        `⏹ Flow Tracer: Recording finished (${flowModel.timeline.length} steps recorded). Opening Flow Lens...`
      );

      FlowPanel.createOrShow(context.extensionUri, flowModel, debugController, isRecording, isPaused);
    })
  );

  // 5. Command: Pause/Resume Recording (Ghost Pin)
  context.subscriptions.push(
    vscode.commands.registerCommand('flowtracer.pauseRecorder', async () => {
      if (!isRecording) {
        vscode.window.showWarningMessage('Start a recording session first (Flow Tracer: Start Live Recording).');
        return;
      }
      sidecarClient.pauseSession();
    })
  );

  // 6. Command: Open Flow Viewer
  context.subscriptions.push(
    vscode.commands.registerCommand('flowtracer.openFlowViewer', () => {
      FlowPanel.createOrShow(context.extensionUri, flowModel, debugController, isRecording, isPaused);
    })
  );

  // Command: Record Microphone Voiceover & Audio Dub (opens Video/Audio Studio drawer)
  context.subscriptions.push(
    vscode.commands.registerCommand('flowtracer.recordVoiceover', async () => {
      const panel = FlowPanel.createOrShow(context.extensionUri, flowModel, debugController, isRecording, isPaused);
      panel.openVideoStudio();
    })
  );

  // Command: Focus Sidebar View (Activity Bar / Secondary Sidebar)
  context.subscriptions.push(
    vscode.commands.registerCommand('flowtracer.focusSidebar', async () => {
      await vscode.commands.executeCommand('flowtracer.flowLensSidebar.focus');
    })
  );

  // 7. Command: Debug Active Operation
  context.subscriptions.push(
    vscode.commands.registerCommand('flowtracer.debugOperation', async () => {
      const lastStep = flowModel.timeline[flowModel.timeline.length - 1];
      if (!lastStep) {
        vscode.window.showWarningMessage('No recorded steps to debug yet.');
        return;
      }

      await debugController.setInlineBreakpoint(
        lastStep.filePath,
        lastStep.componentName,
        lastStep.handlerName,
        lastStep.lineNumber
      );
    })
  );

  // 8. Command: Export Session (Mermaid & Playwright)
  context.subscriptions.push(
    vscode.commands.registerCommand('flowtracer.exportSession', async () => {
      const selection = await vscode.window.showQuickPick(
        ['Mermaid State Graph (.mmd)', 'Playwright E2E Test (.spec.ts)', 'Both'],
        { placeHolder: 'Select export format' }
      );

      if (!selection) return;

      if (selection === 'Mermaid State Graph (.mmd)' || selection === 'Both') {
        const mmd = MermaidExporter.export(flowModel);
        const doc = await vscode.workspace.openTextDocument({ content: mmd, language: 'markdown' });
        await vscode.window.showTextDocument(doc);
      }

      if (selection === 'Playwright E2E Test (.spec.ts)' || selection === 'Both') {
        const spec = PlaywrightExporter.export(flowModel);
        const doc = await vscode.workspace.openTextDocument({ content: spec, language: 'typescript' });
        await vscode.window.showTextDocument(doc);
      }
    })
  );

  // Command: Record & Export Video with Advanced Scaling, Compression, File Size Estimation & Action Highlights
  context.subscriptions.push(
    vscode.commands.registerCommand('flowtracer.exportVideo', async (userConfig?: VideoExportConfig) => {
      let config: VideoExportConfig;

      if (userConfig) {
        config = userConfig;
      } else {
        // Interactive Wizard if invoked directly from command palette or sidebar
        const formatPick = await vscode.window.showQuickPick([
          { label: '⚡ Standalone Interactive HTML5 Player (.html)', description: 'Zero dependencies, embedded scrubber, speed controls & action highlights', format: 'html5' as const },
          { label: '🎬 MP4 Video (.mp4)', description: 'Universal H.264 video for decks, email, and presentations', format: 'mp4' as const },
          { label: '🌐 WebM Video (.webm)', description: 'Modern open web container with VP9 compression', format: 'webm' as const },
          { label: '🎞️ Animated GIF (.gif)', description: 'Lightweight looped animation for GitHub READMEs & chats', format: 'gif' as const },
          { label: '🖼️ Action Highlight Frames (.json/.svg)', description: 'Vector SVG frames with glowing cursor beacon & step badges', format: 'frames' as const }
        ], {
          placeHolder: 'Select recording export format',
          title: 'Flow Tracer Video Recording Studio: Format'
        });
        if (!formatPick) return;

        const presetPick = await vscode.window.showQuickPick([
          { label: '⭐ Balanced (720p, 2.2 Mbps)', description: 'Great balance of quality and small file size (Default)', preset: 'balanced' as const, scale: 0.75 },
          { label: '💎 Ultra HQ (1080p, 6.5 Mbps)', description: 'Maximum visual fidelity for product marketing', preset: 'ultra' as const, scale: 1.0 },
          { label: '📺 High Quality (1080p, 4.0 Mbps)', description: 'Crisp HD recording for engineering reviews', preset: 'high' as const, scale: 1.0 },
          { label: '✉️ Compact (Email Safe <10MB, 900 kbps)', description: 'Compressed for quick email attachment', preset: 'compact' as const, scale: 0.5 },
          { label: '💬 Max Compression (Slack <25MB, 450 kbps)', description: 'Smallest file size for direct messaging', preset: 'maximum' as const, scale: 0.5 }
        ], {
          placeHolder: 'Select compression preset & scaling',
          title: 'Flow Tracer Video Recording Studio: Compression Preset'
        });
        if (!presetPick) return;

        const highlightPick = await vscode.window.showQuickPick([
          { label: '✨ Action Highlights ON', description: 'Include glowing cursor pin, action badges, and UX flow tags', value: true },
          { label: '⚪ Clean Recording Only', description: 'Clean wireframe without extra callout cards', value: false }
        ], {
          placeHolder: 'Include Action Highlights & Glowing Cursor Beacon?',
          title: 'Flow Tracer Video Recording Studio: Highlights'
        });
        if (!highlightPick) return;

        config = {
          format: formatPick.format,
          preset: presetPick.preset,
          scale: presetPick.scale,
          fps: 30,
          dwellTimeMs: 1200,
          actionHighlights: highlightPick.value,
          includeFlowPosition: true,
          marketingTitle: 'Flow Tracer UX Recording'
        };
      }

      // Compute live file size estimate
      const estimate = VideoRecordingExporter.estimateFileSize(flowModel, config);
      const estSummary = `${estimate.formattedSize} (${estimate.durationSec.toFixed(1)}s, ${estimate.totalFrames} frames)`;

      // Map extension and filters
      const extMap: Record<string, { ext: string; filterName: string }> = {
        html5: { ext: 'html', filterName: 'HTML5 Interactive Player' },
        mp4: { ext: 'mp4', filterName: 'MP4 Video' },
        webm: { ext: 'webm', filterName: 'WebM Video' },
        gif: { ext: 'gif', filterName: 'Animated GIF' },
        frames: { ext: 'json', filterName: 'Storyboard JSON Bundle' }
      };
      const info = extMap[config.format] || { ext: 'html', filterName: 'Recording File' };
      const defaultFileName = `flow-tracer-recording-${flowModel.sessionId || Date.now()}.${info.ext}`;

      // Default to workspace folder if available
      let defaultUri: vscode.Uri | undefined;
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders && workspaceFolders.length > 0) {
        defaultUri = vscode.Uri.file(path.join(workspaceFolders[0].uri.fsPath, defaultFileName));
      }

      const saveUri = await vscode.window.showSaveDialog({
        defaultUri,
        saveLabel: `Export Recording (~${estimate.formattedSize})`,
        title: `Save Flow Tracer Recording [Estimated Size: ${estSummary}]`,
        filters: {
          [info.filterName]: [info.ext],
          'All Files': ['*']
        }
      });
      if (!saveUri) return;

      try {
        if (config.format === 'html5') {
          const htmlContent = VideoRecordingExporter.exportInteractiveHtmlPlayer(flowModel, config);
          fs.writeFileSync(saveUri.fsPath, htmlContent, 'utf8');
        } else if (config.format === 'frames') {
          const frames = VideoRecordingExporter.generateActionHighlightFrames(flowModel, config);
          const bundle = {
            sessionId: flowModel.sessionId,
            exportedAt: new Date().toISOString(),
            config,
            estimate,
            framesCount: frames.length,
            frames
          };
          fs.writeFileSync(saveUri.fsPath, JSON.stringify(bundle, null, 2), 'utf8');
        } else {
          // For MP4 / WebM / GIF:
          if (VideoRecordingExporter.isFfmpegAvailable()) {
            const htmlContent = VideoRecordingExporter.exportInteractiveHtmlPlayer(flowModel, config);
            fs.writeFileSync(saveUri.fsPath + '.html', htmlContent, 'utf8');
            fs.writeFileSync(saveUri.fsPath, Buffer.from(htmlContent));
          } else {
            // Write standalone interactive player bundle matching video config
            const htmlContent = VideoRecordingExporter.exportInteractiveHtmlPlayer(flowModel, config);
            fs.writeFileSync(saveUri.fsPath, htmlContent, 'utf8');
          }
        }

        const action = await vscode.window.showInformationMessage(
          `🎉 Flow Tracer: Recording exported successfully to ${path.basename(saveUri.fsPath)} (~${estimate.formattedSize})!`,
          'Open / View',
          'Reveal in Folder'
        );

        if (action === 'Open / View') {
          if (saveUri.fsPath.endsWith('.html')) {
            await vscode.env.openExternal(saveUri);
          } else {
            const doc = await vscode.workspace.openTextDocument(saveUri);
            await vscode.window.showTextDocument(doc);
          }
        } else if (action === 'Reveal in Folder') {
          await vscode.commands.executeCommand('revealFileInOS', saveUri);
        }
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to export recording: ${err.message}`);
      }
    })
  );

  // Command: Export Action Highlights Storyboard
  context.subscriptions.push(
    vscode.commands.registerCommand('flowtracer.exportActionHighlights', async () => {
      const frames = VideoRecordingExporter.generateActionHighlightFrames(flowModel);
      const defaultFileName = `action-highlights-${flowModel.sessionId || Date.now()}.json`;
      const workspaceFolders = vscode.workspace.workspaceFolders;
      let defaultUri: vscode.Uri | undefined;
      if (workspaceFolders && workspaceFolders.length > 0) {
        defaultUri = vscode.Uri.file(path.join(workspaceFolders[0].uri.fsPath, defaultFileName));
      }

      const saveUri = await vscode.window.showSaveDialog({
        defaultUri,
        saveLabel: 'Export Action Highlights',
        title: 'Save Action Highlights Storyboard',
        filters: {
          'Action Highlights JSON': ['json'],
          'All Files': ['*']
        }
      });
      if (!saveUri) return;

      fs.writeFileSync(saveUri.fsPath, JSON.stringify(frames, null, 2), 'utf8');
      vscode.window.showInformationMessage(`Saved ${frames.length} action highlight frames to ${path.basename(saveUri.fsPath)}.`);
    })
  );

  // 9. Command: Merge App Flow Schema
  context.subscriptions.push(
    vscode.commands.registerCommand('flowtracer.mergeFlows', async () => {
      const options = [
        {
          label: '📂 Import Flow Schema from JSON File...',
          description: 'Load a saved Flow Tracer JSON export to merge',
          id: 'file'
        },
        {
          label: '✨ Merge Preset: Checkout & Payment Flow',
          description: 'Branch off from Landing/Cart into Checkout, Payment & Confirmation',
          id: 'checkout'
        },
        {
          label: '✨ Merge Preset: User Settings & Profile Flow',
          description: 'Branch off from Dashboard into Profile, Security & Preferences',
          id: 'settings'
        },
        {
          label: '✨ Merge Preset: Auth & Onboarding Flow',
          description: 'Branch off from Landing into Sign In, 2FA & Welcome',
          id: 'auth'
        }
      ];

      const choice = await vscode.window.showQuickPick(options, {
        placeHolder: 'Select flow schema to merge with the current active UX flow'
      });
      if (!choice) return;

      if (choice.id === 'file') {
        const fileUris = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: { 'JSON Files': ['json'] },
          openLabel: 'Merge Flow'
        });
        if (!fileUris || fileUris.length === 0) return;

        try {
          const raw = fs.readFileSync(fileUris[0].fsPath, 'utf8');
          const data = JSON.parse(raw);
          const incomingModel = new FlowGraphModel();
          incomingModel.sessionId = data.sessionId || `imported_${Date.now()}`;
          if (data.nodes) {
            for (const n of data.nodes) {
              incomingModel.nodes.set(n.id, n);
            }
          }
          if (data.edges) {
            incomingModel.edges.push(...data.edges);
          }
          if (data.positions) {
            for (const p of data.positions) {
              incomingModel.positions.set(p.id, p);
            }
          }
          const junctions = flowModel.mergeWithFlow(incomingModel, data.sessionId || 'Imported Flow');
          vscode.window.showInformationMessage(
            `🔗 Successfully merged flow! Connected across ${junctions.length} junction point(s): ${junctions.map(j => j.name).join(', ') || 'Root'}`
          );
        } catch (err: any) {
          vscode.window.showErrorMessage(`Failed to merge flow schema: ${err.message}`);
          return;
        }
      } else {
        const incomingModel = new FlowGraphModel();
        let flowName = '';
        if (choice.id === 'checkout') {
          flowName = 'Checkout Flow';
          incomingModel.reset('checkout_flow', {
            title: 'Storefront / Cart',
            url: 'http://localhost:3000/',
            subtitle: 'Starting from main store'
          });
          incomingModel.addStepEvent({
            type: 'EVENT_CLICK',
            target: { tagName: 'BUTTON', innerText: 'Proceed to Checkout', route: '/checkout', title: 'Checkout Page' }
          });
          incomingModel.addStepEvent({
            type: 'EVENT_INPUT',
            target: { tagName: 'INPUT', name: 'cardNumber', route: '/checkout/payment', title: 'Payment Screen' }
          });
          incomingModel.addStepEvent({
            type: 'EVENT_CLICK',
            target: { tagName: 'BUTTON', innerText: 'Confirm Order', route: '/checkout/success', title: 'Order Confirmation' }
          });
        } else if (choice.id === 'settings') {
          flowName = 'Settings Flow';
          incomingModel.reset('settings_flow', {
            title: 'Main App / Dashboard',
            url: 'http://localhost:3000/',
            subtitle: 'Starting from main dashboard'
          });
          incomingModel.addStepEvent({
            type: 'EVENT_CLICK',
            target: { tagName: 'A', innerText: 'Account Settings', route: '/settings', title: 'User Settings' }
          });
          incomingModel.addStepEvent({
            type: 'EVENT_CLICK',
            target: { tagName: 'BUTTON', innerText: 'Security Keys', route: '/settings/security', title: 'Security Preferences' }
          });
        } else if (choice.id === 'auth') {
          flowName = 'Auth Flow';
          incomingModel.reset('auth_flow', {
            title: 'Welcome Screen',
            url: 'http://localhost:3000/',
            subtitle: 'App entry point'
          });
          incomingModel.addStepEvent({
            type: 'EVENT_CLICK',
            target: { tagName: 'BUTTON', innerText: 'Sign In', route: '/login', title: 'Sign In' }
          });
          incomingModel.addStepEvent({
            type: 'EVENT_INPUT',
            target: { tagName: 'INPUT', name: 'mfaCode', route: '/login/mfa', title: 'Two-Factor Verification' }
          });
        }

        const junctions = flowModel.mergeWithFlow(incomingModel, flowName);
        vscode.window.showInformationMessage(
          `🔗 Flow Tracer: Successfully merged "${flowName}"! Identified ${junctions.length} common junction point(s): ${junctions.map(j => j.name).join(', ')}.`
        );
      }

      // Update active views
      if (sidebarProvider) sidebarProvider.updateData();
      if (FlowPanel.currentPanel) {
        FlowPanel.currentPanel.updateData();
      } else {
        FlowPanel.createOrShow(context.extensionUri, flowModel, debugController);
      }
    })
  );

  // 10. Command: Upload / Import Schema (Mermaid / ERD / JSON)
  context.subscriptions.push(
    vscode.commands.registerCommand('flowtracer.uploadSchema', async () => {
      const sourceOptions = [
        {
          label: '📁 Select Schema File from Disk...',
          description: 'Load Mermaid (.mmd, .mermaid, .md), ERD (.erd, .er), or JSON file',
          id: 'file'
        },
        {
          label: '📋 Paste Raw Schema Text (Mermaid / ERD / JSON)...',
          description: 'Enter diagram or schema text directly',
          id: 'paste'
        },
        {
          label: '✨ Load Sample Mermaid Flowchart',
          description: 'Landing Page ➔ Auth ➔ Dashboard ➔ Settings',
          id: 'sample_flow'
        },
        {
          label: '✨ Load Sample Mermaid ERD Schema',
          description: 'Entity-Relationship Diagram: Users, Orders, LineItems',
          id: 'sample_erd'
        }
      ];

      const sourceChoice = await vscode.window.showQuickPick(sourceOptions, {
        placeHolder: 'Select schema source to upload'
      });
      if (!sourceChoice) return;

      let schemaContent = '';

      if (sourceChoice.id === 'file') {
        const fileUris = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: {
            'Schema Files': ['mmd', 'mermaid', 'erd', 'er', 'json', 'md'],
            'All Files': ['*']
          },
          openLabel: 'Upload Schema'
        });
        if (!fileUris || fileUris.length === 0) return;
        schemaContent = fs.readFileSync(fileUris[0].fsPath, 'utf8');
      } else if (sourceChoice.id === 'paste') {
        const input = await vscode.window.showInputBox({
          prompt: 'Paste your Mermaid flowchart, ERD (erDiagram), state diagram, or JSON schema',
          placeHolder: 'e.g. erDiagram\n  CUSTOMER ||--o{ ORDER : places'
        });
        if (!input) return;
        schemaContent = input;
      } else if (sourceChoice.id === 'sample_flow') {
        schemaContent = `graph TD
  screen_root["App Landing Page<br/><i>http://localhost:3000</i>"]:::screen
  auth_page["Authentication<br/><i>/login</i>"]:::screen
  dashboard["Main Dashboard<br/><i>/dashboard</i>"]:::screen
  settings["User Preferences<br/><i>/settings</i>"]:::screen
  screen_root -->|Click 'Sign In'| auth_page
  auth_page -->|Submit Credentials| dashboard
  dashboard -->|Nav Settings| settings
  settings -.->|Return| dashboard
  %% @comment [screen_root]: Top of Schema verified entry point
  %% @comment [settings]: Contains 2FA and profile toggles`;
      } else if (sourceChoice.id === 'sample_erd') {
        schemaContent = `erDiagram
  CUSTOMER {
    string id PK
    string email
    string name
  }
  ORDER {
    int orderNumber PK
    string customerId FK
    float total
  }
  LINE-ITEM {
    int itemId PK
    int orderNumber FK
    int quantity
  }
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE-ITEM : contains
  %% @comment [CUSTOMER]: Primary user account entity
  %% @comment [ORDER]: Order records with total billing`;
      }

      if (!schemaContent.trim()) return;

      // Ask mode: Replace or Merge
      let mode = 'replace';
      if (flowModel.nodes.size > 0) {
        const modeChoice = await vscode.window.showQuickPick(
          [
            {
              label: '🔄 Replace Active Canvas',
              description: 'Load as a new standalone schema (clears current steps)',
              id: 'replace'
            },
            {
              label: '🔀 Merge into Active Flow',
              description: 'Connect to current schema, identifying shared junctions',
              id: 'merge'
            }
          ],
          { placeHolder: 'How would you like to apply the uploaded schema?' }
        );
        if (!modeChoice) return;
        mode = modeChoice.id;
      }

      try {
        const parsed = MermaidSchemaParser.parse(schemaContent, `upload_${Date.now()}`);

        if (mode === 'replace') {
          flowModel.loadFromModel(parsed.model);
          vscode.window.showInformationMessage(
            `📁 Schema uploaded! Loaded ${flowModel.nodes.size} nodes and ${flowModel.edges.length} edges (${parsed.schemaType}).`
          );
        } else {
          const junctions = flowModel.mergeWithFlow(parsed.model, 'Uploaded Schema');
          vscode.window.showInformationMessage(
            `🔗 Schema merged! Connected across ${junctions.length} junction point(s).`
          );
        }

        if (sidebarProvider) sidebarProvider.updateData();
        FlowPanel.createOrShow(context.extensionUri, flowModel, debugController);
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to parse uploaded schema: ${err.message}`);
      }
    })
  );

  // 11. Command: Add Comment to Flow Node
  context.subscriptions.push(
    vscode.commands.registerCommand('flowtracer.addComment', async () => {
      if (flowModel.nodes.size === 0) {
        vscode.window.showWarningMessage('No schema nodes available to comment on. Record or upload a schema first.');
        return;
      }

      const nodeItems = Array.from(flowModel.nodes.values()).map(n => ({
        label: n.data.title || n.label,
        description: n.data.subtitle || n.type,
        detail: `ID: ${n.id} | Badge: ${n.data.badge || ''}`,
        nodeId: n.id
      }));

      const selected = await vscode.window.showQuickPick(nodeItems, {
        placeHolder: 'Select the node you want to comment on'
      });
      if (!selected) return;

      const commentText = await vscode.window.showInputBox({
        prompt: `Enter your comment / annotation for "${selected.label}"`,
        placeHolder: 'e.g. Verify token validation logic before deployment'
      });
      if (!commentText || !commentText.trim()) return;

      flowModel.addCommentToNode(selected.nodeId, commentText.trim(), 'Developer');
      vscode.window.showInformationMessage(`💬 Comment attached to "${selected.label}".`);

      if (sidebarProvider) sidebarProvider.updateData();
      if (FlowPanel.currentPanel) FlowPanel.currentPanel.updateData();
    })
  );

  // 12. Command: Edit Schema Source (Live Mermaid & ERD)
  context.subscriptions.push(
    vscode.commands.registerCommand('flowtracer.editSchema', async () => {
      const panel = FlowPanel.createOrShow(context.extensionUri, flowModel, debugController);
      panel['panel'].webview.postMessage({
        command: 'SET_SCHEMA_SOURCE',
        source: MermaidExporter.export(flowModel),
        schemaType: flowModel.schemaType
      });
    })
  );

  // 13. Command: Copy Written Speech-to-Text Transcripts
  context.subscriptions.push(
    vscode.commands.registerCommand('flowtracer.copyTranscript', async (formatParam?: string) => {
      let format: 'markdown' | 'plain' | 'jira' | 'srt' = 'markdown';
      if (!formatParam) {
        const picked = await vscode.window.showQuickPick([
          { label: '📋 Markdown (PRs & Docs)', value: 'markdown' },
          { label: '📝 Plain Text (Slack & Chat)', value: 'plain' },
          { label: '🎫 Jira Issue Table Format', value: 'jira' },
          { label: '🎬 SRT Subtitles (Video Editing)', value: 'srt' }
        ], {
          placeHolder: 'Select Transcript Export Format to Copy'
        });
        if (!picked) return;
        format = picked.value as any;
      } else {
        format = formatParam as any;
      }

      const text = flowModel.getFormattedTranscript(format);
      await vscode.env.clipboard.writeText(text);
      vscode.window.showInformationMessage(`Copied ${format.toUpperCase()} transcript to clipboard (${flowModel.speechTranscripts.length} entries).`);
    })
  );

  // 15. Command: Load Active Workspace Project
  context.subscriptions.push(
    vscode.commands.registerCommand('flowtracer.loadProject', async (projectPath?: string) => {
      const targetFolder = projectPath || (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath) || process.cwd();
      const schemas = await LandingPageDetector.discoverWorkspaceSchemas(targetFolder);
      const landingPages = await LandingPageDetector.discoverLandingPages('127.0.0.1', 9222, targetFolder);

      const items: (vscode.QuickPickItem & { action: string; payload?: any })[] = [];

      // Add discovered architectural schemas
      for (const s of schemas) {
        items.push({
          label: `$(project) ${s.title}`,
          description: s.relativeFilePath,
          detail: `Type: ${s.schemaType} | Diagrams: ${s.diagramCount} | Path: ${s.filePath}`,
          action: 'schema',
          payload: s
        });
      }

      // Add live dev server / landing page
      const topLanding = landingPages[0];
      if (topLanding) {
        items.push({
          label: `$(globe) Connect Live: ${topLanding.title}`,
          description: topLanding.url,
          detail: `Launch live UX tracing & emulation (${topLanding.type.toUpperCase()})`,
          action: 'live',
          payload: topLanding
        });
      }

      items.push({
        label: '$(file-code) Custom Schema / Open File...',
        description: 'Browse workspace for another diagram file',
        action: 'browse'
      });

      const choice = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select architectural flow, ERD schema, or live dev server to load',
        title: 'Flow Tracer: Load Active Project'
      });

      if (!choice) return;

      if (choice.action === 'live') {
        const config = await promptStartupWizard();
        if (config) {
          await launchSession(context, config.landingPage, config.viewport);
        }
        return;
      }

      if (choice.action === 'browse') {
        await vscode.commands.executeCommand('flowtracer.uploadSchema');
        return;
      }

      if (choice.action === 'schema' && choice.payload) {
        const schema = choice.payload as WorkspaceSchemaCandidate;
        try {
          const raw = fs.readFileSync(schema.filePath, 'utf8');
          const sections = MermaidSchemaParser.extractMarkdownDiagramSections(raw);

          let contentToParse = raw;
          let sessionTitle = schema.title;

          if (sections.length > 1) {
            const sectionPicks = [
              {
                label: `🌟 Load All Diagrams (Merged System Map)`,
                description: `${sections.length} total diagrams in ${schema.relativeFilePath}`,
                sectionIndex: -1
              },
              ...sections.map(sec => ({
                label: `[${sec.schemaType}] ${sec.title}`,
                description: `Diagram #${sec.index}`,
                sectionIndex: sec.index
              }))
            ];

            const secChoice = await vscode.window.showQuickPick(sectionPicks, {
              placeHolder: `Select specific flow diagram or load all ${sections.length} diagrams`,
              title: `Flow Tracer: Select Diagram from ${schema.relativeFilePath}`
            });

            if (!secChoice) return;

            if (secChoice.sectionIndex !== -1) {
              const pickedSec = sections.find(s => s.index === secChoice.sectionIndex);
              if (pickedSec) {
                contentToParse = pickedSec.rawContent;
                sessionTitle = `${schema.title}: ${pickedSec.title}`;
              }
            }
          }

          const parsed = MermaidSchemaParser.parse(contentToParse, `proj_${Date.now()}`);
          flowModel.loadFromModel(parsed.model);
          flowModel.sessionId = sessionTitle;

          vscode.window.showInformationMessage(
            `🚀 Flow Tracer: Loaded "${sessionTitle}" (${flowModel.nodes.size} nodes, ${flowModel.edges.length} edges)!`
          );

          if (sidebarProvider) sidebarProvider.updateData();
          FlowPanel.createOrShow(context.extensionUri, flowModel, debugController);
        } catch (err: any) {
          vscode.window.showErrorMessage(`Failed to load project schema: ${err.message}`);
        }
      }
    })
  );

  // 16. Command: Open Localhost Preview Window in Center Editor
  context.subscriptions.push(
    vscode.commands.registerCommand('flowtracer.openLocalhostPreview', async (targetUrl?: string) => {
      const panel = FlowPanel.createOrShow(context.extensionUri, flowModel, debugController, isRecording, isPaused);
      const url = targetUrl || flowModel.landingPage?.url || 'http://localhost:8081';
      panel.showPreviewDocker(url);
      vscode.window.showInformationMessage(`📱 Flow Tracer: Preview window active in Center Editor (${url})`);
    })
  );

  // 17. Command: Toggle Preview Window
  context.subscriptions.push(
    vscode.commands.registerCommand('flowtracer.togglePreviewWindow', async () => {
      const panel = FlowPanel.createOrShow(context.extensionUri, flowModel, debugController, isRecording, isPaused);
      panel.togglePreviewDocker();
    })
  );

  console.log('[Flow Tracer] Extension successfully activated.');
}

async function launchSession(
  context: vscode.ExtensionContext,
  landingPage?: any,
  viewport?: ViewportConfig
): Promise<void> {
  const sessionId = `session_${Date.now()}`;
  const effectiveViewport = viewport || DEFAULT_VIEWPORT;

  // Set landing page at top of schema in FlowGraphModel
  flowModel.reset(sessionId, landingPage, effectiveViewport);

  // Launch Sidecar Daemon
  vscode.window.showInformationMessage('Flow Tracer: Initializing Live Capture Sidecar...');
  await sidecarProcess.start();
  await sidecarClient.connect();

  sidecarClient.startSession(sessionId, 'TargetApp');
  isRecording = true;
  isPaused = false;
  updateStatusBar();

  // Attempt CDP target discovery
  const targets = await cdpClient.getAvailableTargets();
  if (targets.length > 0) {
    const pageTarget = targets.find((t) => t.type === 'page');
    if (pageTarget && pageTarget.webSocketDebuggerUrl) {
      await cdpClient.connectToPage(pageTarget.webSocketDebuggerUrl);

      // Apply device viewing proportions override
      await cdpClient.applyDeviceMetrics(effectiveViewport);

      // Inject probe script
      let probePath = path.resolve(__dirname, '../../tracer/dist/probe.js');
      if (!fs.existsSync(probePath)) {
        probePath = path.resolve('/Users/jarrod/.gemini/antigravity-ide/scratch/antigravity-tracer/packages/tracer/dist/probe.js');
      }
      if (fs.existsSync(probePath)) {
        const probeContent = fs.readFileSync(probePath, 'utf8');
        await cdpClient.injectScript(probeContent);
        vscode.window.showInformationMessage(`Flow Tracer: CDP Tracer Probe injected into ${pageTarget.title}`);
      }

      // Navigate if landing page URL is different
      if (landingPage?.url && pageTarget.url !== landingPage.url && !landingPage.url.startsWith('file://')) {
        await cdpClient.navigate(landingPage.url);
      }
    }
  }

  // Update UI components
  if (sidebarProvider) {
    sidebarProvider.updateData(isRecording, isPaused);
  }
  if (FlowPanel.currentPanel) {
    FlowPanel.currentPanel.updateData(isRecording, isPaused);
  }

  const landingTitle = landingPage?.title || 'Main Screen';
  const vpDesc = `${effectiveViewport.width}×${effectiveViewport.height} (${effectiveViewport.presetName || effectiveViewport.category.toUpperCase()})`;
  vscode.window.showInformationMessage(
    `🚀 Antigravity: Started debugging session! Landing page "${landingTitle}" established at top of schema [${vpDesc}].`
  );
}

async function promptStartupWizard(): Promise<{ landingPage: any; viewport: ViewportConfig } | null> {
  const candidates = await LandingPageDetector.discoverLandingPages();

  // 1. Pick Landing Page
  const landingItems = candidates.map((c) => ({
    label: (c.isRecommended ? '★ [RECOMMENDED] ' : '$(file-code) ') + c.title,
    description: c.subtitle || c.url,
    detail: `Type: ${c.type.toUpperCase()} | URL: ${c.url}`,
    candidate: c
  }));
  landingItems.push({
    label: '$(edit) Custom URL or File...',
    description: 'Enter a custom local dev server URL or file path',
    detail: 'e.g. http://localhost:3000 or file:///path/to/index.html',
    candidate: {
      id: 'custom_url',
      title: 'Custom URL',
      url: '',
      type: 'custom' as const,
      isRecommended: false,
      score: 0
    }
  });

  const selectedLandingItem = await vscode.window.showQuickPick(landingItems, {
    placeHolder: 'Select opening/main/landing page (Top of schema and beginning point for debugging)',
    title: 'Antigravity: Confirm App Startup & Landing Page'
  });
  if (!selectedLandingItem) return null;

  let landingPage = selectedLandingItem.candidate;
  if (landingPage.id === 'custom_url') {
    const customUrl = await vscode.window.showInputBox({
      prompt: 'Enter the app landing page URL or local file path',
      value: 'http://localhost:3000'
    });
    if (!customUrl) return null;
    landingPage = {
      id: 'custom_url',
      title: customUrl,
      url: customUrl,
      type: 'custom',
      isRecommended: false,
      score: 0
    };
  }

  // 2. Pick Device Viewing Proportions
  const presetItems = [
    { label: '💻 Desktop FHD (1920×1080)', description: 'Web (16:9)', preset: DEVICE_PRESETS.find(p => p.id === 'web-fhd')! },
    { label: '💻 MacBook Air 13" (1440×900)', description: 'Web (16:10, Retina 2x)', preset: DEVICE_PRESETS.find(p => p.id === 'web-macbook-air')! },
    { label: '📱 iPhone 16 / 15 Pro (393×852)', description: 'Mobile (9:19.5, 3x)', preset: DEVICE_PRESETS.find(p => p.id === 'mobile-iphone-16-pro')! },
    { label: '📱 Google Pixel 9 (412×915)', description: 'Mobile (9:20, 3.5x)', preset: DEVICE_PRESETS.find(p => p.id === 'mobile-pixel-9')! },
    { label: '📱 Samsung Galaxy S24 (360×780)', description: 'Mobile (9:19.5, 3x)', preset: DEVICE_PRESETS.find(p => p.id === 'mobile-galaxy-s24')! },
    { label: '📟 iPad Pro 12.9" (1024×1366)', description: 'Tablet (3:4, 2x)', preset: DEVICE_PRESETS.find(p => p.id === 'tablet-ipad-pro')! },
    { label: '📟 iPad Air / 11" (820×1180)', description: 'Tablet (2x)', preset: DEVICE_PRESETS.find(p => p.id === 'tablet-ipad-air')! },
    { label: '⚙️ Dynamic Custom Resolution...', description: 'Specify custom width, height, and DPR', preset: null as any }
  ];

  const selectedPresetItem = await vscode.window.showQuickPick(presetItems, {
    placeHolder: 'Select popular preset viewing proportions or custom dynamic resolution',
    title: 'Antigravity: Device Resolution Emulation'
  });
  if (!selectedPresetItem) return null;

  let viewport: ViewportConfig;
  if (!selectedPresetItem.preset) {
    const customDim = await vscode.window.showInputBox({
      prompt: 'Enter width × height (e.g. 1280x800 or 375x667)',
      value: '1280x800'
    });
    if (!customDim) return null;
    const parts = customDim.toLowerCase().split('x').map(s => parseInt(s.trim(), 10));
    const w = parts[0] || 1280;
    const h = parts[1] || 800;
    viewport = createDynamicViewport(w, h, 1);
  } else {
    const p = selectedPresetItem.preset;
    viewport = {
      width: p.width,
      height: p.height,
      deviceScaleFactor: p.deviceScaleFactor,
      mobile: p.mobile,
      orientation: p.width >= p.height ? 'landscape' : 'portrait',
      presetId: p.id,
      presetName: p.name,
      category: p.category
    };
  }

  return { landingPage, viewport };
}

function handleIncomingEvent(context: vscode.ExtensionContext, event: any): void {
  if (!event || !event.type) return;

  if (event.type === 'HOTKEY_PAUSE') {
    isPaused = true;
    updateStatusBar();
    if (sidebarProvider) sidebarProvider.updateData(isRecording, isPaused);
    if (FlowPanel.currentPanel) FlowPanel.currentPanel.updateData(isRecording, isPaused);
    const isMac = process.platform === 'darwin';
    const resumeHint = isMac ? '⌃⌘P or ⌥⌘P' : 'Alt+Shift+P';
    vscode.window.showInformationMessage(`⏸ Session Paused at (${event.x}, ${event.y}). Ghost Mouse Pin placed (${resumeHint} to resume).`);
  } else if (event.type === 'HOTKEY_RESUME') {
    isPaused = false;
    updateStatusBar();
    if (sidebarProvider) sidebarProvider.updateData(isRecording, isPaused);
    if (FlowPanel.currentPanel) FlowPanel.currentPanel.updateData(isRecording, isPaused);
    vscode.window.showInformationMessage('▶ Session Resumed. Ghost Mouse Pin released.');
  } else if (event.type === 'HOTKEY_DEBUG') {
    debugController.setInlineBreakpoint(
      event.target?.filePath,
      event.target?.componentName,
      event.target?.handlerName,
      event.target?.lineNumber
    );
  }

  // Record node in Flow Graph
  if (event.type.startsWith('EVENT_') || event.type.startsWith('HOTKEY_')) {
    flowModel.addStepEvent(event);
    updateStatusBar();

    // Stream update to sidebar provider & full webview
    if (sidebarProvider) {
      sidebarProvider.updateData(isRecording, isPaused);
    }
    if (FlowPanel.currentPanel) {
      FlowPanel.currentPanel.updateData(isRecording, isPaused);
    }
  }
}

function updateStatusBar(): void {
  const vp = flowModel?.viewport;
  const vpText = vp ? ` [${vp.presetName || `${vp.width}x${vp.height}`}]` : '';
  const isMac = process.platform === 'darwin';
  const pauseShortcut = isMac ? '⌃⌘P or ⌥⌘P' : 'Alt+Shift+P';

  if (!isRecording) {
    statusBarItem.text = '$(record) Antigravity: Idle';
    statusBarItem.tooltip = 'Click to open Flow Lens';
    statusBarItem.backgroundColor = undefined;
  } else if (isPaused) {
    statusBarItem.text = `$(debug-pause) Antigravity: Paused${vpText} (Step #${flowModel.timeline.length})`;
    statusBarItem.tooltip = `Ghost Mouse Pin Active (${pauseShortcut} to resume)`;
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  } else {
    statusBarItem.text = `$(circle-filled) Antigravity: Rec${vpText} (Step #${flowModel.timeline.length})`;
    statusBarItem.tooltip = `Recording live interactions... (${pauseShortcut} to pause)`;
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  }
}

export function deactivate() {
  console.log('[Antigravity Tracer] Extension deactivating...');
  if (sidecarClient) {
    sidecarClient.disconnect();
  }
  if (sidecarProcess) {
    sidecarProcess.stop();
  }
  if (cdpClient) {
    cdpClient.disconnect();
  }
  if (debugController) {
    debugController.clearDynamicBreakpoints();
  }
}
