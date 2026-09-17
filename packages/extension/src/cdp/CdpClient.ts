import { WebSocket } from 'ws';
import * as http from 'http';
import { EventEmitter } from 'events';
import { ViewportConfig } from '../device/DevicePresets';

export interface CdpTarget {
  id: string;
  title: string;
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

export class CdpClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private messageId = 0;
  private callbacks = new Map<number, (res: any) => void>();
  private host: string;
  private port: number;

  constructor(host: string = '127.0.0.1', port: number = 9222) {
    super();
    this.host = host;
    this.port = port;
  }

  public async getAvailableTargets(): Promise<CdpTarget[]> {
    return new Promise((resolve) => {
      const req = http.get(`http://${this.host}:${this.port}/json/list`, (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          try {
            const targets = JSON.parse(body);
            resolve(targets);
          } catch {
            resolve([]);
          }
        });
      });
      req.on('error', () => resolve([]));
      req.setTimeout(500, () => {
        req.destroy();
        resolve([]);
      });
    });
  }

  public async connectToPage(wsUrl: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.on('open', async () => {
          console.log(`[CdpClient] Attached to target: ${wsUrl}`);
          await this.send('Page.enable');
          await this.send('Runtime.enable');
          await this.send('DOM.enable');
          this.emit('attached');
          resolve(true);
        });

        this.ws.on('message', (data: string) => {
          try {
            const msg = JSON.parse(data.toString());
            if (msg.id && this.callbacks.has(msg.id)) {
              const cb = this.callbacks.get(msg.id)!;
              this.callbacks.delete(msg.id);
              cb(msg.result);
            } else if (msg.method) {
              this.handleCdpEvent(msg.method, msg.params);
            }
          } catch {}
        });

        this.ws.on('error', (err) => {
          console.warn(`[CdpClient] WebSocket error: ${err.message}`);
          resolve(false);
        });

        this.ws.on('close', () => {
          this.ws = null;
          this.emit('detached');
        });
      } catch {
        resolve(false);
      }
    });
  }

  public async injectScript(scriptSource: string): Promise<any> {
    await this.send('Page.addScriptToEvaluateOnNewDocument', { source: scriptSource });
    return this.send('Runtime.evaluate', { expression: scriptSource });
  }

  private handleCdpEvent(method: string, params: any): void {
    if (method === 'Runtime.consoleAPICalled') {
      const args = params.args || [];
      if (args.length > 1 && args[0].value === '__ANTIGRAVITY_TRACER_EVENT__') {
        try {
          const event = JSON.parse(args[1].value);
          this.emit('tracerEvent', event);
        } catch {}
      }
    }
  }

  public send(method: string, params: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('CDP WebSocket not connected'));
      }
      const id = ++this.messageId;
      this.callbacks.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  public async applyDeviceMetrics(viewport: ViewportConfig): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    try {
      await this.send('Emulation.setDeviceMetricsOverride', {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: viewport.deviceScaleFactor || 1,
        mobile: viewport.mobile,
        screenOrientation: {
          angle: viewport.orientation === 'landscape' ? 90 : 0,
          type: viewport.orientation === 'landscape' ? 'landscapePrimary' : 'portraitPrimary'
        }
      });

      if (viewport.mobile) {
        await this.send('Emulation.setUserAgentOverride', {
          userAgent:
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 AntigravityTracer'
        });
      } else {
        await this.send('Emulation.setUserAgentOverride', {
          userAgent: ''
        });
      }
    } catch (e: any) {
      console.warn(`[CdpClient] Failed to apply device metrics: ${e?.message}`);
    }
  }

  public async navigate(url: string): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    return this.send('Page.navigate', { url });
  }

  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
