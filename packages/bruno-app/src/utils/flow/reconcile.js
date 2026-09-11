/**
 * Flow 节点 reconcile 函数
 *
 * 负责在 Flow 目录中的请求文件与图节点之间保持同步。
 * 所有函数都是纯函数，不依赖 Redux 或外部状态。
 */
import { generateNodeStepId } from './graph';
import { uuid } from 'utils/common';

/**
 * 对 Flow 目录中的每个请求，若图中无对应节点则生成未连接 Request 节点。
 * 支持通过 requestUid / requestPath / alias 匹配已有节点，避免重启后 uid 变更导致重复创建。
 *
 * @param {Array} flowNodes 图中现有节点
 * @param {Array} requestItems Flow 目录中的请求文件列表（每个 item 有 uid, name, pathname, filename, type 等）
 * @returns {Array} 需要新增的节点列表
 */
export function reconcileFlowNodes(flowNodes, requestItems) {
  if (!Array.isArray(flowNodes) || !Array.isArray(requestItems)) {
    return [];
  }

  // 建立图中已有 requestUid / requestPath / alias 的集合
  const existingRequestUids = new Set();
  const existingRequestPaths = new Set();
  const existingAliases = new Set(); // 保存时可能缺 requestPath，alias 作为回退
  for (const node of flowNodes) {
    if (node.type === 'request' && node.requestUid) {
      existingRequestUids.add(node.requestUid);
    }
    if (node.type === 'request' && node.requestPath) {
      existingRequestPaths.add(node.requestPath);
    }
    if (node.type === 'request' && node.alias) {
      existingAliases.add(node.alias);
    }
  }

  // 找出图中没有的请求
  const newNodes = [];
  for (const request of requestItems) {
    if (!existingRequestUids.has(request.uid)) {
      const rp = request.filename || request.pathname;
      const rn = request.name;
      // 如果已有节点通过 requestPath 或 alias 指向此请求，不重复创建
      if ((rp && existingRequestPaths.has(rp)) || (rn && existingAliases.has(rn))) {
        continue;
      }
      newNodes.push({
        id: generateNodeStepId(),
        type: 'request',
        requestUid: request.uid,
        requestPath: request.filename || request.pathname || '',
        alias: request.name || '',
        position: {
          x: 320 + Math.random() * 200, // 随机偏移避免重叠
          y: 200 + Math.random() * 100
        },
        inputs: []
      });
    }
  }

  return newNodes;
}

/**
 * 移除图中引用但文件不存在的节点及其关联边。
 * 支持通过 requestPath 或 alias 回退匹配：重启后文件 uid 可能变化，此时保留节点并更新 requestUid。
 *
 * @param {Array} nodes 图中现有节点
 * @param {Array} edges 图中现有边
 * @param {Array} requestItems Flow 目录中的请求文件列表
 * @returns {{ nodes: Array, edges: Array, nodesToUpdateUid: Array }}
 *   nodesToUpdateUid — [{ nodeId, newUid }]，调用方需 dispatch updateFlowNode 更新节点
 */
export function removeOrphanedNodes(nodes, edges, requestItems) {
  if (!Array.isArray(nodes)) return { nodes: [], edges: edges || [], nodesToUpdateUid: [] };
  if (!Array.isArray(edges)) edges = [];
  if (!Array.isArray(requestItems)) requestItems = [];

  // 建立有效 requestUid / requestPath / alias → uid 的映射
  const validRequestUids = new Set();
  const requestPathToUid = new Map();
  const aliasToUid = new Map();
  for (const request of requestItems) {
    validRequestUids.add(request.uid);
    const rp = request.filename || request.pathname;
    if (rp) requestPathToUid.set(rp, request.uid);
    if (request.name) aliasToUid.set(request.name, request.uid);
  }

  // 找出需要移除的节点 + 需要更新 requestUid 的节点
  const orphanedNodeIds = new Set();
  const keptNodes = [];
  const nodesToUpdateUid = [];

  for (const node of nodes) {
    if (node.type === 'request') {
      if (validRequestUids.has(node.requestUid)) {
        // uid 精确匹配 — 保留
        keptNodes.push(node);
      } else if (node.requestPath && requestPathToUid.has(node.requestPath)) {
        // requestUid 不匹配但 requestPath 匹配（重启后 uid 变更），保留节点并更新 uid
        const newUid = requestPathToUid.get(node.requestPath);
        keptNodes.push({ ...node, requestUid: newUid });
        nodesToUpdateUid.push({ nodeId: node.id, newUid });
      } else if (node.alias && aliasToUid.has(node.alias)) {
        // requestPath 也不匹配，但 alias 匹配（已保存的旧数据没有 requestPath），保留并更新
        const newUid = aliasToUid.get(node.alias);
        // 补全 requestPath
        const request = requestItems.find(r => r.uid === newUid);
        const rp = request ? (request.filename || request.pathname || '') : '';
        keptNodes.push({ ...node, requestUid: newUid, requestPath: rp });
        nodesToUpdateUid.push({ nodeId: node.id, newUid });
      } else {
        // 完全无匹配 — 标记为孤儿
        orphanedNodeIds.add(node.id);
      }
    } else {
      // Start/End 节点始终保留
      keptNodes.push(node);
    }
  }

  // 移除与孤儿节点关联的边
  const keptEdges = edges.filter(
    (edge) => !orphanedNodeIds.has(edge.source) && !orphanedNodeIds.has(edge.target)
  );

  return { nodes: keptNodes, edges: keptEdges, nodesToUpdateUid };
}

/**
 * 为请求生成默认的未连接节点。
 *
 * @param {Object} requestItem 请求文件 item
 * @param {number} [offsetX] 可选 X 偏移
 * @param {number} [offsetY] 可选 Y 偏移
 * @returns {Object} 节点对象
 */
export function createNodeForRequest(requestItem, offsetX = 320, offsetY = 200) {
  return {
    id: generateNodeStepId(),
    type: 'request',
    requestUid: requestItem.uid,
    requestPath: requestItem.filename || requestItem.pathname || '',
    alias: requestItem.name || '',
    position: {
      x: offsetX,
      y: offsetY
    },
    inputs: []
  };
}