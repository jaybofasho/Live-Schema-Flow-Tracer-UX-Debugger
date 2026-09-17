/**
 * Inspects DOM elements to extract component names, source files, lines,
 * and handler functions from React Fiber or Vue internal instances.
 */

export interface ComponentResolution {
  componentName?: string;
  filePath?: string;
  lineNumber?: number;
  columnNumber?: number;
  handlerName?: string;
}

export function resolveComponentFromElement(element: HTMLElement | null): ComponentResolution {
  if (!element) return {};

  // 1. Try React Fiber resolution
  const reactRes = resolveReactFiber(element);
  if (reactRes.componentName) return reactRes;

  // 2. Try Vue Component resolution
  const vueRes = resolveVueComponent(element);
  if (vueRes.componentName) return vueRes;

  return {};
}

function resolveReactFiber(element: HTMLElement): ComponentResolution {
  let curr: any = element;
  let fiberKey = Object.keys(curr).find(
    k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
  );

  // Traverse up parent elements if fiber key not directly on element
  while (!fiberKey && curr.parentElement) {
    curr = curr.parentElement;
    fiberKey = Object.keys(curr).find(
      k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
    );
  }

  if (!fiberKey) return {};

  let fiber = curr[fiberKey];
  let componentName: string | undefined;
  let filePath: string | undefined;
  let lineNumber: number | undefined;
  let columnNumber: number | undefined;
  let handlerName: string | undefined;

  // Walk up Fiber tree to find user component boundary
  while (fiber) {
    // Check for source debugging annotations injected by Babel/Vite React plugin
    if (fiber._debugSource) {
      if (!filePath) {
        filePath = fiber._debugSource.fileName;
        lineNumber = fiber._debugSource.lineNumber;
        columnNumber = fiber._debugSource.columnNumber;
      }
    }

    // Check type name
    const type = fiber.type;
    if (type && typeof type === 'function') {
      const name = type.displayName || type.name;
      if (name && !componentName && !name.startsWith('_')) {
        componentName = name;
      }
    } else if (fiber.elementType && typeof fiber.elementType === 'function') {
      const name = fiber.elementType.displayName || fiber.elementType.name;
      if (name && !componentName && !name.startsWith('_')) {
        componentName = name;
      }
    }

    // Inspect props for click/submit handler names
    if (fiber.memoizedProps) {
      const props = fiber.memoizedProps;
      if (props.onClick && typeof props.onClick === 'function') {
        handlerName = props.onClick.name || 'onClick';
      } else if (props.onSubmit && typeof props.onSubmit === 'function') {
        handlerName = props.onSubmit.name || 'onSubmit';
      }
    }

    if (componentName && filePath) break;
    fiber = fiber.return;
  }

  return {
    componentName,
    filePath,
    lineNumber,
    columnNumber,
    handlerName
  };
}

function resolveVueComponent(element: any): ComponentResolution {
  let curr = element;
  while (curr) {
    if (curr.__vueParentComponent) {
      const instance = curr.__vueParentComponent;
      const componentName = instance.type?.name || instance.type?.__name;
      const filePath = instance.type?.__file;
      return {
        componentName,
        filePath
      };
    }
    if (curr.__vue__) {
      const instance = curr.__vue__;
      const componentName = instance.$options?.name;
      return { componentName };
    }
    curr = curr.parentElement;
  }
  return {};
}
