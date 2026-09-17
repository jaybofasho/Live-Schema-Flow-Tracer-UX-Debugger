const test = require('node:test');
const assert = require('node:assert');
const { FlowGraphModel } = require('../dist/graph/FlowGraphModel');
const { MermaidSchemaParser } = require('../dist/parser/MermaidSchemaParser');
const { MermaidExporter } = require('../dist/export/MermaidExporter');

test('MermaidSchemaParser detects flowchart format and parses nodes, edges, and comments', () => {
  const mermaidFlowchart = `
graph TD
  A["Landing Screen"] --> B["Login Modal"]
  B --> C["Dashboard View"]
  %% @comment [A]: Initial user entry point
  %% @comment [B]: Check OAuth2 validation flow
`;

  const parsed = MermaidSchemaParser.parse(mermaidFlowchart, 'flowchart-test-session');
  assert.strictEqual(parsed.schemaType, 'FLOWCHART');
  assert.strictEqual(parsed.nodes.length, 3);
  assert.strictEqual(parsed.edges.length, 2);

  const nodeA = parsed.nodes.find(n => n.id === 'A');
  assert.ok(nodeA);
  assert.strictEqual(nodeA.label, 'Landing Screen');
  assert.strictEqual(nodeA.data.comments?.length, 1);
  assert.strictEqual(nodeA.data.comments[0].text, 'Initial user entry point');

  const nodeB = parsed.nodes.find(n => n.id === 'B');
  assert.ok(nodeB);
  assert.strictEqual(nodeB.data.comments?.length, 1);
  assert.strictEqual(nodeB.data.comments[0].text, 'Check OAuth2 validation flow');

  const edgeAB = parsed.edges.find(e => e.source === 'A' && e.target === 'B');
  assert.ok(edgeAB);
});

test('MermaidSchemaParser parses ERD (erDiagram) entities, attributes, and relationships', () => {
  const mermaidERD = `
erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    CUSTOMER }|..|{ DELIVERY-ADDRESS : uses

    CUSTOMER {
        string id PK
        string email
        string name
    }
    ORDER {
        int orderNumber PK
        string customerId FK
        float totalAmount
        string status
    }
    %% @comment [CUSTOMER]: Primary user account entity
`;

  const parsed = MermaidSchemaParser.parse(mermaidERD, 'erd-test-session');
  assert.strictEqual(parsed.schemaType, 'ERD');
  assert.ok(parsed.nodes.length >= 3); // CUSTOMER, ORDER, LINE-ITEM, DELIVERY-ADDRESS

  const customer = parsed.nodes.find(n => n.id === 'CUSTOMER');
  assert.ok(customer);
  assert.strictEqual(customer.data.badge, 'ENTITY');
  assert.strictEqual(customer.data.attributes?.length, 3);
  assert.deepStrictEqual(customer.data.attributes[0], { type: 'string', name: 'id', key: 'PK' });
  assert.deepStrictEqual(customer.data.attributes[1], { type: 'string', name: 'email', key: undefined });

  // Check comment attached to CUSTOMER entity
  assert.strictEqual(customer.data.comments?.length, 1);
  assert.strictEqual(customer.data.comments[0].text, 'Primary user account entity');

  const order = parsed.nodes.find(n => n.id === 'ORDER');
  assert.ok(order);
  assert.strictEqual(order.data.attributes?.length, 4);

  // Check ERD edge
  const edgeCustomerOrder = parsed.edges.find(e => e.source === 'CUSTOMER' && e.target === 'ORDER');
  assert.ok(edgeCustomerOrder);
  assert.strictEqual(edgeCustomerOrder.label, 'places');
});

test('MermaidSchemaParser parses state diagrams (stateDiagram-v2)', () => {
  const mermaidState = `
stateDiagram-v2
    [*] --> Idle
    Idle --> Processing : SubmitForm
    Processing --> Success : 200 OK
    Processing --> Error : 500 Fail
    Success --> [*]
`;

  const parsed = MermaidSchemaParser.parse(mermaidState, 'state-test-session');
  assert.strictEqual(parsed.schemaType, 'STATE');
  const idle = parsed.nodes.find(n => n.id === 'Idle');
  const processing = parsed.nodes.find(n => n.id === 'Processing');
  assert.ok(idle);
  assert.ok(processing);
  assert.strictEqual(idle.data.badge, 'STATE');
});

