/**
 * server/cloudflare-worker.ts
 *
 * Cloudflare Edge Worker for Flow Tracer Pro License Verification & Activation.
 * - Validates license keys with Polar.sh API (/v1/license-keys/validate)
 * - Enforces device binding with machineId
 * - Computes sliding 35-day window for recurring subscriptions, or null for Lifetime licenses
 * - Cryptographically signs payload using Ed25519 Private Key
 *
 * Deploy with Wrangler:
 *   npx wrangler deploy
 * Secrets required:
 *   npx wrangler secret put POLAR_ACCESS_TOKEN
 *   npx wrangler secret put POLAR_ORGANIZATION_ID
 *   npx wrangler secret put ED25519_PRIVATE_KEY
 */

import * as crypto from 'node:crypto';

export interface Env {
  POLAR_ACCESS_TOKEN: string;
  POLAR_ORGANIZATION_ID: string;
  ED25519_PRIVATE_KEY: string;
  DEV_BYPASS_KEY?: string; // Optional for local development testing
}

export interface ActivationRequest {
  licenseKey: string;
  machineId: string;
  platform?: string;
  appVersion?: string;
}

export interface SignedLicensePayload {
  key: string;
  tier: 'pro' | 'enterprise';
  machineId: string;
  issuedAt: number;
  expiresAt: number | null; // null = Lifetime, timestamp = subscription renewal
}

export interface ActivationResponse {
  valid: boolean;
  payload: SignedLicensePayload;
  signature: string; // Base64 encoded Ed25519 signature
  message?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Content-Type': 'application/json'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'flowtracer-license-engine' }), {
        headers: corsHeaders
      });
    }

    if (url.pathname !== '/api/v1/activate' || request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Endpoint Not Found' }), {
        status: 404,
        headers: corsHeaders
      });
    }

    try {
      const body: ActivationRequest = await request.json();
      const { licenseKey, machineId } = body;

      if (!licenseKey || !licenseKey.trim() || !machineId || !machineId.trim()) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: licenseKey and machineId are required.' }),
          { status: 400, headers: corsHeaders }
        );
      }

      const cleanKey = licenseKey.trim();
      const cleanMachineId = machineId.trim();

      // Support local dev testing bypass key if configured
      let isLifetime = false;
      let isDevMode = false;
      let tier: 'pro' | 'enterprise' = 'pro';

      if (env.DEV_BYPASS_KEY && cleanKey === env.DEV_BYPASS_KEY) {
        isDevMode = true;
        isLifetime = true;
      } else {
        // Validate with Polar.sh License API
        const polarResponse = await fetch('https://api.polar.sh/v1/license-keys/validate', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.POLAR_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
            'User-Agent': 'FlowTracer-License-Worker/1.0'
          },
          body: JSON.stringify({
            key: cleanKey,
            organization_id: env.POLAR_ORGANIZATION_ID,
            conditions: {
              machine_id: cleanMachineId
            }
          })
        });

        if (!polarResponse.ok) {
          const errData = await polarResponse.json().catch(() => ({}));
          return new Response(
            JSON.stringify({
              error: errData.detail || 'License key is invalid, revoked, or has reached maximum activation limit.'
            }),
            { status: 403, headers: corsHeaders }
          );
        }

        const polarData: any = await polarResponse.json();

        // Check if one-time/lifetime or recurring subscription
        isLifetime = polarData.benefit?.properties?.is_lifetime === true ||
                     polarData.product?.is_recurring === false ||
                     !polarData.expires_at;

        tier = polarData.tier === 'enterprise' ? 'enterprise' : 'pro';
      }

      // Build payload: 35-day sliding window for subscriptions, null for lifetime
      const now = Date.now();
      const subscriptionWindowMs = 35 * 24 * 60 * 60 * 1000; // 35 days
      const expiresAt = isLifetime ? null : (now + subscriptionWindowMs);

      const payload: SignedLicensePayload = {
        key: cleanKey,
        tier,
        machineId: cleanMachineId,
        issuedAt: now,
        expiresAt
      };

      // Sign payload with Ed25519 Private Key
      const payloadString = JSON.stringify(payload);
      const signature = crypto.sign(
        null,
        Buffer.from(payloadString, 'utf8'),
        env.ED25519_PRIVATE_KEY
      ).toString('base64');

      const responsePayload: ActivationResponse = {
        valid: true,
        payload,
        signature,
        message: isDevMode ? 'Activated in Development Mode' : 'License successfully activated'
      };

      return new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: corsHeaders
      });

    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: `Internal License Error: ${err.message}` }),
        { status: 500, headers: corsHeaders }
      );
    }
  }
};
