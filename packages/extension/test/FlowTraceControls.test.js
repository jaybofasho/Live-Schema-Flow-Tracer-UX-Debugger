const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('Flow Trace Controls: FlowPanel contains dedicated Start/Stop Flow Trace buttons and styles', () => {
  const flowPanelPath = path.resolve(__dirname, '../src/webview/FlowPanel.ts');
  const content = fs.readFileSync(flowPanelPath, 'utf8');

  // Canvas Header button
  assert.ok(content.includes('id="btnHeaderTraceToggle"'), 'Must have btnHeaderTraceToggle in canvas header');
  assert.ok(content.includes('⏺ Start Flow Trace'), 'Must have Start Flow Trace button text');

  // Preview Docker Header button
  assert.ok(content.includes('id="btnDockerTraceToggle"'), 'Must have btnDockerTraceToggle in preview docker header');
  assert.ok(content.includes('⏺ Start Trace'), 'Must have Start Trace button in docker');

  // CSS classes for idle and recording states
  assert.ok(content.includes('.btn-header-trace'), 'Must include .btn-header-trace CSS');
  assert.ok(content.includes('.btn-header-trace.idle'), 'Must include .btn-header-trace.idle CSS');
  assert.ok(content.includes('.btn-header-trace.recording'), 'Must include .btn-header-trace.recording CSS');
  assert.ok(content.includes('.docker-trace-btn'), 'Must include .docker-trace-btn CSS');
  assert.ok(content.includes('.docker-trace-btn.idle'), 'Must include .docker-trace-btn.idle CSS');
  assert.ok(content.includes('.docker-trace-btn.recording'), 'Must include .docker-trace-btn.recording CSS');

  // Dynamic session label
  assert.ok(content.includes('id="sessionLabel">IDLE</span>'), 'Session label must start as IDLE');
  assert.ok(content.includes('updateSessionUI()'), 'Must call updateSessionUI() on graph updates');

  // Message handlers in FlowPanel
  assert.ok(content.includes("case 'startFlowTrace':"), 'Must handle startFlowTrace message');
  assert.ok(content.includes("case 'stopFlowTrace':"), 'Must handle stopFlowTrace message');
  assert.ok(content.includes("case 'pauseFlowTrace':"), 'Must handle pauseFlowTrace message');

  // openVideoStudio method
  assert.ok(content.includes('public openVideoStudio()'), 'Must expose openVideoStudio method');

  // Disambiguated Video Studio
  assert.ok(content.includes('🎬 Video Studio (MP4 / Dubbing)'), 'Video button must be disambiguated to Video Studio');
});

test('Flow Trace Controls: FlowSidebarViewProvider tracks real isRecording and isPaused states', () => {
  const sidebarPath = path.resolve(__dirname, '../src/webview/FlowSidebarViewProvider.ts');
  const content = fs.readFileSync(sidebarPath, 'utf8');

  // Startup card launch button
  assert.ok(content.includes('⏺ Start Live Flow Trace'), 'Sidebar launch button must read Start Live Flow Trace');

  // Disambiguated video studio in sidebar
  assert.ok(content.includes('🎬 Video Studio (MP4 / Dubbing)'), 'Sidebar video button must be Video Studio');

  // True state handling
  assert.ok(content.includes('isSessionActive = !!msg.isRecording;'), 'Sidebar must use msg.isRecording instead of nodes.length');
  assert.ok(!content.includes('isSessionActive = currentData.nodes && currentData.nodes.length > 0;'), 'False positive heuristic must be removed');

  // Paused status badge
  assert.ok(content.includes('.status-badge.paused'), 'Must include paused badge CSS');
});

test('Flow Trace Controls: extension.ts registers recordVoiceover and direct URL startRecorder', () => {
  const extPath = path.resolve(__dirname, '../src/extension.ts');
  const content = fs.readFileSync(extPath, 'utf8');

  // Registered recordVoiceover command
  assert.ok(content.includes("vscode.commands.registerCommand('flowtracer.recordVoiceover'"), 'Must register flowtracer.recordVoiceover');

  // Direct URL support in startRecorder
  assert.ok(content.includes("typeof urlOrConfig === 'string'"), 'startRecorder must support string URL');
  assert.ok(content.includes("urlOrConfig.url"), 'startRecorder must support config object with URL');

  // State propagation in stopRecorder and updateStatusBar
  assert.ok(content.includes('sidebarProvider.updateData(isRecording, isPaused)'), 'Must pass isRecording to sidebar');
  assert.ok(content.includes('FlowPanel.currentPanel.updateData(isRecording, isPaused)'), 'Must pass isRecording to FlowPanel');
});

