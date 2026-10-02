import { resolveComponentFromElement } from "./fiber";

export interface TargetMetadata {
  tagName: string;
  selector: string;
  resilientSelector?: string;
  semanticSelector?: string;
  testId?: string;
  role?: string;
  ariaLabel?: string;
  placeholder?: string;
  name?: string;
  inputType?: string;
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

export function getImplicitRole(element: HTMLElement): string | undefined {
  const tag = element.tagName.toLowerCase();
  if (tag === "button") return "button";
  if (tag === "a" && element.hasAttribute("href")) return "link";
  if (tag === "textarea") return "textbox";
  if (tag === "select") return "combobox";
  if (tag === "input") {
    const type = (element.getAttribute("type") || "text").toLowerCase();
    if (type === "button" || type === "submit" || type === "reset") return "button";
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    if (type === "range") return "slider";
    if (type === "number") return "spinbutton";
    if (["text", "email", "password", "search", "tel", "url"].includes(type)) return "textbox";
  }
  if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(tag)) return "heading";
  if (tag === "nav") return "navigation";
  if (tag === "main") return "main";
  if (tag === "form") return "form";
  if (tag === "table") return "table";
  if (tag === "img") return "img";
  return undefined;
}

export function generateSelector(element: HTMLElement): string {
  if (element.id) {
    return `#${CSS.escape(element.id)}`;
  }
  let path = "";
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
    path = tag + (path ? " > " + path : "");
    curr = parent;
  }
  return path || element.tagName.toLowerCase();
}

export function generateResilientSelector(element: HTMLElement): string {
  // 1. Explicit Test IDs (Highest priority in automated testing)
  const testId = element.getAttribute("data-testid") ||
                 element.getAttribute("data-test") ||
                 element.getAttribute("data-cy") ||
                 element.getAttribute("data-qa");
  if (testId) {
    if (element.getAttribute("data-testid")) return `[data-testid="${CSS.escape(testId)}"]`;
    if (element.getAttribute("data-cy")) return `[data-cy="${CSS.escape(testId)}"]`;
    if (element.getAttribute("data-test")) return `[data-test="${CSS.escape(testId)}"]`;
    if (element.getAttribute("data-qa")) return `[data-qa="${CSS.escape(testId)}"]`;
  }

  // 2. Stable unique ID (avoiding generated auto-ids like :r0:, ember123, etc.)
  if (element.id && !/[:\d]{3,}/.test(element.id) && !element.id.startsWith("__")) {
    return `#${CSS.escape(element.id)}`;
  }

  // 3. Form input / textarea by name attribute
  const name = element.getAttribute("name");
  if (name) {
    return `${element.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
  }

  // 4. Accessible aria-label
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) {
    return `${element.tagName.toLowerCase()}[aria-label="${CSS.escape(ariaLabel)}"]`;
  }

  // 5. Placeholder
  const placeholder = element.getAttribute("placeholder");
  if (placeholder) {
    return `${element.tagName.toLowerCase()}[placeholder="${CSS.escape(placeholder)}"]`;
  }

  // 6. Role with accessible text for buttons and links
  const role = element.getAttribute("role") || getImplicitRole(element);
  const text = (element.innerText || element.textContent || "").trim().slice(0, 30);
  if (role === "button" && text) {
    return `button:has-text("${CSS.escape(text)}")`;
  }

  // 7. Compact semantic hierarchy (ancestor with id/testId + tag/class)
  let curr: HTMLElement | null = element;
  let path = "";
  while (curr && curr.nodeType === Node.ELEMENT_NODE && curr !== document.body) {
    let part = curr.tagName.toLowerCase();
    const currTestId = curr.getAttribute("data-testid") || curr.getAttribute("data-cy");
    if (currTestId) {
      path = `[data-testid="${CSS.escape(currTestId)}"]` + (path ? ` > ${path}` : "");
      return path;
    }
    if (curr.id && !/[:\d]{3,}/.test(curr.id)) {
      path = `#${CSS.escape(curr.id)}` + (path ? ` > ${path}` : "");
      return path;
    }

    if (curr.className && typeof curr.className === "string") {
      const mainClass = curr.className.split(/\s+/).filter(c => c && !c.includes(":") && !c.startsWith("_"))[0];
      if (mainClass) {
        part += `.${CSS.escape(mainClass)}`;
      }
    }

    const parent: HTMLElement | null = curr.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((c: Element) => c.tagName === curr!.tagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(curr) + 1;
        part += `:nth-of-type(${index})`;
      }
    }

    path = part + (path ? " > " + path : "");
    curr = parent;
  }

  return path || generateSelector(element);
}

export function extractTargetInfo(element: HTMLElement): TargetMetadata {
  const rect = element.getBoundingClientRect();
  const componentInfo = resolveComponentFromElement(element);

  const text = (element.innerText || element.textContent || "").trim().slice(0, 80);
  const testId = element.getAttribute("data-testid") ||
                 element.getAttribute("data-test") ||
                 element.getAttribute("data-cy") ||
                 element.getAttribute("data-qa") ||
                 undefined;
  const role = element.getAttribute("role") || getImplicitRole(element) || undefined;
  const ariaLabel = element.getAttribute("aria-label") || undefined;
  const placeholder = (element as HTMLInputElement).placeholder || undefined;
  const name = (element as HTMLInputElement).name || undefined;
  const inputType = (element as HTMLInputElement).type || undefined;
  const resilientSelector = generateResilientSelector(element);

  let semanticSelector = "";
  if (testId) {
    semanticSelector = `getByTestId('${testId}')`;
  } else if (role && text && text.length <= 40) {
    semanticSelector = `getByRole('${role}', { name: '${text.replace(/'/g, "\\'")}' })`;
  } else if (placeholder) {
    semanticSelector = `getByPlaceholder('${placeholder.replace(/'/g, "\\'")}')`;
  } else if (ariaLabel) {
    semanticSelector = `getByLabel('${ariaLabel.replace(/'/g, "\\'")}')`;
  } else {
    semanticSelector = `locator('${resilientSelector}')`;
  }

  return {
    tagName: element.tagName.toLowerCase(),
    selector: generateSelector(element),
    resilientSelector,
    semanticSelector,
    testId,
    role,
    ariaLabel,
    placeholder,
    name,
    inputType,
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
