import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface ResolvedSourceLocation {
  uri: vscode.Uri;
  line: number;
  column: number;
  functionName?: string;
}

export class SourceMapResolver {
  /**
   * Resolves a component name or file hint to an actual file in the VS Code workspace.
   */
  public static async resolveLocation(
    filePath?: string,
    componentName?: string,
    handlerName?: string
  ): Promise<ResolvedSourceLocation | null> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null;
    }

    // 1. Direct file path match if provided
    if (filePath) {
      // If absolute path and exists
      if (fs.existsSync(filePath)) {
        return {
          uri: vscode.Uri.file(filePath),
          line: 1,
          column: 1,
          functionName: handlerName
        };
      }

      // If relative, search in workspace folders
      const baseName = path.basename(filePath);
      const matchedFiles = await vscode.workspace.findFiles(`**/${baseName}`, '**/node_modules/**', 1);
      if (matchedFiles.length > 0) {
        return {
          uri: matchedFiles[0],
          line: 1,
          column: 1,
          functionName: handlerName
        };
      }
    }

    // 2. Component name search (e.g. "LoginForm.tsx", "CheckoutButton.vue")
    if (componentName) {
      const candidates = [
        `**/${componentName}.tsx`,
        `**/${componentName}.jsx`,
        `**/${componentName}.vue`,
        `**/${componentName}.js`,
        `**/${componentName}.ts`
      ];

      for (const pattern of candidates) {
        const found = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 1);
        if (found.length > 0) {
          const uri = found[0];
          let line = 1;

          // Try to locate handler inside the file
          if (handlerName) {
            try {
              const doc = await vscode.workspace.openTextDocument(uri);
              const text = doc.getText();
              const regex = new RegExp(`(function\\s+${handlerName}|const\\s+${handlerName}\\s*=|${handlerName}\\s*\\()`);
              const match = regex.exec(text);
              if (match) {
                const pos = doc.positionAt(match.index);
                line = pos.line + 1;
              }
            } catch {}
          }

          return {
            uri,
            line,
            column: 1,
            functionName: handlerName
          };
        }
      }
    }

    return null;
  }
}
