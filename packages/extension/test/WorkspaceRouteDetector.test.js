const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { WorkspaceRouteDetector } = require('../dist/discovery/WorkspaceRouteDetector');

test('WorkspaceRouteDetector: scans Expo Router project and discovers all routes including /stack', () => {
  const projectRoot = '/Users/jarrod/Desktop/project';
  if (!fs.existsSync(projectRoot)) {
    return; // Skip if directory not accessible
  }

  const result = WorkspaceRouteDetector.discoverWorkspaceRoutesSync(projectRoot);

  assert.strictEqual(result.framework, 'expo', 'Should identify expo framework');
  assert.strictEqual(result.defaultDevUrl, 'http://localhost:8081', 'Expo should default to port 8081');
  assert.ok(result.routes.length >= 10, 'Should discover multiple workspace routes');

  // Verify /stack is present (active file currently being edited)
  const stackRoute = result.routes.find(r => r.label === '/stack' || r.cleanPath === '/stack');
  assert.ok(stackRoute, 'Must discover /stack route from app/(tabs)/stack.tsx');
  assert.strictEqual(stackRoute.path, '/(tabs)/stack');
  assert.strictEqual(stackRoute.cleanPath, '/stack');
  assert.strictEqual(stackRoute.label, '/stack');
  assert.strictEqual(stackRoute.source, 'expo-router');
  assert.strictEqual(stackRoute.isDynamic, false);

  // Verify other tabs and pages
  assert.ok(result.routes.some(r => r.label === '/draft' && r.path === '/(tabs)/draft'), 'Must discover /draft');
  assert.ok(result.routes.some(r => r.label === '/league' && r.path === '/(tabs)/league'), 'Must discover /league');
  assert.ok(result.routes.some(r => r.label === '/admin'), 'Must discover /admin');
  assert.ok(result.routes.some(r => r.label === '/join'), 'Must discover /join');
  assert.ok(result.routes.some(r => r.label === '/onboarding'), 'Must discover /onboarding');
  assert.ok(result.routes.some(r => r.label === '/profile'), 'Must discover /profile');

  // Verify non-route helper files are ignored
  assert.ok(!result.routes.some(r => r.path.includes('_layout')), '_layout files must not be routes');
  assert.ok(!result.routes.some(r => r.path.includes('+html')), '+html files must not be routes');
  assert.ok(!result.routes.some(r => r.path.includes('+not-found')), '+not-found files must not be routes');

  // Verify dynamic parameter routes
  const dynamicRoute = result.routes.find(r => r.path === '/dm/[id]');
  assert.ok(dynamicRoute, 'Must discover /dm/[id]');
  assert.strictEqual(dynamicRoute.isDynamic, true);
  assert.strictEqual(dynamicRoute.label, '/dm/:id');
});

test('WorkspaceRouteDetector: scans repo root without draft stack routes', () => {
  const repoRoot = path.resolve(__dirname, '../../..');
  const result = WorkspaceRouteDetector.discoverWorkspaceRoutesSync(repoRoot);

  assert.strictEqual(result.defaultDevUrl, 'http://localhost:3000', 'Generic repo should default to 3000');
  assert.ok(result.routes.length > 0, 'Should return routes');
  assert.ok(result.routes.some(r => r.path === '/' && r.label === '/ (Home)'), 'Must include root home route');

  // Ensure draft stack routes are NOT globally present in this repo
  assert.ok(!result.routes.some(r => r.path === '/(tabs)/draft'), 'Should not contain /(tabs)/draft');
  assert.ok(!result.routes.some(r => r.path === '/(tabs)/stack'), 'Should not contain /(tabs)/stack');
  assert.ok(!result.routes.some(r => r.path === '/profile-setup'), 'Should not contain /profile-setup');
});

