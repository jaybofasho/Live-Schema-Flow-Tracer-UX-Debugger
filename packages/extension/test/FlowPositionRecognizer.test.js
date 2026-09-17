const test = require('node:test');
const assert = require('node:assert');
const { FlowPositionRecognizer } = require('../dist/graph/FlowPositionRecognizer');

test('FlowPositionRecognizer normalizes URLs and routes correctly', () => {
  assert.strictEqual(FlowPositionRecognizer.normalizeRoute('http://localhost:3000/dashboard?tab=analytics#overview'), '/dashboard');
  assert.strictEqual(FlowPositionRecognizer.normalizeRoute('/settings/profile/'), '/settings/profile');
  assert.strictEqual(FlowPositionRecognizer.normalizeRoute('file:///Users/dev/app/index.html'), '/app/index.html');
  assert.strictEqual(FlowPositionRecognizer.normalizeRoute(''), '/');
  assert.strictEqual(FlowPositionRecognizer.normalizeRoute(undefined), '/');
});

test('FlowPositionRecognizer infers UX phases accurately', () => {
  assert.strictEqual(FlowPositionRecognizer.inferPhase('/', 'Welcome to App'), 'LANDING');
  assert.strictEqual(FlowPositionRecognizer.inferPhase('/login', 'Sign In'), 'AUTH');
  assert.strictEqual(FlowPositionRecognizer.inferPhase('/signup', 'Create Account'), 'AUTH');
  assert.strictEqual(FlowPositionRecognizer.inferPhase('/dashboard', 'Metrics Overview'), 'DASHBOARD');
  assert.strictEqual(FlowPositionRecognizer.inferPhase('/settings/account', 'User Settings'), 'SETTINGS');
  assert.strictEqual(FlowPositionRecognizer.inferPhase('/cart', 'Shopping Cart'), 'CHECKOUT');
  assert.strictEqual(FlowPositionRecognizer.inferPhase('/checkout/payment', 'Payment Step'), 'CHECKOUT');
  assert.strictEqual(FlowPositionRecognizer.inferPhase('/about', 'Company Info'), 'GENERAL');
});

test('FlowPositionRecognizer computes canonical position signature and tracks visit counts', () => {
  const visitTracker = new Map();
  const breadcrumb = ['Landing'];

  const event1 = {
    type: 'EVENT_CLICK',
    step: 1,
    target: {
      tagName: 'BUTTON',
      route: '/dashboard',
      title: 'Analytics Dashboard',
      componentName: 'DashboardNavButton'
    }
  };

  const pos1 = FlowPositionRecognizer.recognizePosition(event1, breadcrumb, visitTracker);
  assert.strictEqual(pos1.route, '/dashboard');
  assert.strictEqual(pos1.phase, 'DASHBOARD');
  assert.strictEqual(pos1.visitCount, 1);
  assert.deepStrictEqual(pos1.breadcrumb, ['Landing', 'Analytics Dashboard']);

  // Second visit to the same route
  const event2 = {
    type: 'EVENT_CLICK',
    step: 2,
    target: {
      tagName: 'A',
      route: '/dashboard',
      title: 'Analytics Dashboard',
      componentName: 'RefreshLink'
    }
  };

  const pos2 = FlowPositionRecognizer.recognizePosition(event2, pos1.breadcrumb, visitTracker);
  assert.strictEqual(pos2.visitCount, 2);
  assert.strictEqual(pos2.id, pos1.id);
});

test('FlowPositionRecognizer detects modal and dialog context', () => {
  const visitTracker = new Map();
  const breadcrumb = ['Dashboard'];

  const event = {
    type: 'EVENT_CLICK',
    step: 3,
    target: {
      tagName: 'BUTTON',
      route: '/dashboard',
      title: 'Dashboard',
      modal: 'DeleteConfirmationDialog'
    }
  };

  const pos = FlowPositionRecognizer.recognizePosition(event, breadcrumb, visitTracker);
  assert.strictEqual(pos.modal, 'DeleteConfirmationDialog');
  assert.ok(pos.name.includes('DeleteConfirmationDialog'));
  assert.strictEqual(pos.breadcrumb[pos.breadcrumb.length - 1], 'Modal: DeleteConfirmationDialog');
});
