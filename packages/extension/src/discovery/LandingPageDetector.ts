import type * as vscodeType from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';

function getVsCode(): typeof vscodeType | undefined {
  try {
    return require('vscode');
  } catch {
    return undefined;
  }
}

export interface LandingPageCandidate {
  id: string;
  title: string;
  subtitle?: string;
  url: string;
  filePath?: string;
  componentName?: string;
  type: 'html' | 'react' | 'vue' | 'server' | 'custom';
  isRecommended: boolean;
  score: number;
}

export interface WorkspaceSchemaCandidate {
  id: string;
  title: string;
  filePath: string;
  relativeFilePath: string;
  schemaType: 'FLOWCHART' | 'ERD' | 'STATE' | 'GENERIC';
  diagramCount: number;
  sections?: { title: string; index: number; schemaType: string }[];
  isRecommended: boolean;
}

export class LandingPageDetector {
  /**
   * Scans workspace folders for architectural schemas (Mermaid, ERD, State diagrams).
   */
  public static async discoverWorkspaceSchemas(baseFolder?: string): Promise<WorkspaceSchemaCandidate[]> {
    const candidates: WorkspaceSchemaCandidate[] = [];
    const vscode = getVsCode();

    let folderPaths: string[] = [];
    if (baseFolder) {
      folderPaths = [baseFolder];
    } else if (vscode?.workspace?.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      folderPaths = vscode.workspace.workspaceFolders.map(f => f.uri.fsPath);
    } else {
      folderPaths = [process.cwd()];
    }

    for (const folderPath of folderPaths) {
      const knownSchemaFiles = [
        { rel: 'ARCHITECTURE_FLOW.md', title: 'Draft Stack Architecture Flows', type: 'FLOWCHART' as const },
        { rel: 'DATABASE_SCHEMA_ERD.md', title: 'Database Schema ERD (Supabase)', type: 'ERD' as const },
        { rel: 'DESIGN.md', title: 'Design & Visual System Flow', type: 'FLOWCHART' as const },
        { rel: 'DRAFT_STACK__COMPLETE_SYSTEM_.md', title: 'Complete System Architecture Blueprint', type: 'FLOWCHART' as const }
      ];

      for (const item of knownSchemaFiles) {
        const fullPath = path.join(folderPath, item.rel);
        if (fs.existsSync(fullPath)) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            const mermaidMatches = content.match(/```mermaid/gi) || [];
            candidates.push({
              id: `schema_${item.rel.replace(/[/\\.]/g, '_')}`,
              title: item.title,
              filePath: fullPath,
              relativeFilePath: item.rel,
              schemaType: item.type,
              diagramCount: mermaidMatches.length || 1,
              isRecommended: candidates.length === 0
            });
          } catch {}
        }
      }

      // Check for standalone .mmd, .mermaid, .erd files in workspace root and docs/
      const searchDirs = [folderPath, path.join(folderPath, 'docs')];
      for (const dir of searchDirs) {
        if (!fs.existsSync(dir)) continue;
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isFile()) {
              const ext = path.extname(entry.name).toLowerCase();
              if (['.mmd', '.mermaid', '.erd', '.er'].includes(ext)) {
                const fullPath = path.join(dir, entry.name);
                const rel = path.relative(folderPath, fullPath);
                if (!candidates.some(c => c.filePath === fullPath)) {
                  candidates.push({
                    id: `schema_${rel.replace(/[/\\.]/g, '_')}`,
                    title: path.basename(entry.name, ext).replace(/[-_]/g, ' '),
                    filePath: fullPath,
                    relativeFilePath: rel,
                    schemaType: ext.includes('erd') ? 'ERD' : 'FLOWCHART',
                    diagramCount: 1,
                    isRecommended: candidates.length === 0
                  });
                }
              }
            }
          }
        } catch {}
      }
    }

    return candidates;
  }

  /**
   * Scans workspace folders for potential landing/opening pages.
   */
  public static async discoverLandingPages(
    cdpHost: string = '127.0.0.1',
    cdpPort: number = 9222,
    baseFolder?: string
  ): Promise<LandingPageCandidate[]> {
    const candidates: LandingPageCandidate[] = [];
    const vscode = getVsCode();

    // 1. Check active CDP targets (if app is already running under Chrome/Electron)
    const cdpPages = await this.queryCdpTargets(cdpHost, cdpPort);
    for (const p of cdpPages) {
      if (p.type === 'page' && p.url && !p.url.startsWith('chrome-extension://') && !p.url.startsWith('about:')) {
        candidates.push({
          id: `cdp_${p.id}`,
          title: p.title || 'Running Browser Tab',
          subtitle: p.url,
          url: p.url,
          type: 'server',
          isRecommended: true,
          score: 100
        });
      }
    }

    // Determine target folders to scan
    let folderPaths: string[] = [];
    if (baseFolder) {
      folderPaths = [baseFolder];
    } else if (vscode?.workspace?.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      folderPaths = vscode.workspace.workspaceFolders.map(f => f.uri.fsPath);
    } else {
      folderPaths = [process.cwd()];
    }

    // 2. Scan workspace files
    for (const folderPath of folderPaths) {
      let defaultDevUrl = 'http://localhost:3000';
      let isExpo = false;

      // Inspect package.json to detect framework defaults
      const pkgPath = path.join(folderPath, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
          const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
          if (allDeps['expo'] || allDeps['expo-router']) {
            isExpo = true;
            defaultDevUrl = 'http://localhost:8081';
          } else if (allDeps['vite']) {
            defaultDevUrl = 'http://localhost:5173';
          }
        } catch {}
      }

      // Priority 1: Check demo-app/index.html
      const demoIndexPath = path.join(folderPath, 'demo-app', 'index.html');
      if (fs.existsSync(demoIndexPath)) {
        const title = this.extractHtmlTitle(demoIndexPath) || 'Antigravity Cloud Portal (Demo App)';
        const fileUrl = this.pathToUriString(demoIndexPath);
        candidates.push({
          id: 'demo_app_index',
          title: title,
          subtitle: path.relative(folderPath, demoIndexPath),
          url: fileUrl,
          filePath: demoIndexPath,
          componentName: 'AuthSubmitButton',
          type: 'html',
          isRecommended: candidates.length === 0,
          score: 95
        });
      }

      // Priority 2: Standard index.html, public/index.html, src/index.html
      const commonHtmlPaths = [
        path.join(folderPath, 'index.html'),
        path.join(folderPath, 'public', 'index.html'),
        path.join(folderPath, 'src', 'index.html')
      ];

      for (const htmlPath of commonHtmlPaths) {
        if (fs.existsSync(htmlPath) && htmlPath !== demoIndexPath) {
          const title = this.extractHtmlTitle(htmlPath) || path.basename(htmlPath);
          const fileUrl = this.pathToUriString(htmlPath);
          candidates.push({
            id: `html_${path.relative(folderPath, htmlPath)}`,
            title: title,
            subtitle: path.relative(folderPath, htmlPath),
            url: fileUrl,
            filePath: htmlPath,
            type: 'html',
            isRecommended: candidates.length === 0,
            score: 85
          });
        }
      }

      // Priority 3: Expo Router, React, Next.js, and Vue landing page files
      const frameworkEntryPoints = [
        // Expo Router / React Native Web
        { rel: 'app/index.tsx', comp: 'IndexScreen', type: 'react' as const, score: 95, title: 'Draft Stack App Index (Expo Router)' },
        { rel: 'app/_layout.tsx', comp: 'RootLayout', type: 'react' as const, score: 92, title: 'Root Layout (Expo Router)' },
        { rel: 'app/(tabs)/index.tsx', comp: 'HomeScreen', type: 'react' as const, score: 90, title: 'Home Tabs Screen (Expo Router)' },
        { rel: 'app/(tabs)/draft.tsx', comp: 'DraftRoomScreen', type: 'react' as const, score: 88, title: 'Draft Room Screen (Expo Router)' },
        // Standard Next.js & React/Vue
        { rel: 'app/page.tsx', comp: 'Page', type: 'react' as const, score: 85, title: '<Page /> Landing Root' },
        { rel: 'pages/index.tsx', comp: 'HomePage', type: 'react' as const, score: 85, title: '<HomePage /> Landing Root' },
        { rel: 'src/App.tsx', comp: 'App', type: 'react' as const, score: 80, title: '<App /> Landing Root' },
        { rel: 'src/App.jsx', comp: 'App', type: 'react' as const, score: 80, title: '<App /> Landing Root' },
        { rel: 'src/App.vue', comp: 'App', type: 'vue' as const, score: 80, title: '<App /> Landing Root' },
        { rel: 'src/main.tsx', comp: 'Root', type: 'react' as const, score: 75, title: '<Root /> Landing Root' },
        { rel: 'src/main.ts', comp: 'Root', type: 'vue' as const, score: 70, title: '<Root /> Landing Root' }
      ];

      for (const entry of frameworkEntryPoints) {
        const fullPath = path.join(folderPath, entry.rel);
        if (fs.existsSync(fullPath)) {
          candidates.push({
            id: `entry_${entry.rel.replace(/[/\\.]/g, '_')}`,
            title: entry.title || `<${entry.comp} /> Landing Root`,
            subtitle: entry.rel,
            url: defaultDevUrl,
            filePath: fullPath,
            componentName: entry.comp,
            type: entry.type,
            isRecommended: candidates.length === 0,
            score: entry.score
          });
        }
      }
    }

    // Sort candidates by score descending
    candidates.sort((a, b) => b.score - a.score);

    // If no candidates found, provide a fallback default
    if (candidates.length === 0) {
      candidates.push({
        id: 'default_local',
        title: 'Local Web App (http://localhost:3000)',
        subtitle: 'Default Development Server URL',
        url: 'http://localhost:3000',
        type: 'server',
        isRecommended: true,
        score: 50
      });
    } else {
      // Ensure only the top one is recommended
      candidates.forEach((c, idx) => {
        c.isRecommended = idx === 0;
      });
    }

    return candidates;
  }

  private static pathToUriString(fsPath: string): string {
    const vscode = getVsCode();
    if (vscode?.Uri?.file) {
      try {
        return vscode.Uri.file(fsPath).toString();
      } catch {}
    }
    return `file://${fsPath}`;
  }

  private static extractHtmlTitle(filePath: string): string | null {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const match = content.match(/<title>([^<]+)<\/title>/i);
      if (match && match[1]) {
        return match[1].trim();
      }
      const h1Match = content.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      if (h1Match && h1Match[1]) {
        return h1Match[1].trim();
      }
      const h2Match = content.match(/<h2[^>]*>([^<]+)<\/h2>/i);
      if (h2Match && h2Match[1]) {
        return h2Match[1].trim();
      }
    } catch {}
    return null;
  }

  private static async queryCdpTargets(host: string, port: number): Promise<any[]> {
    return new Promise((resolve) => {
      try {
        const req = http.get(`http://${host}:${port}/json/list`, (res) => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve([]);
            }
          });
        });
        req.on('error', () => resolve([]));
        req.setTimeout(400, () => {
          req.destroy();
          resolve([]);
        });
      } catch {
        resolve([]);
      }
    });
  }
}
