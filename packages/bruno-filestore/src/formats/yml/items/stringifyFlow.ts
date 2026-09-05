import type { Item as BrunoItem } from '@usebruno/schema-types/collection/item';
import { stringifyYml } from '../utils';

const stringifyFlow = (item: BrunoItem): string => stringifyYml({
  info: {
    name: item.name?.trim() || 'Flow',
    type: 'flow',
    ...(typeof item.seq === 'number' ? { seq: item.seq } : {}),
    ...(item.tags?.length ? { tags: item.tags } : {})
  },
  flow: { steps: item.flow?.steps || [] }
});

export default stringifyFlow;
