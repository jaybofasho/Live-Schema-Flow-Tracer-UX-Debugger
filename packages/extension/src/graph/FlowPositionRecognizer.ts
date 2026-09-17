export type FlowPhase = 'LANDING' | 'AUTH' | 'ONBOARDING' | 'DASHBOARD' | 'SETTINGS' | 'CHECKOUT' | 'GENERAL';

export interface FlowPosition {
  id: string;
  name: string;
  route: string;
  rawUrl?: string;
  title?: string;
  component?: string;
  phase: FlowPhase;
  breadcrumb: string[];
  visitCount: number;
  stepIndices: number[];
  isModal?: boolean;
  modal?: string;
}

export class FlowPositionRecognizer {
  /**
   * Normalizes a raw URL into a clean canonical route path.
   * Strips ephemeral query parameters (like ?t=12345, ?session=abc, etc.) and file prefixes.
   */
  public static normalizeRoute(rawUrl?: string): string {
    if (!rawUrl) return '/';

    try {
      if (rawUrl.startsWith('file://')) {
        const parts = rawUrl.replace('file://', '').split('/');
        return '/' + parts.slice(-2).join('/');
      }

      const urlObj = new URL(rawUrl, 'http://localhost');
      const pathname = urlObj.pathname;
      return pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
    } catch {
      return rawUrl;
    }
  }

  /**
   * Infers the app user experience phase based on route, component name, and title.
   */
  public static inferPhase(route: string, componentName?: string, title?: string): FlowPhase {
    const combined = `${route} ${componentName || ''} ${title || ''}`.toLowerCase();

    if (combined.includes('login') || combined.includes('auth') || combined.includes('signup') || combined.includes('register') || combined.includes('token')) {
      return 'AUTH';
    }
    if (route === '/' || combined.includes('portal') || combined.includes('landing')) {
      return 'LANDING';
    }
    if (combined.includes('onboard') || combined.includes('welcome') || combined.includes('wizard')) {
      return 'ONBOARDING';
    }
    if (combined.includes('dash') || combined.includes('home') || combined.includes('overview') || combined.includes('feed')) {
      return 'DASHBOARD';
    }
    if (combined.includes('setting') || combined.includes('profile') || combined.includes('account') || combined.includes('pref')) {
      return 'SETTINGS';
    }
    if (combined.includes('cart') || combined.includes('checkout') || combined.includes('pay') || combined.includes('order')) {
      return 'CHECKOUT';
    }

    return 'GENERAL';
  }

  /**
   * Computes a canonical position ID and descriptor from an interaction or navigation event.
   */
  public static computePosition(
    event: any,
    currentBreadcrumb: string[] = ['App Entry'],
    existingPositions: Map<string, FlowPosition> = new Map()
  ): FlowPosition {
    const target = event.target || {};
    const rawUrl = event.url || event.route || target.url || target.route;
    const component = target.componentName;
    const selector = target.selector || '';
    const modalAttr = event.modal || target.modal;

    // Check if interaction occurs inside a modal / dialog
    const isModal = Boolean(modalAttr || selector.includes('dialog') || selector.includes('.modal') || selector.includes('[role="dialog"]'));

    const route = this.normalizeRoute(rawUrl);
    const eventTitle = target.title || event.title;
    const phase = this.inferPhase(route, component, eventTitle);

    // Compute canonical ID
    let canonicalId = `pos_route_${route.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    if (isModal) {
      canonicalId += modalAttr ? `_modal_${modalAttr.replace(/[^a-zA-Z0-9_]/g, '_')}` : '_modal';
    }

    // Name formatting
    let name = eventTitle || route;
    if (isModal) {
      name = modalAttr ? `Modal: ${modalAttr}` : (eventTitle ? `${eventTitle} (Modal)` : 'Modal Dialog');
    } else if (route === '/' || route === '') {
      name = eventTitle || 'Landing / Home';
    } else if (route.includes('/dashboard')) {
      name = eventTitle || 'Dashboard Overview';
    } else if (route.includes('/login') || route.includes('/auth')) {
      name = eventTitle || 'Authentication';
    } else if (route.includes('/settings')) {
      name = eventTitle || 'Settings';
    } else if (route.includes('/checkout')) {
      name = eventTitle || 'Checkout';
    } else if (component) {
      name = `<${component} />`;
    }

    // Existing position check to maintain visit count
    const existing = existingPositions.get(canonicalId);
    const visitCount = existing ? existing.visitCount + 1 : 1;
    const stepIndices = existing ? [...existing.stepIndices, event.step || 1] : [event.step || 1];

    // Compute updated breadcrumb
    let updatedBreadcrumb = [...currentBreadcrumb];
    if (!updatedBreadcrumb.includes(name)) {
      updatedBreadcrumb.push(name);
    }

    const pos: FlowPosition = {
      id: canonicalId,
      name,
      route,
      rawUrl,
      title: eventTitle,
      component,
      modal: modalAttr,
      phase,
      breadcrumb: updatedBreadcrumb,
      visitCount,
      stepIndices,
      isModal
    };

    existingPositions.set(canonicalId, pos);
    return pos;
  }

  /**
   * Alias for computePosition for explicit naming clarity.
   */
  public static recognizePosition(
    event: any,
    currentBreadcrumb: string[] = ['App Entry'],
    existingPositions: Map<string, FlowPosition> = new Map()
  ): FlowPosition {
    return this.computePosition(event, currentBreadcrumb, existingPositions);
  }

  /**
   * Checks if two positions represent the same user experience location.
   */
  public static isSamePosition(posA?: FlowPosition, posB?: FlowPosition): boolean {
    if (!posA || !posB) return false;
    return posA.id === posB.id || (posA.route === posB.route && posA.isModal === posB.isModal);
  }
}
