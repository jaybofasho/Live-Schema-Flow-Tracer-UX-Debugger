/**
 * Core unified communication protocol for Antigravity Live Recording,
 * UX-Mapping, and Dynamic Debugging.
 */

export interface DomTargetInfo {
  tagName: string;
  selector: string;
  id?: string;
  className?: string;
  text?: string;
  componentName?: string;
  filePath?: string;
  lineNumber?: number;
  columnNumber?: number;
  handlerName?: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface GhostPin {
  x: number;
  y: number;
  step: number;
  timestamp: number;
  label?: string;
}

export interface FrameSample {
  frameId: string;
  timestamp: number;
  dataUri?: string;
  width?: number;
  height?: number;
}

export type TracerMessage =
  | {
      type: 'EVENT_CLICK';
      sessionId: string;
      step: number;
      timestamp: number;
      x: number;
      y: number;
      target: DomTargetInfo;
      frameId?: string;
    }
  | {
      type: 'EVENT_INPUT';
      sessionId: string;
      step: number;
      timestamp: number;
      x: number;
      y: number;
      target: DomTargetInfo;
      valueMasked?: string;
    }
  | {
      type: 'EVENT_SUBMIT';
      sessionId: string;
      step: number;
      timestamp: number;
      target: DomTargetInfo;
    }
  | {
      type: 'EVENT_NAVIGATE';
      sessionId: string;
      step: number;
      timestamp: number;
      url: string;
      previousUrl?: string;
    }
  | {
      type: 'HOTKEY_PAUSE';
      sessionId: string;
      step: number;
      timestamp: number;
      x: number;
      y: number;
      frozen: boolean;
    }
  | {
      type: 'HOTKEY_RESUME';
      sessionId: string;
      timestamp: number;
    }
  | {
      type: 'HOTKEY_COMMENT';
      sessionId: string;
      step: number;
      timestamp: number;
      comment: string;
    }
  | {
      type: 'HOTKEY_DEBUG';
      sessionId: string;
      step: number;
      timestamp: number;
      target?: DomTargetInfo;
    }
  | {
      type: 'STATE_TRANSITION';
      sessionId: string;
      timestamp: number;
      fromState: string;
      toState: string;
      trigger: string;
    }
  | {
      type: 'SESSION_START';
      sessionId: string;
      timestamp: number;
      appName?: string;
    }
  | {
      type: 'SESSION_STOP';
      sessionId: string;
      timestamp: number;
      totalSteps: number;
    }
  | {
      type: 'OVERLAY_PIN_UPDATE';
      x: number;
      y: number;
      step: number;
      label?: string;
      visible: boolean;
    };

export interface SidecarStatus {
  online: boolean;
  activeSessionId?: string;
  currentStep: number;
  isPaused: boolean;
  lastCoordinates: { x: number; y: number };
  overlayActive: boolean;
}
