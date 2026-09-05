import type { Item as BrunoItem } from '@usebruno/schema-types/collection/item';
import { uuid } from '../../../utils';

export interface FlowFile {
  info?: {
    name?: string;
    type: 'flow';
    seq?: number;
    tags?: string[];
  };
  steps?: unknown[];
  flow?: { steps?: unknown[] };
}

const parseFlow = (ocFlow: FlowFile): BrunoItem => {
  const info = ocFlow.info || { type: 'flow' as const };
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
    flow: { steps: Array.isArray(ocFlow.flow?.steps) ? ocFlow.flow!.steps : (Array.isArray(ocFlow.steps) ? ocFlow.steps : []) },
    examples: [],
    filename: null,
    pathname: null
  } as BrunoItem;
};

export default parseFlow;
