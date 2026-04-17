export type RawOperationalNodeType =
  | 'AICapability'
  | 'API'
  | 'Defect'
  | 'Deployment'
  | 'Feature'
  | 'Language'
  | 'Product'
  | 'RCA'
  | 'Region'
  | 'Requirement'
  | 'Screen'
  | 'Service'
  | 'TestCase'
  | 'TestSuite'
  | 'UserJourney';

export type OperationalNodeType = RawOperationalNodeType | 'NodeClassReference';

export type OperationalNodeGroup =
  | 'ai'
  | 'api'
  | 'defect'
  | 'deployment'
  | 'feature'
  | 'journey'
  | 'language'
  | 'nodeClass'
  | 'product'
  | 'rca'
  | 'region'
  | 'requirement'
  | 'screen'
  | 'service'
  | 'testcase'
  | 'testsuite';

export interface RawOperationalGraphMeta {
  name: string;
  version: string;
  description?: string;
  format: 'nodes-links';
  nodeCount?: number;
  linkCount?: number;
  isFictional: boolean;
}

export interface RawOperationalGraphNode {
  id: string;
  label: string;
  type: RawOperationalNodeType;
  group: Exclude<OperationalNodeGroup, 'nodeClass'>;
  description?: string;
  summary?: string;
  [key: string]: unknown;
}

export interface RawOperationalGraphLink {
  id?: string;
  source: string;
  target: string;
  type: string;
  label?: string;
  weight?: number;
  [key: string]: unknown;
}

export interface RawOperationalGraphDataset {
  meta: RawOperationalGraphMeta;
  nodeTypes: RawOperationalNodeType[];
  edgeTypes: string[];
  nodes: RawOperationalGraphNode[];
  links: RawOperationalGraphLink[];
}

export interface GraphFilterState {
  query: string;
  nodeType: 'all' | RawOperationalNodeType;
  showLabels: boolean;
}

export interface OperationalGraphNode {
  id: string;
  label: string;
  type: OperationalNodeType;
  group: OperationalNodeGroup;
  description?: string;
  summary?: string;
  attributes: Record<string, unknown>;
  displayType: string;
  accent: string;
  symbolKey: string;
  shortLabel: string;
  cluster: {
    x: number;
    y: number;
  };
  connectionCount: number;
  isSynthetic?: boolean;
  referencedType?: RawOperationalNodeType;
}

export interface OperationalGraphLink {
  id: string;
  source: string;
  target: string;
  type: string;
  label: string;
  inverseLabel?: string;
  family: string;
  accent: string;
  width: number;
  dasharray?: string;
  weight?: number;
}

export interface OperationalGraphDataset {
  meta: RawOperationalGraphMeta & {
    displayNodeCount: number;
    displayLinkCount: number;
    nodeTypeCount: number;
    aiCapabilityCount: number;
    syntheticNodeCount: number;
  };
  nodeTypes: RawOperationalNodeType[];
  edgeTypes: string[];
  nodes: OperationalGraphNode[];
  links: OperationalGraphLink[];
}

export interface SelectedNodeState {
  node: OperationalGraphNode;
  connectedCount: number;
  relationGroupCount: number;
  relationGroups: Array<{
    key: string;
    title: string;
    items: Array<{
      id: string;
      label: string;
      type: OperationalNodeType;
      displayType: string;
    }>;
  }>;
}

export type GraphAction =
  | { type: 'selectNode'; nodeId: string }
  | { type: 'focusNode'; nodeId: string }
  | { type: 'highlightNode'; nodeId: string }
  | { type: 'highlightNeighbors'; nodeId: string; depth?: 1 | 2 | 3 }
  | { type: 'highlightNeighborhood'; nodeId: string; depth?: 1 | 2 | 3 }
  | { type: 'filterNodeTypes'; nodeTypes: RawOperationalNodeType[] }
  | { type: 'fitSelectionIntoView'; nodeIds?: string[] }
  | { type: 'highlightShortestPath'; fromNodeId: string; toNodeId: string }
  | { type: 'resetGraphState' };

export interface GraphChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  createdAt: string;
  referencedNodeIds?: string[];
  actions?: GraphAction[];
  actionFeedback?: string[];
  isError?: boolean;
}

export interface GraphTraversalResult {
  seedNodeIds: string[];
  depth: number;
  nodeIds: string[];
  edgeIds: string[];
}

export interface GraphQueryContext {
  graphMeta: OperationalGraphDataset['meta'];
  schema: {
    nodeTypes: RawOperationalNodeType[];
    relationshipTypes: string[];
  };
  currentView: {
    selectedNodeId: string | null;
    manualFilterType: 'all' | RawOperationalNodeType;
    assistantFilterTypes: RawOperationalNodeType[] | null;
    showLabels: boolean;
  };
  candidateNodes: Array<{
    id: string;
    label: string;
    type: OperationalNodeType;
    summary?: string;
    connectionCount: number;
  }>;
  expandedNeighborhoods: Array<{
    seedNodeId: string;
    depth: number;
    nodes: Array<{
      id: string;
      label: string;
      type: OperationalNodeType;
      summary?: string;
    }>;
    links: Array<{
      source: string;
      target: string;
      type: string;
      label: string;
    }>;
  }>;
  nodes: Array<{
    id: string;
    label: string;
    type: OperationalNodeType;
    displayType: string;
    summary?: string;
    attributes: Record<string, unknown>;
    connectionCount: number;
  }>;
  links: Array<{
    id: string;
    source: string;
    target: string;
    type: string;
    label: string;
    inverseLabel?: string;
  }>;
  history?: Array<{
    role: 'user' | 'assistant' | 'system';
    text: string;
  }>;
}

export interface GraphAssistantResponse {
  answer: string;
  referencedNodeIds: string[];
  actions: GraphAction[];
}