test('WorkspaceRouteDetector: discovers Next.js App Router routes', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-app-test-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { next: '^14.0.0', react: '^18.0.0' }
    }));

    fs.mkdirSync(path.join(tmpDir, 'app', 'dashboard'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'app', '(auth)', 'login'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'app', 'blog', '[slug]'), { recursive: true });

    fs.writeFileSync(path.join(tmpDir, 'app', 'page.tsx'), 'export default function Home() {}');
    fs.writeFileSync(path.join(tmpDir, 'app', 'dashboard', 'page.tsx'), 'export default function Dashboard() {}');
    fs.writeFileSync(path.join(tmpDir, 'app', '(auth)', 'login', 'page.tsx'), 'export default function Login() {}');
    fs.writeFileSync(path.join(tmpDir, 'app', 'blog', '[slug]', 'page.tsx'), 'export default function Post() {}');

    const result = WorkspaceRouteDetector.discoverWorkspaceRoutesSync(tmpDir);

    assert.strictEqual(result.framework, 'next');
    assert.strictEqual(result.defaultDevUrl, 'http://localhost:3000');
    assert.strictEqual(result.routes.length, 4);

    assert.ok(result.routes.some(r => r.path === '/' && r.label === '/ (Home)'));
    assert.ok(result.routes.some(r => r.path === '/dashboard' && r.label === '/dashboard'));
    assert.ok(result.routes.some(r => r.cleanPath === '/login' && r.label === '/login'));
    assert.ok(result.routes.some(r => r.path.includes('[slug]') && r.label === '/blog/:slug' && r.isDynamic));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('WorkspaceRouteDetector: discovers Pages router routes and ignores api and _app', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-test-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { vite: '^5.0.0' }
    }));

    fs.mkdirSync(path.join(tmpDir, 'pages', 'users'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'pages', 'api'), { recursive: true });

    fs.writeFileSync(path.join(tmpDir, 'pages', 'index.tsx'), 'export default function Home() {}');
    fs.writeFileSync(path.join(tmpDir, 'pages', 'about.tsx'), 'export default function About() {}');
    fs.writeFileSync(path.join(tmpDir, 'pages', 'users', '[id].tsx'), 'export default function User() {}');
    fs.writeFileSync(path.join(tmpDir, 'pages', '_app.tsx'), 'export default function App() {}');
    fs.writeFileSync(path.join(tmpDir, 'pages', 'api', 'hello.ts'), 'export default function handler() {}');

    const result = WorkspaceRouteDetector.discoverWorkspaceRoutesSync(tmpDir);

    assert.strictEqual(result.framework, 'vite');
    assert.strictEqual(result.defaultDevUrl, 'http://localhost:5173');

    assert.ok(result.routes.some(r => r.path === '/' && r.label === '/ (Home)'));
    assert.ok(result.routes.some(r => r.path === '/about' && r.label === '/about'));
    assert.ok(result.routes.some(r => r.cleanPath === '/users/:id' && r.isDynamic));
    assert.ok(!result.routes.some(r => r.path.includes('_app')));
    assert.ok(!result.routes.some(r => r.path.includes('api/hello')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('WorkspaceRouteDetector: supports user custom routes and active graph model routes', () => {
  const repoRoot = path.resolve(__dirname, '../../..');
  const mockModel = {
    nodes: new Map([
      ['n1', { data: { route: '/checkout/step2' } }],
      ['n2', { data: { url: 'http://localhost:3000/order-confirmed' } }]
    ])
  };

  const result = WorkspaceRouteDetector.discoverWorkspaceRoutesSync(repoRoot, mockModel, ['/custom-webhook', '/staging/test']);

  assert.ok(result.routes.some(r => r.path === '/custom-webhook' && r.source === 'custom'));
  assert.ok(result.routes.some(r => r.path === '/staging/test' && r.source === 'custom'));
  assert.ok(result.routes.some(r => r.path === '/checkout/step2' && r.source === 'flow-graph'));
  assert.ok(result.routes.some(r => r.path === '/order-confirmed' && r.source === 'flow-graph'));
});
