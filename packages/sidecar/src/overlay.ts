import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface OverlayOptions {
  binaryPath?: string;
  enableNative?: boolean;
}

export class GhostOverlayController {
  private childProcess: ChildProcess | null = null;
  private binaryPath: string;
  private isVisible: boolean = false;
  private lastPin: { x: number; y: number; step: number; label: string } | null = null;

  constructor(options: OverlayOptions = {}) {
    const defaultPath = path.resolve(__dirname, '../bin/ghost-overlay');
    const fallbackPath = path.resolve(__dirname, '../../bin/ghost-overlay');
    this.binaryPath =
      options.binaryPath ||
      (fs.existsSync(defaultPath) ? defaultPath : fallbackPath);
  }

  public start(): boolean {
    if (this.childProcess) {
      return true;
    }

    // Check if the native binary exists (compiled for macOS)
    if (process.platform === 'darwin' && fs.existsSync(this.binaryPath)) {
      try {
        this.childProcess = spawn(this.binaryPath, [], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        this.childProcess.stdout?.on('data', (data) => {
          // stdout response (e.g. ACK show / PONG)
        });

        this.childProcess.stderr?.on('data', (data) => {
          console.error(`[GhostOverlay stderr] ${data.toString().trim()}`);
        });

        this.childProcess.on('exit', (code) => {
          console.log(`[GhostOverlay] Process exited with code ${code}`);
          this.childProcess = null;
          this.isVisible = false;
        });

        console.log(`[GhostOverlay] Native macOS click-through overlay initialized (${this.binaryPath})`);
        return true;
      } catch (err) {
        console.warn(`[GhostOverlay] Could not spawn native overlay: ${err}. Falling back to virtual pin.`);
      }
    } else {
      console.log(`[GhostOverlay] Native macOS binary not found or non-macOS platform. Running in headless/virtual mode.`);
    }

    return false;
  }

  public show(x: number, y: number, step: number, label: string = 'PAUSED'): void {
    this.lastPin = { x, y, step, label };
    this.isVisible = true;

    if (this.childProcess && this.childProcess.stdin && !this.childProcess.stdin.destroyed) {
      this.childProcess.stdin.write(`show ${Math.round(x)} ${Math.round(y)} ${step} ${label}\n`);
    } else {
      console.log(`[GhostOverlay VIRTUAL] Pin placed at (${x}, ${y}) - Step #${step} [${label}]`);
    }
  }

  public hide(): void {
    this.isVisible = false;
    if (this.childProcess && this.childProcess.stdin && !this.childProcess.stdin.destroyed) {
      this.childProcess.stdin.write(`hide\n`);
    } else {
      console.log(`[GhostOverlay VIRTUAL] Pin hidden`);
    }
  }

  public stop(): void {
    if (this.childProcess) {
      try {
        this.childProcess.stdin?.write(`quit\n`);
        this.childProcess.kill('SIGTERM');
      } catch {
        // ignore
      }
      this.childProcess = null;
      this.isVisible = false;
    }
  }

  public getStatus() {
    return {
      active: !!this.childProcess,
      visible: this.isVisible,
      lastPin: this.lastPin
    };
  }
}
