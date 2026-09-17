import { exec } from 'child_process';
import { FrameSample } from './protocol';

export class ScreenCaptureManager {
  private lastCoordinates = { x: 0, y: 0 };
  private isSampling = false;

  constructor() {}

  /**
   * Returns current cached cursor coordinates instantly without blocking the event loop.
   * Also triggers an asynchronous background update on macOS.
   */
  public getCursorPosition(): { x: number; y: number } {
    this.refreshCursorPositionAsync();
    return this.lastCoordinates;
  }

  public setCoordinates(x: number, y: number): void {
    this.lastCoordinates = { x, y };
  }

  private refreshCursorPositionAsync(): void {
    if (this.isSampling || process.platform !== 'darwin') return;
    this.isSampling = true;

    const jxa = `ObjC.import('CoreGraphics');
var pt = $.CGEventGetLocation($.CGEventCreate(null));
JSON.stringify({ x: Math.round(pt.x), y: Math.round(pt.y) });`;

    exec(`osascript -l JavaScript -e "${jxa.replace(/\n/g, ' ')}"`, (err, stdout) => {
      this.isSampling = false;
      if (!err && stdout) {
        try {
          const parsed = JSON.parse(stdout.trim());
          if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
            this.lastCoordinates = parsed;
          }
        } catch {}
      }
    });
  }

  public captureScreenSample(frameId: string): FrameSample {
    return {
      frameId,
      timestamp: Date.now(),
      width: 1920,
      height: 1080
    };
  }
}
