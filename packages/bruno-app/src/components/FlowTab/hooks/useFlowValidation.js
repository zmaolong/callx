/**
 * useFlowValidation — 图校验、错误明细展示与节点定位。
 *
 * errors 为实时校验结果（供顶栏错误弹层）；handleValidate 供运行前校验复用，
 * 避免两处各自调 validateGraph 产生分叉。
 */
import { useCallback, useMemo } from 'react';
import { validateGraph } from 'utils/flow/graph';

export function useFlowValidation({ flow, setSelectedNodeId, canvasInstanceRef }) {
  const nodes = flow?.flow?.nodes;
  const edges = flow?.flow?.edges;

  const handleValidate = useCallback(() => {
    if (!flow?.flow) return [];
    return validateGraph(flow.flow.nodes || [], flow.flow.edges || []);
  }, [flow?.flow]);

  // 校验错误（附加节点显示名，供顶栏错误弹层展示与定位）
  const errors = useMemo(() => {
    if (!nodes) return [];
    const nodeNames = {};
    for (const n of nodes || []) {
      nodeNames[n.id] = n.alias || n.id;
    }
    return validateGraph(nodes || [], edges || []).map((e) => ({
      ...e,
      nodeName: e.nodeId
        ? (nodeNames[e.nodeId] || e.nodeId)
        : (e.edgeId ? `边 ${e.edgeId}` : null)
    }));
  }, [nodes, edges]);

  // 定位节点：选中并居中到画布
  const focusNode = useCallback((nodeId) => {
    if (!nodeId) return;
    setSelectedNodeId(nodeId);
    const node = (nodes || []).find((n) => n.id === nodeId);
    const instance = canvasInstanceRef.current;
    if (node?.position && instance?.setCenter) {
      instance.setCenter(node.position.x + 100, node.position.y + 30, { zoom: 1.2, duration: 400 });
    }
  }, [nodes, setSelectedNodeId, canvasInstanceRef]);

  // 点击错误明细 → 定位到相关节点
  const handleFocusError = useCallback((error) => {
    let nodeId = error?.nodeId;
    if (!nodeId && error?.edgeId) {
      const edge = (edges || []).find((e) => e.id === error.edgeId);
      nodeId = edge?.source;
    }
    if (!nodeId) return;
    focusNode(nodeId);
  }, [edges, focusNode]);

  return { errors, handleValidate, focusNode, handleFocusError };
}

export default useFlowValidation;
