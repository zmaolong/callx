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
import ConditionEdge from './edges/ConditionEdge';
import FlowContextMenu from './FlowContextMenu';
import StyledWrapper from './StyledWrapper';
import { STATUS_COLORS } from './constants';
import {
  updateFlowNodes,
  addFlowEdge,
  removeFlowEdge,
  removeFlowNode
} from 'providers/ReduxStore/slices/collections';

const nodeTypes = {
  start: StartNode,
  end: EndNode,
  request: RequestNode
};

const edgeTypes = {
  condition: ConditionEdge
};

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
  onSave
}) => {
  const dispatch = useDispatch();
  const theme = useTheme();
  const edgeColor = theme.colors?.text?.muted || theme.border?.border2 || '#64748b';
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
        type: n.type === 'start' ? 'start' : n.type === 'end' ? 'end' : 'request',
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
    return flow.flow.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      ...(e.condition
        ? { type: 'condition', data: { condition: e.condition }, style: { strokeWidth: 2 } }
        : { ...defaultEdgeOptions })
    }));
  }, [flow?.flow?.edges, edgeColor]);

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

  // 同步运行态到节点（executionStatus、duration、httpStatus、errorMessage）
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
            errorMessage: nodeState.error
          }
        };
      })
    );
  }, [flowRun?.nodes]);

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
  }, [flowRun?.nodes]);

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

      // 合法连线规则：Start→Request、Request→Request、Request→End
      const validPairs = [
        ['start', 'request'],
        ['request', 'request'],
        ['request', 'end']
      ];
      const isValid = validPairs.some(
        ([s, t]) => sourceType === s && targetType === t
      );

      if (!isValid) {
        toast.error('连线方向不合法：只能从 Start/请求节点 连向 请求节点/End');
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

      const newEdge = {
        id: `edge_${connection.source}_${connection.target}`,
        source: connection.source,
        target: connection.target,
        ...defaultEdgeOptions
      };

      setEdges((eds) => addEdge(newEdge, eds));
      dispatch(addFlowEdge({
        collectionUid,
        itemUid: flow.uid,
        edge: {
          id: newEdge.id,
          source: newEdge.source,
          target: newEdge.target
        }
      }));
    },
    [nodes, edges, dispatch, collectionUid, flow?.uid]
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