test('FlowGraphModel loads imported schema, adds comments, and updates node properties', () => {
  const initialSchema = `
graph TD
  STEP1["Landing Screen"] --> STEP2["Checkout Button"]
`;
  const parsed = MermaidSchemaParser.parse(initialSchema, 'import-session-1');
  const model = new FlowGraphModel('import-session-1');
  model.loadFromModel(parsed);

  assert.strictEqual(model.nodes.size, 2);
  assert.strictEqual(model.schemaType, 'FLOWCHART');

  // Add comments to STEP1 and STEP2
  const c1 = model.addCommentToNode('STEP1', 'Needs mobile responsive layout review', 'Alice');
  assert.strictEqual(c1.author, 'Alice');
  assert.strictEqual(c1.text, 'Needs mobile responsive layout review');

  const c2 = model.addCommentToNode('STEP2', 'Verify click event tracking analytics', 'Bob');
  assert.strictEqual(c2.author, 'Bob');

  const node1 = model.nodes.get('STEP1');
  assert.strictEqual(node1.data.comments?.length, 1);

  // Edit node properties
  const updated = model.updateNodeData('STEP2', {
    title: 'Instant Buy CTA',
    subtitle: 'High conversion payment button',
    badge: 'CONVERSION'
  });
  assert.ok(updated);
  assert.strictEqual(updated.label, 'Instant Buy CTA');
  assert.strictEqual(updated.data.title, 'Instant Buy CTA');
  assert.strictEqual(updated.data.subtitle, 'High conversion payment button');
  assert.strictEqual(updated.data.badge, 'CONVERSION');
});

test('MermaidExporter serializes ERD and preserved comments', () => {
  const erdModel = new FlowGraphModel('export-erd-session');
  erdModel.schemaType = 'ERD';

  erdModel.nodes.set('USER', {
    id: 'USER',
    type: 'screen',
    label: 'USER',
    data: {
      badge: 'ENTITY',
      attributes: [
        { type: 'int', name: 'id', key: 'PK' },
        { type: 'string', name: 'username' }
      ],
      comments: [
        { id: 'c1', author: 'Dev', text: 'Auth identity table', timestamp: Date.now() }
      ]
    }
  });

  erdModel.nodes.set('PROFILE', {
    id: 'PROFILE',
    type: 'screen',
    label: 'PROFILE',
    data: {
      badge: 'ENTITY',
      attributes: [
        { type: 'int', name: 'userId', key: 'FK' },
        { type: 'string', name: 'bio' }
      ]
    }
  });

  erdModel.edges.push({
    id: 'e1',
    source: 'USER',
    target: 'PROFILE',
    label: 'has'
  });

  const exported = MermaidExporter.exportERD(erdModel);
  assert.ok(exported.includes('erDiagram'));
  assert.ok(exported.includes('USER ||--o{ PROFILE : "has"'));
  assert.ok(exported.includes('int id PK'));
  assert.ok(exported.includes('string username'));
  assert.ok(exported.includes('%% @comment [USER]: Auth identity table'));
});

test('MermaidSchemaParser extracts and parses multi-diagram markdown documents', () => {
  const markdown = `
# Project Architectural Flow

## Section 1: User Journey
\`\`\`mermaid
graph TD
  Start[App Opened] --> Lobby[League Lobby]
  Lobby --> Draft[Draft Room]
\`\`\`

## Section 2: Database Schema
\`\`\`mermaid
erDiagram
  LEAGUE ||--o{ TEAM : contains
  LEAGUE {
    uuid id PK
    string name
  }
\`\`\`
`;

  const sections = MermaidSchemaParser.extractMarkdownDiagramSections(markdown);
  assert.strictEqual(sections.length, 2);
  assert.strictEqual(sections[0].title, 'Section 1: User Journey');
  assert.strictEqual(sections[0].schemaType, 'FLOWCHART');
  assert.strictEqual(sections[1].title, 'Section 2: Database Schema');
  assert.strictEqual(sections[1].schemaType, 'ERD');

  const parsed = MermaidSchemaParser.parse(markdown, 'multi-diagram-test');
  assert.ok(parsed.nodes.length >= 4, 'Should parse nodes across all diagrams');
  assert.ok(parsed.edges.length >= 2, 'Should parse edges across all diagrams');
});

