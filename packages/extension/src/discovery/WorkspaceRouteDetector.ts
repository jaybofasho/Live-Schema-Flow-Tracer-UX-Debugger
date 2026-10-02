import * as path from 'path';
import * as fs from 'fs';
import type * as vscodeType from 'vscode';

function getVsCode(): typeof vscodeType | undefined {
  try {
    return require('vscode');
  } catch {
    return undefined;
  }
}

export type RouteSource =
  | 'expo-router'
  | 'next-app'
  | 'next-pages'
  | 'sveltekit'
  | 'remix'
  | 'react-router'
  | 'vue-router'
  | 'html'
  | 'flow-graph'
  | 'custom'
  | 'default';

export interface WorkspaceRoute {
  path: string;              // URL path, e.g. "/(tabs)/stack" or "/stack" or "/"
  cleanPath?: string;        // Clean path without grouping parens, e.g. "/stack"
  label: string;             // Display chip text, e.g. "/stack" or "/ (Home)"
  filePath?: string;         // Absolute file path
  relativeFilePath?: string; // Relative to workspace root, e.g. "app/(tabs)/stack.tsx"
  source: RouteSource;
  isDynamic?: boolean;       // True if route contains parameters like [id] or :id
}

export interface WorkspaceRouteScanResult {
  routes: WorkspaceRoute[];
  defaultDevUrl: string;
  framework: 'expo' | 'next' | 'vite' | 'remix' | 'svelte' | 'vue' | 'react' | 'generic';
}

export class WorkspaceRouteDetector {
  /**
   * Scans workspace folders to discover all routes dynamically according to project framework conventions.
   */
  public static async discoverWorkspaceRoutes(
    baseFolder?: string,
    activeModel?: any,
    customRoutes: string[] = []
  ): Promise<WorkspaceRouteScanResult> {
    return this.discoverWorkspaceRoutesSync(baseFolder, activeModel, customRoutes);
  }

  /**
   * Synchronous discovery method for immediate initial render and headless tests.
   */
  public static discoverWorkspaceRoutesSync(
    baseFolder?: string,
    activeModel?: any,
    customRoutes: string[] = []
  ): WorkspaceRouteScanResult {
    const folderPaths = this.getWorkspaceFolders(baseFolder);
    const discovered: WorkspaceRoute[] = [];
    let detectedFramework: WorkspaceRouteScanResult['framework'] = 'generic';
    let defaultDevUrl = 'http://localhost:3000';

    for (const folderPath of folderPaths) {
      if (!fs.existsSync(folderPath)) continue;

      // 1. Detect project framework & dev server default port
      const frameworkInfo = this.detectFrameworkAndPort(folderPath);
      if (frameworkInfo.framework !== 'generic') {
        detectedFramework = frameworkInfo.framework;
        defaultDevUrl = frameworkInfo.defaultDevUrl;
      }

      // 2. Scan Expo Router / Next App Router in app/ and src/app/
      const appDirs = [path.join(folderPath, 'app'), path.join(folderPath, 'src', 'app')];
      for (const appDir of appDirs) {
        if (fs.existsSync(appDir)) {
          const appRoutes = this.scanAppDirectory(appDir, folderPath);
          discovered.push(...appRoutes);
        }
      }

      // 3. Scan Pages Router (Next.js, Nuxt, Vite) in pages/ and src/pages/
      const pagesDirs = [path.join(folderPath, 'pages'), path.join(folderPath, 'src', 'pages')];
      for (const pagesDir of pagesDirs) {
        if (fs.existsSync(pagesDir)) {
          const pagesRoutes = this.scanPagesDirectory(pagesDir, folderPath);
          discovered.push(...pagesRoutes);
        }
      }

      // 4. Scan SvelteKit in src/routes/
      const svelteRoutesDir = path.join(folderPath, 'src', 'routes');
      if (fs.existsSync(svelteRoutesDir)) {
        const svelteRoutes = this.scanSvelteKitDirectory(svelteRoutesDir, folderPath);
        discovered.push(...svelteRoutes);
      }

      // 5. Scan Remix in app/routes/
      const remixRoutesDir = path.join(folderPath, 'app', 'routes');
      if (fs.existsSync(remixRoutesDir)) {
        const remixRoutes = this.scanRemixDirectory(remixRoutesDir, folderPath);
        discovered.push(...remixRoutes);
      }

      // 6. Scan code-based router declarations (React Router, Vue Router)
      const codeRoutes = this.scanCodeRouterDeclarations(folderPath);
      discovered.push(...codeRoutes);

      // 7. Scan static HTML files
      const htmlRoutes = this.scanHtmlFiles(folderPath);
      discovered.push(...htmlRoutes);
    }

    // 8. Add routes from active FlowGraphModel if present
    if (activeModel && activeModel.nodes) {
      const graphRoutes = this.extractRoutesFromGraphModel(activeModel);
      discovered.push(...graphRoutes);
    }

    // 9. Add user custom routes
    for (const cr of customRoutes) {
      if (cr && typeof cr === 'string') {
        const norm = cr.startsWith('/') ? cr : '/' + cr;
        discovered.push({
          path: norm,
          cleanPath: norm,
          label: norm,
          source: 'custom'
        });
      }
    }

    // 10. Deduplicate, format, and sort routes
    const routes = this.deduplicateAndSortRoutes(discovered);

    return {
      routes,
      defaultDevUrl,
      framework: detectedFramework
    };
  }

