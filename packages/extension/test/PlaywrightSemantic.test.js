const test = require("node:test");
const assert = require("node:assert");
const { FlowGraphModel } = require("../dist/graph/FlowGraphModel");
const { PlaywrightExporter } = require("../dist/export/PlaywrightExporter");

test("PlaywrightExporter generates semantic locators (testId, role, placeholder, label) and assertions", () => {
  const model = new FlowGraphModel("session-pw-semantic");

  // Step 1: Semantic testId
  model.addStepEvent({
    type: "EVENT_CLICK",
    step: 1,
    target: {
      testId: "checkout-btn",
      selector: "#btn123"
    }
  });

  // Step 2: Role with text
  model.addStepEvent({
    type: "EVENT_CLICK",
    step: 2,
    target: {
      role: "button",
      text: "Confirm Order"
    }
  });

  // Step 3: Input with placeholder
  model.addStepEvent({
    type: "EVENT_INPUT",
    step: 3,
    value: "vip-bidder",
    valueMasked: "vip-bidder",
    target: {
      placeholder: "Enter coupon code"
    }
  });

  // Step 4: Input with label
  model.addStepEvent({
    type: "EVENT_INPUT",
    step: 4,
    value: "••••••••",
    valueMasked: "••••••••",
    target: {
      ariaLabel: "Security PIN"
    }
  });

  // Step 5: Assertions
  model.addStepEvent({
    type: "EVENT_ASSERTION",
    step: 5,
    assertionType: "TEXT_EQUALS",
    expected: "Order Placed Successfully",
    target: {
      testId: "success-banner"
    }
  });

  model.addStepEvent({
    type: "EVENT_ASSERTION",
    step: 6,
    assertionType: "URL_MATCHES",
    expected: "/confirmation"
  });

  const spec = PlaywrightExporter.export(model);

  assert.ok(spec.includes("await page.getByTestId('checkout-btn').click();"), "Must generate getByTestId");
  assert.ok(spec.includes("await page.getByRole('button', { name: 'Confirm Order' }).click();"), "Must generate getByRole");
  assert.ok(spec.includes("await page.getByPlaceholder('Enter coupon code').fill('vip-bidder');"), "Must generate getByPlaceholder");
  assert.ok(spec.includes("await page.getByLabel('Security PIN').fill('••••••••');"), "Must generate getByLabel");
  assert.ok(spec.includes("await expect(page.getByTestId('success-banner')).toHaveText('Order Placed Successfully');"), "Must generate toHaveText assertion");
  assert.ok(spec.includes("await expect(page).toHaveURL(/.*/confirmation.*/);"), "Must generate toHaveURL assertion");
});
