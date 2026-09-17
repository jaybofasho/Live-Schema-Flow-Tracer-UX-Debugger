import { FlowGraphModel, FlowNode, FlowEdge, FlowComment } from '../graph/FlowGraphModel';
import { FlowPositionRecognizer, FlowPosition } from '../graph/FlowPositionRecognizer';

export interface MarkdownDiagramSection {
  title: string;
  schemaType: 'FLOWCHART' | 'ERD' | 'STATE' | 'GENERIC';
  rawContent: string;
  index: number;
}

export interface ParsedSchemaResult {
  schemaType: 'FLOWCHART' | 'ERD' | 'STATE' | 'GENERIC';
  model: FlowGraphModel;
  nodes: FlowNode[];
  edges: FlowEdge[];
  warnings: string[];
}

export class MermaidSchemaParser {
  /**
   * Extracts discrete named mermaid or ERD diagram code blocks from a markdown document.
   */
  public static extractMarkdownDiagramSections(markdown: string): MarkdownDiagramSection[] {
    const sections: MarkdownDiagramSection[] = [];
    const lines = markdown.split('\n');
    let currentHeading = 'Diagram';
    let inFence = false;
    let fenceLang = '';
    let fenceLines: string[] = [];
    let sectionIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headingMatch = line.match(/^#{1,4}\s+(.+)/);
      if (headingMatch && !inFence) {
        currentHeading = headingMatch[1].trim();
      }

      const fenceStartMatch = line.match(/^```([a-zA-Z0-9_-]*)/);
      if (fenceStartMatch && !inFence) {
        inFence = true;
        fenceLang = fenceStartMatch[1].toLowerCase();
        fenceLines = [];
        continue;
      }

      if (line.match(/^```\s*$/) && inFence) {
        inFence = false;
        const blockContent = fenceLines.join('\n').trim();
        if (blockContent) {
          const type = this.detectSchemaType(blockContent);
          if (fenceLang === 'mermaid' || fenceLang === 'mmd' || type !== 'GENERIC') {
            sectionIndex++;
            sections.push({
              title: currentHeading || `Section ${sectionIndex}`,
              schemaType: type,
              rawContent: blockContent,
              index: sectionIndex
            });
          }
        }
        continue;
      }

      if (inFence) {
        fenceLines.push(line);
      }
    }