  /**
   * Scans app/ or src/app/ directory for Expo Router or Next.js App Router files.
   */
  private static scanAppDirectory(appDir: string, rootDir: string): WorkspaceRoute[] {
    const routes: WorkspaceRoute[] = [];
    const entries = this.walkDirSync(appDir);

    for (const filePath of entries) {
      const ext = path.extname(filePath).toLowerCase();
      if (!['.tsx', '.ts', '.jsx', '.js'].includes(ext)) continue;

      const baseName = path.basename(filePath);
      // Skip hidden, layout, error, and test/config files
      if (baseName.startsWith('_') || baseName.startsWith('+')) continue;
      if (baseName.includes('.test.') || baseName.includes('.spec.') || baseName.includes('.d.ts')) continue;

      const relToApp = path.relative(appDir, filePath);
      const segments = relToApp.split(path.sep);

      // Check if any segment is an excluded folder (components, hooks, etc.)
      const excludedDirs = new Set(['components', 'hooks', 'constants', 'styles', 'assets', 'utils', 'lib', 'services', 'types', '__tests__']);
      if (segments.some(seg => excludedDirs.has(seg))) continue;

      const fileWithoutExt = baseName.slice(0, -ext.length);
      const dirSegments = segments.slice(0, -1);

      // Next.js App Router convention: page.tsx defines the route
      if (fileWithoutExt === 'page') {
        const cleanSegments = dirSegments.filter(s => !(s.startsWith('(') && s.endsWith(')')));
        const cleanPath = cleanSegments.length === 0 ? '/' : '/' + cleanSegments.join('/');
        const rawPath = dirSegments.length === 0 ? '/' : '/' + dirSegments.join('/');
        const isDynamic = rawPath.includes('[') || rawPath.includes(':');
        routes.push({
          path: rawPath,
          cleanPath,
          label: cleanPath === '/' ? '/ (Home)' : this.formatRouteLabel(cleanPath),
          filePath,
          relativeFilePath: path.relative(rootDir, filePath),
          source: 'next-app',
          isDynamic
        });
        continue;
      }

      // Expo Router convention: files define routes
      const rawSegments = [...dirSegments, fileWithoutExt];
      let rawPath = '';
      if (rawSegments.length === 1 && rawSegments[0] === 'index') {
        rawPath = '/';
      } else if (fileWithoutExt === 'index') {
        rawPath = '/' + dirSegments.join('/');
      } else {
        rawPath = '/' + rawSegments.join('/');
      }

      // Clean path strips route group folders with parens e.g. (tabs) or (auth)
      const cleanSegments = rawSegments
        .filter(s => !(s.startsWith('(') && s.endsWith(')')));
      
      let cleanPath = '';
      if (cleanSegments.length === 0 || (cleanSegments.length === 1 && cleanSegments[0] === 'index')) {
        cleanPath = '/';
      } else if (cleanSegments[cleanSegments.length - 1] === 'index') {
        cleanPath = '/' + cleanSegments.slice(0, -1).join('/');
      } else {
        cleanPath = '/' + cleanSegments.join('/');
      }

      const isDynamic = rawPath.includes('[') || rawPath.includes(':');
      const label = cleanPath === '/' ? '/ (Home)' : this.formatRouteLabel(cleanPath);

      routes.push({
        path: rawPath,
        cleanPath,
        label,
        filePath,
        relativeFilePath: path.relative(rootDir, filePath),
        source: 'expo-router',
        isDynamic
      });
    }

    return routes;
  }

