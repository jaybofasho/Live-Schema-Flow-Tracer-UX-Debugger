const test = require('node:test');
const assert = require('node:assert');
const { FlowGraphModel } = require('../dist/graph/FlowGraphModel');
const { AudioDubbingManager } = require('../dist/audio/AudioDubbingManager');
const { VideoRecordingExporter } = require('../dist/export/VideoRecordingExporter');

function createSampleFlowModel() {
  const model = new FlowGraphModel();
  model.reset('test-audio-session', {
    id: 'landing_home',
    title: 'Storefront Home',
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

  model.addStepEvent({
    type: 'EVENT_CLICK',
    x: 450,
    y: 320,
    target: {
      tagName: 'BUTTON',
      innerText: 'Buy Now',
      id: 'btn-buy-now',
      componentName: 'ProductCard',
      handlerName: 'onBuyNow',
      filePath: '/src/components/ProductCard.tsx',
      lineNumber: 48
    }
  });

  model.addStepEvent({
    type: 'EVENT_NAVIGATE',
    url: 'http://localhost:3000/checkout',
    title: 'Checkout Flow'
  });

  model.addStepEvent({
    type: 'EVENT_INPUT',
    x: 600,
    y: 400,
    target: {
      tagName: 'INPUT',
      id: 'card-number-input',
      componentName: 'PaymentForm',
      handlerName: 'onCardInput'
    }
  });

  return model;
}

test('AudioDubbingManager: generateIntelligentNarration creates descriptive, context-aware narrations', () => {
  const model = createSampleFlowModel();
  const timeline = model.timeline;

  const narrationClick = AudioDubbingManager.generateIntelligentNarration(timeline[0]);
  assert.ok(narrationClick.includes('Step 1'), 'Narration includes step number');
  assert.ok(narrationClick.includes('Buy Now'), 'Narration includes button text');
  assert.ok(narrationClick.includes('ProductCard'), 'Narration references AST component name');

  const narrationNav = AudioDubbingManager.generateIntelligentNarration(timeline[1]);
  assert.ok(narrationNav.includes('Step 2'), 'Narration includes step 2');
  assert.ok(narrationNav.includes('Checkout Flow') || narrationNav.includes('/checkout'), 'Narration references target route');

  const narrationInput = AudioDubbingManager.generateIntelligentNarration(timeline[2]);
  assert.ok(narrationInput.includes('Step 3'), 'Narration includes step 3');
  assert.ok(narrationInput.includes('card-number-input') || narrationInput.includes('PaymentForm'), 'Narration references input field');
});

test('AudioDubbingManager: formatters generate valid Markdown, Plain Text, SRT, and Jira records', () => {
  const model = createSampleFlowModel();
  const sampleTranscripts = [
    {
      id: 'trans_1',
      step: 1,
      timestampMs: 0,
      durationMs: 1500,
      text: 'Click the Buy Now button on the storefront product card.',
      confidence: 0.98,
      speaker: 'Alex'
    },
    {
      id: 'trans_2',
      step: 2,
      timestampMs: 1500,
      durationMs: 1200,
      text: 'User navigates seamlessly to the checkout payment page.',
      confidence: 0.95,
      speaker: 'Alex'
    },
    {
      id: 'trans_3',
      step: 3,
      timestampMs: 2700,
      durationMs: 2000,
      text: 'Enter the credit card details to complete payment transaction.',
      confidence: 0.99,
      speaker: 'Alex'
    }
  ];

  // 1. Markdown
  const md = AudioDubbingManager.toMarkdownTranscript('Checkout Demo', sampleTranscripts, model);
  assert.ok(md.includes('# 🎙️ Audio Transcript & UX Walkthrough Record'), 'Markdown title present');
  assert.ok(md.includes('Checkout Demo'), 'Session title present');
  assert.ok(md.includes('Step-by-Step Written Transcript'), 'Section title present');
  assert.ok(md.includes('Click the Buy Now button'), 'Contains step 1 text');
  assert.ok(md.includes('ProductCard'), 'Contains component context');

  // 2. Plain Text
  const plain = AudioDubbingManager.toPlainTextTranscript(sampleTranscripts);
  assert.ok(plain.includes('[00:00] (Step #1) Alex: "Click the Buy Now button'), 'Plain text contains formatted line 1');
  assert.ok(plain.includes('[00:01] (Step #2) Alex: "User navigates'), 'Plain text contains formatted line 2');

  // 3. SRT Subtitles
  const srt = AudioDubbingManager.toSrtSubtitles(sampleTranscripts);
  assert.ok(srt.includes('1\n00:00:00,000 --> 00:00:01,500\nClick the Buy Now button'), 'SRT block 1 formatted properly');
  assert.ok(srt.includes('2\n00:00:01,500 --> 00:00:03,000\nUser navigates'), 'SRT block 2 formatted properly');

  // 4. Jira Issue Format
  const jira = AudioDubbingManager.toJiraIssueFormat('Checkout Demo', sampleTranscripts, model);
  assert.ok(jira.includes('h3. 🎙️ Audio Transcript & Action Flow Record: Checkout Demo'), 'Jira header present');
  assert.ok(jira.includes('||Step||Timestamp||Action / Component||Spoken Voiceover||'), 'Jira table syntax');
  assert.ok(jira.includes('|#1|00:00|'), 'Jira row syntax');
});

test('FlowGraphModel: manages audio track, transcripts, comments synchronization, and serialization', () => {
  const model = createSampleFlowModel();

  // Add transcript
  model.addSpeechTranscript({
    id: 'stt_1',
    step: 1,
    timestampMs: 500,
    durationMs: 1400,
    text: 'Tap on the buy now CTA button.',
    confidence: 0.97,
    speaker: 'Tester'
  });

  assert.strictEqual(model.speechTranscripts.length, 1);
  assert.strictEqual(model.speechTranscripts[0].text, 'Tap on the buy now CTA button.');

  // Verify node comment synchronization (Voiceover author)
  const node = Array.from(model.nodes.values()).find(n => n.step === 1);
  assert.ok(node, 'Node for step 1 exists');
  assert.ok(node.data.comments && node.data.comments.length > 0, 'Node has comment attached');
  assert.strictEqual(node.data.comments[0].author, 'Voiceover');
  assert.strictEqual(node.data.comments[0].text, 'Tap on the buy now CTA button.');

  // Update transcript
  model.updateSpeechTranscript('stt_1', 'Updated: Tap on the primary buy CTA.');
  assert.strictEqual(model.speechTranscripts[0].text, 'Updated: Tap on the primary buy CTA.');

  // Set Audio Track Metadata
  model.setAudioTrack({
    id: 'track_1',
    durationSec: 4.5,
    sampleRate: 48000,
    format: 'audio/webm',
    audioDataUri: 'data:audio/webm;base64,GkXfo59ChoEBQveBAU...',
    transcripts: model.speechTranscripts,
    recordedAt: '2026-09-10T17:00:00.000Z'
  });

  assert.ok(model.audioTrack, 'Audio track is set');
  assert.strictEqual(model.audioTrack.durationSec, 4.5);

  // Test getFormattedTranscript aliases
  const mdOut = model.getFormattedTranscript('markdown');
  const plainOut = model.getFormattedTranscript('plain');
  const textOut = model.getFormattedTranscript('text');
  const jiraOut = model.getFormattedTranscript('jira');
  const srtOut = model.getFormattedTranscript('srt');

  assert.ok(mdOut.includes('Updated: Tap on the primary buy CTA.'));
  assert.strictEqual(plainOut, textOut, 'plain and text return identical output');
  assert.ok(jiraOut.includes('h3. 🎙️ Audio Transcript & Action Flow Record'));
  assert.ok(srtOut.includes('-->'));

  // Test serialization & deserialization
  const json = model.toJSON();
  assert.ok(json.audioTrack, 'JSON includes audioTrack');
  assert.ok(json.speechTranscripts && json.speechTranscripts.length === 1, 'JSON includes speechTranscripts');

  const reloaded = new FlowGraphModel();
  reloaded.loadFromModel(json);
  assert.strictEqual(reloaded.speechTranscripts.length, 1);
  assert.strictEqual(reloaded.speechTranscripts[0].id, 'stt_1');
  assert.strictEqual(reloaded.audioTrack?.id, 'track_1');

  // Delete and Clear
  model.deleteSpeechTranscript('stt_1');
  assert.strictEqual(model.speechTranscripts.length, 0);

  model.addSpeechTranscript({
    id: 'stt_2',
    step: 2,
    timestampMs: 1200,
    durationMs: 1000,
    text: 'Step 2 transcript',
    confidence: 0.99
  });
  assert.strictEqual(model.speechTranscripts.length, 1);
  model.clearSpeechTranscripts();
  assert.strictEqual(model.speechTranscripts.length, 0);
});

test('VideoRecordingExporter: audio dubbing overhead and STT subtitles in frames and HTML player', () => {
  const model = createSampleFlowModel();

  model.addSpeechTranscript({
    id: 'stt_step_1',
    step: 1,
    timestampMs: 0,
    durationMs: 1500,
    text: 'Click the primary CTA button.',
    confidence: 0.96,
    speaker: 'Presenter'
  });

  // 1. File size estimation with and without audio
  const estNoAudio = VideoRecordingExporter.estimateFileSize(model, { includeAudioDub: false });
  const estWithAudio = VideoRecordingExporter.estimateFileSize(model, { includeAudioDub: true });

  assert.strictEqual(estNoAudio.hasAudio, false);
  assert.strictEqual(estWithAudio.hasAudio, true);
  assert.ok(estWithAudio.estimatedSizeBytes > estNoAudio.estimatedSizeBytes, 'File size increases when audio stream is enabled');

  // 2. Action highlight SVG frames include subtitle callout
  const frames = VideoRecordingExporter.generateActionHighlightFrames(model, {
    includeTranscripts: true,
    includeAudioDub: true
  });

  assert.strictEqual(frames.length, 3);
  assert.ok(frames[0].transcriptText?.includes('Click the primary CTA button.'), 'Frame 1 has speech transcript');
  assert.ok(frames[0].svg.includes('VOICEOVER:'), 'Frame 1 SVG includes voiceover overlay');
  assert.ok(frames[0].svg.includes('Click the primary CTA button.'), 'Frame 1 SVG renders transcribed words');

  // 3. Standalone Interactive HTML5 Player
  const html = VideoRecordingExporter.exportInteractiveHtmlPlayer(model, {
    includeAudioDub: true,
    includeTranscripts: true
  });

  assert.ok(html.includes('<title>'), 'HTML player has title');
  assert.ok(html.includes('🎙️ DUBBED AUDIO') || html.includes('badge-audio'), 'Player includes audio badge');
  assert.ok(html.includes('📝 STT TRANSCRIPTS') || html.includes('badge-stt'), 'Player includes STT badge');
  assert.ok(html.includes('id="subtitleOverlay"'), 'Player includes live subtitle overlay');
  assert.ok(html.includes('id="tabTranscripts"'), 'Player includes Written Transcripts tab');
  assert.ok(html.includes('id="btnCopyMd"'), 'Player includes Copy Markdown button');
  assert.ok(html.includes('id="btnCopyPlain"'), 'Player includes Copy Plain Text button');
  assert.ok(html.includes('id="btnCopyJira"'), 'Player includes Copy Jira button');
  assert.ok(html.includes('id="btnCopySrt"'), 'Player includes Copy SRT button');
  assert.ok(html.includes('id="dubbedAudio"'), 'Player includes dubbedAudio element');
  assert.ok(html.includes('Click the primary CTA button.'), 'Player embeds recorded speech transcript');
});
