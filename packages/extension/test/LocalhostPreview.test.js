const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('Localhost Preview: package.json registers openLocalhostPreview and togglePreviewWindow commands and menus', () => {
  const pkgPath = path.resolve(__dirname, '../package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  // Commands
  const openCmd = pkg.contributes.commands.find(c => c.command === 'flowtracer.openLocalhostPreview');
  assert.ok(openCmd, 'flowtracer.openLocalhostPreview should be registered');
  assert.strictEqual(openCmd.title, 'Flow Tracer: Open Localhost Preview (Center Editor)');

  const toggleCmd = pkg.contributes.commands.find(c => c.command === 'flowtracer.togglePreviewWindow');
  assert.ok(toggleCmd, 'flowtracer.togglePreviewWindow should be registered');

  // Activation events
  assert.ok(pkg.activationEvents.includes('onCommand:flowtracer.openLocalhostPreview'));
  assert.ok(pkg.activationEvents.includes('onCommand:flowtracer.togglePreviewWindow'));

  // Menus
  const editorMenu = pkg.contributes.menus['editor/title'];
  assert.ok(editorMenu.some(m => m.command === 'flowtracer.openLocalhostPreview'), 'Should be in editor/title menu');

  const sidebarMenu = pkg.contributes.menus['view/title'];
  assert.ok(sidebarMenu.some(m => m.command === 'flowtracer.openLocalhostPreview'), 'Should be in sidebar view/title menu');
});

test('Localhost Preview: FlowPanel contains complete moveable, scalable, collapsable docker DOM and controls', () => {
  const flowPanelPath = path.resolve(__dirname, '../src/webview/FlowPanel.ts');
  const content = fs.readFileSync(flowPanelPath, 'utf8');

  // Container and Shield
  assert.ok(content.includes('id="localhostPreviewDocker"'), 'Must contain localhostPreviewDocker element');
  assert.ok(content.includes('class="preview-docker-container"'), 'Must have preview-docker-container class');
  assert.ok(content.includes('id="previewIframeShield"'), 'Must have previewIframeShield for dragging over iframe');

  // Moveable Header & Grip
  assert.ok(content.includes('id="previewDockerHeader"'), 'Must have header grab handle');
  assert.ok(content.includes('preview-drag-grip'), 'Must contain drag grip');

  // Scalable & Resizable Controls
  assert.ok(content.includes('id="previewPresetSelect"'), 'Must have device preset selector');
  assert.ok(content.includes('value="mobile-iphone-16-pro"'), 'Must support iPhone 16 Pro');
  assert.ok(content.includes('value="mobile-pixel-9"'), 'Must support Pixel 9');
  assert.ok(content.includes('value="tablet-ipad-air"'), 'Must support iPad Air');
  assert.ok(content.includes('value="desktop-laptop"'), 'Must support Laptop');
  assert.ok(content.includes('id="btnPreviewRotate"'), 'Must have orientation rotation button');
  assert.ok(content.includes('id="previewZoomSelect"'), 'Must have zoom scale dropdown');
  assert.ok(content.includes('id="previewResizeHandle"'), 'Must have corner drag resize handle');

  // Collapsable & Dockable Controls
  assert.ok(content.includes('id="btnPreviewDockToggle"'), 'Must have dock to side toggle button');
  assert.ok(content.includes('id="btnPreviewMinimize"'), 'Must have minimize button');
  assert.ok(content.includes('id="previewDockPill"'), 'Must have collapsed floating dock pill');
  assert.ok(content.includes('id="btnPreviewMaximize"'), 'Must have maximize button');
  assert.ok(content.includes('id="btnPreviewClose"'), 'Must have close button');
  assert.ok(content.includes('id="btnResetPreviewPos"'), 'Must have center reset position button');

  // Address Bar & Route Navigation
  assert.ok(content.includes('id="previewUrlInput"'), 'Must have URL address input');
  assert.ok(content.includes('value="http://localhost:8081"'), 'Must default to Expo Web port 8081');
  assert.ok(content.includes('id="btnPreviewGo"'), 'Must have Go navigation button');
  assert.ok(content.includes('id="btnPreviewReload"'), 'Must have reload button');
  assert.ok(content.includes('id="btnPreviewBezelToggle"'), 'Must have phone bezel toggle');
  assert.ok(content.includes('id="btnPreviewExternal"'), 'Must have open external browser button');
  assert.ok(content.includes('class="route-chip" data-path="/"'), 'Must have root route chip');
  assert.ok(content.includes('data-path="/join"'), 'Must have /join route chip');
  assert.ok(content.includes('data-path="/(tabs)/draft"'), 'Must have /draft route chip');

  // Status & Offline Recovery
  assert.ok(content.includes('id="previewOfflineOverlay"'), 'Must have offline fallback overlay');
  assert.ok(content.includes('id="btnRetryConnection"'), 'Must have connection retry button');
  assert.ok(content.includes('id="btnSwitchPort3000"'), 'Must have port 3000 switcher');
  assert.ok(content.includes('id="footerDimLabel"'), 'Must have dimensions label in footer');

  // Script Initialization & Event Handlers
  assert.ok(content.includes('function initLocalhostPreviewDocker()'), 'Must define initLocalhostPreviewDocker()');
  assert.ok(content.includes('window.previewDockerControl ='), 'Must expose window.previewDockerControl');
  assert.ok(content.includes("msg.command === 'SHOW_PREVIEW_DOCKER'"), 'Must handle SHOW_PREVIEW_DOCKER');
  assert.ok(content.includes("msg.command === 'TOGGLE_PREVIEW_DOCKER'"), 'Must handle TOGGLE_PREVIEW_DOCKER');
});

test('Localhost Preview: dynamically truncates docker header elements when scaled down or resized', () => {
  const flowPanelPath = path.resolve(__dirname, '../src/webview/FlowPanel.ts');
  const content = fs.readFileSync(flowPanelPath, 'utf8');

  // CSS Container Query configuration on preview-docker-container
  assert.ok(content.includes('container-type: inline-size;'), 'Must configure container-type inline-size');
  assert.ok(content.includes('container-name: docker;'), 'Must configure container-name docker');

  // Responsive container query breakpoints and fallback classes
  assert.ok(content.includes('@container docker (max-width: 580px)'), 'Must include 580px container query');
  assert.ok(content.includes('@container docker (max-width: 480px)'), 'Must include 480px container query');
  assert.ok(content.includes('@container docker (max-width: 380px)'), 'Must include 380px container query');
  assert.ok(content.includes('.preview-docker-header.header-compact'), 'Must include header-compact class styling');
  assert.ok(content.includes('.preview-docker-header.header-tight'), 'Must include header-tight class styling');
  assert.ok(content.includes('.preview-docker-header.header-micro'), 'Must include header-micro class styling');

  // DOM elements with dynamic truncation targets
  assert.ok(content.includes('id="dockerTitleText"'), 'Must have dockerTitleText span for text truncation');
  assert.ok(content.includes('id="previewPortBadge"'), 'Must have previewPortBadge for port shortening');
  assert.ok(content.includes('class="bezel-btn-text"'), 'Must have bezel-btn-text for hiding label at narrow widths');
  assert.ok(content.includes('class="url-protocol-prefix"'), 'Must have url-protocol-prefix for address bar compression');

  // JS Runtime Responsiveness and ResizeObserver
  assert.ok(content.includes('function updateHeaderResponsive('), 'Must define updateHeaderResponsive() function');
  assert.ok(content.includes('window.updateDockerHeaderResponsive = updateHeaderResponsive'), 'Must expose updateHeaderResponsive');
  assert.ok(content.includes('new ResizeObserver('), 'Must observe docker element width with ResizeObserver');
  assert.ok(content.includes('headerResizeObserver.observe(docker)'), 'Must observe docker container');
});