test('Flow Trace Controls: supports Mac-specific hotkeys without Alt across keybindings, webviews, and status bar', () => {
  const pkgPath = path.resolve(__dirname, '../package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  // 1. package.json keybindings for Mac
  const macBindings = pkg.contributes.keybindings.filter(k => k.mac);
  assert.ok(macBindings.length >= 6, 'Must contribute at least 6 Mac keybinding entries');

  // Pause keybindings on Mac (must include ctrl+cmd+p without alt)
  assert.ok(macBindings.some(k => k.command === 'flowtracer.pauseRecorder' && k.mac === 'ctrl+cmd+p'), 'Must support ctrl+cmd+p for pause on Mac');
  assert.ok(macBindings.some(k => k.command === 'flowtracer.pauseRecorder' && k.mac === 'cmd+alt+p'), 'Must support cmd+alt+p for pause on Mac');

  // Debug keybindings on Mac (must include ctrl+cmd+d without alt)
  assert.ok(macBindings.some(k => k.command === 'flowtracer.debugOperation' && k.mac === 'ctrl+cmd+d'), 'Must support ctrl+cmd+d for debug on Mac');
  assert.ok(macBindings.some(k => k.command === 'flowtracer.debugOperation' && k.mac === 'cmd+alt+d'), 'Must support cmd+alt+d for debug on Mac');

  // Comment & Trace keybindings on Mac
  assert.ok(macBindings.some(k => k.command === 'flowtracer.addComment' && k.mac === 'ctrl+cmd+c'), 'Must support ctrl+cmd+c for comment on Mac');
  assert.ok(macBindings.some(k => k.command === 'flowtracer.startRecorder' && k.mac === 'ctrl+cmd+r'), 'Must support ctrl+cmd+r for trace on Mac');

  // 2. FlowSidebarViewProvider platform detection & in-webview keydown listener
  const sidebarPath = path.resolve(__dirname, '../src/webview/FlowSidebarViewProvider.ts');
  const sidebarContent = fs.readFileSync(sidebarPath, 'utf8');
  assert.ok(sidebarContent.includes('id="pauseShortcutLabel"'), 'Must have dynamic pauseShortcutLabel span');
  assert.ok(sidebarContent.includes("isMac ? '(⌃⌘P / ⌥⇧P)' : '(Alt+Shift+P)'"), 'Must set Mac shortcut label dynamically');
  assert.ok(sidebarContent.includes("e.ctrlKey && e.metaKey && key === 'p'"), 'Must handle Ctrl+Cmd+P in sidebar webview');
  assert.ok(sidebarContent.includes("case 'debugOperation':"), 'Must handle debugOperation message in sidebar');

  // 3. FlowPanel platform detection & in-webview keydown listener
  const flowPanelPath = path.resolve(__dirname, '../src/webview/FlowPanel.ts');
  const panelContent = fs.readFileSync(flowPanelPath, 'utf8');
  assert.ok(panelContent.includes("e.ctrlKey && e.metaKey && key === 'p'"), 'Must handle Ctrl+Cmd+P in FlowPanel webview');
  assert.ok(panelContent.includes("e.ctrlKey && e.metaKey && key === 'r'"), 'Must handle Ctrl+Cmd+R in FlowPanel webview');
  assert.ok(panelContent.includes("case 'debugOperation':"), 'Must handle debugOperation message in FlowPanel');

  // 4. extension.ts platform-aware status bar tooltip
  const extPath = path.resolve(__dirname, '../src/extension.ts');
  const extContent = fs.readFileSync(extPath, 'utf8');
  assert.ok(extContent.includes("process.platform === 'darwin'"), 'Must detect macOS in extension host');
  assert.ok(extContent.includes("pauseShortcut = isMac ? '⌃⌘P or ⌥⌘P' : 'Alt+Shift+P'"), 'Status bar must adapt pause shortcut tooltip for Mac');
});
