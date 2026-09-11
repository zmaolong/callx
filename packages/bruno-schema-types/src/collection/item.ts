import type { UID } from '../common';
import type { Request } from '../requests';
import type { Example } from './examples';
import type { FolderRoot } from './folder';

export type ItemType
  = | 'http-request'
    | 'graphql-request'
    | 'folder'
    | 'js'
    | 'app'
    | 'flow'
    | 'grpc-request'
    | 'ws-request';

export interface HttpItemSettings {
  encodeUrl?: boolean | null;
  followRedirects?: boolean | null;
  maxRedirects?: number | null;
  timeout?: number | 'inherit' | null;
  forwardAuthorizationHeader?: boolean | null;
  omitHeaders?: string[] | null;
  hostEnabled?: boolean | null;
}

export interface WebSocketItemSettings {
  settings?: {
    timeout?: number | null;
    keepAliveInterval?: number | null;
  } | null;
}

export type ItemSettings = HttpItemSettings | WebSocketItemSettings | null;

export interface App {
  code?: string | null;
  enabled?: boolean | null;
}

export type FlowInputSource = {
  kind: 'flow' | 'literal';
  expression?: string;
  value?: unknown;
  valueType?: 'string' | 'number' | 'boolean' | 'json' | 'null';
};

export interface FlowInputMapping {
  name: string;
  source: FlowInputSource;
}

export interface FlowNode {
  id: string;
  type: 'start' | 'end' | 'request';
  requestUid?: string;
  requestPath?: string;
  alias?: string;
  position: { x: number; y: number };
  inputs?: FlowInputMapping[];
  errorHandler?: FlowErrorHandler | null;
}

export interface FlowEdgeCondition {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'regex';
  value: unknown;
  expression?: string;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  label?: string;
  condition?: FlowEdgeCondition | null;
}

export type ErrorHandlerStrategy = 'stop' | 'continue' | 'jump';

export interface FlowErrorHandler {
  strategy: ErrorHandlerStrategy;
  jumpToNodeId?: string;
  retryCount?: number;
}

export interface Flow {
  nodes?: FlowNode[] | null;
  edges?: FlowEdge[] | null;
}

export interface Item {
  uid: UID;
  type: ItemType;
  seq?: number | null;
  name: string;
  description?: string | null;
  tags?: string[] | null;
  request?: Request | null;
  settings?: ItemSettings;
  app?: App | null;
  flow?: Flow | null;
  fileContent?: string | null;
  root?: FolderRoot | null;
  items?: Item[] | null;
  examples?: Example[] | null;
  filename?: string | null;
  pathname?: string | null;
}
