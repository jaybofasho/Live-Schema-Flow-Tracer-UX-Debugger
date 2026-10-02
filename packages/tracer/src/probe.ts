import { extractTargetInfo } from "./events";

export interface TracerConfig {
  sidecarWsUrl?: string;
  enableVisualIndicator?: boolean;
}

export class AntigravityTracerProbe {
  private ws: WebSocket | null = null;
  private isConnected: boolean = false;
  private step: number = 0;
  private sessionId: string = `session_${Date.now()}`;
  private isAssertionMode: boolean = false;
  private assertionOverlayEl: HTMLElement | null = null;
  private inputDebounceTimers: Map<HTMLElement, any> = new Map();

  constructor(config: TracerConfig = {}) {
    this.initListeners();
    this.initNetworkTracing();
    this.initAssertionHotkeys();
    this.connectWs(config.sidecarWsUrl || "ws://127.0.0.1:54321");
    console.log("[AntigravityTracer] In-page probe initialized with Semantic Selectors, Assertion Pinning & Network Correlation.");
  }

  private connectWs(url: string): void {
    try {
      this.ws = new WebSocket(url);
      this.ws.onopen = () => {
        this.isConnected = true;
        console.log("[AntigravityTracer] Connected to sidecar WebSocket.");
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
      this.ws.send(JSON.stringify({ type: "TRIGGER_EVENT", event }));
    }

    // 2. Output for CDP console / Runtime.binding interception
    const cdpHook = (window as any).__flowtracer_cdp_hook || (window as any).__antigravity_cdp_hook;
    if (typeof cdpHook === "function") {
      cdpHook(event);
    }

    // Tag console log with specialized prefix for CDP log listener
    console.debug("__FLOWTRACER_EVENT__", JSON.stringify(event));
    console.debug("__ANTIGRAVITY_TRACER_EVENT__", JSON.stringify(event));
  }

  public assert(assertionType: string = "VISIBLE", target?: HTMLElement | null, expected?: string): void {
    const el = target || document.body;
    const info = extractTargetInfo(el);
    const text = expected || info.text || "";

    this.emit({
      type: "EVENT_ASSERTION",
      assertionType,
      expected: text,
      target: info
    });

    this.showAssertionToast(`✅ Asserted ${assertionType}: "${text.slice(0, 30)}"`);
  }

  public toggleAssertionMode(force?: boolean): void {
    this.isAssertionMode = force !== undefined ? force : !this.isAssertionMode;
    if (this.isAssertionMode) {
      this.renderAssertionBanner();
    } else {
      this.removeAssertionBanner();
    }
  }

  private renderAssertionBanner(): void {
    if (this.assertionOverlayEl) return;
    const banner = document.createElement("div");
    banner.id = "__flowtracer_assert_banner";
    banner.style.position = "fixed";
    banner.style.top = "12px";
    banner.style.left = "50%";
    banner.style.transform = "translateX(-50%)";
    banner.style.zIndex = "999999";
    banner.style.backgroundColor = "#065f46";
    banner.style.color = "#ecfdf5";
    banner.style.padding = "8px 16px";
    banner.style.borderRadius = "20px";
    banner.style.boxShadow = "0 4px 14px rgba(0,0,0,0.3)";
    banner.style.fontFamily = "system-ui, -apple-system, sans-serif";
    banner.style.fontSize = "13px";
    banner.style.fontWeight = "600";
    banner.style.pointerEvents = "auto";
    banner.style.cursor = "pointer";
    banner.innerHTML = `🎯 <b>ASSERTION MODE ACTIVE</b> — Click any element to pin assertion (Press Esc or ${navigator.platform.includes("Mac") ? "⌃⌘A" : "Alt+Shift+A"} to exit)`;

    banner.onclick = () => this.toggleAssertionMode(false);
    document.body.appendChild(banner);
    this.assertionOverlayEl = banner;
  }

  private removeAssertionBanner(): void {
    if (this.assertionOverlayEl && this.assertionOverlayEl.parentNode) {
      this.assertionOverlayEl.parentNode.removeChild(this.assertionOverlayEl);
      this.assertionOverlayEl = null;
    }
  }

  private showAssertionToast(message: string): void {
    const toast = document.createElement("div");
    toast.style.position = "fixed";
    toast.style.bottom = "24px";
    toast.style.right = "24px";
    toast.style.zIndex = "999999";
    toast.style.backgroundColor = "#047857";
    toast.style.color = "#ffffff";
    toast.style.padding = "10px 18px";
    toast.style.borderRadius = "8px";
    toast.style.boxShadow = "0 6px 16px rgba(0,0,0,0.25)";
    toast.style.fontFamily = "system-ui, sans-serif";
    toast.style.fontSize = "13px";
    toast.style.transition = "opacity 0.3s ease";
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 350);
    }, 2200);
  }

  private initAssertionHotkeys(): void {
    window.addEventListener("keydown", (e: KeyboardEvent) => {
      const isMac = navigator.platform.includes("Mac");
      const key = e.key.toLowerCase();

      if (e.key === "Escape" && this.isAssertionMode) {
        this.toggleAssertionMode(false);
        return;
      }

      const matchMac = isMac && (e.ctrlKey && e.metaKey && key === "a");
      const matchWin = (e.altKey && e.shiftKey && key === "a");

      if (matchMac || matchWin) {
        e.preventDefault();
        this.toggleAssertionMode();
      }
    }, true);
  }

  private initNetworkTracing(): void {
    const probe = this;

    // 1. Wrap window.fetch
    if (typeof window !== "undefined" && window.fetch) {
      const origFetch = window.fetch;
      window.fetch = async function (...args) {
        const start = Date.now();
        const reqUrl = typeof args[0] === "string" ? args[0] : (args[0] as Request)?.url || "";
        const method = (args[1]?.method || "GET").toUpperCase();

        try {
          const response = await origFetch.apply(this, args);
          const durationMs = Date.now() - start;

          // Exclude internal telemetry calls
          if (!reqUrl.includes("54321") && !reqUrl.includes("__flowtracer")) {
            probe.emit({
              type: "EVENT_NETWORK",
              method,
              url: reqUrl,
              status: response.status,
              durationMs
            });
          }
          return response;
        } catch (err: any) {
          const durationMs = Date.now() - start;
          probe.emit({
            type: "EVENT_NETWORK",
            method,
            url: reqUrl,
            status: 0,
            error: err.message,
            durationMs
          });
          throw err;
        }
      };
    }

    // 2. Wrap XMLHttpRequest
    if (typeof window !== "undefined" && window.XMLHttpRequest) {
      const origOpen = XMLHttpRequest.prototype.open;
      const origSend = XMLHttpRequest.prototype.send;

      XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: any[]) {
        (this as any).__flow_method = method;
        (this as any).__flow_url = String(url);
        return origOpen.apply(this, [method, url, ...rest] as any);
      };

      XMLHttpRequest.prototype.send = function (...args: any[]) {
        const start = Date.now();
        const xhr = this;

        xhr.addEventListener("loadend", () => {
          const url = (xhr as any).__flow_url || "";
          const method = ((xhr as any).__flow_method || "GET").toUpperCase();
          if (!url.includes("54321") && !url.includes("__flowtracer")) {
            probe.emit({
              type: "EVENT_NETWORK",
              method,
              url,
              status: xhr.status,
              durationMs: Date.now() - start
            });
          }
        });

        return origSend.apply(this, args as any);
      };
    }
  }

  public async replay(timeline: any[], options: { speed?: number; highlight?: boolean } = {}): Promise<void> {
    const speed = options.speed || 1;
    const highlight = options.highlight !== false;

    console.log(`[AntigravityTracer] Starting in-page replay (${timeline.length} steps, ${speed}x speed)...`);

    for (const item of timeline) {
      const details = item.details || item;
      const targetMeta = details.target;

      let el: HTMLElement | null = null;
      if (targetMeta) {
        if (targetMeta.testId) {
          el = document.querySelector(`[data-testid="${CSS.escape(targetMeta.testId)}"]`);
        }
        if (!el && targetMeta.resilientSelector) {
          try { el = document.querySelector(targetMeta.resilientSelector); } catch {}
        }
        if (!el && targetMeta.selector) {
          try { el = document.querySelector(targetMeta.selector); } catch {}
        }
      }

      if (el && highlight) {
        const origOutline = el.style.outline;
        const origTransition = el.style.transition;
        el.style.transition = "outline 0.2s ease";
        el.style.outline = "3px solid #38bdf8";
        await new Promise(r => setTimeout(r, 200 / speed));
        el.style.outline = origOutline;
        el.style.transition = origTransition;
      }

      if (item.type === "EVENT_CLICK" && el) {
        el.click();
      } else if (item.type === "EVENT_INPUT" && el) {
        const val = details.valueMasked || details.value || "test";
        (el as HTMLInputElement).value = val;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (item.type === "EVENT_NAVIGATE" && details.url) {
        if (details.url !== window.location.href) {
          window.location.href = details.url;
          return; // Browser will navigate
        }
      }

      await new Promise(r => setTimeout(r, 400 / speed));
    }

    console.log("[AntigravityTracer] Replay finished successfully.");
  }

  private initListeners(): void {
    // 1. Click Listener (capture phase)
    window.addEventListener(
      "click",
      (e: MouseEvent) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;

        // If in assertion mode, intercept the click and record assertion instead
        if (this.isAssertionMode) {
          e.preventDefault();
          e.stopPropagation();
          const info = extractTargetInfo(target);
          this.assert("VISIBLE", target, info.text);
          this.toggleAssertionMode(false);
          return;
        }

        const info = extractTargetInfo(target);
        this.emit({
          type: "EVENT_CLICK",
          x: e.clientX,
          y: e.clientY,
          target: info
        });
      },
      true
    );

    // 2. Input / Typing Listener with debounce & password masking
    const handleInput = (e: Event) => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement | null;
      if (!target || !target.tagName) return;

      const tag = target.tagName.toLowerCase();
      if (tag !== "input" && tag !== "textarea" && tag !== "select") return;

      const isPassword = target.type === "password";
      const rawVal = target.value || "";
      const valMasked = isPassword ? "••••••••" : rawVal;

      clearTimeout(this.inputDebounceTimers.get(target));
      const timer = setTimeout(() => {
        const info = extractTargetInfo(target);
        this.emit({
          type: "EVENT_INPUT",
          value: isPassword ? "***" : rawVal,
          valueMasked: valMasked,
          target: info
        });
      }, 300);
      this.inputDebounceTimers.set(target, timer);
    };

    window.addEventListener("input", handleInput, true);
    window.addEventListener("change", handleInput, true);

    // 3. Form Submit Listener
    window.addEventListener(
      "submit",
      (e: SubmitEvent) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const info = extractTargetInfo(target);
        this.emit({
          type: "EVENT_SUBMIT",
          target: info
        });
      },
      true
    );

    // 4. Navigation / URL changes
    let lastUrl = window.location.href;
    const checkNavigation = () => {
      if (window.location.href !== lastUrl) {
        const prev = lastUrl;
        lastUrl = window.location.href;
        this.emit({
          type: "EVENT_NAVIGATE",
          url: lastUrl,
          previousUrl: prev
        });
      }
    };

    window.addEventListener("popstate", checkNavigation);
    window.addEventListener("hashchange", checkNavigation);

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
if (typeof window !== "undefined") {
  if (!(window as any).__flowtracer_probe && !(window as any).__antigravity_tracer) {
    const probe = new AntigravityTracerProbe();
    (window as any).__flowtracer_probe = probe;
    (window as any).__antigravity_tracer = probe;
  }
}
