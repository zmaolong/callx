import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import isEqual from 'lodash/isEqual';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useDispatch, useSelector } from 'react-redux';
import { useTheme } from 'styled-components';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { IconFocusCentered, IconMap, IconMapOff } from '@tabler/icons';
import StartNode from './nodes/StartNode';
import EndNode from './nodes/EndNode';
import RequestNode from './nodes/RequestNode';
import LoopNode from './nodes/LoopNode';
import ConditionEdge from './edges/ConditionEdge';
import FlowContextMenu from './FlowContextMenu';
import StyledWrapper from './StyledWrapper';
import { STATUS_COLORS } from './constants';
import { LOOP_EDGE_KINDS } from 'utils/flow/graph';
import {
  updateFlowNodes,
  addFlowEdge,
  removeFlowEdge,
  removeFlowNode
} from 'providers/ReduxStore/slices/collections';

const nodeTypes = {
  start: StartNode,
  end: EndNode,
  request: RequestNode,
  loop: LoopNode
};

const edgeTypes = {
  condition: ConditionEdge
};

// 从 fromId 沿普通出边 BFS（不经过 avoidId、不走回边），判断能否到达 toId——用于循环回边判定
function isReachable(edgeList, fromId, toId, avoidId) {
  const queue = [fromId];
  const visited = new Set();
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === toId) return true;
    if (visited.has(current) || current === avoidId) continue;
    visited.add(current);
    for (const edge of edgeList) {
      if (edge.source === current && edge.loopKind !== LOOP_EDGE_KINDS.BACK) {
        queue.push(edge.target);
      }
    }
  }
  return false;
}

// 画布内视图控制条：适应视图 / 小地图开关（运行等全局操作已移至顶栏）
const ViewBar = styled.div`
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  background: ${(props) => props.theme.background.crust};
  border: 1px solid ${(props) => props.theme.border.border1};
  border-radius: ${(props) => props.theme.border.radius.md};
  box-shadow: ${(props) => props.theme.shadow.sm};
`;

const ViewButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: ${(props) => props.theme.border.radius.sm};
  background: transparent;
  color: ${(props) => props.$active
    ? props.theme.colors?.accent || '#3b82f6'
    : props.theme.colors?.text?.muted || '#64748b'};
  cursor: pointer;

  &:hover {
    background: ${(props) => props.theme.background.surface1};
    color: ${(props) => props.theme.text};
  }
