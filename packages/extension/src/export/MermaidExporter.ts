import { FlowGraphModel } from '../graph/FlowGraphModel';

export class MermaidExporter {
  public static export(model: FlowGraphModel): string {
    if (model.schemaType === 'ERD') {
      return this.exportERD(model);
    }
    return this.exportFlowchart(model);
  }

  public static exportFlowchart(model: FlowGraphModel): string {
    const lines: string[] = [];
    lines.push('```mermaid');
    lines.push('graph TD');
    lines.push('  %% Styles');
    lines.push('  classDef screen fill:#1e293b,stroke:#38bdf8,stroke-width:2px,color:#fff;');
    lines.push('  classDef junction fill:#3b0764,stroke:#c084fc,stroke-width:2.5px,color:#f3e8ff;');
    lines.push('  classDef action fill:#0f172a,stroke:#818cf8,stroke-width:1.5px,color:#f8fafc;');
    lines.push('  classDef handler fill:#064e3b,stroke:#34d399,stroke-width:1.5px,color:#ecfdf5;');
    lines.push('  classDef breakpoint fill:#701a75,stroke:#f472b6,stroke-width:2px,color:#fff;');
    lines.push('  classDef note fill:#312e81,stroke:#a78bfa,stroke-width:1.5px,color:#f5f3ff;');
    lines.push('  classDef assertion fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#fff;');
    lines.push('  classDef network fill:#1e1b4b,stroke:#6366f1,stroke-width:1.5px,color:#e0e7ff;');
    lines.push('');

    // Nodes
    for (const [id, node] of model.nodes.entries()) {
      const sanitizedId = id.replace(/[^a-zA-Z0-9_]/g, '_');
      const cleanTitle = (node.data.title || node.label).replace(/"/g, "'");
      const cleanSubtitle = (node.data.subtitle || '').replace(/"/g, "'");
      const labelText = cleanSubtitle ? `"${cleanTitle}<br/><i>${cleanSubtitle}</i>"` : `"${cleanTitle}"`;

      if (node.data.isJunction) {
        lines.push(`  ${sanitizedId}{{"🔀 ${cleanTitle}<br/><b>[JUNCTION]</b>"}}:::junction`);
      } else if (node.data.badge === 'ASSERTION') {
        lines.push(`  ${sanitizedId}{{"✅ ${cleanTitle}"}}:::assertion`);
      } else if (node.data.badge === 'API') {
        lines.push(`  ${sanitizedId}[/"🌐 ${cleanTitle}"/]:::network`);
      } else if (node.type === 'screen') {
        lines.push(`  ${sanitizedId}[${labelText}]:::screen`);
      } else if (node.type === 'handler') {
        lines.push(`  ${sanitizedId}("${labelText}"):::handler`);
      } else if (node.type === 'breakpoint') {
        lines.push(`  ${sanitizedId}{{"🛑 ${cleanTitle}"}}:::breakpoint`);
      } else if (node.type === 'note') {
        lines.push(`  ${sanitizedId}>"${cleanTitle}"]:::note`);
      } else {
        lines.push(`  ${sanitizedId}["${cleanTitle}"]:::action`);
      }

      // Export comments attached to this node
      if (node.data.comments && node.data.comments.length > 0) {
        for (const c of node.data.comments) {
          lines.push(`  %% @comment [${sanitizedId}]: ${c.text.replace(/\n/g, ' ')}`);
        }
      }
    }

    lines.push('');

    // Edges
    for (const edge of model.edges) {
      const src = edge.source.replace(/[^a-zA-Z0-9_]/g, '_');
      const tgt = edge.target.replace(/[^a-zA-Z0-9_]/g, '_');
      const edgeLabel = edge.label ? `|"${edge.label.replace(/"/g, "'")}"|` : '';

      if (edge.isReturn) {
        lines.push(`  ${src} -.->${edgeLabel} ${tgt}`);
      } else {
        lines.push(`  ${src} -->${edgeLabel} ${tgt}`);
      }
    }

    lines.push('```');
    return lines.join('\n');
  }

  public static exportERD(model: FlowGraphModel): string {
    const lines: string[] = [];
    lines.push('```mermaid');
    lines.push('erDiagram');

    // Export Entities
    for (const [id, node] of model.nodes.entries()) {
      const entityName = id.replace(/[^a-zA-Z0-9_-]/g, '_');
      const attrs = node.data.attributes || [];

      if (attrs.length > 0) {
        lines.push(`  ${entityName} {`);
        for (const a of attrs) {
          const keyStr = a.key ? ` ${a.key}` : '';
          lines.push(`    ${a.type || 'string'} ${a.name}${keyStr}`);
        }
        lines.push(`  }`);
      } else {
        lines.push(`  ${entityName}`);
      }

      // Comments on entity
      if (node.data.comments && node.data.comments.length > 0) {
        for (const c of node.data.comments) {
          lines.push(`  %% @comment [${entityName}]: ${c.text.replace(/\n/g, ' ')}`);
        }
      }
    }

    lines.push('');

    // Export Relationships
    for (const edge of model.edges) {
      const src = edge.source.replace(/[^a-zA-Z0-9_-]/g, '_');
      const tgt = edge.target.replace(/[^a-zA-Z0-9_-]/g, '_');
      let cardinality = '||--o{';
      let relLabel = 'relates';

      if (edge.label) {
        const parts = edge.label.split(/\s+/);
        if (parts[0] && /[|o}{.-]/.test(parts[0])) {
          cardinality = parts[0];
          relLabel = parts.slice(1).join(' ') || 'relates';
        } else {
          relLabel = edge.label;
        }
      }

      lines.push(`  ${src} ${cardinality} ${tgt} : "${relLabel.replace(/"/g, "'")}"`);
    }

    lines.push('```');
    return lines.join('\n');
  }
}
