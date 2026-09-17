import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export class SidecarProcess {
  private process: ChildProcess | null = null;
  private isRunning: boolean = false;

  constructor() {}

  public start(): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.isRunning && this.process) {
        return resolve(true);
      }

      let sidecarScript = path.resolve(__dirname, '../../../sidecar/dist/index.js');

      if (!fs.existsSync(sidecarScript)) {
        const workspacePath = path.resolve('/Users/jarrod/.gemini/antigravity-ide/scratch/antigravity-tracer/packages/sidecar/dist/index.js');
        if (fs.existsSync(workspacePath)) {
          sidecarScript = workspacePath;
        } else {
          console.warn(`[SidecarProcess] Sidecar script not found at ${sidecarScript}. Please build @antigravity/sidecar.`);
          return resolve(false);
        }
      }

      try {
        this.process = spawn(process.execPath, [sidecarScript], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, SIDECAR_PORT: '54321', SIDECAR_HOST: '127.0.0.1' }
        });

        this.isRunning = true;

        this.process.stdout?.on('data', (data) => {
          console.log(`[SidecarDaemon stdout] ${data.toString().trim()}`);
        });

        this.process.stderr?.on('data', (data) => {
          console.error(`[SidecarDaemon stderr] ${data.toString().trim()}`);
        });

        this.process.on('exit', (code) => {
          console.log(`[SidecarDaemon] Process exited with code ${code}`);
          this.isRunning = false;
          this.process = null;
        });

        // Give process a moment to bind port
        setTimeout(() => resolve(true), 600);
      } catch (err) {
        console.error(`[SidecarProcess] Failed to launch daemon: ${err}`);
        resolve(false);
      }
    });
  }

  public stop(): void {
    if (this.process) {
      try {
        this.process.kill('SIGTERM');
      } catch {}
      this.process = null;
      this.isRunning = false;
    }
  }

  public getStatus() {
    return {
      running: this.isRunning,
      pid: this.process?.pid
    };
  }
}
