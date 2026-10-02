#!/usr/bin/env node
/**
 * scripts/generate-license-keypair.js
 * Generates an Ed25519 public/private keypair for Flow Tracer Pro licensing.
 *
 * Output:
 *  - Public Key (PEM SPKI): Paste into LicenseManager.ts in packages/extension
 *  - Private Key (PEM PKCS8): Save as Cloudflare Worker secret (ED25519_PRIVATE_KEY)
 */

const crypto = require('node:crypto');

function generateKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  console.log('='.repeat(70));
  console.log('🔑 FLOW TRACER ED25519 LICENSE KEYPAIR GENERATOR');
  console.log('='.repeat(70));
  console.log('\n--- PUBLIC KEY (Paste into packages/extension/src/license/LicenseManager.ts) ---');
  console.log(publicKey.trim());
  console.log('\n--- PRIVATE KEY (Set in Cloudflare Worker secret: ED25519_PRIVATE_KEY) ---');
  console.log(privateKey.trim());
  console.log('\n' + '='.repeat(70));
  console.log('⚠️  KEEP THE PRIVATE KEY SECRET. NEVER COMMIT IT TO A PUBLIC REPOSITORY.');
  console.log('='.repeat(70) + '\n');

  return { publicKey: publicKey.trim(), privateKey: privateKey.trim() };
}

if (require.main === module) {
  generateKeypair();
}

module.exports = { generateKeypair };
