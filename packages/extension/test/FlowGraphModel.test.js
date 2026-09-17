const test = require('node:test');
const assert = require('node:assert');
const { FlowGraphModel } = require('../dist/graph/FlowGraphModel');

test('FlowGraphModel initializes with default screen node', () => {
  const model = new FlowGraphModel('test-session');
  assert.strictEqual(model.sessionId, 'test-session');
  assert.strictEqual(model.nodes.size, 1);
  assert.strictEqual(model.nodes.get('screen_root')?.type, 'screen');
  assert.strictEqual(model.edges.length, 0);
  assert.strictEqual(model.timeline.length, 0);
});

test('FlowGraphModel records EVENT_CLICK and creates action + handler nodes', () => {
  const model = new FlowGraphModel('test-session');

  const clickEvent = {
    type: 'EVENT_CLICK',
    step: 1,
    timestamp: 1000,
    x: 450,
    y: 320,
    target: {
      tagName: 'button',
      selector: '#btnSubmit',
      text: 'Submit Form',
      componentName: 'AuthSubmitButton',
      filePath: 'src/components/AuthSubmitButton.tsx',
      lineNumber: 42,
      handlerName: 'handleAuthSubmit'
    }
  };

  const actionNode = model.addStepEvent(clickEvent);

  assert.strictEqual(actionNode.type, 'action');
  assert.strictEqual(actionNode.data.componentName, 'AuthSubmitButton');
  assert.strictEqual(actionNode.data.handlerName, 'handleAuthSubmit');
  assert.strictEqual(actionNode.data.filePath, 'src/components/AuthSubmitButton.tsx');
  assert.strictEqual(actionNode.data.lineNumber, 42);

  // Check that edge from root to action exists
  assert.strictEqual(model.edges.length, 2); // root -> action, and action -> handler
  const edgeToHandler = model.edges.find(e => e.label === 'calls');
  assert.ok(edgeToHandler);
  assert.strictEqual(edgeToHandler.source, actionNode.id);

  // Check handler node
  const handlerNode = model.nodes.get(edgeToHandler.target);
  assert.ok(handlerNode);
  assert.strictEqual(handlerNode.type, 'handler');
  assert.strictEqual(handlerNode.data.title, 'handleAuthSubmit()');

  // Check timeline item
  assert.strictEqual(model.timeline.length, 1);
  assert.strictEqual(model.timeline[0].step, 1);
  assert.strictEqual(model.timeline[0].componentName, 'AuthSubmitButton');
});

test('FlowGraphModel records EVENT_NAVIGATE and updates screen transitions', () => {
  const model = new FlowGraphModel('test-session');

  model.addStepEvent({
    type: 'EVENT_CLICK',
    step: 1,
    target: { selector: '#loginBtn' }
  });

  const navNode = model.addStepEvent({
    type: 'EVENT_NAVIGATE',
    step: 2,
    url: 'http://localhost:3000/dashboard'
  });

  assert.strictEqual(navNode.type, 'screen');
  assert.ok(navNode.label.includes('/dashboard'));
});
