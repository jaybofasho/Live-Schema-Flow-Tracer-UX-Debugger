import * as vscode from 'vscode';
import { SourceMapResolver } from '../cdp/SourceMapResolver';

export class DebugController {
  private activeBreakpoints: vscode.SourceBreakpoint[] = [];

  public async setInlineBreakpoint(
    filePath?: string,
    componentName?: string,
    handlerName?: string,
    lineHint?: number
  ): Promise<boolean> {
    const loc = await SourceMapResolver.resolveLocation(filePath, componentName, handlerName);

    if (!loc) {
      vscode.window.showWarningMessage(
        `Antigravity Debugger: Could not resolve source file for ${componentName || 'component'} (${handlerName || 'handler'}).`
      );
      return false;
    }

    const targetLine = lineHint || loc.line || 1;
    const position = new vscode.Position(targetLine - 1, 0);
    const location = new vscode.Location(loc.uri, position);

    const breakpoint = new vscode.SourceBreakpoint(location, true);
    this.activeBreakpoints.push(breakpoint);
    vscode.debug.addBreakpoints([breakpoint]);

    // Open and reveal the file in editor
    try {
      const doc = await vscode.workspace.openTextDocument(loc.uri);
      const editor = await vscode.window.showTextDocument(doc, {
        preview: false,
        selection: new vscode.Range(position, position)
      });
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    } catch (err) {
      console.error('Failed to open document:', err);
    }

    vscode.window.showInformationMessage(
      `🛑 Antigravity: Dynamic breakpoint placed at ${vscode.workspace.asRelativePath(loc.uri)}:${targetLine} [${handlerName || componentName || 'handler'}]`
    );

    return true;
  }

  public clearDynamicBreakpoints(): void {
    if (this.activeBreakpoints.length > 0) {
      vscode.debug.removeBreakpoints(this.activeBreakpoints);
      this.activeBreakpoints = [];
    }
  }
}
