import { FlowGraphModel, FlowNode, FlowEdge } from './FlowGraphModel';
import { FlowPosition } from './FlowPositionRecognizer';

export interface FlowJunction {
  positionId: string;
  name: string;
  route: string;
  nodeId: string;
  flowCount: number;
  flowNames: string[];
}

export class FlowSchemaMerger {
  /**
   * Finds common junction points where two flow graphs intersect.
   */
  public static findJunctions(modelA: FlowGraphModel, modelB: FlowGraphModel): FlowJunction[] {
    const junctions: FlowJunction[] = [];
    const positionsA = modelA.positions;
    const positionsB = modelB.positions;

    for (const [posId, posA] of positionsA.entries()) {
      if (positionsB.has(posId)) {
        const posB = positionsB.get(posId)!;
        // Find matching node ID
        const matchedNodeA = Array.from(modelA.nodes.values()).find(
          n => n.data?.flowPositionId === posId
        ) || (posA.route === '/' ? modelA.nodes.get('screen_root') : undefined);

        junctions.push({
          positionId: posId,
          name: posA.name || posB.name,
          route: posA.route,
          nodeId: matchedNodeA ? matchedNodeA.id : `junction_${posId}`,
          flowCount: 2,
          flowNames: [modelA.sessionId, modelB.sessionId]
        });
      }
    }

    return junctions;
  }

  /**
   * Merges an incoming flow graph into a target flow graph, unifying shared positions
   * and connecting branching and converging paths.
   */
  public static merge(
    target: FlowGraphModel,
    incoming: FlowGraphModel,
    incomingFlowName: string = 'Incoming Flow'
  ): { mergedModel: FlowGraphModel; junctions: FlowJunction[] } {
    const junctions = this.findJunctions(target, incoming);
    const junctionPosIds = new Set(junctions.map(j => j.positionId));

    const incomingNodeIdMap = new Map<string, string>(); // oldId -> newOrExistingId

    // 1. Map and merge nodes
    for (const incomingNode of incoming.nodes.values()) {
      const posId = incomingNode.data?.flowPositionId;

      // Check if this node corresponds to an existing junction position in target
      if (posId && junctionPosIds.has(posId)) {
        // Find corresponding node in target
        const existingTargetNode = Array.from(target.nodes.values()).find(
          n => n.data?.flowPositionId === posId
        ) || ((incomingNode.id === 'screen_root' || incomingNode.data?.route === '/') ? target.nodes.get('screen_root') : undefined);

        if (existingTargetNode) {
          incomingNodeIdMap.set(incomingNode.id, existingTargetNode.id);

          // Mark existing target node as a verified junction
          existingTargetNode.data.isJunction = true;
          existingTargetNode.data.badge = '🔀 JUNCTION';
          existingTargetNode.data.flowNames = Array.from(
            new Set([...(existingTargetNode.data.flowNames || [target.sessionId]), incomingFlowName])
          );
          continue;
        }
      }

      // If not a shared junction, add the incoming node with an aliased ID to avoid collision
      const aliasedNodeId = `merged_${incoming.sessionId}_${incomingNode.id}`;
      incomingNodeIdMap.set(incomingNode.id, aliasedNodeId);

      const clonedNode: FlowNode = {
        ...incomingNode,
        id: aliasedNodeId,
        data: {
          ...incomingNode.data,
          route: incomingNode.data?.route || incomingNode.data?.flowPositionName,
          flowNames: [incomingFlowName]
        }
      };
      target.nodes.set(aliasedNodeId, clonedNode);
    }

    // 2. Merge edges
    for (const incomingEdge of incoming.edges) {
      const remappedSource = incomingNodeIdMap.get(incomingEdge.source) || incomingEdge.source;
      const remappedTarget = incomingNodeIdMap.get(incomingEdge.target) || incomingEdge.target;

      // Prevent self-loops unless original was a cycle
      if (remappedSource === remappedTarget && incomingEdge.source !== incomingEdge.target) {
        continue;
      }

      const mergedEdgeId = `edge_${remappedSource}_to_${remappedTarget}_${incoming.sessionId}`;

      // Check if duplicate edge already exists
      const existingEdge = target.edges.find(
        e => e.source === remappedSource && e.target === remappedTarget
      );

      if (!existingEdge) {
        target.edges.push({
          id: mergedEdgeId,
          source: remappedSource,
          target: remappedTarget,
          label: `${incomingEdge.label || ''} (${incomingFlowName})`.trim(),
          timestamp: incomingEdge.timestamp,
          animated: incomingEdge.animated
        });
      }
    }

    // 3. Merge positions map
    for (const [posId, pos] of incoming.positions.entries()) {
      if (target.positions.has(posId)) {
        const existingPos = target.positions.get(posId)!;
        existingPos.visitCount += pos.visitCount;
      } else {
        target.positions.set(posId, { ...pos });
      }
    }

    return { mergedModel: target, junctions };
  }
}
