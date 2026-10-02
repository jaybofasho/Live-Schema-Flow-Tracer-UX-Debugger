const test = require("node:test");
const assert = require("node:assert");
const { FlowGraphModel } = require("../dist/graph/FlowGraphModel");
const { MermaidExporter } = require("../dist/export/MermaidExporter");

test("FlowGraphModel records EVENT_INPUT, EVENT_ASSERTION, and EVENT_NETWORK with distinct badges and links", () => {
  const model = new FlowGraphModel("session-new-events");

  // 1. EVENT_INPUT
  const inputNode = model.addStepEvent({
    type: "EVENT_INPUT",
    step: 1,
    valueMasked: "secret123",
    target: {
      tagName: "INPUT",
      componentName: "PasswordInput",
      selector: "#pwd"
    }
  });

  assert.strictEqual(inputNode.data.badge, "INPUT");
  assert.ok(inputNode.label.includes("PasswordInput"));
  assert.ok(inputNode.label.includes("secret123"));

  // 2. EVENT_ASSERTION
  const assertNode = model.addStepEvent({
    type: "EVENT_ASSERTION",
    step: 2,
    assertionType: "TEXT_EQUALS",
    expected: "Account Dashboard",
    target: {
      tagName: "H1",
      selector: "h1.title"
    }
  });

  assert.strictEqual(assertNode.data.badge, "ASSERTION");
  assert.ok(assertNode.label.includes("Assert: TEXT_EQUALS"));

  // 3. EVENT_NETWORK
  const netNode = model.addStepEvent({
    type: "EVENT_NETWORK",
    step: 3,
    method: "POST",
    url: "https://api.example.com/v1/auth/login",
    status: 200,
    durationMs: 140
  });

  assert.strictEqual(netNode.data.badge, "API");
  assert.ok(netNode.label.includes("POST"));
  assert.ok(netNode.label.includes("/v1/auth/login"));
  assert.ok(netNode.label.includes("[200]"));
  assert.ok(netNode.data.subtitle.includes("140ms"));

  // 4. Verify Mermaid flowchart exports assertion and network styles
  const mmd = MermaidExporter.export(model);
  assert.ok(mmd.includes("classDef assertion"), "Must define assertion style");
  assert.ok(mmd.includes("classDef network"), "Must define network style");
  assert.ok(mmd.includes(":::assertion"), "Must apply assertion style to node");
  assert.ok(mmd.includes(":::network"), "Must apply network style to node");
});
