import { ViewportConfig } from '../device/DevicePresets';
import { FlowPosition, FlowPositionRecognizer, FlowPhase } from './FlowPositionRecognizer';
import { FlowSchemaMerger, FlowJunction } from './FlowSchemaMerger';
import {
  SpeechTranscriptItem,
  AudioTrackMetadata,
  AudioDubbingManager
} from '../audio/AudioDubbingManager';

export interface FlowComment {
  id: string;
  author: string;
  text: string;
  timestamp: number;
}

export interface FlowNode {
  id: string;
  label: string;
  type: 'screen' | 'component' | 'action' | 'handler' | 'breakpoint' | 'note';
  step?: number;
  timestamp: number;
  data: {
    title: string;
    subtitle?: string;
    componentName?: string;
    selector?: string;
    filePath?: string;
    lineNumber?: number;
    handlerName?: string;
    badge?: string;
    note?: string;
    coords?: { x: number; y: number };
    viewport?: ViewportConfig;
    flowPositionId?: string;
    flowPositionName?: string;
    flowPhase?: FlowPhase;
    route?: string;
    isJunction?: boolean;
    flowNames?: string[];
    isReturnCycle?: boolean;
    comments?: FlowComment[];
    attributes?: Array<{ type: string; name: string; key?: string }>;
  };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  timestamp: number;
  animated?: boolean;
  isReturn?: boolean;
  flowName?: string;
}

export interface SessionTimelineItem {
  step: number;
  type: string;
  timestamp: number;
  label: string;
  filePath?: string;
  lineNumber?: number;
  componentName?: string;
  handlerName?: string;
  flowPositionId?: string;
  flowPositionName?: string;
  flowPhase?: FlowPhase;
  details?: any;
}

export interface LandingPageInfo {
  title: string;
  subtitle?: string;
  url?: string;
  filePath?: string;
  componentName?: string;
}

export class FlowGraphModel {
  public sessionId: string = '';
  public startTime: number = Date.now();
  public nodes: Map<string, FlowNode> = new Map();
  public edges: FlowEdge[] = [];
  public timeline: SessionTimelineItem[] = [];
  public landingPage?: LandingPageInfo;
  public viewport?: ViewportConfig;
  public schemaType: 'FLOWCHART' | 'ERD' | 'STATE' | 'GENERIC' = 'FLOWCHART';

  // Flow Position Recognition & Schema State
  public positions: Map<string, FlowPosition> = new Map();
  public currentPosition?: FlowPosition;
  public activeBreadcrumb: string[] = [];
  public flowNames: string[] = [];

  // Audio Dubbing & Speech-to-Text Transcripts
  public audioTrack?: AudioTrackMetadata;
  public speechTranscripts: SpeechTranscriptItem[] = [];

  private lastNodeId: string | null = null;
  private currentScreenId: string = 'screen_root';
  private screenNodeByPosition: Map<string, string> = new Map(); // posId -> nodeId

  constructor(sessionId: string = `session_${Date.now()}`, landing?: LandingPageInfo, viewport?: ViewportConfig) {
    this.reset(sessionId, landing, viewport);
  }

  public reset(sessionId: string = `session_${Date.now()}`, landing?: LandingPageInfo, viewport?: ViewportConfig): void {
    this.sessionId = sessionId;
    this.startTime = Date.now();
    this.nodes.clear();
    this.edges = [];
    this.timeline = [];
    this.positions.clear();
    this.screenNodeByPosition.clear();
    this.lastNodeId = null;
    this.flowNames = [sessionId];
    this.schemaType = 'FLOWCHART';
    this.audioTrack = undefined;
    this.speechTranscripts = [];

    // Initial flow position for landing/root
    const route = landing?.url ? FlowPositionRecognizer.normalizeRoute(landing.url) : '/';
    const initialPos: FlowPosition = {
      id: `pos_route_${route.replace(/[^a-zA-Z0-9_]/g, '_')}`,
      name: landing?.title || 'Landing / Entry',
      route,
      rawUrl: landing?.url,
      title: landing?.title,
      component: landing?.componentName,
      phase: 'LANDING',
      breadcrumb: [landing?.title || 'Landing'],
      visitCount: 1,
      stepIndices: [0]
    };
    this.positions.set(initialPos.id, initialPos);
    this.currentPosition = initialPos;
    this.activeBreadcrumb = [...initialPos.breadcrumb];

    // Root initial screen node (Top of Schema & Beginning Point)
    this.currentScreenId = 'screen_root';
    this.setLandingPage(
      landing || {
        title: 'App Initialization',
        subtitle: 'Session initialized',
        url: 'http://localhost:3000'
      },
      viewport
    );
  }

