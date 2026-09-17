import { extractTargetInfo } from './events';

export interface TracerConfig {
  sidecarWsUrl?: string;
  enableVisualIndicator?: boolean;
}

export class AntigravityTracerProbe {
  private ws: WebSocket | null = null;
  private isConnected: boolean = false;
  private step: number = 0;
  private sessionId: string = `session_${Date.now()}`;

  constructor(config: TracerConfig = {}) {
    this.initListeners();
    this.connectWs(config.sidecarWsUrl || 'ws://127.0.0.1:54321');
    console.log('[AntigravityTracer] In-page probe initialized.');
  }

  private connectWs(url: string): void {
    try {
      this.ws = new WebSocket(url);
      this.ws.onopen = () => {
        this.isConnected = true;
        console.log('[AntigravityTracer] Connected to sidecar WebSocket.');
      };
      this.ws.onclose = () => {
        this.isConnected = false;
        // Retry connection after 2 seconds
        setTimeout(() => this.connectWs(url), 2000);
      };
      this.ws.onerror = () => {
        // Will trigger onclose
      };
    } catch {
      // WS not available or blocked
    }
  }

  public emit(event: any): void {
    this.step++;
    event.step = this.step;
    event.sessionId = this.sessionId;
    event.timestamp = Date.now();

    // 1. Send via WebSocket if open
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'TRIGGER_EVENT', event }));
    }

    // 2. Output for CDP console / Runtime.binding interception
    const cdpHook = (window as any).__flowtracer_cdp_hook || (window as any).__antigravity_cdp_hook;
    if (typeof cdpHook === 'function') {
      cdpHook(event);
    }

    // Tag console log with specialized prefix for CDP log listener
    console.debug('__FLOWTRACER_EVENT__', JSON.stringify(event));
    console.debug('__ANTIGRAVITY_TRACER_EVENT__', JSON.stringify(event));
  }

  private initListeners(): void {
    // 1. Click Listener (capture phase)
    window.addEventListener(
      'click',
      (e: MouseEvent) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const info = extractTargetInfo(target);
        this.emit({
          type: 'EVENT_CLICK',
          x: e.clientX,
          y: e.clientY,
          target: info
        });
      },
      true
    );

    // 2. Form Submit Listener
    window.addEventListener(
      'submit',
      (e: SubmitEvent) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const info = extractTargetInfo(target);
        this.emit({
          type: 'EVENT_SUBMIT',
          target: info
        });
      },
      true
    );

    // 3. Navigation / URL changes
    let lastUrl = window.location.href;
    const checkNavigation = () => {
      if (window.location.href !== lastUrl) {
        const prev = lastUrl;
        lastUrl = window.location.href;
        this.emit({
          type: 'EVENT_NAVIGATE',
          url: lastUrl,
          previousUrl: prev
        });
      }
    };

    window.addEventListener('popstate', checkNavigation);
    window.addEventListener('hashchange', checkNavigation);

    const origPushState = history.pushState;
    history.pushState = function (...args) {
      const res = origPushState.apply(this, args);
      checkNavigation();
      return res;
    };

    const origReplaceState = history.replaceState;
    history.replaceState = function (...args) {
      const res = origReplaceState.apply(this, args);
      checkNavigation();
      return res;
    };
  }
}

// Auto-initialize when injected
if (typeof window !== 'undefined') {
  if (!(window as any).__flowtracer_probe && !(window as any).__antigravity_tracer) {
    const probe = new AntigravityTracerProbe();
    (window as any).__flowtracer_probe = probe;
    (window as any).__antigravity_tracer = probe;
  }
}
