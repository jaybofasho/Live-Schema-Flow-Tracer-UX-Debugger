/**
 * packages/extension/src/license/LicenseManager.ts
 *
 * Flow Tracer Pro Licensing Subsystem
 * - Offline-tolerant Ed25519 cryptographic signature verification
 * - Secure secret storage (context.secrets) with graceful globalState fallback
 * - Machine binding verification via vscode.env.machineId
 * - Automatic background token refresh for active subscriptions
 * - Dynamic context toggles for VS Code menus (flowtracer:isPro)
 */

import * as vscode from 'vscode';
import * as crypto from 'node:crypto';

export interface LicensePayload {
  key: string;
  tier: 'pro' | 'enterprise';
  machineId: string;
  issuedAt: number;
  expiresAt: number | null; // null = Lifetime, timestamp = subscription renewal deadline
}

export interface StoredTokenData {
  payload: LicensePayload;
  signature: string; // Base64 encoded Ed25519 signature
}

export class LicenseManager {
  private static SECRET_TOKEN_KEY = 'flowtracer_pro_signed_token';
  private static SECRET_RAW_KEY = 'flowtracer_pro_license_key';
  private static FALLBACK_TOKEN_KEY = 'flowtracer_pro_token_fallback';
  private static API_ENDPOINT = 'https://license.flowtracer.dev/api/v1/activate';

