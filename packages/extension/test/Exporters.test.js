const test = require('node:test');
const assert = require('node:assert');
const { FlowGraphModel } = require('../dist/graph/FlowGraphModel');
const { MermaidExporter } = require('../dist/export/MermaidExporter');
const { PlaywrightExporter } = require('../dist/export/PlaywrightExporter');

test('MermaidExporter generates valid flowchart syntax', () => {
  const model = new FlowGraphModel('session-export');
  model.addStepEvent({
    type: 'EVENT_CLICK',
    step: 1,
    target: {
      tagName: 'button',
      selector: '#btnAuth',
      componentName: 'LoginButton',
      handlerName: 'login'
    }
  });

  const mmd = MermaidExporter.export(model);
  assert.ok(mmd.includes('```mermaid'));
  assert.ok(mmd.includes('graph TD'));
  assert.ok(mmd.includes('classDef screen'));
  assert.ok(mmd.includes('LoginButton'));
  assert.ok(mmd.includes('login()'));
});

test('PlaywrightExporter generates valid Playwright test spec', () => {
  const model = new FlowGraphModel('session-e2e');
  model.addStepEvent({
    type: 'EVENT_NAVIGATE',
    step: 1,
    url: 'http://localhost:3000/login'
  });
  model.addStepEvent({
    type: 'EVENT_CLICK',
    step: 2,
    target: {
      selector: '#submit-btn'
    }
  });
  model.addStepEvent({
    type: 'HOTKEY_COMMENT',
    step: 3,
    comment: 'Check that dashboard opens after click'
  });

  const spec = PlaywrightExporter.export(model);
  assert.ok(spec.includes("import { test, expect } from '@playwright/test';"));
  assert.ok(spec.includes("await page.goto('http://localhost:3000/login');"));
  assert.ok(spec.includes("await page.locator('#submit-btn').click();"));
  assert.ok(spec.includes('[USER ANNOTATION]: Check that dashboard opens after click'));
});
