const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');

// Mock 'vscode' module for pure node:test execution
const Module = require('node:module');
const originalRequire = Module.prototype.require;
const mockMachineId = 'test-machine-id-12345';

Module.prototype.require = function (id) {
  if (id === 'vscode') {
    return {
      env: {
        machineId: mockMachineId
      },
      commands: {
        executeCommand: async () => {}
      },
      window: {
        showInformationMessage: async () => {},
        showErrorMessage: async () => {},
        showWarningMessage: async () => {},
        showInputBox: async () => {}
      },
      ProgressLocation: { Notification: 15 }
    };
  }
  return originalRequire.apply(this, arguments);
};

const { LicenseManager } = require('../dist/license/LicenseManager');

// Test Mock Context
function createMockContext() {
  const secretsStore = new Map();
  const globalStateStore = new Map();
  let failSecrets = false;

  return {
    secrets: {
      get: async (key) => {
        if (failSecrets) throw new Error('OS Keychain Locked / libsecret unavailable');
        return secretsStore.get(key);
      },
      store: async (key, val) => {
        if (failSecrets) throw new Error('OS Keychain Locked / libsecret unavailable');
        secretsStore.set(key, val);
      },
      delete: async (key) => {
        if (failSecrets) throw new Error('OS Keychain Locked / libsecret unavailable');
        secretsStore.delete(key);
      }
    },
    globalState: {
      get: (key) => globalStateStore.get(key),
      update: async (key, val) => {
        if (val === undefined) globalStateStore.delete(key);
        else globalStateStore.set(key, val);
      }
    },
    setFailSecrets: (val) => { failSecrets = val; }
  };
}

// Generate valid signature using the test private key corresponding to the public key in LicenseManager.ts
const TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIBLtv8Hl+cf52ZTiUXArMzuiad0ENHJ7zG35z8S7jBuG
-----END PRIVATE KEY-----`;

function createSignedToken(payload) {
  const payloadString = JSON.stringify(payload);
  const signature = crypto.sign(
    null,
    Buffer.from(payloadString, 'utf8'),
    TEST_PRIVATE_KEY
  ).toString('base64');

  return { payload, signature };
}

test('LicenseManager: Offline verification succeeds for valid lifetime token matching machineId', async () => {
  const mockContext = createMockContext();
  const lm = new LicenseManager(mockContext);

  const tokenData = createSignedToken({
    key: 'FT-LIFETIME-1234',
    tier: 'pro',
    machineId: mockMachineId,
    issuedAt: Date.now(),
    expiresAt: null // Lifetime
  });

  await mockContext.secrets.store('flowtracer_pro_signed_token', JSON.stringify(tokenData));

  const isPro = await lm.isProUser();
  assert.strictEqual(isPro, true, 'Valid lifetime license should be recognized as Pro');
});

test('LicenseManager: Verification fails if machineId does not match current machine', async () => {
  const mockContext = createMockContext();
  const lm = new LicenseManager(mockContext);

  const tokenData = createSignedToken({
    key: 'FT-PIRATED-5678',
    tier: 'pro',
    machineId: 'completely-different-machine-id',
    issuedAt: Date.now(),
    expiresAt: null
  });

  await mockContext.secrets.store('flowtracer_pro_signed_token', JSON.stringify(tokenData));

  const isPro = await lm.isProUser();
  assert.strictEqual(isPro, false, 'License bound to different machineId must be rejected');
});

test('LicenseManager: Verification fails if subscription token has expired', async () => {
  const mockContext = createMockContext();
  const lm = new LicenseManager(mockContext);

  const tokenData = createSignedToken({
    key: 'FT-SUB-EXPIRED',
    tier: 'pro',
    machineId: mockMachineId,
    issuedAt: Date.now() - 40 * 24 * 60 * 60 * 1000,
    expiresAt: Date.now() - 5 * 24 * 60 * 60 * 1000 // Expired 5 days ago
  });

  await mockContext.secrets.store('flowtracer_pro_signed_token', JSON.stringify(tokenData));

  const isPro = await lm.isProUser();
  assert.strictEqual(isPro, false, 'Expired subscription license must be rejected');
});

test('LicenseManager: Verification fails if token payload is tampered with', async () => {
  const mockContext = createMockContext();
  const lm = new LicenseManager(mockContext);

  const tokenData = createSignedToken({
    key: 'FT-FREE-USER',
    tier: 'pro',
    machineId: mockMachineId,
    issuedAt: Date.now(),
    expiresAt: null
  });

  // Attacker tampers with the payload without knowing private key
  tokenData.payload.key = 'FT-TAMPERED-KEY';

  await mockContext.secrets.store('flowtracer_pro_signed_token', JSON.stringify(tokenData));

  const isPro = await lm.isProUser();
  assert.strictEqual(isPro, false, 'Tampered token must fail cryptographic signature check');
});

test('LicenseManager: Falls back gracefully to globalState when OS Keychain fails', async () => {
  const mockContext = createMockContext();
  mockContext.setFailSecrets(true); // Simulate OS keychain failure (e.g. headless Linux)

  const lm = new LicenseManager(mockContext);

  const tokenData = createSignedToken({
    key: 'FT-KEYCHAIN-FALLBACK',
    tier: 'pro',
    machineId: mockMachineId,
    issuedAt: Date.now(),
    expiresAt: null
  });

  // Put in globalState fallback
  await mockContext.globalState.update('flowtracer_pro_token_fallback', JSON.stringify(tokenData));

  const isPro = await lm.isProUser();
  assert.strictEqual(isPro, true, 'LicenseManager should seamlessly read from globalState fallback when keychain fails');
});