  public setLandingPage(landing: LandingPageInfo, viewport?: ViewportConfig): FlowNode {
    this.landingPage = landing;
    this.viewport = viewport;

    const route = landing.url ? FlowPositionRecognizer.normalizeRoute(landing.url) : '/';
    const posId = `pos_route_${route.replace(/[^a-zA-Z0-9_]/g, '_')}`;

    if (!this.positions.has(posId)) {
      const pos: FlowPosition = {
        id: posId,
        name: landing.title,
        route,
        rawUrl: landing.url,
        title: landing.title,
        component: landing.componentName,
        phase: 'LANDING',
        breadcrumb: [landing.title],
        visitCount: 1,
        stepIndices: [0]
      };
      this.positions.set(posId, pos);
      this.currentPosition = pos;
      this.activeBreadcrumb = [landing.title];
    }

    const resolutionText = viewport
      ? `${viewport.width}×${viewport.height} (${viewport.presetName || viewport.category.toUpperCase()})`
      : '';
    const subtitle = landing.subtitle || (resolutionText ? `${landing.url || landing.filePath || 'Root'} • ${resolutionText}` : (landing.url || 'Top of Schema'));

    const rootNode: FlowNode = {
      id: this.currentScreenId,
      label: landing.title,
      type: 'screen',
      step: 0,
      timestamp: this.startTime,
      data: {
        title: landing.title,
        subtitle,
        componentName: landing.componentName,
        filePath: landing.filePath,
        badge: 'LANDING PAGE',
        viewport,
        flowPositionId: posId,
        flowPositionName: landing.title,
        flowPhase: 'LANDING',
        flowNames: [this.sessionId]
      }
    };

    this.nodes.set(this.currentScreenId, rootNode);
    this.screenNodeByPosition.set(posId, this.currentScreenId);
    this.lastNodeId = this.currentScreenId;

    return rootNode;
  }

