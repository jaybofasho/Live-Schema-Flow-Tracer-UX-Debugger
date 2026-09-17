import { WebSocket } from 'ws';
import { EventEmitter } from 'events';

export class SidecarClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private isConnected: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(url: string = 'ws://127.0.0.1:54321') {
    super();
    this.url = url;
  }

  public connect(): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.isConnected && this.ws) {
        return resolve(true);
      }

      try {
        this.ws = new WebSocket(this.url);

        this.ws.on('open', () => {
          this.isConnected = true;
          this.emit('connected');
          console.log(`[SidecarClient] Connected to sidecar at ${this.url}`);
          resolve(true);
        });

        this.ws.on('message', (data: string) => {
          try {
            const msg = JSON.parse(data.toString());
            this.emit('message', msg);
          } catch (e) {
            console.error('[SidecarClient] Could not parse message:', e);
          }
        });

        this.ws.on('close', () => {
          this.isConnected = false;
          this.emit('disconnected');
          console.log('[SidecarClient] Disconnected from sidecar');
        });

        this.ws.on('error', (err) => {
          console.warn(`[SidecarClient] WebSocket error: ${err.message}`);
          resolve(false);
        });
      } catch (err) {
        console.error(`[SidecarClient] Connection failure: ${err}`);
        resolve(false);
      }
    });
  }

  public send(msg: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  public startSession(sessionId: string, appName?: string): void {
    this.send({ type: 'START_SESSION', sessionId, appName });
  }

  public stopSession(): void {
    this.send({ type: 'STOP_SESSION' });
  }

  public pauseSession(): void {
    this.send({ type: 'TRIGGER_HOTKEY', action: 'pause' });
  }

  public triggerDebug(target?: any): void {
    this.send({ type: 'TRIGGER_HOTKEY', action: 'debug', payload: { target } });
  }

  public setPin(x: number, y: number, step: number, label: string): void {
    this.send({ type: 'SET_PIN', x, y, step, label });
  }

  public hidePin(): void {
    this.send({ type: 'HIDE_PIN' });
  }

  public disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  public getConnected(): boolean {
    return this.isConnected;
  }
}
