import type { Item as BrunoItem } from '@usebruno/schema-types/collection/item';
import { uuid } from '../../../utils';

export interface FlowNode {
  id: string;
  type: 'start' | 'end' | 'request';
  requestUid?: string;
  requestPath?: string;
  alias?: string;
  position: { x: number; y: number };
  inputs?: Array<{
    name: string;
    source: {
      kind: 'flow' | 'literal';
      expression?: string;
      value?: unknown;
      valueType?: string;
    };
  }>;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
}

export interface FlowFile {
  info?: {
    name?: string;
    type: 'flow';
    seq?: number;
    tags?: string[];
  };
  flow?: {
    nodes?: FlowNode[];
    edges?: FlowEdge[];
  };
}

const parseFlow = (ocFlow: FlowFile): BrunoItem => {
  const info = ocFlow.info || { type: 'flow' as const };
  const flowData = ocFlow.flow || {};
  return {
    uid: uuid(),
    type: 'flow',
    seq: typeof info.seq === 'number' ? info.seq : 1,
    name: info.name || 'Flow',
    tags: Array.isArray(info.tags) ? info.tags : [],
    request: null,
    settings: null,
    app: null,
    fileContent: null,
    root: null,
    items: [],
    flow: {
      nodes: Array.isArray(flowData.nodes) ? flowData.nodes : [],
      edges: Array.isArray(flowData.edges) ? flowData.edges : []
    },
    examples: [],
    filename: null,
    pathname: null
  } as BrunoItem;
};

export default parseFlow;