  public addStepEvent(event: any): FlowNode {
    const step = event.step || this.timeline.length + 1;
    const timestamp = event.timestamp || Date.now();
    const nodeId = `step_${step}_${event.type}`;

    // Flow Position Recognition
    const prevPosition = this.currentPosition;
    const newPosition = FlowPositionRecognizer.computePosition(
      event,
      this.activeBreadcrumb,
      this.positions
    );

    // Detect if this is a return cycle to an already visited position
    const isReturningToVisitedPos = Boolean(
      prevPosition &&
      prevPosition.id !== newPosition.id &&
      newPosition.visitCount > 1
    );

    this.positions.set(newPosition.id, newPosition);
    this.currentPosition = newPosition;
    this.activeBreadcrumb = newPosition.breadcrumb;

    let label = `Step #${step}`;
    let type: FlowNode['type'] = 'action';
    let subtitle = event.type;
    let componentName = event.target?.componentName;
    let filePath = event.target?.filePath;
    let lineNumber = event.target?.lineNumber;
    let handlerName = event.target?.handlerName;

    if (event.type === 'EVENT_NAVIGATE') {
      type = 'screen';
      label = `Navigate: ${newPosition.route}`;
      subtitle = isReturningToVisitedPos ? `⮌ Return to ${newPosition.name}` : (event.url || 'Route Transition');
      this.currentScreenId = nodeId;
      this.screenNodeByPosition.set(newPosition.id, nodeId);
    } else if (event.type === 'EVENT_CLICK') {
      type = 'action';
      const targetText = event.target?.text ? ` "${event.target.text.slice(0, 20)}"` : '';
      label = `Click: ${componentName || event.target?.tagName || 'Element'}${targetText}`;
      subtitle = event.target?.selector || 'DOM Click';
    } else if (event.type === 'EVENT_SUBMIT') {
      type = 'action';
      label = `Submit Form: ${componentName || 'Form'}`;
      subtitle = event.target?.selector || 'DOM Submit';
    } else if (event.type === 'HOTKEY_PAUSE') {
      type = 'note';
      label = `Paused at (${event.x}, ${event.y})`;
      subtitle = 'Ghost Mouse Pin Active';
    } else if (event.type === 'HOTKEY_COMMENT') {
      type = 'note';
      label = `Note: ${event.comment}`;
      subtitle = 'User Annotation';
    } else if (event.type === 'HOTKEY_DEBUG') {
      type = 'breakpoint';
      label = `Debug: ${handlerName || componentName || 'Breakpoint'}`;
      subtitle = filePath ? `${filePath}:${lineNumber}` : 'Dynamic Breakpoint';
    }

    const node: FlowNode = {
      id: nodeId,
      label,
      type,
      step,
      timestamp,
      data: {
        title: label,
        subtitle,
        componentName,
        selector: event.target?.selector,
        filePath,
        lineNumber,
        handlerName,
        badge: isReturningToVisitedPos ? '⮌ RETURN' : type.toUpperCase(),
        coords: event.x && event.y ? { x: event.x, y: event.y } : undefined,
        flowPositionId: newPosition.id,
        flowPositionName: newPosition.name,
        flowPhase: newPosition.phase,
        route: newPosition.route,
        isReturnCycle: isReturningToVisitedPos,
        flowNames: [this.sessionId]
      }
    };

    this.nodes.set(nodeId, node);

    // Link from previous node
    if (this.lastNodeId && this.lastNodeId !== nodeId) {
      const edgeLabel = isReturningToVisitedPos
        ? `⮌ Return to ${newPosition.name}`
        : event.type.replace('EVENT_', '').replace('HOTKEY_', '');

      this.edges.push({
        id: `edge_${this.lastNodeId}_to_${nodeId}`,
        source: this.lastNodeId,
        target: nodeId,
        label: edgeLabel,
        timestamp,
        animated: true,
        isReturn: isReturningToVisitedPos
      });
    }

    // Also link to handler function node if handler exists
    if (handlerName) {
      const handlerNodeId = `handler_${nodeId}`;
      if (!this.nodes.has(handlerNodeId)) {
        this.nodes.set(handlerNodeId, {
          id: handlerNodeId,
          label: `fn: ${handlerName}()`,
          type: 'handler',
          timestamp,
          data: {
            title: `${handlerName}()`,
            subtitle: filePath ? `${filePath}:${lineNumber || 1}` : 'Code Handler',
            filePath,
            lineNumber,
            badge: 'CODE',
            flowPositionId: newPosition.id,
            flowPositionName: newPosition.name
          }
        });
        this.edges.push({
          id: `edge_${nodeId}_to_${handlerNodeId}`,
          source: nodeId,
          target: handlerNodeId,
          label: 'calls',
          timestamp,
          animated: false
        });
      }
    }

    this.lastNodeId = nodeId;

    this.timeline.push({
      step,
      type: event.type,
      timestamp,
      label,
      filePath,
      lineNumber,
      componentName,
      handlerName,
      flowPositionId: newPosition.id,
      flowPositionName: newPosition.name,
      flowPhase: newPosition.phase,
      details: event
    });

    return node;
  }

  /**
   * Merges an external or alternate flow schema with this graph model at common junctions.
   */
  public mergeWithFlow(incoming: FlowGraphModel, flowName?: string): FlowJunction[] {
    const res = FlowSchemaMerger.merge(this, incoming, flowName || incoming.sessionId);
    if (!this.flowNames.includes(flowName || incoming.sessionId)) {
      this.flowNames.push(flowName || incoming.sessionId);
    }
    return res.junctions;
  }

