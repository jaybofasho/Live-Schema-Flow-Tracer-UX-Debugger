import { resolveComponentFromElement } from './fiber';

export interface TargetMetadata {
  tagName: string;
  selector: string;
  id?: string;
  className?: string;
  text?: string;
  componentName?: string;
  filePath?: string;
  lineNumber?: number;
  columnNumber?: number;
  handlerName?: string;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export function generateSelector(element: HTMLElement): string {
  if (element.id) {
    return `#${CSS.escape(element.id)}`;
  }
  let path = '';
  let curr: HTMLElement | null = element;
  while (curr && curr.nodeType === Node.ELEMENT_NODE && curr !== document.body) {
    let tag = curr.tagName.toLowerCase();
    if (curr.id) {
      path = `#${CSS.escape(curr.id)} > ` + path;
      break;
    }
    const parent: HTMLElement | null = curr.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((c: Element) => c.tagName === curr!.tagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(curr) + 1;
        tag += `:nth-of-type(${index})`;
      }
    }
    path = tag + (path ? ' > ' + path : '');
    curr = parent;
  }
  return path || element.tagName.toLowerCase();
}

export function extractTargetInfo(element: HTMLElement): TargetMetadata {
  const rect = element.getBoundingClientRect();
  const componentInfo = resolveComponentFromElement(element);

  const text = (element.innerText || element.textContent || '').trim().slice(0, 80);

  return {
    tagName: element.tagName.toLowerCase(),
    selector: generateSelector(element),
    id: element.id || undefined,
    className: element.className || undefined,
    text: text || undefined,
    componentName: componentInfo.componentName,
    filePath: componentInfo.filePath,
    lineNumber: componentInfo.lineNumber,
    columnNumber: componentInfo.columnNumber,
    handlerName: componentInfo.handlerName,
    boundingBox: {
      x: Math.round(rect.x + window.scrollX),
      y: Math.round(rect.y + window.scrollY),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    }
  };
}