`;

const FlowCanvas = ({
  flow,
  collectionUid,
  onSelectNode,
  onContextMenu,
  onUndo,
  onRedo,
  onBeforeDelete,
  onInstanceReady,
  requestInfoMap,
  onCancelRun,
  onSave
}) => {
  const dispatch = useDispatch();
  const theme = useTheme();
  const edgeColor = theme.colors?.text?.muted || theme.border?.border2 || '#64748b';
  // 条件边/循环节点边使用主题强调色（与 ConditionEdge 内部渲染一致）
  const accentColor = theme.accent || theme.colors?.accent || '#3b82f6';
  const reactFlowWrapper = useRef(null);
  const instanceRef = useRef(null);

  const flowRun = useSelector((state) => state.flowRun?.runs?.[flow?.uid]);

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState(null); // { x, y, paneX, paneY, node, edge }

  // 小地图开关
  const [showMiniMap, setShowMiniMap] = useState(true);

  const handleInit = useCallback((instance) => {
    instanceRef.current = instance;
    if (onInstanceReady) onInstanceReady(instance);
  }, [onInstanceReady]);

  const handleFitView = useCallback(() => {
    instanceRef.current?.fitView({ padding: 0.2, duration: 300 });
  }, []);

  const defaultEdgeOptions = {
    type: 'smoothstep',
    animated: false,
    style: { stroke: edgeColor, strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor }
  };

  // 将 flow 数据转换为 React Flow 格式
  const initialNodes = useMemo(() => {
    if (!flow?.flow?.nodes) return [];
    return flow.flow.nodes.map((n) => {
      const info = requestInfoMap?.[n.requestUid];
      return {
        id: n.id,
        type: n.type === 'start' ? 'start' : n.type === 'end' ? 'end' : n.type === 'loop' ? 'loop' : 'request',
        position: n.position || { x: 0, y: 0 },
        data: {
          ...n,
          label: n.alias || info?.name || n.id,
          collectionUid,
          method: info?.method,
          url: info?.url
        }
      };
    });
  }, [flow?.flow?.nodes, collectionUid, requestInfoMap]);

  const initialEdges = useMemo(() => {
    if (!flow?.flow?.edges) return [];
    return flow.flow.edges.map((e) => {
      if (e.condition) {
        // 条件边：虚线 + 强调色 + 箭头（此前漏掉 markerEnd，视觉上与普通边不统一）
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          type: 'condition',
          data: { condition: e.condition },
          style: { strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: accentColor }
        };
      }
      if (e.loopKind) {
        // 循环节点的 body/done 出边：附标签说明语义
        const labels = { body: '循环体', done: '完成后', back: '回边' };
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          label: labels[e.loopKind] || '',
          labelShowBg: true,
          labelBgPadding: [4, 1],
          labelBgBorderRadius: 6,
          labelBgStyle: { fill: theme.background?.crust, color: accentColor, fillOpacity: 1 },
          style: { strokeWidth: 2, stroke: accentColor, strokeDasharray: e.loopKind === 'back' ? '6 4' : undefined },
          markerEnd: { type: MarkerType.ArrowClosed, color: accentColor }
        };
      }
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        ...defaultEdgeOptions
      };
    });
  }, [flow?.flow?.edges, edgeColor, accentColor, theme]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState(null);

  // 同步外部数据变化到 React Flow 状态（使用深比较避免不必要的状态重置）
  const prevNodesRef = useRef(initialNodes);
  const prevEdgesRef = useRef(initialEdges);
  useEffect(() => {
    if (!isEqual(prevNodesRef.current, initialNodes)) {
      setNodes(initialNodes);
      prevNodesRef.current = initialNodes;
    }
    if (!isEqual(prevEdgesRef.current, initialEdges)) {
      setEdges(initialEdges);
      prevEdgesRef.current = initialEdges;
    }
  }, [initialNodes, initialEdges]);

  // 同步运行态到节点（executionStatus、duration、httpStatus、errorMessage、取消回调）
  // 依赖 initialNodes：图被外部重置（撤销/重做/同步）后重新叠加运行态，避免状态丢失
  useEffect(() => {
    if (!flowRun?.nodes) return;
    setNodes((nds) =>
      nds.map((n) => {
        const nodeState = flowRun.nodes[n.id];
        if (!nodeState) return n;
        return {
          ...n,
          data: {
            ...n.data,
            executionStatus: nodeState.status,
            duration: nodeState.duration,
            httpStatus: nodeState.httpStatus,
            errorMessage: nodeState.error,
            loopProgress: nodeState.loopProgress,
            onCancelRun
          }
        };
      })
    );
  }, [flowRun?.nodes, initialNodes, onCancelRun]);

  // 边动画：当前正在运行的节点对应的入边设置 animated: true
  useEffect(() => {
    if (!flowRun?.nodes) return;
    setEdges((eds) =>
      eds.map((e) => {
        const targetNodeState = flowRun.nodes[e.target];
        const isActive = targetNodeState?.status === 'running';
        return { ...e, animated: isActive };
      })
    );
  }, [flowRun?.nodes, initialEdges]);

  // 连线回调：校验合法性，失败给出明确提示
  const onConnect = useCallback(
    (connection) => {
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);

      if (!sourceNode || !targetNode) return;

      if (connection.source === connection.target) {
        toast.error('不能连接到节点自身');
        return;
      }

      const sourceType = sourceNode.data?.type || sourceNode.type;
      const targetType = targetNode.data?.type || targetNode.type;

      // 合法连线：Start→Request/Loop、Request→Request/Loop/End、Loop→Request/End
      const validTargets = {
        start: ['request', 'loop'],
        request: ['request', 'loop', 'end'],
        loop: ['request', 'end']
      };
      if (!(validTargets[sourceType] || []).includes(targetType)) {
        toast.error('连线方向不合法：Start/请求节点 → 请求/循环节点，循环节点 → 请求节点/End');
        return;
      }

      // 检查是否已存在相同连线
      const exists = edges.some(
        (e) => e.source === connection.source && e.target === connection.target
      );
      if (exists) {
        toast('这两个节点已经连线', { icon: 'ℹ️' });
        return;
      }

      // 循环节点连线语义：出边自动分配 循环体/完成后；入边自动区分 入口/回边
      let loopKind = null;
      if (sourceType === 'loop') {
        const outEdgeList = edges.filter((e) => e.source === connection.source);
        const hasBody = outEdgeList.some((e) => e.loopKind === LOOP_EDGE_KINDS.BODY);
        const hasDone = outEdgeList.some((e) => e.loopKind === LOOP_EDGE_KINDS.DONE);
        if (hasBody && hasDone) {
          toast.error('循环节点最多两条出边（循环体 / 完成后），如需调整请先删除连线');
          return;
        }
        loopKind = hasBody ? LOOP_EDGE_KINDS.DONE : LOOP_EDGE_KINDS.BODY;
        toast(loopKind === LOOP_EDGE_KINDS.BODY ? '已设为「循环体」出边' : '已设为「完成后」出边', { icon: 'ℹ️', duration: 2500 });
      } else if (targetType === 'loop') {
        const loopId = connection.target;
        const bodyEdge = edges.find((e) => e.source === loopId && e.loopKind === LOOP_EDGE_KINDS.BODY);
        // 源节点已在循环体内 → 回边；否则作为入口连线（入口仅允许一条）
        const inBody = bodyEdge
          ? isReachable(edges, bodyEdge.target, connection.source, loopId)
          : false;
        if (inBody) {
          const backCount = edges.filter((e) => e.target === loopId && e.loopKind === LOOP_EDGE_KINDS.BACK).length;
          if (backCount >= 1) {
            toast.error('循环节点只允许一条回边');
            return;
          }
          loopKind = LOOP_EDGE_KINDS.BACK;
          toast('已设为循环回边', { icon: 'ℹ️', duration: 2500 });
        } else if (edges.some((e) => e.target === loopId && !e.loopKind)) {
          toast.error('循环节点只能有一条入口连线');
          return;
        }
      }

      const newEdge = {
        id: `edge_${connection.source}_${connection.target}`,
        source: connection.source,
        target: connection.target,
        ...(loopKind ? { loopKind } : {})
      };

      // 记录撤销快照后写 Redux（与删边/删节点一致，连线可被 Ctrl+Z 撤销）
      if (onBeforeDelete) onBeforeDelete();

      setEdges((eds) => addEdge(newEdge, eds));
      dispatch(addFlowEdge({
        collectionUid,
        itemUid: flow.uid,
        edge: newEdge
      }));
    },
    [nodes, edges, dispatch, collectionUid, flow?.uid, onBeforeDelete]
  );

  // 节点位置变化时持久化（基于 flow 原始节点数据，保留 errorHandler 等全部字段）
  const onNodeDragStop = useCallback(
    (event, node) => {
      const flowNodes = flow?.flow?.nodes || [];
      const updatedNodes = flowNodes.map((n) => (n.id === node.id ? { ...n, position: node.position } : n));

      setNodes((nds) => nds.map((n) => (n.id === node.id ? { ...n, position: node.position } : n)));

      dispatch(updateFlowNodes({
        collectionUid,
        itemUid: flow.uid,
        nodes: updatedNodes
      }));
    },
    [flow?.flow?.nodes, dispatch, collectionUid, flow?.uid]
  );

  // 选中节点
  const onNodeClick = useCallback(
    (event, node) => {
      setSelectedNode(node);
      if (onSelectNode) onSelectNode(node);
    },
    [onSelectNode]
  );

  // 点击画布空白区域取消选中
  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    if (onSelectNode) onSelectNode(null);
  }, [onSelectNode]);

  // 删除边（双击）——先记录撤销快照
  const onEdgeDoubleClick = useCallback(
    (event, edge) => {
      if (onBeforeDelete) onBeforeDelete();
      setEdges((eds) => eds.filter((e) => e.id !== edge.id));
      dispatch(removeFlowEdge({
        collectionUid,
        itemUid: flow.uid,
        edgeId: edge.id
      }));
    },
    [dispatch, collectionUid, flow?.uid, onBeforeDelete]
  );

  // 删除选中节点（通过键盘 Delete）/ 撤销重做
  const onKeyDown = useCallback(
    (event) => {
      // Ctrl+S 保存
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        if (onSave) onSave();
        return;
      }
      // Ctrl+Z 撤销
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        onUndo?.();
        return;
      }
      // Ctrl+Shift+Z 或 Ctrl+Y 重做
      if ((event.ctrlKey || event.metaKey) && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
        event.preventDefault();
        onRedo?.();
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (!selectedNode) return;
        // 不允许删除 Start/End
        const nodeType = selectedNode.data?.type || selectedNode.type;
        if (nodeType === 'start' || nodeType === 'end') return;

        // 记录撤销快照（removeFlowNode 会级联删除关联边）
        if (onBeforeDelete) onBeforeDelete();

        // 从 ReactFlow state 中删除
        setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
        setEdges((eds) => eds.filter(
          (e) => e.source !== selectedNode.id && e.target !== selectedNode.id
        ));

        // 从 Redux 中删除节点（removeFlowNode 也会自动删除关联边）
        dispatch(removeFlowNode({
          collectionUid,
          itemUid: flow.uid,
          nodeId: selectedNode.id
        }));

        // 清除选中状态
        setSelectedNode(null);
        if (onSelectNode) onSelectNode(null);
      }
    },
    [selectedNode, dispatch, collectionUid, flow?.uid, onSelectNode, onUndo, onRedo, onBeforeDelete]
  );

  // 右键菜单
  const onNodeContextMenu = useCallback((event, node) => {
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      node,
      edge: null
    });
  }, []);

  const onEdgeContextMenu = useCallback((event, edge) => {
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      node: null,
      edge
    });
  }, []);

  const onPaneContextMenu = useCallback((event) => {
    event.preventDefault();
    // 屏幕坐标 → 画布坐标，保证缩放/平移后新节点落点正确
    let paneX = event.clientX;
    let paneY = event.clientY;
    if (instanceRef.current?.screenToFlowPosition) {
      const pos = instanceRef.current.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      paneX = pos.x;
      paneY = pos.y;
    }
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      paneX,
      paneY,
      node: null,
      edge: null
    });
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // 空画布引导：没有任何请求节点时显示
  const hasRequestNodes = useMemo(
    () => nodes.some((n) => (n.data?.type || n.type) === 'request'),
    [nodes]
  );

  return (
    <StyledWrapper className="flow-canvas-wrapper" ref={reactFlowWrapper}>
      <ViewBar>
        <ViewButton onClick={handleFitView} title="适应视图" aria-label="适应视图">
          <IconFocusCentered size={16} />
        </ViewButton>
        <ViewButton
          $active={showMiniMap}
          onClick={() => setShowMiniMap((prev) => !prev)}
          title={showMiniMap ? '隐藏小地图' : '显示小地图'}
          aria-label={showMiniMap ? '隐藏小地图' : '显示小地图'}
        >
          {showMiniMap ? <IconMap size={16} /> : <IconMapOff size={16} />}
        </ViewButton>
      </ViewBar>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onInit={handleInit}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onEdgeDoubleClick={onEdgeDoubleClick}
        onKeyDown={onKeyDown}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        deleteKeyCode={null}
        nodesDraggable={true}
        snapToGrid
        snapGrid={[16, 16]}
      >
        <Background color={theme.border?.border2 || '#aaa'} gap={16} />
        <Controls />
        {showMiniMap && (
          <MiniMap
            nodeColor={(node) => {
              if (node.type === 'start') return STATUS_COLORS.success;
              if (node.type === 'end') return STATUS_COLORS.failed;
              const executionStatus = node.data?.executionStatus;
              if (executionStatus && STATUS_COLORS[executionStatus]) return STATUS_COLORS[executionStatus];
              return STATUS_COLORS.idle;
            }}
            maskColor={theme.mode === 'dark' ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.08)'}
          />
        )}
      </ReactFlow>

      {!hasRequestNodes && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            zIndex: 5,
            textAlign: 'center',
            color: theme.colors?.text?.muted || '#94a3b8',
            fontSize: 13,
            lineHeight: 1.8
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600 }}>画布还没有请求节点</div>
          <div>右键画布空白处 → 「添加请求节点」，然后连线 Start → 请求 → End</div>
        </div>
      )}

      {contextMenu && (
        <FlowContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          paneX={contextMenu.paneX}
          paneY={contextMenu.paneY}
          node={contextMenu.node}
          edge={contextMenu.edge}
          onClose={handleCloseContextMenu}
          onAction={onContextMenu}
        />
      )}
    </StyledWrapper>
  );
};

export default FlowCanvas;