  /**
   * Scans pages/ or src/pages/ for Next.js Pages router or Nuxt / Vite pages.
   */
  private static scanPagesDirectory(pagesDir: string, rootDir: string): WorkspaceRoute[] {
    const routes: WorkspaceRoute[] = [];
    const entries = this.walkDirSync(pagesDir);

    for (const filePath of entries) {
      const ext = path.extname(filePath).toLowerCase();
      if (!['.tsx', '.ts', '.jsx', '.js', '.vue', '.svelte'].includes(ext)) continue;

      const baseName = path.basename(filePath);
      if (baseName.startsWith('_')) continue; // Skip _app, _document, _error
      if (baseName.includes('.test.') || baseName.includes('.spec.') || baseName.includes('.d.ts')) continue;

      const relToPages = path.relative(pagesDir, filePath);
      const segments = relToPages.split(path.sep);

      // Skip api/ directory inside pages
      if (segments[0] === 'api') continue;

      const fileWithoutExt = baseName.slice(0, -ext.length);
      const dirSegments = segments.slice(0, -1);
      const allSegments = [...dirSegments, fileWithoutExt];

      let rawPath = '';
      if (allSegments.length === 1 && allSegments[0] === 'index') {
        rawPath = '/';
      } else if (fileWithoutExt === 'index') {
        rawPath = '/' + dirSegments.join('/');
      } else {
        rawPath = '/' + allSegments.join('/');
      }

      const cleanPath = this.convertNextDynamicToColon(rawPath);
      const isDynamic = rawPath.includes('[') || rawPath.includes(':');

      routes.push({
        path: rawPath,
        cleanPath,
        label: cleanPath === '/' ? '/ (Home)' : this.formatRouteLabel(cleanPath),
        filePath,
        relativeFilePath: path.relative(rootDir, filePath),
        source: 'next-pages',
        isDynamic
      });
    }

    return routes;
  }

  /**
   * Scans SvelteKit src/routes/ directory.
   */
  private static scanSvelteKitDirectory(routesDir: string, rootDir: string): WorkspaceRoute[] {
    const routes: WorkspaceRoute[] = [];
    const entries = this.walkDirSync(routesDir);

    for (const filePath of entries) {
      const baseName = path.basename(filePath);
      if (baseName.startsWith('+page.')) {
        const rel = path.relative(routesDir, path.dirname(filePath));
        const rawPath = rel === '' || rel === '.' ? '/' : '/' + rel.split(path.sep).join('/');
        routes.push({
          path: rawPath,
          cleanPath: rawPath,
          label: rawPath === '/' ? '/ (Home)' : rawPath,
          filePath,
          relativeFilePath: path.relative(rootDir, filePath),
          source: 'sveltekit',
          isDynamic: rawPath.includes('[')
        });
      }
    }

    return routes;
  }

  /**
   * Scans Remix app/routes/ directory.
   */
  private static scanRemixDirectory(remixDir: string, rootDir: string): WorkspaceRoute[] {
    const routes: WorkspaceRoute[] = [];
    if (!fs.existsSync(remixDir)) return routes;

    try {
      const files = fs.readdirSync(remixDir);
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (!['.tsx', '.ts', '.jsx', '.js'].includes(ext)) continue;

        const nameWithoutExt = file.slice(0, -ext.length);
        let routePath = '/' + nameWithoutExt.replace(/\./g, '/').replace(/^\/_index$/, '').replace(/\$([a-zA-Z0-9_]+)/g, ':$1');
        if (routePath === '') routePath = '/';

        routes.push({
          path: routePath,
          cleanPath: routePath,
          label: routePath === '/' ? '/ (Home)' : routePath,
          filePath: path.join(remixDir, file),
          relativeFilePath: path.relative(rootDir, path.join(remixDir, file)),
          source: 'remix',
          isDynamic: routePath.includes(':')
        });
      }
    } catch {}

