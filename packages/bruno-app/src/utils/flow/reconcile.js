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
 *
 * @param {Array} flowNodes 图中现有节点
 * @param {Array} requestItems Flow 目录中的请求文件列表（每个 item 有 uid, name, pathname, filename, type 等）
 * @returns {Array} 需要新增的节点列表
 */
export function reconcileFlowNodes(flowNodes, requestItems) {
  if (!Array.isArray(flowNodes) || !Array.isArray(requestItems)) {
    return [];
  }

  // 建立图中已有 requestUid 的集合
  const existingRequestUids = new Set();
  for (const node of flowNodes) {
    if (node.type === 'request' && node.requestUid) {
      existingRequestUids.add(node.requestUid);
    }
  }

  // 找出图中没有的请求
  const newNodes = [];
  for (const request of requestItems) {
    if (!existingRequestUids.has(request.uid)) {
      newNodes.push({
        id: generateNodeStepId(),
        type: 'request',
        requestUid: request.uid,
        requestPath: request.filename || request.pathname,
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
 *
 * @param {Array} nodes 图中现有节点
 * @param {Array} edges 图中现有边
 * @param {Array} requestItems Flow 目录中的请求文件列表
 * @returns {{ nodes: Array, edges: Array }} 清理后的 nodes 和 edges
 */
export function removeOrphanedNodes(nodes, edges, requestItems) {
  if (!Array.isArray(nodes)) return { nodes: [], edges: edges || [] };
  if (!Array.isArray(edges)) edges = [];
  if (!Array.isArray(requestItems)) requestItems = [];

  // 建立有效 requestUid 的集合
  const validRequestUids = new Set();
  for (const request of requestItems) {
    validRequestUids.add(request.uid);
  }

  // 找出需要移除的节点 ID
  const orphanedNodeIds = new Set();
  const keptNodes = [];

  for (const node of nodes) {
    if (node.type === 'request') {
      if (!validRequestUids.has(node.requestUid)) {
        orphanedNodeIds.add(node.id);
      } else {
        keptNodes.push(node);
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

  return { nodes: keptNodes, edges: keptEdges };
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
