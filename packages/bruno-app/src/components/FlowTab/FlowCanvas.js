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
import StartNode from './nodes/StartNode';
import EndNode from './nodes/EndNode';
import RequestNode from './nodes/RequestNode';
import FlowToolbar from './FlowToolbar';
import FlowContextMenu from './FlowContextMenu';
import StyledWrapper from './StyledWrapper';
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

const FlowCanvas = ({ flow, collectionUid, onSelectNode, toolbarProps, onContextMenu, onUndo, onRedo }) => {
  const dispatch = useDispatch();
  const theme = useTheme();
  const edgeColor = theme.colors?.text?.muted || theme.border?.border2 || '#64748b';
  const reactFlowWrapper = useRef(null);

  const flowRun = useSelector((state) => state.flowRun?.runs?.[flow?.uid]);

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState(null); // { x, y, node, edge }

  const defaultEdgeOptions = {
    type: 'smoothstep',
    animated: false,
    style: { stroke: edgeColor, strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor }
  };

  // 将 flow 数据转换为 React Flow 格式
  const initialNodes = useMemo(() => {
    if (!flow?.flow?.nodes) return [];
    return flow.flow.nodes.map((n) => ({
      id: n.id,
      type: n.type === 'start' ? 'start' : n.type === 'end' ? 'end' : 'request',
      position: n.position || { x: 0, y: 0 },
      data: {
        ...n,
        label: n.alias || n.id,
        collectionUid
      }
    }));
  }, [flow?.flow?.nodes, collectionUid]);

  const initialEdges = useMemo(() => {
    if (!flow?.flow?.edges) return [];
    return flow.flow.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      ...defaultEdgeOptions
    }));
  }, [flow?.flow?.edges]);

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

  // 同步运行态到节点（executionStatus、duration、httpStatus）
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
            httpStatus: nodeState.httpStatus
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

  // 连线回调：校验合法性
  const onConnect = useCallback(
    (connection) => {
      // 检查 source 和 target 节点类型
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);

      if (!sourceNode || !targetNode) return;

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

      if (!isValid) return;

      // 检查是否已存在相同连线
      const exists = edges.some(
        (e) => e.source === connection.source && e.target === connection.target
      );
      if (exists) return;

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

  // 节点位置变化时持久化
  const onNodeDragStop = useCallback(
    (event, node) => {
      const updatedNodes = nodes.map((n) => {
        if (n.id === node.id) {
          return { ...n, position: node.position };
        }
        return n;
      });
      setNodes(updatedNodes);

      dispatch(updateFlowNodes({
        collectionUid,
        itemUid: flow.uid,
        nodes: updatedNodes.map((n) => ({
          id: n.id,
          type: n.data?.type || n.type,
          position: n.position,
          requestUid: n.data?.requestUid,
          requestPath: n.data?.requestPath,
          alias: n.data?.alias,
          inputs: n.data?.inputs || []
        }))
      }));
    },
    [nodes, dispatch, collectionUid, flow?.uid]
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

  // 删除边
  const onEdgeDoubleClick = useCallback(
    (event, edge) => {
      setEdges((eds) => eds.filter((e) => e.id !== edge.id));
      dispatch(removeFlowEdge({
        collectionUid,
        itemUid: flow.uid,
        edgeId: edge.id
      }));
    },
    [dispatch, collectionUid, flow?.uid]
  );

  // 删除选中节点（通过键盘 Delete）/ 撤销重做
  const onKeyDown = useCallback(
    (event) => {
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

        // 删除关联的边（ReactFlow state）
        const connectedEdgeIds = edges
          .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
          .map((e) => e.id);
        connectedEdgeIds.forEach((edgeId) => {
          dispatch(removeFlowEdge({
            collectionUid,
            itemUid: flow.uid,
            edgeId
          }));
        });

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
    [selectedNode, edges, dispatch, collectionUid, flow?.uid, onSelectNode, onUndo, onRedo]
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
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      node: null,
      edge: null
    });
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  return (
    <StyledWrapper className="flow-canvas-wrapper" ref={reactFlowWrapper}>
      <FlowToolbar
        onRun={toolbarProps?.onRun}
        onCancel={toolbarProps?.onCancel}
        onAutoLayout={toolbarProps?.onAutoLayout}
        onUndo={toolbarProps?.onUndo}
        onRedo={toolbarProps?.onRedo}
        canUndo={toolbarProps?.canUndo}
        canRedo={toolbarProps?.canRedo}
        isRunning={toolbarProps?.isRunning}
        errors={toolbarProps?.errors}
      />
      <ReactFlow
        nodes={nodes}
        edges={edges}
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
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        deleteKeyCode={null}
        nodesDraggable={true}
        snapToGrid
        snapGrid={[16, 16]}
      >
        <Background color={theme.border?.border2 || '#aaa'} gap={16} />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === 'start') return '#22c55e';
            if (node.type === 'end') return '#ef4444';
            return '#3b82f6';
          }}
          maskColor={theme.mode === 'dark' ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.08)'}
        />
      </ReactFlow>

      {contextMenu && (
        <FlowContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
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
