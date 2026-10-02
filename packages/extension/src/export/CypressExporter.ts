import { FlowGraphModel } from "../graph/FlowGraphModel";

export class CypressExporter {
  public static getCypressLocator(target?: any, details?: any): string {
    if (!target) {
      return "cy.get('body')";
    }

    // 1. Explicit Test IDs (Highest stability in Cypress)
    if (target.testId) {
      return `cy.get('[data-testid="${target.testId}"]')`;
    }

    // 2. Button or Link by visible text
    const tag = (target.tagName || "").toLowerCase();
    if ((tag === "button" || tag === "a") && target.text && target.text.length <= 30 && !target.selector?.startsWith("#")) {
      const escaped = target.text.replace(/'/g, "\\'");
      return `cy.contains('${tag}', '${escaped}')`;
    }

    // 3. Inputs with placeholder
    if (target.placeholder) {
      return `cy.get('input[placeholder="${target.placeholder}"]')`;
    }

    // 4. Inputs with name
    if (target.name) {
      return `cy.get('${tag || "input"}[name="${target.name}"]')`;
    }

    // 5. Resilient selector or direct selector fallback
    const selector = target.selector || target.resilientSelector;
    if (selector) {
      return `cy.get('${selector}')`;
    }

    return `cy.get('${tag || "body"}')`;
  }

  public static export(model: FlowGraphModel): string {
    const lines: string[] = [];
    lines.push(`describe('Recorded Session: ${model.sessionId}', () => {`);
    lines.push(`  it('replays user flow and interactions', () => {`);

    const landingUrl = model.landingPage?.url || "http://localhost:3000";

    // Set viewport dimensions if configured
    if (model.viewport) {
      lines.push(`    // Emulate device viewport: ${model.viewport.presetName || `${model.viewport.width}x${model.viewport.height}`}`);
      lines.push(`    cy.viewport(${model.viewport.width}, ${model.viewport.height});`);
      lines.push("");
    }

    // Navigate to confirmed landing page
    lines.push(`    // Top of schema landing page`);
    lines.push(`    cy.visit('${landingUrl}');`);
    lines.push("");

    let lastPositionName = "";

    for (const item of model.timeline) {
      const details = item.details || {};

      if (item.flowPositionName && item.flowPositionName !== lastPositionName) {
        lastPositionName = item.flowPositionName;
        const phaseBadge = (item as any).flowPhase ? ` [${(item as any).flowPhase}]` : "";
        lines.push(`    // ─── Flow Position: ${lastPositionName}${phaseBadge} ───`);
      }

      lines.push(`    // Step #${item.step}: ${item.label}`);

      if (item.type === "EVENT_NAVIGATE") {
        const url = details.url || landingUrl;
        lines.push(`    cy.visit('${url}');`);
      } else if (item.type === "EVENT_CLICK") {
        const locator = this.getCypressLocator(details.target, details);
        lines.push(`    ${locator}.click();`);
      } else if (item.type === "EVENT_INPUT") {
        const locator = this.getCypressLocator(details.target, details);
        const val = details.valueMasked || details.value || "test-input";
        lines.push(`    ${locator}.clear().type('${val}');`);
      } else if (item.type === "EVENT_SUBMIT") {
        const locator = this.getCypressLocator(details.target, details);
        lines.push(`    ${locator}.submit();`);
      } else if (item.type === "EVENT_ASSERTION") {
        const assertionType = details.assertionType || "VISIBLE";
        const locator = this.getCypressLocator(details.target, details);
        if (assertionType === "TEXT_EQUALS" && details.expected) {
          lines.push(`    ${locator}.should('have.text', '${details.expected}');`);
        } else if (assertionType === "TEXT_CONTAINS" && details.expected) {
          lines.push(`    ${locator}.should('contain.text', '${details.expected}');`);
        } else if (assertionType === "URL_MATCHES" && details.expected) {
          lines.push(`    cy.url().should('include', '${details.expected}');`);
        } else if (assertionType === "HIDDEN") {
          lines.push(`    ${locator}.should('not.be.visible');`);
        } else {
          lines.push(`    ${locator}.should('be.visible');`);
        }
      } else if (item.type === "EVENT_NETWORK") {
        const method = details.method || "GET";
        const url = details.url || "";
        const status = details.status;
        lines.push(`    // [API CALL]: ${method} ${url} (status: ${status || "unknown"})`);
      } else if (item.type === "HOTKEY_COMMENT") {
        lines.push(`    // [USER ANNOTATION]: ${details.comment}`);
      }
      lines.push("");
    }

    lines.push(`    // Assert final page state`);
    lines.push(`    cy.url().should('exist');`);
    lines.push(`  });`);
    lines.push(`});`);

    return lines.join("\n");
  }
}
