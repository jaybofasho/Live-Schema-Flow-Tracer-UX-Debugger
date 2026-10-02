const test = require("node:test");
const assert = require("node:assert");
const { FlowGraphModel } = require("../dist/graph/FlowGraphModel");
const { CypressExporter } = require("../dist/export/CypressExporter");

test("CypressExporter generates valid Cypress test spec with semantic locators and assertions", () => {
  const landing = {
    title: "Auct Now Portal",
    url: "http://localhost:3000/auctions"
  };
  const viewport = {
    width: 1280,
    height: 800,
    presetName: "MacBook Air 13-inch",
    category: "desktop"
  };

  const model = new FlowGraphModel("session-cypress-e2e", landing, viewport);

  // 1. Semantic testId click
  model.addStepEvent({
    type: "EVENT_CLICK",
    step: 1,
    target: {
      tagName: "BUTTON",
      testId: "bid-submit-btn",
      text: "Place Bid",
      selector: "#bidBtn"
    }
  });

  // 2. Input with placeholder
  model.addStepEvent({
    type: "EVENT_INPUT",
    step: 2,
    value: "250",
    valueMasked: "250",
    target: {
      tagName: "INPUT",
      placeholder: "Enter bid amount",
      selector: "#amountInput"
    }
  });

  // 3. Form submit
  model.addStepEvent({
    type: "EVENT_SUBMIT",
    step: 3,
    target: {
      tagName: "FORM",
      selector: "#bidForm"
    }
  });

  // 4. Assertion checkpoint
  model.addStepEvent({
    type: "EVENT_ASSERTION",
    step: 4,
    assertionType: "TEXT_CONTAINS",
    expected: "Bid Confirmed: $250",
    target: {
      tagName: "DIV",
      testId: "toast-confirmation",
      selector: ".toast"
    }
  });

  // 5. Network correlation
  model.addStepEvent({
    type: "EVENT_NETWORK",
    step: 5,
    method: "POST",
    url: "http://localhost:3000/api/bids",
    status: 201,
    durationMs: 85
  });

  const spec = CypressExporter.export(model);

  // Assertions on generated Cypress test code
  assert.ok(spec.includes("describe('Recorded Session: session-cypress-e2e', () => {"), "Spec must contain describe block");
  assert.ok(spec.includes("cy.viewport(1280, 800);"), "Spec must set viewport");
  assert.ok(spec.includes("cy.visit('http://localhost:3000/auctions');"), "Spec must visit landing URL");
  assert.ok(spec.includes("cy.get('[data-testid=\"bid-submit-btn\"]').click();"), "Spec must prioritize semantic testId locator");
  assert.ok(spec.includes("cy.get('input[placeholder=\"Enter bid amount\"]').clear().type('250');"), "Spec must handle input typing");
  assert.ok(spec.includes("cy.get('#bidForm').submit();"), "Spec must handle form submit");
  assert.ok(spec.includes("cy.get('[data-testid=\"toast-confirmation\"]').should('contain.text', 'Bid Confirmed: $250');"), "Spec must generate should assertion");
  assert.ok(spec.includes("[API CALL]: POST http://localhost:3000/api/bids (status: 201)"), "Spec must record API call in comments");
});
