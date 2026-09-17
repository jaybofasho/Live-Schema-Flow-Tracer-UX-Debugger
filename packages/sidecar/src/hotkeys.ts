import { EventEmitter } from 'events';

export type HotkeyAction = 'pause' | 'resume' | 'comment' | 'debug';

export class GlobalHotkeyManager extends EventEmitter {
  private isListening: boolean = false;
  private isPaused: boolean = false;

  constructor() {
    super();
  }

  public start(): void {
    if (this.isListening) return;
    this.isListening = true;
    const isMac = process.platform === 'darwin';
    console.log('[HotkeyManager] Global hotkey listener active:');
    if (isMac) {
      console.log('  - ⌃⌘P / ⌥⌘P (Option+Shift+P) : Pause/Resume live session & Ghost Pin');
      console.log('  - ⌃⌘C / ⌥⌘C (Option+Shift+C) : Add user note / comment marker');
      console.log('  - ⌃⌘D / ⌥⌘D (Option+Shift+D) : Trigger Dynamic Breakpoint in IDE');
    } else {
      console.log('  - Alt+Shift+P : Pause/Resume live session & Ghost Pin');
      console.log('  - Alt+Shift+C : Add user note / comment marker');
      console.log('  - Alt+Shift+D : Trigger Dynamic Breakpoint in IDE');
    }
  }

  public stop(): void {
    this.isListening = false;
  }

  public triggerHotkey(action: HotkeyAction, payload?: any): void {
    if (action === 'pause') {
      this.isPaused = !this.isPaused;
      this.emit(this.isPaused ? 'hotkey:pause' : 'hotkey:resume', payload);
    } else if (action === 'comment') {
      this.emit('hotkey:comment', payload);
    } else if (action === 'debug') {
      this.emit('hotkey:debug', payload);
    }
  }

  public getPausedState(): boolean {
    return this.isPaused;
  }

  public setPausedState(paused: boolean): void {
    this.isPaused = paused;
  }
}
