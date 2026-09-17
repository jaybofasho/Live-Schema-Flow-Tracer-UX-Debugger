const test = require('node:test');
const assert = require('node:assert');
const { FlowGraphModel } = require('../dist/graph/FlowGraphModel');
const { FlowSchemaMerger } = require('../dist/graph/FlowSchemaMerger');
const { MermaidExporter } = require('../dist/export/MermaidExporter');
const { PlaywrightExporter } = require('../dist/export/PlaywrightExporter');

test('FlowSchemaMerger detects shared junction points between flows', () => {
  const landing = { title: 'App Entry', url: 'http://localhost:3000/' };

  // Flow A: Home -> Dashboard -> Settings
  const flowA = new FlowGraphModel('flow-a', landing);
  flowA.addStepEvent({
    type: 'EVENT_CLICK',
    target: { tagName: 'BUTTON', route: '/dashboard', title: 'Dashboard' }
  });
  flowA.addStepEvent({
    type: 'EVENT_CLICK',
    target: { tagName: 'BUTTON', route: '/settings', title: 'Settings' }
  });

  // Flow B: Home -> Dashboard -> Checkout
  const flowB = new FlowGraphModel('flow-b', landing);
  flowB.addStepEvent({
    type: 'EVENT_CLICK',
    target: { tagName: 'BUTTON', route: '/dashboard', title: 'Dashboard' }
  });
  flowB.addStepEvent({
    type: 'EVENT_CLICK',
    target: { tagName: 'BUTTON', route: '/checkout', title: 'Checkout' }
  });

  const junctions = FlowSchemaMerger.findJunctions(flowA, flowB);

  // Both root ('/') and '/dashboard' should be detected as junctions
  assert.ok(junctions.length >= 2, `Expected at least 2 junctions, got ${junctions.length}`);
  const junctionRoutes = junctions.map(j => j.route);
  assert.ok(junctionRoutes.includes('/'), 'Landing route / should be a junction');
  assert.ok(junctionRoutes.includes('/dashboard'), 'Dashboard route /dashboard should be a junction');
});

test('FlowSchemaMerger unifies shared nodes and tags junctions', () => {
  const landing = { title: 'App Entry', url: 'http://localhost:3000/' };

  const target = new FlowGraphModel('main-flow', landing);
  target.addStepEvent({
    type: 'EVENT_CLICK',
    target: { tagName: 'BUTTON', route: '/dashboard', title: 'Main Dashboard' }
  });

  const branch = new FlowGraphModel('branch-flow', landing);
  branch.addStepEvent({
    type: 'EVENT_CLICK',
    target: { tagName: 'BUTTON', route: '/dashboard', title: 'Main Dashboard' }
  });
  branch.addStepEvent({
    type: 'EVENT_CLICK',
    target: { tagName: 'BUTTON', route: '/orders', title: 'Orders Page' }
  });

  const junctions = target.mergeWithFlow(branch, 'Orders Branch');
  assert.ok(junctions.length > 0);

  // Find the dashboard node in target
  const dashboardNode = Array.from(target.nodes.values()).find(
    n => n.data && n.data.route === '/dashboard'
  );
  assert.ok(dashboardNode, 'Dashboard node must exist in merged graph');
  assert.strictEqual(dashboardNode.data.isJunction, true, 'Dashboard node should be tagged as isJunction');
  assert.strictEqual(dashboardNode.data.badge, '🔀 JUNCTION');
  assert.ok(dashboardNode.data.flowNames.includes('Orders Branch'));

  // The unique node '/orders' must also be present in merged target
  const ordersNode = Array.from(target.nodes.values()).find(
    n => n.data && n.data.route === '/orders'
  );
  assert.ok(ordersNode, 'Orders branch node must exist in merged target');
  assert.ok(ordersNode.data.flowNames.includes('Orders Branch'));

  // Edge must connect from dashboard junction to orders
  const edge = target.edges.find(e => e.source === dashboardNode.id && e.target === ordersNode.id);
  assert.ok(edge, 'Merged edge should link from Dashboard junction to Orders page');
});

test('FlowGraphModel detects return cycles to previously visited positions', () => {
  const landing = { title: 'Home', url: 'http://localhost:3000/' };
  const model = new FlowGraphModel('cycle-test', landing);

  // Visit Dashboard
  model.addStepEvent({
    type: 'EVENT_CLICK',
    target: { tagName: 'BUTTON', route: '/dashboard', title: 'Dashboard' }
  });

  // Visit Reports
  model.addStepEvent({
    type: 'EVENT_CLICK',
    target: { tagName: 'BUTTON', route: '/reports', title: 'Reports' }
  });

  // Re-visit Dashboard (Cycle / Return)
  const returnNode = model.addStepEvent({
    type: 'EVENT_CLICK',
    target: { tagName: 'A', route: '/dashboard', title: 'Dashboard', innerText: 'Back to Dashboard' }
  });

  assert.strictEqual(returnNode.data.isReturnCycle, true, 'Should mark node as return cycle');
  assert.strictEqual(returnNode.data.badge, '⮌ RETURN');

  // The edge leading to the return node should indicate return cycle
  const returnEdge = model.edges.find(e => e.target === returnNode.id);
  assert.ok(returnEdge);
  assert.ok(returnEdge.label.includes('Return to'));
  assert.strictEqual(returnEdge.animated, true);
});

test('MermaidExporter highlights junction nodes with diamond syntax', () => {
  const landing = { title: 'Home', url: 'http://localhost:3000/' };
  const flowA = new FlowGraphModel('flow-a', landing);
  flowA.addStepEvent({
    type: 'EVENT_CLICK',
    target: { tagName: 'BUTTON', route: '/portal', title: 'Portal Hub' }
  });

  const flowB = new FlowGraphModel('flow-b', landing);
  flowB.addStepEvent({
    type: 'EVENT_CLICK',
    target: { tagName: 'BUTTON', route: '/portal', title: 'Portal Hub' }
  });
  flowB.addStepEvent({
    type: 'EVENT_CLICK',
    target: { tagName: 'BUTTON', route: '/billing', title: 'Billing' }
  });

  flowA.mergeWithFlow(flowB, 'Billing Flow');

  const mmd = MermaidExporter.export(flowA);
  assert.ok(mmd.includes('🔀'), 'Mermaid export should contain junction symbol');
  assert.ok(mmd.includes('classDef junction'), 'Mermaid export should define junction class style');
});

test('PlaywrightExporter groups steps by UX Flow Position', () => {
  const landing = { title: 'App Entry', url: 'http://localhost:3000/' };
  const model = new FlowGraphModel('pos-pw-test', landing);

  model.addStepEvent({
    type: 'EVENT_CLICK',
    target: { tagName: 'BUTTON', selector: '#loginBtn', route: '/auth', title: 'Auth Page' }
  });
  model.addStepEvent({
    type: 'EVENT_INPUT',
    target: { tagName: 'INPUT', selector: '#email', route: '/auth', title: 'Auth Page' }
  });

  const script = PlaywrightExporter.export(model);
  assert.ok(script.includes('// ─── Flow Position: Auth Page [AUTH] ───'), 'Script should include flow position banner');
  assert.ok(script.includes("await page.locator('#loginBtn').click();"));
});