  /**
   * Embedded Ed25519 Public Key (SPKI PEM format).
   * Safe to distribute in client code. Cannot be used to forge license signatures.
   */
  public static readonly ED25519_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAd1MM98nt8OP3HLsfAbcCA1FqEWBEquaH8y2mAsIcQS4=
-----END PUBLIC KEY-----`.trim();

  private context: vscode.ExtensionContext;
  private cachedProStatus: boolean | null = null;
  private isRefreshing = false;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Initialize license state on extension activation.
   */
  async initialize(): Promise<boolean> {
    const isPro = await this.isProUser();
    await vscode.commands.executeCommand('setContext', 'flowtracer:isPro', isPro);

    // If subscription is within 10 days of expiration, trigger silent background refresh
    if (isPro) {
      this.maybeSilentRefresh();
    }

    return isPro;
  }

  /**
   * Check if current environment has valid Pro entitlement.
   * Runs offline-first with zero network latency.
   */
  async isProUser(): Promise<boolean> {
    if (this.cachedProStatus !== null) {
      return this.cachedProStatus;
    }

    const tokenData = await this.retrieveStoredToken();
    if (!tokenData) {
      this.cachedProStatus = false;
      return false;
    }

    const isValid = this.verifyTokenOffline(tokenData);
    this.cachedProStatus = isValid;
    return isValid;
  }

  /**
   * Return parsed license details if active, or null.
   */
  async getLicenseDetails(): Promise<LicensePayload | null> {
    const tokenData = await this.retrieveStoredToken();
    if (!tokenData || !this.verifyTokenOffline(tokenData)) {
      return null;
    }
    return tokenData.payload;
  }

  /**
   * Interactive prompt for user to enter and activate a license key.
   */
  async promptAndActivate(): Promise<boolean> {
    const rawKey = await vscode.window.showInputBox({
      title: 'Flow Tracer Pro Activation',
      prompt: 'Enter your Polar.sh License Key (e.g., FT-XXXX-XXXX-XXXX)',
      placeHolder: 'FT-XXXX-XXXX-XXXX',
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value || !value.trim()) {
          return 'License key cannot be empty.';
        }
        return null;
      }
    });

    if (!rawKey) return false;

    return this.activateKeyWithProgress(rawKey.trim());
  }

  /**
   * Activate with VS Code progress notification.
   */
  async activateKeyWithProgress(licenseKey: string): Promise<boolean> {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Validating Flow Tracer Pro License with Polar.sh...',
        cancellable: false
      },
      async () => {
        const success = await this.activateKey(licenseKey);
        if (success) {
          vscode.window.showInformationMessage(
            '🎉 Flow Tracer Pro activated successfully! All video studio and transcript exporters are unlocked.'
          );
        }
        return success;
      }
    );
  }

  /**
   * Resolve activation endpoint from settings with fallback to default production URL.
   */
  public getActivationEndpoint(): string {
    try {
      const configured = vscode.workspace?.getConfiguration?.('flowtracer')?.get<string>('licenseServerUrl');
      if (configured && configured.trim()) {
        return configured.trim();
      }
    } catch {
      // ignore
    }
    return LicenseManager.API_ENDPOINT;
  }

  /**
   * Activate against verification endpoint.
   */
  async activateKey(licenseKey: string): Promise<boolean> {
    try {
      const endpoint = this.getActivationEndpoint();
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'FlowTracer-Extension-Client/0.1.0'
        },
        body: JSON.stringify({
          licenseKey,
          machineId: vscode.env.machineId,
          platform: process.platform,
          appVersion: '0.1.0'
        })
      });

      if (!response.ok) {
        const errJson: any = await response.json().catch(() => ({}));
        vscode.window.showErrorMessage(
          `License Activation Failed: ${errJson.error || `Server responded with status ${response.status}`}`
        );
        return false;
      }

      const data: any = await response.json();
      const tokenData: StoredTokenData = {
        payload: data.payload,
        signature: data.signature
      };

      // Verify signature locally before persisting
      if (!this.verifyTokenOffline(tokenData)) {
        vscode.window.showErrorMessage(
          'License signature verification failed. The activation server response may be untrusted.'
        );
        return false;
      }

      // Store in secrets with fallback to globalState
      await this.storeTokenSafely(tokenData);
      try {
        await this.context.secrets.store(LicenseManager.SECRET_RAW_KEY, licenseKey);
      } catch {
        // Ignored if secrets store is unavailable
      }

      this.cachedProStatus = true;
      await vscode.commands.executeCommand('setContext', 'flowtracer:isPro', true);
      return true;

    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Unable to reach license activation server: ${error.message}. Please check your internet connection.`
      );
      return false;
    }
  }

  /**
   * Display license and subscription status.
   */
  async checkLicenseStatus(): Promise<void> {
    const isPro = await this.isProUser();
    if (!isPro) {
      const choice = await vscode.window.showInformationMessage(
        'Flow Tracer is currently running in Free Community Edition.',
        'Upgrade to Pro',
        'Enter License Key'
      );
      if (choice === 'Upgrade to Pro') {
        vscode.env.openExternal(vscode.Uri.parse('https://polar.sh/thrice-wise-enterprise/subscriptions'));
      } else if (choice === 'Enter License Key') {
        await this.promptAndActivate();
      }
      return;
    }

    const details = await this.getLicenseDetails();
    if (!details) {
      vscode.window.showInformationMessage('Flow Tracer Pro is active.');
      return;
    }

    const maskedKey = details.key.length > 8
      ? `${details.key.substring(0, 4)}...${details.key.substring(details.key.length - 4)}`
      : details.key;

    const expirationText = details.expiresAt === null
      ? 'Lifetime (Never Expires)'
      : new Date(details.expiresAt).toLocaleDateString(undefined, { dateStyle: 'long' });

    const choice = await vscode.window.showInformationMessage(
      `Flow Tracer Pro (${details.tier.toUpperCase()})\n` +
      `• Key: ${maskedKey}\n` +
      `• Plan: ${expirationText}\n` +
      `• Device: Bound to machine`,
      'Deactivate License',
      'OK'
    );

    if (choice === 'Deactivate License') {
      await this.deactivateLicense();
    }
  }

  /**
   * Deactivate and clear stored license credentials.
   */
  async deactivateLicense(): Promise<boolean> {
    const confirm = await vscode.window.showWarningMessage(
      'Are you sure you want to deactivate Flow Tracer Pro on this machine?',
      'Yes, Deactivate',
      'Cancel'
    );

    if (confirm !== 'Yes, Deactivate') return false;

    try {
      await this.context.secrets.delete(LicenseManager.SECRET_TOKEN_KEY);
      await this.context.secrets.delete(LicenseManager.SECRET_RAW_KEY);
    } catch {
      // Ignore
    }
    await this.context.globalState.update(LicenseManager.FALLBACK_TOKEN_KEY, undefined);

    this.cachedProStatus = false;
    await vscode.commands.executeCommand('setContext', 'flowtracer:isPro', false);

    vscode.window.showInformationMessage('Flow Tracer Pro license deactivated.');
    return true;
  }

  /**
   * Gate check helper for Pro features. Shows user-friendly upgrade prompt if not unlocked.
   */
  async enforceProFeature(featureName: string): Promise<boolean> {
    const isPro = await this.isProUser();
    if (isPro) return true;

    const action = await vscode.window.showWarningMessage(
      `${featureName} is a Flow Tracer Pro feature.`,
      'Upgrade on Polar.sh',
      'Enter License Key',
      'Cancel'
    );

    if (action === 'Upgrade on Polar.sh') {
      vscode.env.openExternal(vscode.Uri.parse('https://polar.sh/thrice-wise-enterprise/subscriptions'));
    } else if (action === 'Enter License Key') {
      await this.promptAndActivate();
    }

    return false;
  }

  /**
   * Offline cryptographic check using Ed25519 public key.
   */
  private verifyTokenOffline(data: StoredTokenData): boolean {
    if (!data || !data.payload || !data.signature) {
      return false;
    }

    try {
      const payloadString = JSON.stringify(data.payload);

      const isVerified = crypto.verify(
        null,
        Buffer.from(payloadString, 'utf8'),
        LicenseManager.ED25519_PUBLIC_KEY,
        Buffer.from(data.signature, 'base64')
      );

      if (!isVerified) return false;

      // 1. Verify machine binding
      if (data.payload.machineId !== vscode.env.machineId) {
        return false;
      }

      // 2. Verify expiration if subscription
      if (data.payload.expiresAt !== null && Date.now() > data.payload.expiresAt) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Safe storage helper handling OS Keychain locking gracefully.
   */
  private async storeTokenSafely(tokenData: StoredTokenData): Promise<void> {
    const json = JSON.stringify(tokenData);
    let secretsSucceeded = false;

    try {
      await this.context.secrets.store(LicenseManager.SECRET_TOKEN_KEY, json);
      secretsSucceeded = true;
    } catch {
      // OS Keychain is unavailable (headless Linux, remote SSH, corrupted SecretService)
    }

    if (!secretsSucceeded) {
      // Store safely in VS Code's internal database (never committed to Git)
      await this.context.globalState.update(LicenseManager.FALLBACK_TOKEN_KEY, json);
    }
  }

  /**
   * Retrieve token from context.secrets with fallback to context.globalState.
   */
  private async retrieveStoredToken(): Promise<StoredTokenData | null> {
    try {
      const secretJson = await this.context.secrets.get(LicenseManager.SECRET_TOKEN_KEY);
      if (secretJson) {
        return JSON.parse(secretJson);
      }
    } catch {
      // Fallback
    }

    const fallbackJson = this.context.globalState.get<string>(LicenseManager.FALLBACK_TOKEN_KEY);
    if (fallbackJson) {
      try {
        return JSON.parse(fallbackJson);
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Silent background token refresh for subscriptions within 10 days of expiration.
   */
  private async maybeSilentRefresh(): Promise<void> {
    if (this.isRefreshing) return;

    const tokenData = await this.retrieveStoredToken();
    if (!tokenData || tokenData.payload.expiresAt === null) return; // Lifetime license doesn't need refresh

    const msUntilExpiry = tokenData.payload.expiresAt - Date.now();
    const tenDaysMs = 10 * 24 * 60 * 60 * 1000;

    if (msUntilExpiry > 0 && msUntilExpiry < tenDaysMs) {
      this.isRefreshing = true;
      try {
        let rawKey: string | undefined;
        try {
          rawKey = await this.context.secrets.get(LicenseManager.SECRET_RAW_KEY);
        } catch {
          // ignore
        }
        if (!rawKey) rawKey = tokenData.payload.key;

        // Perform silent background activation without showing blocking progress UI
        const res = await fetch(this.getActivationEndpoint(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            licenseKey: rawKey,
            machineId: vscode.env.machineId,
            platform: process.platform,
            appVersion: '0.1.0'
          })
        });

        if (res.ok) {
          const freshData: any = await res.json();
          const refreshedToken: StoredTokenData = {
            payload: freshData.payload,
            signature: freshData.signature
          };
          if (this.verifyTokenOffline(refreshedToken)) {
            await this.storeTokenSafely(refreshedToken);
          }
        }
      } catch {
        // Silent failure: allow user to continue offline until expiresAt lapses
      } finally {
        this.isRefreshing = false;
      }
    }
  }
}