  /**
   * Adds an annotation / comment to a specific node.
   */
  public addCommentToNode(nodeId: string, text: string, author: string = 'Developer'): FlowComment | null {
    const node = this.nodes.get(nodeId);
    if (!node) return null;

    const comment: FlowComment = {
      id: `comment_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      author,
      text,
      timestamp: Date.now()
    };

    if (!node.data.comments) {
      node.data.comments = [];
    }
    node.data.comments.push(comment);
    node.data.note = text;

    this.timeline.push({
      step: this.timeline.length + 1,
      type: 'HOTKEY_COMMENT',
      timestamp: comment.timestamp,
      label: `Comment on ${node.data.title || node.label}: "${text}"`,
      componentName: node.data.componentName,
      filePath: node.data.filePath,
      lineNumber: node.data.lineNumber,
      flowPositionId: node.data.flowPositionId,
      flowPositionName: node.data.flowPositionName,
      flowPhase: node.data.flowPhase,
      details: { comment: text, nodeId, author }
    });

    return comment;
  }

  /**
   * Updates properties of an existing node in the schema (editing).
   */
  public updateNodeData(
    nodeId: string,
    updates: Partial<FlowNode['data']> & { label?: string; type?: FlowNode['type'] }
  ): FlowNode | null {
    const node = this.nodes.get(nodeId);
    if (!node) return null;

    if (updates.label !== undefined) {
      node.label = updates.label;
    } else if (updates.title !== undefined) {
      node.label = updates.title;
    }
    if (updates.type !== undefined) {
      node.type = updates.type;
    }

    const { label: _l, type: _t, ...dataUpdates } = updates;
    node.data = {
      ...node.data,
      ...dataUpdates
    };

    // If route or title changed, update corresponding FlowPosition if present
    if (node.data.flowPositionId && this.positions.has(node.data.flowPositionId)) {
      const pos = this.positions.get(node.data.flowPositionId)!;
      if (dataUpdates.title) pos.name = dataUpdates.title;
      if (dataUpdates.route) pos.route = dataUpdates.route;
    }

    return node;
  }

  /**
   * Adds or updates a speech-to-text transcript item for a flow step.
   */
  public addSpeechTranscript(transcript: SpeechTranscriptItem): SpeechTranscriptItem {
    // Remove existing transcript for same step or id if present
    this.speechTranscripts = this.speechTranscripts.filter(t => t.id !== transcript.id && t.step !== transcript.step);
    this.speechTranscripts.push(transcript);
    this.speechTranscripts.sort((a, b) => a.timestampMs - b.timestampMs || a.step - b.step);

    // Also attach to corresponding node as a comment if node exists
    const matchingNode = Array.from(this.nodes.values()).find(n => n.step === transcript.step);
    if (matchingNode) {
      if (!matchingNode.data.comments) {
        matchingNode.data.comments = [];
      }
      const existingVoiceComment = matchingNode.data.comments.find(c => c.author === 'Voiceover');
      if (existingVoiceComment) {
        existingVoiceComment.text = transcript.text;
        existingVoiceComment.timestamp = Date.now();
      } else {
        matchingNode.data.comments.push({
          id: `comment_voice_${transcript.id}`,
          author: 'Voiceover',
          text: transcript.text,
          timestamp: Date.now()
        });
      }
    }

    return transcript;
  }

  /**
   * Updates an existing transcript text by id.
   */
  public updateSpeechTranscript(id: string, newText: string): boolean {
    const item = this.speechTranscripts.find(t => t.id === id);
    if (!item) return false;
    item.text = newText;
    return true;
  }

  /**
   * Deletes a transcript by id.
   */
  public deleteSpeechTranscript(id: string): boolean {
    const prevLen = this.speechTranscripts.length;
    this.speechTranscripts = this.speechTranscripts.filter(t => t.id !== id);
    return this.speechTranscripts.length < prevLen;
  }

  /**
   * Clears all recorded transcripts.
   */
  public clearSpeechTranscripts(): void {
    this.speechTranscripts = [];
  }

  /**
   * Sets the recorded audio track metadata.
   */
  public setAudioTrack(track: AudioTrackMetadata): void {
    this.audioTrack = track;
    if (track.transcripts && track.transcripts.length > 0) {
      track.transcripts.forEach(t => this.addSpeechTranscript(t));
    }
  }

  /**
   * Formats all speech transcripts into Markdown, Plain Text, SRT, or Jira format.
   */
  public getFormattedTranscript(format: 'markdown' | 'text' | 'plain' | 'srt' | 'jira' = 'markdown'): string {
    const title = this.landingPage?.title || this.sessionId;
    switch (format) {
      case 'text':
      case 'plain':
        return AudioDubbingManager.toPlainTextTranscript(this.speechTranscripts);
      case 'srt':
        return AudioDubbingManager.toSrtSubtitles(this.speechTranscripts);
      case 'jira':
        return AudioDubbingManager.toJiraIssueFormat(title, this.speechTranscripts, this);
      case 'markdown':
      default:
        return AudioDubbingManager.toMarkdownTranscript(title, this.speechTranscripts, this);
    }
  }

  /**
   * Resets this model and replaces all state with an imported model or parsed schema result.
   */
  public loadFromModel(incoming: FlowGraphModel | any): void {
    const src = incoming?.model ? incoming.model : incoming;
    if (!src) return;

    this.sessionId = src.sessionId || this.sessionId;
    this.startTime = src.startTime || Date.now();
    this.landingPage = src.landingPage;
    this.viewport = src.viewport;
    this.schemaType = src.schemaType || incoming.schemaType || 'FLOWCHART';
    this.flowNames = src.flowNames && src.flowNames.length ? [...src.flowNames] : [this.sessionId];
    this.audioTrack = src.audioTrack;
    this.speechTranscripts = Array.isArray(src.speechTranscripts) ? [...src.speechTranscripts] : [];

    this.nodes.clear();
    if (src.nodes instanceof Map) {
      for (const [id, node] of src.nodes.entries()) {
        this.nodes.set(id, { ...node, data: { ...node.data } });
      }
    } else if (Array.isArray(src.nodes)) {
      for (const node of src.nodes) {
        this.nodes.set(node.id, { ...node, data: { ...node.data } });
      }
    }

    this.edges = Array.isArray(src.edges) ? src.edges.map((e: any) => ({ ...e })) : [];
    this.timeline = Array.isArray(src.timeline) ? src.timeline.map((t: any) => ({ ...t })) : [];

    this.positions.clear();
    if (src.positions instanceof Map) {
      for (const [id, pos] of src.positions.entries()) {
        this.positions.set(id, { ...pos });
      }
    } else if (Array.isArray(src.positions)) {
      for (const pos of src.positions) {
        this.positions.set(pos.id, { ...pos });
      }
    }

    this.currentPosition = src.currentPosition;
    this.activeBreadcrumb = src.activeBreadcrumb ? [...src.activeBreadcrumb] : [];
    this.lastNodeId = this.nodes.size > 0 ? Array.from(this.nodes.keys())[this.nodes.size - 1] : null;
  }

  public toJSON() {
    return {
      sessionId: this.sessionId,
      startTime: this.startTime,
      schemaType: this.schemaType,
      landingPage: this.landingPage,
      viewport: this.viewport,
      currentPosition: this.currentPosition,
      activeBreadcrumb: this.activeBreadcrumb,
      positions: Array.from(this.positions.values()),
      flowNames: this.flowNames,
      nodes: Array.from(this.nodes.values()),
      edges: this.edges,
      timeline: this.timeline,
      audioTrack: this.audioTrack,
      speechTranscripts: this.speechTranscripts
    };
  }
}
