const test = require('node:test');
const assert = require('node:assert');
const { FlowGraphModel } = require('../dist/graph/FlowGraphModel');
const { PlaywrightExporter } = require('../dist/export/PlaywrightExporter');
const { MermaidExporter } = require('../dist/export/MermaidExporter');

test('FlowGraphModel establishes confirmed landing page at top of schema with viewport', () => {
  const landing = {
    title: 'Antigravity Cloud Portal',
    url: 'file:///demo-app/index.html',
    filePath: '/path/to/demo-app/index.html',
    componentName: 'AuthSubmitButton'
  };

  const viewport = {
    width: 393,
    height: 852,
    deviceScaleFactor: 3,
    mobile: true,
    orientation: 'portrait',
    presetId: 'mobile-iphone-16-pro',
    presetName: 'iPhone 16 / 15 Pro',
    category: 'mobile'
  };

  const model = new FlowGraphModel('session-landing-test', landing, viewport);

  assert.strictEqual(model.nodes.size, 1);
  const rootNode = model.nodes.get('screen_root');
  assert.ok(rootNode, 'Root node should exist');
  assert.strictEqual(rootNode.label, 'Antigravity Cloud Portal');
  assert.strictEqual(rootNode.data.badge, 'LANDING PAGE');
  assert.strictEqual(rootNode.data.componentName, 'AuthSubmitButton');
  assert.strictEqual(rootNode.data.viewport.width, 393);
  assert.strictEqual(rootNode.data.viewport.height, 852);
  assert.strictEqual(rootNode.data.viewport.presetId, 'mobile-iphone-16-pro');

  // Verify toJSON includes landing page & viewport
  const json = model.toJSON();
  assert.strictEqual(json.landingPage.title, 'Antigravity Cloud Portal');
  assert.strictEqual(json.viewport.presetId, 'mobile-iphone-16-pro');

  // Subsequent events branch from root landing node
  const clickEvent = {
    type: 'EVENT_CLICK',
    step: 1,
    target: {
      tagName: 'button',
      selector: '#btnSubmit',
      componentName: 'AuthSubmitButton',
      handlerName: 'handleAuthSubmit'
    }
  };
  const stepNode = model.addStepEvent(clickEvent);

  const edgeFromRoot = model.edges.find(e => e.source === 'screen_root' && e.target === stepNode.id);
  assert.ok(edgeFromRoot, 'Edge should link directly from root landing node to step 1');
});

test('PlaywrightExporter exports viewport dimensions and initial landing page navigation', () => {
  const landing = {
    title: 'Antigravity Cloud Portal',
    url: 'http://localhost:3000/portal'
  };

  const viewport = {
    width: 393,
    height: 852,
    deviceScaleFactor: 3,
    mobile: true,
    orientation: 'portrait',
    presetName: 'iPhone 16 / 15 Pro',
    category: 'mobile'
  };

  const model = new FlowGraphModel('session-export-test', landing, viewport);
  model.addStepEvent({
    type: 'EVENT_CLICK',
    step: 1,
    target: { selector: '#btnLogin' }
  });

  const script = PlaywrightExporter.export(model);

  assert.ok(script.includes(`await page.setViewportSize({ width: 393, height: 852 });`), 'Playwright script should set viewport');
  assert.ok(script.includes(`await page.goto('http://localhost:3000/portal');`), 'Playwright script should navigate to landing page');
  assert.ok(script.includes(`await page.locator('#btnLogin').click();`), 'Playwright script should include click action');
});

test('MermaidExporter generates diagram with top of schema landing page', () => {
  const landing = {
    title: 'Antigravity Landing Page',
    url: 'http://localhost:3000'
  };

  const model = new FlowGraphModel('session-mermaid-test', landing);
  const diagram = MermaidExporter.export(model);

  assert.ok(diagram.includes('Antigravity Landing Page'), 'Mermaid diagram should include landing page title');
  assert.ok(diagram.includes('screen_root'), 'Mermaid diagram should include root node');
});
