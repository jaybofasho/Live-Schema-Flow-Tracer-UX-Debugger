const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { LandingPageDetector } = require('../dist/discovery/LandingPageDetector');

test('LandingPageDetector scans workspace and identifies demo-app/index.html as recommended landing page', async () => {
  const repoRoot = path.resolve(__dirname, '../../..');
  const candidates = await LandingPageDetector.discoverLandingPages('127.0.0.1', 9222, repoRoot);

  assert.ok(candidates.length > 0, 'Should discover landing candidates');

  // Verify demo-app/index.html is discovered
  const demoCandidate = candidates.find(c => c.id === 'demo_app_index');
  assert.ok(demoCandidate, 'Should find demo_app_index');
  assert.strictEqual(demoCandidate.isRecommended, true, 'demo-app should be recommended landing page');
  assert.ok(demoCandidate.title.includes('Target Application Under Test') || demoCandidate.title.includes('Antigravity'), 'Should extract HTML title');
  assert.strictEqual(demoCandidate.componentName, 'AuthSubmitButton');
  assert.strictEqual(demoCandidate.type, 'html');
});

test('LandingPageDetector detects Expo Router project with port 8081 and discovers schemas', async () => {
  const projectRoot = '/Users/jarrod/Desktop/project';
  const candidates = await LandingPageDetector.discoverLandingPages('127.0.0.1', 9222, projectRoot);

  assert.ok(candidates.length > 0, 'Should find candidates for Draft Stack project');
  const topCandidate = candidates[0];
  assert.strictEqual(topCandidate.id, 'entry_app_index_tsx', 'Top candidate should be app/index.tsx');
  assert.strictEqual(topCandidate.url, 'http://localhost:8081', 'Dev URL should default to 8081 for Expo');
  assert.strictEqual(topCandidate.isRecommended, true);

  // Test schema discovery
  const schemas = await LandingPageDetector.discoverWorkspaceSchemas(projectRoot);
  assert.ok(schemas.length >= 2, 'Should discover ARCHITECTURE_FLOW.md and DATABASE_SCHEMA_ERD.md');
  const archSchema = schemas.find(s => s.relativeFilePath === 'ARCHITECTURE_FLOW.md');
  assert.ok(archSchema, 'Should find ARCHITECTURE_FLOW.md');
  assert.ok(archSchema.diagramCount > 10, 'Should detect multiple diagram blocks');

  const erdSchema = schemas.find(s => s.relativeFilePath === 'DATABASE_SCHEMA_ERD.md');
  assert.ok(erdSchema, 'Should find DATABASE_SCHEMA_ERD.md');
  assert.strictEqual(erdSchema.schemaType, 'ERD');
});

