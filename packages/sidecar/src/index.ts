import { WebSocketServer, WebSocket } from 'ws';
import * as http from 'http';
import { GhostOverlayController } from './overlay';
import { ScreenCaptureManager } from './capture';
import { GlobalHotkeyManager } from './hotkeys';
import { TracerMessage, SidecarStatus } from './protocol';

const PORT = parseInt(process.env.SIDECAR_PORT || '54321', 10);
const HOST = process.env.SIDECAR_HOST || '127.0.0.1';

export class SidecarServer {
  public readonly port: number;
  public readonly host: string;
  private server: http.Server;
  private wss: WebSocketServer;
  private overlay: GhostOverlayController;
  private capture: ScreenCaptureManager;
  private hotkeys: GlobalHotkeyManager;

  private activeSessionId: string | null = null;
  private currentStep: number = 0;
  private isPaused: boolean = false;
  private clients: Set<WebSocket> = new Set();

  constructor(
    port: number = parseInt(process.env.SIDECAR_PORT || '54321', 10),
    host: string = process.env.SIDECAR_HOST || '127.0.0.1'
  ) {
    this.port = port;
    this.host = host;
    this.overlay = new GhostOverlayController();
    this.capture = new ScreenCaptureManager();
    this.hotkeys = new GlobalHotkeyManager();

    this.server = http.createServer((req, res) => {
      // Basic HTTP health & control endpoints
      const url = new URL(req.url || '/', `http://${this.host}:${this.port}`);

      if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', time: Date.now() }));
        return;
      }

      if (url.pathname === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.getStatus()));
        return;
      }

      if (url.pathname === '/api/hotkey' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.action) {
              this.hotkeys.triggerHotkey(data.action, data.payload);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, action: data.action }));
              return;
            }
          } catch {}
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid hotkey payload' }));
        });
        return;
      }

      res.writeHead(404);
      res.end();
    });

    this.wss = new WebSocketServer({ server: this.server });
    this.setupWebSockets();
    this.setupHotkeyListeners();
  }

  private setupWebSockets(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('[Sidecar] Client connected to WebSocket');
      this.clients.add(ws);

      // Send current state immediately upon connection
      ws.send(JSON.stringify({
        type: 'SIDECAR_STATUS',
        status: this.getStatus()
      }));

      ws.on('message', (data: string) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleClientMessage(ws, msg);
        } catch (e) {
          console.error('[Sidecar] Malformed WebSocket message:', e);
        }
      });

      ws.on('close', () => {
        console.log('[Sidecar] Client disconnected');
        this.clients.delete(ws);
      });
    });
  }

  private setupHotkeyListeners(): void {
    this.hotkeys.on('hotkey:pause', () => {
      this.handlePauseToggle();
    });

    this.hotkeys.on('hotkey:resume', () => {
      this.handleResume();
    });

    this.hotkeys.on('hotkey:comment', (payload) => {
      const coords = this.capture.getCursorPosition();
      this.broadcast({
        type: 'HOTKEY_COMMENT',
        sessionId: this.activeSessionId || 'default',
        step: this.currentStep,
        timestamp: Date.now(),
        comment: payload?.comment || 'User note added'
      });
    });

    this.hotkeys.on('hotkey:debug', (payload) => {
      this.broadcast({
        type: 'HOTKEY_DEBUG',
        sessionId: this.activeSessionId || 'default',
        step: this.currentStep,
        timestamp: Date.now(),
        target: payload?.target
      });
    });
  }

  private handlePauseToggle(): void {
    this.isPaused = !this.isPaused;
    const coords = this.capture.getCursorPosition();

    if (this.isPaused) {
      console.log(`[Sidecar] Pausing session at (${coords.x}, ${coords.y}). Placing Ghost Mouse Pin.`);
      this.overlay.show(coords.x, coords.y, this.currentStep, 'PAUSED');

      this.broadcast({
        type: 'HOTKEY_PAUSE',
        sessionId: this.activeSessionId || 'default',
        step: this.currentStep,
        timestamp: Date.now(),
        x: coords.x,
        y: coords.y,
        frozen: true
      });
    } else {
      this.handleResume();
    }
  }

  private handleResume(): void {
    this.isPaused = false;
    this.overlay.hide();
    console.log('[Sidecar] Resumed session. Ghost Mouse Pin hidden.');

    this.broadcast({
      type: 'HOTKEY_RESUME',
      sessionId: this.activeSessionId || 'default',
      timestamp: Date.now()
    });
  }

  private handleClientMessage(sender: WebSocket, msg: any): void {
    switch (msg.type) {
      case 'START_SESSION':
        this.activeSessionId = msg.sessionId || `session_${Date.now()}`;
        this.currentStep = 0;
        this.isPaused = false;
        this.overlay.start();
        this.hotkeys.start();
        console.log(`[Sidecar] Session started: ${this.activeSessionId}`);
        this.broadcast({
          type: 'SESSION_START',
          sessionId: this.activeSessionId,
          timestamp: Date.now(),
          appName: msg.appName
        });
        break;

      case 'STOP_SESSION':
        console.log(`[Sidecar] Session stopped: ${this.activeSessionId}`);
        const endedSession = this.activeSessionId;
        const total = this.currentStep;
        this.overlay.hide();
        this.activeSessionId = null;
        this.isPaused = false;
        this.broadcast({
          type: 'SESSION_STOP',
          sessionId: endedSession || 'default',
          timestamp: Date.now(),
          totalSteps: total
        });
        break;

      case 'TRIGGER_EVENT':
        if (msg.event) {
          this.currentStep++;
          msg.event.step = this.currentStep;
          msg.event.sessionId = this.activeSessionId || 'default';
          if (msg.event.x && msg.event.y) {
            this.capture.setCoordinates(msg.event.x, msg.event.y);
          }
          this.broadcast(msg.event as TracerMessage);
        }
        break;

      case 'TRIGGER_HOTKEY':
        if (msg.action) {
          this.hotkeys.triggerHotkey(msg.action, msg.payload);
        }
        break;

      case 'SET_PIN':
        this.overlay.show(msg.x, msg.y, msg.step || this.currentStep, msg.label || 'PINNED');
        break;

      case 'HIDE_PIN':
        this.overlay.hide();
        break;
    }
  }

  public broadcast(msg: TracerMessage | any): void {
    const serialized = JSON.stringify(msg);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(serialized);
      }
    }
  }

  public getStatus(): SidecarStatus {
    const coords = this.capture.getCursorPosition();
    const overlayStatus = this.overlay.getStatus();
    return {
      online: true,
      activeSessionId: this.activeSessionId || undefined,
      currentStep: this.currentStep,
      isPaused: this.isPaused,
      lastCoordinates: coords,
      overlayActive: overlayStatus.active
    };
  }

  public start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, this.host, () => {
        console.log(`[Sidecar] Daemon listening on http://${this.host}:${this.port} & ws://${this.host}:${this.port}`);
        this.overlay.start();
        this.hotkeys.start();
        resolve();
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      this.overlay.stop();
      this.hotkeys.stop();
      for (const client of this.clients) {
        try { client.terminate(); } catch {}
      }
      this.clients.clear();
      this.wss.close(() => {
        if (typeof (this.server as any).closeAllConnections === 'function') {
          (this.server as any).closeAllConnections();
        }
        this.server.close(() => {
          resolve();
        });
      });
    });
  }
}

// Direct execution entrypoint
if (require.main === module) {
  const server = new SidecarServer();
  server.start().catch((err) => {
    console.error('Failed to start Sidecar daemon:', err);
    process.exit(1);
  });
}