    return sections;
  }

  /**
   * Detects the type of schema diagram from raw text.
   */
  public static detectSchemaType(raw: string): 'FLOWCHART' | 'ERD' | 'STATE' | 'GENERIC' {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{') || (trimmed.includes('"nodes"') && trimmed.includes('"edges"'))) {
      return 'GENERIC';
    }
    const clean = trimmed.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
    if (clean.startsWith('erDiagram') || clean.includes('\nerDiagram')) {
      return 'ERD';
    }
    if (clean.startsWith('stateDiagram') || clean.includes('\nstateDiagram')) {
      return 'STATE';
    }
    if (clean.startsWith('graph') || clean.startsWith('flowchart') || clean.includes('\ngraph') || clean.includes('\nflowchart')) {
      return 'FLOWCHART';
    }
    return 'GENERIC';
  }

  /**
   * Parses raw Mermaid or JSON schema text into a populated FlowGraphModel.
   */
  public static parseToModel(raw: string, sessionId: string = `imported_${Date.now()}`): FlowGraphModel {
    const result = this.parse(raw, sessionId);
    return result.model;
  }

  /**
   * Comprehensive parser for Mermaid (Flowchart, ERD, State) and JSON schemas.
   */
  public static parse(raw: string, sessionId: string = `imported_${Date.now()}`): ParsedSchemaResult {
    const warnings: string[] = [];
    const schemaType = this.detectSchemaType(raw);
    const model = new FlowGraphModel(sessionId);
    model.schemaType = schemaType;

    // Reset default root to allow clean import
    model.nodes.clear();
    model.edges = [];
    model.timeline = [];
    model.positions.clear();

    const trimmed = raw.trim();

    // 1. JSON Schema handling
    if (trimmed.startsWith('{')) {
      try {
        const json = JSON.parse(trimmed);
        if (json.nodes && Array.isArray(json.nodes)) {
          for (const n of json.nodes) {
            model.nodes.set(n.id, n);
          }
        }
        if (json.edges && Array.isArray(json.edges)) {
          model.edges = [...json.edges];
        }
        if (json.positions && Array.isArray(json.positions)) {
          for (const p of json.positions) {
            model.positions.set(p.id, p);
          }
        }
        if (json.schemaType) {
          model.schemaType = json.schemaType;
        }
        return {
          schemaType: model.schemaType,
          model,
          nodes: Array.from(model.nodes.values()),
          edges: model.edges,
          warnings
        };
      } catch (err: any) {
        warnings.push(`JSON parse error: ${err.message}`);
      }
    }

    // 2. Check for markdown documents with discrete diagram sections
    const markdownSections = this.extractMarkdownDiagramSections(trimmed);
    if (markdownSections.length > 0) {
      for (const section of markdownSections) {
        const secLines = section.rawContent.split('\n').map(l => l.trim());
        if (section.schemaType === 'ERD') {
          this.parseERD(secLines, model, warnings);
        } else if (section.schemaType === 'STATE') {
          this.parseStateDiagram(secLines, model, warnings);
        } else {
          this.parseFlowchart(secLines, model, warnings);
        }
      }
      return {
        schemaType: model.schemaType,
        model,
        nodes: Array.from(model.nodes.values()),
        edges: model.edges,
        warnings
      };
    }

    // 3. Single diagram or direct raw text
    const clean = trimmed
      .replace(/^```[a-z]*\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    const lines = clean.split('\n').map(l => l.trim());

    if (schemaType === 'ERD') {
      this.parseERD(lines, model, warnings);
    } else if (schemaType === 'STATE') {
      this.parseStateDiagram(lines, model, warnings);
    } else {
      this.parseFlowchart(lines, model, warnings);
    }

    return {
      schemaType: model.schemaType,
      model,
      nodes: Array.from(model.nodes.values()),
      edges: model.edges,
      warnings
    };
  }

  /**
   * Parses Mermaid Flowcharts / Graphs (graph TD, flowchart LR, etc.)
   */
  private static parseFlowchart(lines: string[], model: FlowGraphModel, warnings: string[]): void {
    let stepCount = 1;

    for (const rawLine of lines) {
      if (!rawLine || rawLine.startsWith('graph ') || rawLine.startsWith('flowchart ') || rawLine.startsWith('classDef ')) {
        continue;
      }

      // Check for comments / annotations
      if (rawLine.startsWith('%%')) {
        this.parseCommentLine(rawLine, model);
        continue;
      }

      // Check for edge in line: A --> B, A["Title"] --> B["Title"], A -->|label| B, etc.
      const arrowRegex = /(-->|-.->|==>|--\s*[^->]+\s*-->)/;
      const arrowMatch = rawLine.match(arrowRegex);

      if (arrowMatch && arrowMatch.index !== undefined) {
        const leftPart = rawLine.substring(0, arrowMatch.index).trim();
        const arrow = arrowMatch[0].trim();
        let rightPart = rawLine.substring(arrowMatch.index + arrowMatch[0].length).trim();

        let edgeLabel = '';
        if (arrow.startsWith('--') && arrow.includes('-->')) {
          const inlineMatch = arrow.match(/--\s*([^->]+)\s*-->/);
          if (inlineMatch) edgeLabel = inlineMatch[1].trim().replace(/^["']|["']$/g, '');
        }

        if (rightPart.startsWith('|')) {
          const pipeMatch = rightPart.match(/^\|([^|]+)\|\s*(.*)/);
          if (pipeMatch) {
            edgeLabel = pipeMatch[1].trim().replace(/^["']|["']$/g, '');
            rightPart = pipeMatch[2].trim();
          }
        }

        const sourceId = this.parseNodePiece(leftPart, model, stepCount++);
        const targetId = this.parseNodePiece(rightPart, model, stepCount++);

        if (sourceId && targetId) {
          const isReturn = arrow.includes('.-');
          model.edges.push({
            id: `edge_${sourceId}_to_${targetId}_${model.edges.length}`,
            source: sourceId,
            target: targetId,
            label: edgeLabel,
            timestamp: Date.now(),
            animated: isReturn || arrow.includes('=='),
            isReturn
          });
        }
      } else {
        // Standalone node definition on line
        this.parseNodePiece(rawLine, model, stepCount++);
      }
    }
  }

  /**
   * Parses Mermaid Entity-Relationship Diagrams (erDiagram)
   */
  private static parseERD(lines: string[], model: FlowGraphModel, warnings: string[]): void {
    let currentEntityNode: FlowNode | null = null;
    let stepCount = 1;

    for (const rawLine of lines) {
      if (!rawLine || rawLine.startsWith('erDiagram') || rawLine.startsWith('classDef ')) {
        continue;
      }

      // Comment check
      if (rawLine.startsWith('%%')) {
        this.parseCommentLine(rawLine, model);
        continue;
      }

      // Entity closing brace
      if (rawLine === '}') {
        currentEntityNode = null;
        continue;
      }

      // Inside entity block: attribute declaration (e.g. string name PK "customer name")
      if (currentEntityNode && !rawLine.includes('{') && !rawLine.includes('--')) {
        const attrParts = rawLine.split(/\s+/).filter(Boolean);
        if (attrParts.length >= 2) {
          const type = attrParts[0];
          const name = attrParts[1];
          const key = attrParts.slice(2).find(p => ['PK', 'FK', 'UK'].includes(p.toUpperCase()));

          if (!currentEntityNode.data.attributes) {
            currentEntityNode.data.attributes = [];
          }
          currentEntityNode.data.attributes.push({ type, name, key });

          // Update subtitle with attribute summary
          const attrSummary = currentEntityNode.data.attributes
            .map(a => `${a.name}${a.key ? ` (${a.key})` : ''}`)
            .join(' • ');
          currentEntityNode.data.subtitle = attrSummary;
        }
        continue;
      }

      // Entity declaration block start: CUSTOMER {
      const entityBlockMatch = rawLine.match(/^([a-zA-Z0-9_\-]+)\s*\{/);
      if (entityBlockMatch) {
        const entityName = entityBlockMatch[1].trim();
        currentEntityNode = this.ensureNodeExists(model, entityName, 'component');
        currentEntityNode.label = entityName;
        currentEntityNode.data.title = entityName;
        currentEntityNode.data.badge = 'ENTITY';
        currentEntityNode.data.attributes = [];
        continue;
      }

      // Entity Relationship syntax:
      // CUSTOMER ||--o{ ORDER : places
      // ORDER ||--|{ LINE-ITEM : "contains items"
      const erdRelRegex = /([a-zA-Z0-9_\-]+)\s*([|o}{.\-]+)\s*([a-zA-Z0-9_\-]+)\s*:\s*([^%]+)/;
      const relMatch = rawLine.match(erdRelRegex);
      if (relMatch) {
        const entityA = relMatch[1].trim();
        const cardinality = relMatch[2].trim();
        const entityB = relMatch[3].trim();
        const label = relMatch[4].trim().replace(/^["']|["']$/g, '');

        const nodeA = this.ensureNodeExists(model, entityA, 'component');
        nodeA.data.badge = 'ENTITY';
        const nodeB = this.ensureNodeExists(model, entityB, 'component');
        nodeB.data.badge = 'ENTITY';

        model.edges.push({
          id: `edge_${entityA}_to_${entityB}_${model.edges.length}`,
          source: entityA,
          target: entityB,
          label: label || cardinality,
          timestamp: Date.now(),
          animated: cardinality.includes('..') || cardinality.includes('o')
        });
      }
    }
  }

  /**
   * Parses Mermaid State Diagrams (stateDiagram-v2)
   */
  private static parseStateDiagram(lines: string[], model: FlowGraphModel, warnings: string[]): void {
    let stepCount = 1;

    for (const rawLine of lines) {
      if (!rawLine || rawLine.startsWith('stateDiagram')) continue;

      if (rawLine.startsWith('%%')) {
        this.parseCommentLine(rawLine, model);
        continue;
      }

      // State transition: StateA --> StateB : Event
      const transitionRegex = /([*a-zA-Z0-9_\-]+)\s*-->\s*([*a-zA-Z0-9_\-]+)(?:\s*:\s*(.*))?/;
      const match = rawLine.match(transitionRegex);
      if (match) {
        const source = match[1] === '[*]' ? 'state_initial' : match[1];
        const target = match[2] === '[*]' ? 'state_final' : match[2];
        const eventLabel = (match[3] || '').trim();

        const srcNode = this.ensureNodeExists(model, source, source === 'state_initial' ? 'screen' : 'action');
        if (source === 'state_initial') {
          srcNode.label = '[*] Initial';
          srcNode.data.badge = 'INITIAL STATE';
        } else {
          srcNode.data.badge = 'STATE';
        }

        const tgtNode = this.ensureNodeExists(model, target, target === 'state_final' ? 'screen' : 'action');
        if (target === 'state_final') {
          tgtNode.label = '[*] Final';
          tgtNode.data.badge = 'FINAL STATE';
        } else {
          tgtNode.data.badge = 'STATE';
        }

        model.edges.push({
          id: `edge_${source}_to_${target}_${model.edges.length}`,
          source,
          target,
          label: eventLabel,
          timestamp: Date.now(),
          animated: true
        });
      } else {
        // State declaration with description: stateId : description
        const descMatch = rawLine.match(/^([a-zA-Z0-9_\-]+)\s*:\s*(.*)/);
        if (descMatch) {
          const stateId = descMatch[1].trim();
          const desc = descMatch[2].trim();
          const node = this.ensureNodeExists(model, stateId, 'action');
          node.data.subtitle = desc;
          node.data.badge = 'STATE';
        }
      }
    }
  }

  /**
   * Parses a single node definition string or node fragment (e.g. `STEP1["Title"]` or `STEP1`).
   */
  private static parseNodePiece(piece: string, model: FlowGraphModel, step: number): string | null {
    const trimmed = piece.trim();
    if (!trimmed) return null;

    // Regex for node shapes: id{{"..."}} | id>...] | id[...] | id(...) | id{...}
    const nodeRegex = /^([a-zA-Z0-9_\-]+)\s*(?:(\{\{|\(|\[|\>|\(\[|\{\()\s*(["']?)(.*?)\3\s*(\}\}|\)|\]|\)\}|\}\)))?(?:::([a-zA-Z0-9_\-]+))?$/;
    const match = trimmed.match(nodeRegex);

    if (match) {
      const id = match[1].trim();
      const openBracket = match[2];
      let rawText = match[4];
      const styleClass = match[6];

      let title = id;
      let subtitle: string | undefined;
      let isJunction = false;
      let badge: string | undefined;
      let type: FlowNode['type'] = 'action';

      if (rawText) {
        const breakParts = rawText.split(/<br\s*\/?>/i);
        title = breakParts[0].replace(/<[^>]*>/g, '').replace(/^[🔀🛑\s]+/, '').trim();

        if (breakParts[1]) {
          subtitle = breakParts[1].replace(/<[^>]*>/g, '').trim();
        }
      }

      if (openBracket === '{{' || styleClass === 'junction' || rawText?.includes('[JUNCTION]') || rawText?.includes('🔀')) {
        isJunction = true;
        badge = '🔀 JUNCTION';
        type = 'screen';
      } else if (styleClass === 'screen') {
        type = 'screen';
        badge = 'SCREEN';
      } else if (styleClass === 'handler') {
        type = 'handler';
        badge = 'HANDLER';
      } else if (styleClass === 'breakpoint' || rawText?.includes('🛑')) {
        type = 'breakpoint';
        badge = 'BREAKPOINT';
      } else if (styleClass === 'note' || openBracket === '>') {
        type = 'note';
        badge = 'NOTE';
      }

      const node = this.ensureNodeExists(model, id, type);
      if (rawText || !node.label) {
        node.label = title;
        node.data.title = title;
      }
      if (subtitle) node.data.subtitle = subtitle;
      if (badge) node.data.badge = badge;
      if (isJunction) node.data.isJunction = true;
      if (node.step === undefined || node.step === 0) {
        node.step = step;
      }

      const route = id.startsWith('screen_') ? `/${id.replace('screen_', '')}` : `/${id}`;
      const pos = FlowPositionRecognizer.computePosition(
        { route, title, target: { route, title } },
        model.activeBreadcrumb,
        model.positions
      );
      node.data.flowPositionId = pos.id;
      node.data.flowPositionName = pos.name;
      node.data.flowPhase = pos.phase;
      node.data.route = pos.route;

      return id;
    }

    // Fallback: extract leading identifier
    const idMatch = trimmed.match(/^([a-zA-Z0-9_\-]+)/);
    if (idMatch) {
      const id = idMatch[1];
      this.ensureNodeExists(model, id, 'action');
      return id;
    }
    return null;
  }

  /**
   * Parses comments such as `%% @comment [nodeId]: text` or `%% note: text`
   */
  private static parseCommentLine(line: string, model: FlowGraphModel): void {
    const commentMatch = line.match(/^%%\s*(?:@comment\s*\[([a-zA-Z0-9_\-]+)\]|note\s*\[?([a-zA-Z0-9_\-]+)?\]?)\s*:\s*(.*)/i);
    if (commentMatch) {
      const targetId = commentMatch[1] || commentMatch[2];
      const commentText = commentMatch[3].trim();

      if (targetId && model.nodes.has(targetId)) {
        model.addCommentToNode(targetId, commentText, 'Author');
      } else if (model.nodes.size > 0) {
        // Attach to latest node
        const latestId = Array.from(model.nodes.keys())[model.nodes.size - 1];
        model.addCommentToNode(latestId, commentText, 'Author');
      }
    }
  }

  /**
   * Helper to ensure a node exists in the model or instantiate a placeholder.
   */
  private static ensureNodeExists(model: FlowGraphModel, id: string, defaultType: FlowNode['type']): FlowNode {
    if (model.nodes.has(id)) {
      return model.nodes.get(id)!;
    }

    const node: FlowNode = {
      id,
      label: id,
      type: defaultType,
      step: model.nodes.size + 1,
      timestamp: Date.now(),
      data: {
        title: id,
        badge: defaultType.toUpperCase(),
        flowNames: [model.sessionId]
      }
    };

    model.nodes.set(id, node);
    return node;
  }
}
