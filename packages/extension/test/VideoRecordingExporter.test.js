const test = require('node:test');
const assert = require('node:assert');
const { FlowGraphModel } = require('../dist/graph/FlowGraphModel');
const { VideoRecordingExporter } = require('../dist/export/VideoRecordingExporter');

function createSampleFlowModel() {
  const model = new FlowGraphModel();
  model.reset('test-recording-session', {
    id: 'landing_hero',
    title: 'Landing Hero Page',
    url: 'http://localhost:3000/',
    type: 'html'
  }, {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
    orientation: 'landscape',
    presetId: 'web-fhd',
    presetName: 'Desktop FHD (1920x1080)',
    category: 'web'
  });

  // Add 3 user interaction steps
  model.addStepEvent({
    type: 'EVENT_CLICK',
    x: 450,
    y: 320,
    target: {
      tagName: 'BUTTON',
      innerText: 'Get Started',
      id: 'btn-get-started',
      classList: ['cta-button'],
      filePath: '/src/components/Hero.tsx',
      lineNumber: 42,
      componentName: 'HeroCta',
      handlerName: 'onGetStarted'
    }
  });

  model.addStepEvent({
    type: 'EVENT_NAVIGATE',
    url: 'http://localhost:3000/auth/login',
    title: 'Login Screen'
  });

  model.addStepEvent({
    type: 'EVENT_CLICK',
    x: 820,
    y: 410,
    target: {
      tagName: 'INPUT',
      id: 'email-input',
      classList: ['auth-input'],
      filePath: '/src/components/LoginForm.tsx',
      lineNumber: 19,
      componentName: 'LoginForm',
      handlerName: 'onFocusEmail'
    }
  });

  return model;
}

test('VideoRecordingExporter: normalizeConfig normalizes aliases and defaults', () => {
  const normalized = VideoRecordingExporter.normalizeConfig({
    format: 'webm',
    scale: 0.75,
    preset: 'ultra',
    dwellTimeMs: 2000,
    targetResolution: { width: 1280, height: 720 }
  });

  assert.strictEqual(normalized.format, 'webm');
  assert.strictEqual(normalized.compression, 'ultra');
  assert.strictEqual(normalized.preset, 'ultra');
  assert.strictEqual(normalized.actionDwellMs, 2000);
  assert.strictEqual(normalized.targetWidth, 1280);
  assert.strictEqual(normalized.targetHeight, 720);
  assert.strictEqual(normalized.scaling, 0.75);
  assert.strictEqual(normalized.fps, 30);
  assert.strictEqual(normalized.includeWatermark, true);
});

test('VideoRecordingExporter: estimateFileSize calculates file size and badges for MP4 and WebM', () => {
  const model = createSampleFlowModel();

  const estimateMp4 = VideoRecordingExporter.estimateFileSize(model, {
    format: 'mp4',
    scaling: 1.0,
    compression: 'balanced',
    fps: 30,
    actionDwellMs: 1500
  });

  assert.ok(estimateMp4.estimatedSizeBytes > 0, 'Byte size should be positive');
  assert.ok(estimateMp4.formattedSize.includes('KB') || estimateMp4.formattedSize.includes('MB'));
  assert.ok(estimateMp4.durationSec > 0);
  assert.strictEqual(estimateMp4.totalFrames, Math.round(estimateMp4.durationSec * 30));
  assert.strictEqual(estimateMp4.targetWidth, 1920);
  assert.strictEqual(estimateMp4.targetHeight, 1080);
  assert.ok(estimateMp4.resolution.includes('1920×1080'));

  // WebM should have a lower bitrate than MP4
  const estimateWebm = VideoRecordingExporter.estimateFileSize(model, {
    format: 'webm',
    scaling: 1.0,
    compression: 'balanced',
    fps: 30,
    actionDwellMs: 1500
  });

  assert.ok(estimateWebm.effectiveBitrateKbps < estimateMp4.effectiveBitrateKbps);
});

