const test = require('node:test');
const assert = require('node:assert');
const { WebSocket } = require('ws');
const { SidecarServer } = require('../dist/index');

test('SidecarServer boots, accepts WebSocket connections, and responds to messages', async () => {
  const server = new SidecarServer(54399);
  await server.start();

  const ws = new WebSocket('ws://127.0.0.1:54399');
  const receivedMessages = [];
  let messageResolver = null;

  ws.on('message', (data) => {
    const parsed = JSON.parse(data.toString());
    receivedMessages.push(parsed);
    if (messageResolver) {
      const fn = messageResolver;
      messageResolver = null;
      fn();
    }
  });

  const waitForNextMessage = () => {
    if (receivedMessages.length > 0) {
      return Promise.resolve(receivedMessages.shift());
    }
    return new Promise((resolve) => {
      messageResolver = () => resolve(receivedMessages.shift());
    });
  };

  const connected = await new Promise((resolve) => {
    ws.on('open', () => resolve(true));
    ws.on('error', () => resolve(false));
  });

  assert.strictEqual(connected, true);

  // 1. Initial status message
  const firstMsg = await waitForNextMessage();
  assert.strictEqual(firstMsg.type, 'SIDECAR_STATUS');
  assert.strictEqual(firstMsg.status.online, true);

  // 2. Send session start
  ws.send(JSON.stringify({
    type: 'START_SESSION',
    sessionId: 'test-session-123'
  }));

  const sessionStartMsg = await waitForNextMessage();
  assert.strictEqual(sessionStartMsg.type, 'SESSION_START');
  assert.strictEqual(sessionStartMsg.sessionId, 'test-session-123');

  ws.close();
  await server.stop();
});
