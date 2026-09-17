import { FlowGraphModel } from '../graph/FlowGraphModel';

export class PlaywrightExporter {
  public static export(model: FlowGraphModel): string {
    const lines: string[] = [];
    lines.push(`import { test, expect } from '@playwright/test';`);
    lines.push('');
    lines.push(`test.describe('Recorded Session: ${model.sessionId}', () => {`);
    lines.push(`  test('replays user flow and interactions', async ({ page }) => {`);

    const landingUrl = model.landingPage?.url || 'http://localhost:3000';

    // Set viewport dimensions from confirmed session device preset
    if (model.viewport) {
      lines.push(`    // Emulate device viewport: ${model.viewport.presetName || `${model.viewport.width}x${model.viewport.height}`}`);
      lines.push(`    await page.setViewportSize({ width: ${model.viewport.width}, height: ${model.viewport.height} });`);
      lines.push('');
    }

    // Navigate to confirmed landing page (top of schema)
    lines.push(`    // Top of schema landing page`);
    lines.push(`    await page.goto('${landingUrl}');`);
    lines.push(`    await page.waitForLoadState('networkidle');`);
    lines.push('');

    let lastPositionName = '';

    for (const item of model.timeline) {
      const details = item.details || {};

      if (item.flowPositionName && item.flowPositionName !== lastPositionName) {
        lastPositionName = item.flowPositionName;
        const phaseBadge = (item as any).flowPhase ? ` [${(item as any).flowPhase}]` : '';
        lines.push(`    // ─── Flow Position: ${lastPositionName}${phaseBadge} ───`);
      }

      lines.push(`    // Step #${item.step}: ${item.label}`);

      if (item.type === 'EVENT_NAVIGATE') {
        const url = details.url || landingUrl;
        lines.push(`    await page.goto('${url}');`);
        lines.push(`    await page.waitForLoadState('networkidle');`);
      } else if (item.type === 'EVENT_CLICK') {
        const selector = details.target?.selector;
        if (selector) {
          lines.push(`    await page.locator('${selector}').click();`);
        } else if (details.x && details.y) {
          lines.push(`    await page.mouse.click(${details.x}, ${details.y});`);
        }
      } else if (item.type === 'EVENT_INPUT') {
        const selector = details.target?.selector;
        const val = details.valueMasked || 'test-input';
        if (selector) {
          lines.push(`    await page.locator('${selector}').fill('${val}');`);
        }
      } else if (item.type === 'EVENT_SUBMIT') {
        const selector = details.target?.selector;
        if (selector) {
          lines.push(`    await page.locator('${selector}').press('Enter');`);
        }
      } else if (item.type === 'HOTKEY_COMMENT') {
        lines.push(`    // [USER ANNOTATION]: ${details.comment}`);
      }
      lines.push('');
    }

    lines.push(`    // Assert final page state`);
    lines.push(`    await expect(page).toHaveURL(/.*/);`);
    lines.push(`  });`);
    lines.push(`});`);

    return lines.join('\n');
  }
}