test('VideoRecordingExporter: estimateFileSize scales monotonically with resolution scaling', () => {
  const model = createSampleFlowModel();

  const est100 = VideoRecordingExporter.estimateFileSize(model, { scaling: 1.0, compression: 'high' });
  const est50 = VideoRecordingExporter.estimateFileSize(model, { scaling: 0.5, compression: 'high' });
  const est25 = VideoRecordingExporter.estimateFileSize(model, { scaling: 0.25, compression: 'high' });

  assert.ok(est100.estimatedSizeBytes > est50.estimatedSizeBytes, '100% should be larger than 50%');
  assert.ok(est50.estimatedSizeBytes > est25.estimatedSizeBytes, '50% should be larger than 25%');
  assert.strictEqual(est50.targetWidth, 960);
  assert.strictEqual(est50.targetHeight, 540);
  assert.ok(est50.resolution.includes('960×540'));
  assert.strictEqual(est25.targetWidth, 480);
  assert.strictEqual(est25.targetHeight, 270);
  assert.ok(est25.resolution.includes('480×270'));
});

test('VideoRecordingExporter: estimateFileSize scales monotonically across compression presets', () => {
  const model = createSampleFlowModel();

  const estUltra = VideoRecordingExporter.estimateFileSize(model, { compression: 'ultra' });
  const estHigh = VideoRecordingExporter.estimateFileSize(model, { compression: 'high' });
  const estBalanced = VideoRecordingExporter.estimateFileSize(model, { compression: 'balanced' });
  const estCompact = VideoRecordingExporter.estimateFileSize(model, { compression: 'compact' });
  const estMax = VideoRecordingExporter.estimateFileSize(model, { compression: 'maximum' });

  assert.ok(estUltra.estimatedSizeBytes > estHigh.estimatedSizeBytes, 'Ultra > High');
  assert.ok(estHigh.estimatedSizeBytes > estBalanced.estimatedSizeBytes, 'High > Balanced');
  assert.ok(estBalanced.estimatedSizeBytes > estCompact.estimatedSizeBytes, 'Balanced > Compact');
  assert.ok(estCompact.estimatedSizeBytes > estMax.estimatedSizeBytes, 'Compact > Maximum');

  // Compact and Maximum presets should award EMAIL_SAFE or SLACK_READY badges
  assert.ok(estCompact.channelBadge === 'EMAIL_SAFE' || estCompact.channelBadge === 'SLACK_READY');
  assert.ok(estMax.channelBadge === 'EMAIL_SAFE');
});

test('VideoRecordingExporter: generateActionHighlightFrames generates SVG vector frames with cursor beacon and badges', () => {
  const model = createSampleFlowModel();

  const frames = VideoRecordingExporter.generateActionHighlightFrames(model, {
    actionHighlights: true,
    includeWatermark: true,
    marketingTitle: 'Demo Checkout Flow'
  });

  assert.ok(frames.length >= 3, 'Should have frames for the timeline steps');

  // Check first frame properties
  const frame1 = frames[0];
  assert.strictEqual(frame1.step, 1);
  assert.ok(frame1.svgDataUri.startsWith('data:image/svg+xml;'));
  assert.ok(frame1.svg.includes('<svg'), 'Frame contains SVG root');
  assert.ok(frame1.svg.includes('Demo Checkout Flow'), 'Contains marketing watermark title');
  assert.ok(frame1.svg.includes('STEP #1'), 'Contains step badge');
  assert.ok(frame1.svg.includes('pulse-ring'), 'Contains glowing cursor beacon animation ring');
  assert.ok(frame1.svg.includes('HeroCta'), 'Contains component name in action callout');
});

test('VideoRecordingExporter: exportInteractiveHtmlPlayer generates standalone self-contained HTML player', () => {
  const model = createSampleFlowModel();

  const html = VideoRecordingExporter.exportInteractiveHtmlPlayer(model, {
    format: 'html5',
    marketingTitle: 'Self-Contained Product Showcase'
  });

  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(html.includes('Self-Contained Product Showcase'));
  assert.ok(html.includes('id="btnPlayPause"'));
  assert.ok(html.includes('id="scrubber"'));
  assert.ok(html.includes('id="selectSpeed"'));
  assert.ok(html.includes('id="stepsContainer"'));
  assert.ok(html.includes('svgDataUri'));
  assert.ok(html.includes('step-item'));
});
