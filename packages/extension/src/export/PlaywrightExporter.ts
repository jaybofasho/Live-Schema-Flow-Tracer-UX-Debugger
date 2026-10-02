import { FlowGraphModel } from "../graph/FlowGraphModel";

export class PlaywrightExporter {
  public static getLocator(target?: any, details?: any): string {
    if (!target) {
      if (details?.x && details?.y) {
        return `page.mouse.click(${details.x}, ${details.y})`;
      }
      return "page.locator('body')";
    }

    // 1. Semantic Test IDs (Highest stability)
    if (target.testId) {
      return `page.getByTestId('${target.testId}')`;
    }

    // 2. ARIA role with accessible name (when text is present)
    if (target.role && target.text && target.text.length <= 40) {
      const escaped = target.text.replace(/'/g, "\\'");
      return `page.getByRole('${target.role}', { name: '${escaped}' })`;
    }

    // 3. Input placeholder
    if (target.placeholder) {
      const escaped = target.placeholder.replace(/'/g, "\\'");
      return `page.getByPlaceholder('${escaped}')`;
    }

    // 4. Accessible label
    if (target.ariaLabel) {
      const escaped = target.ariaLabel.replace(/'/g, "\\'");
      return `page.getByLabel('${escaped}')`;
    }

    // 5. Button or Link by text
    const tag = (target.tagName || "").toLowerCase();
    if ((tag === "button" || tag === "a") && target.text && target.text.length <= 30 && !target.selector?.startsWith("#")) {
      const role = tag === "a" ? "link" : "button";
      const escaped = target.text.replace(/'/g, "\\'");
      return `page.getByRole('${role}', { name: '${escaped}' })`;
    }

    // 6. Direct CSS / Resilient selector fallback
    const selector = target.selector || target.resilientSelector;
    if (selector) {
      return `page.locator('${selector}')`;
    }

    return `page.locator('${tag || "body"}')`;
  }

  public static export(model: FlowGraphModel): string {
    const lines: string[] = [];
    lines.push("import { test, expect } from '@playwright/test';");
    lines.push("");
    lines.push(`test.describe('Recorded Session: ${model.sessionId}', () => {`);
    lines.push("  test('replays user flow and interactions', async ({ page }) => {");

    const landingUrl = model.landingPage?.url || "http://localhost:3000";

    // Set viewport dimensions from confirmed session device preset
    if (model.viewport) {
      lines.push(`    // Emulate device viewport: ${model.viewport.presetName || `${model.viewport.width}x${model.viewport.height}`}`);
      lines.push(`    await page.setViewportSize({ width: ${model.viewport.width}, height: ${model.viewport.height} });`);
      lines.push("");
    }

    // Navigate to confirmed landing page (top of schema)
    lines.push("    // Top of schema landing page");
    lines.push(`    await page.goto('${landingUrl}');`);
    lines.push("    await page.waitForLoadState('networkidle');");
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
        lines.push(`    await page.goto('${url}');`);
        lines.push("    await page.waitForLoadState('networkidle');");
      } else if (item.type === "EVENT_CLICK") {
        const locator = this.getLocator(details.target, details);
        if (locator.startsWith("page.mouse.click")) {
          lines.push(`    await ${locator};`);
        } else {
          lines.push(`    await ${locator}.click();`);
        }
      } else if (item.type === "EVENT_INPUT") {
        const locator = this.getLocator(details.target, details);
        const val = details.valueMasked || details.value || "test-input";
        lines.push(`    await ${locator}.fill('${val}');`);
      } else if (item.type === "EVENT_SUBMIT") {
        const locator = this.getLocator(details.target, details);
        lines.push(`    await ${locator}.press('Enter');`);
      } else if (item.type === "EVENT_ASSERTION") {
        const assertionType = details.assertionType || "VISIBLE";
        const locator = this.getLocator(details.target, details);
        if (assertionType === "TEXT_EQUALS" && details.expected) {
          lines.push(`    await expect(${locator}).toHaveText('${details.expected}');`);
        } else if (assertionType === "TEXT_CONTAINS" && details.expected) {
          lines.push(`    await expect(${locator}).toContainText('${details.expected}');`);
        } else if (assertionType === "URL_MATCHES" && details.expected) {
          lines.push(`    await expect(page).toHaveURL(/.*${details.expected}.*/);`);
        } else if (assertionType === "HIDDEN") {
          lines.push(`    await expect(${locator}).toBeHidden();`);
        } else {
          lines.push(`    await expect(${locator}).toBeVisible();`);
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

    lines.push("    // Assert final page state");
    lines.push("    await expect(page).toHaveURL(/.*/);");
    lines.push("  });");
    lines.push("});");

    return lines.join("\n");
  }
}