    return routes;
  }

  /**
   * Scans source files for code-based router declarations:
   * <Route path="/xyz" /> or path: '/xyz'
   */
  private static scanCodeRouterDeclarations(rootDir: string): WorkspaceRoute[] {
    const routes: WorkspaceRoute[] = [];
    const candidateFiles = [
      path.join(rootDir, 'src', 'App.tsx'),
      path.join(rootDir, 'src', 'App.jsx'),
      path.join(rootDir, 'src', 'routes.tsx'),
      path.join(rootDir, 'src', 'routes.ts'),
      path.join(rootDir, 'src', 'router.tsx'),
      path.join(rootDir, 'src', 'router.ts'),
      path.join(rootDir, 'src', 'router', 'index.ts'),
      path.join(rootDir, 'src', 'router', 'index.js'),
      path.join(rootDir, 'App.tsx'),
      path.join(rootDir, 'App.jsx')
    ];

    for (const cPath of candidateFiles) {
      if (fs.existsSync(cPath)) {
        try {
          const content = fs.readFileSync(cPath, 'utf8');
          // Match <Route path="/..." or path: "/..."
          const routeRegex = /(?:<Route\s+[^>]*path=["']([^"']+)["']|path\s*:\s*["'](\/[a-zA-Z0-9_\-\/:]+)["'])/g;
          let match: RegExpExecArray | null;
          while ((match = routeRegex.exec(content)) !== null) {
            const rPath = match[1] || match[2];
            if (rPath && rPath.startsWith('/') && rPath !== '*' && !routes.some(r => r.path === rPath)) {
              routes.push({
                path: rPath,
                cleanPath: rPath,
                label: rPath === '/' ? '/ (Home)' : rPath,
                filePath: cPath,
                relativeFilePath: path.relative(rootDir, cPath),
                source: 'react-router',
                isDynamic: rPath.includes(':')
              });
            }
          }
        } catch {}
      }
    }

    return routes;
  }

  /**
   * Scans root and demo-app for static HTML files.
   */
  private static scanHtmlFiles(rootDir: string): WorkspaceRoute[] {
    const routes: WorkspaceRoute[] = [];

    // Root index.html
    const rootIndex = path.join(rootDir, 'index.html');
    if (fs.existsSync(rootIndex)) {
      routes.push({
        path: '/',
        cleanPath: '/',
        label: '/ (Home)',
        filePath: rootIndex,
        relativeFilePath: 'index.html',
        source: 'html'
      });
    }

    // demo-app/index.html
    const demoIndex = path.join(rootDir, 'demo-app', 'index.html');
    if (fs.existsSync(demoIndex)) {
      routes.push({
        path: '/demo-app/index.html',
        cleanPath: '/demo-app',
        label: '/demo-app',
        filePath: demoIndex,
        relativeFilePath: 'demo-app/index.html',
        source: 'html'
      });
    }

    return routes;
  }

  /**
   * Extracts routes from nodes in FlowGraphModel.
   */
  private static extractRoutesFromGraphModel(activeModel: any): WorkspaceRoute[] {
    const routes: WorkspaceRoute[] = [];
    if (!activeModel?.nodes) return routes;

    const nodes = activeModel.nodes instanceof Map ? Array.from(activeModel.nodes.values()) : activeModel.nodes;
    for (const node of nodes) {
      const nodeRoute = node.data?.route || node.data?.url || node.route;
      if (nodeRoute && typeof nodeRoute === 'string') {
        let clean = nodeRoute;
        try {
          if (clean.startsWith('http://') || clean.startsWith('https://')) {
            clean = new URL(clean).pathname;
          }
        } catch {}
        if (clean.startsWith('/') && !routes.some(r => r.path === clean)) {
          routes.push({
            path: clean,
            cleanPath: clean,
            label: clean === '/' ? '/ (Home)' : clean,
            source: 'flow-graph'
          });
        }
      }
    }

    return routes;
  }

  /**
   * Detects package framework and default dev port from package.json.
   */
  public static detectFrameworkAndPort(folderPath: string): {
    framework: WorkspaceRouteScanResult['framework'];
    defaultDevUrl: string;
  } {
    const pkgPath = path.join(folderPath, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      return { framework: 'generic', defaultDevUrl: 'http://localhost:3000' };
    }

    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

      if (deps['expo'] || deps['expo-router']) {
        return { framework: 'expo', defaultDevUrl: 'http://localhost:8081' };
      }
      if (deps['next']) {
        return { framework: 'next', defaultDevUrl: 'http://localhost:3000' };
      }
      if (deps['@remix-run/react'] || deps['@remix-run/node']) {
        return { framework: 'remix', defaultDevUrl: 'http://localhost:3000' };
      }
      if (deps['@sveltejs/kit'] || deps['svelte']) {
        return { framework: 'svelte', defaultDevUrl: 'http://localhost:5173' };
      }
      if (deps['vite']) {
        return { framework: 'vite', defaultDevUrl: 'http://localhost:5173' };
      }
      if (deps['vue']) {
        return { framework: 'vue', defaultDevUrl: 'http://localhost:5173' };
      }
      if (deps['react']) {
        return { framework: 'react', defaultDevUrl: 'http://localhost:3000' };
      }
    } catch {}

    return { framework: 'generic', defaultDevUrl: 'http://localhost:3000' };
  }

  /**
   * Converts Next.js parameter syntax /posts/[id] to /posts/:id.
   */
  private static convertNextDynamicToColon(routePath: string): string {
    return routePath.replace(/\[([^\]]+)\]/g, ':$1');
  }

  /**
   * Formats route labels for chip display.
   */
  private static formatRouteLabel(routePath: string): string {
    return this.convertNextDynamicToColon(routePath);
  }

  /**
   * Deduplicates and orders routes:
   * - Root '/' first
   * - Static routes before dynamic parameterized routes
   * - Alphabetical ordering
   */
  private static deduplicateAndSortRoutes(rawRoutes: WorkspaceRoute[]): WorkspaceRoute[] {
    const seen = new Map<string, WorkspaceRoute>();

    for (const r of rawRoutes) {
      const normPath = r.cleanPath || r.path;
      const key = normPath.toLowerCase();

      if (!seen.has(key)) {
        seen.set(key, r);
      } else {
        // Prefer code-defined framework routes over generic or HTML
        const existing = seen.get(key)!;
        if (
          existing.source === 'html' ||
          existing.source === 'default' ||
          (existing.source === 'flow-graph' && r.source !== 'default')
        ) {
          seen.set(key, r);
        }
      }
    }

    const uniqueRoutes = Array.from(seen.values());

    // Ensure '/' exists
    if (!uniqueRoutes.some(r => r.path === '/' || r.cleanPath === '/')) {
      uniqueRoutes.unshift({
        path: '/',
        cleanPath: '/',
        label: '/ (Home)',
        source: 'default'
      });
    }

    // Sort routes:
    // 1. Root '/' is always index 0
    // 2. Non-dynamic routes come before dynamic routes
    // 3. Short paths before deep paths, then alphabetical
    uniqueRoutes.sort((a, b) => {
      const aIsRoot = a.path === '/' || a.cleanPath === '/';
      const bIsRoot = b.path === '/' || b.cleanPath === '/';
      if (aIsRoot) return -1;
      if (bIsRoot) return 1;

      const aDyn = !!a.isDynamic;
      const bDyn = !!b.isDynamic;
      if (!aDyn && bDyn) return -1;
      if (aDyn && !bDyn) return 1;

      const aLabel = a.label || a.path;
      const bLabel = b.label || b.path;
      return aLabel.localeCompare(bLabel);
    });

    return uniqueRoutes;
  }

  /**
   * Recursively collects file paths synchronously.
   */
  private static walkDirSync(dir: string, maxDepth: number = 6, currentDepth: number = 0): string[] {
    if (currentDepth > maxDepth || !fs.existsSync(dir)) return [];
    const results: string[] = [];

    try {
      const list = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of list) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (
            ['node_modules', '.git', '.expo', '.next', 'dist', 'build', 'coverage'].includes(entry.name)
          ) {
            continue;
          }
          results.push(...this.walkDirSync(fullPath, maxDepth, currentDepth + 1));
        } else if (entry.isFile()) {
          results.push(fullPath);
        }
      }
    } catch {}

    return results;
  }

  /**
   * Retrieves workspace folder paths.
   */
  private static getWorkspaceFolders(baseFolder?: string): string[] {
    const vscode = getVsCode();
    if (baseFolder) return [baseFolder];
    if (vscode?.workspace?.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      return vscode.workspace.workspaceFolders.map(f => f.uri.fsPath);
    }
    return [process.cwd()];
  }
}
