const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

test('Schema Visualizer: FlowPanel contains dot matrix background, 4-directional pan D-pad, and zoom controls', () => {
  const flowPanelPath = path.resolve(__dirname, '../src/webview/FlowPanel.ts');
  const content = fs.readFileSync(flowPanelPath, 'utf8');

  // 1. Dot Matrix Canvas Background & Styling
  assert.ok(content.includes('id="graphCanvas"'), 'Must contain graphCanvas element');
  assert.ok(content.includes('background-image:'), 'Must configure background-image on canvas');
  assert.ok(content.includes('radial-gradient('), 'Must use radial-gradient for dot matrix pattern');
  assert.ok(content.includes('background-size: 24px 24px'), 'Must configure dot matrix 24px grid size');
  assert.ok(content.includes('cursor: grab;'), 'Must have grab cursor for infinite canvas panning');
  assert.ok(content.includes('#graphCanvas.is-panning'), 'Must support is-panning class for grabbing cursor');

  // 2. Viewport Transform Layer
  assert.ok(content.includes('id="graphViewport"'), 'Must contain graphViewport container');
  assert.ok(content.includes('class="graph-viewport"'), 'Must have graph-viewport class');
  assert.ok(content.includes('will-change: transform;'), 'Must optimize GPU layer transform');

  // 3. 4-Directional Pan D-Pad HUD
  assert.ok(content.includes('class="canvas-hud"'), 'Must have canvas-hud element');
  assert.ok(content.includes('class="canvas-dpad"'), 'Must have canvas-dpad element');
  assert.ok(content.includes('id="btnPanUp"'), 'Must have Pan Up button');
  assert.ok(content.includes('id="btnPanDown"'), 'Must have Pan Down button');
  assert.ok(content.includes('id="btnPanLeft"'), 'Must have Pan Left button');
  assert.ok(content.includes('id="btnPanRight"'), 'Must have Pan Right button');
  assert.ok(content.includes('id="btnPanReset"'), 'Must have Pan Reset Center button');

  // 4. Zoom Controls HUD
  assert.ok(content.includes('class="canvas-zoom-controls"'), 'Must have canvas-zoom-controls element');
  assert.ok(content.includes('id="btnZoomIn"'), 'Must have Zoom In button');
  assert.ok(content.includes('id="btnZoomOut"'), 'Must have Zoom Out button');
  assert.ok(content.includes('id="btnZoomLabel"'), 'Must have Zoom percentage indicator button');
  assert.ok(content.includes('id="btnZoomFit"'), 'Must have Fit to view button');

  // 5. JavaScript Implementation & Interaction Handlers
  assert.ok(content.includes('function initCanvasPanAndZoom()'), 'Must define initCanvasPanAndZoom()');
  assert.ok(content.includes('initCanvasPanAndZoom();'), 'Must invoke initCanvasPanAndZoom()');
  assert.ok(content.includes('window.schemaVisualizerControl ='), 'Must expose window.schemaVisualizerControl');
  assert.ok(content.includes('graphCanvas.addEventListener(\'mousedown\''), 'Must have mouse drag listener');
  assert.ok(content.includes('graphCanvas.addEventListener(\'wheel\''), 'Must have wheel zoom and trackpad pan listener');
  assert.ok(content.includes('window.addEventListener(\'keydown\''), 'Must have keyboard 4-directional arrow controls');
});
