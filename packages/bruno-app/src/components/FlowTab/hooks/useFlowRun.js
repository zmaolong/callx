/**
 * useFlowRun — Flow 运行编排。
 *
 * 整链运行 / 运行到此（stop-at）/ 单跑节点 / 取消，以及运行互斥
 * （runningRef 同步挡双击）与运行按钮态复位（监听运行态收尾）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import { executeFlow, executeSingleNode, cancelFlow } from 'utils/flow/executor';

/**
 * 构建执行上下文：collectionItems 映射 + collection 浅拷贝。
 * 执行器只写 runtimeVariables（每节点独立重建）；HTTP 请求跨 IPC 传输本身
 * 就是深拷贝，渲染层无需复制整个集合（大集合深拷贝会造成明显卡顿）。
 */
function buildExecutionContext(flow, collection) {
  const collectionItems = {};
  const flattenItems = (items) => {
    for (const item of items) {
      if (item.uid) {
        collectionItems[item.uid] = item;
      }
      if (item.items) flattenItems(item.items);
    }
  };
  flattenItems(flow.items || []);
  // 也搜索集合中的顶层
  if (collection.items) flattenItems(collection.items);

  const collectionCopy = {
    ...collection,
    runtimeVariables: { ...(collection.runtimeVariables || {}) }
  };
  return { collectionItems, collectionCopy };
}

export function useFlowRun({
  flow,
  collection,
  store,
  flowRun,
  handleValidate,
  selectedNodeId,
  onRunningStarted
}) {
  const dispatch = useDispatch();
  const [isRunning, setIsRunning] = useState(false);
  // 运行互斥标记：isRunning 是异步 state，双击/快速连点时两次调用都会放行，
  // 用同步 ref 挡住第二次（第二次会被执行器的并发防护拒绝并弹幽灵 toast）
  const runningRef = useRef(false);

  // 运行开始时自动唤起右侧工作台（运行结果都在面板中展示）
  useEffect(() => {
    if (flowRun?.status === 'running') {
      onRunningStarted?.();
    }
  }, [flowRun?.status, onRunningStarted]);

  // 运行结束/取消（运行态离开 running）时复位运行按钮态；
  // 避免取消后 Run 按钮短暂恢复、又被执行器并发防护拒绝的竞态
  const prevRunStatusRef = useRef(null);
  useEffect(() => {
    const status = flowRun?.status;
    if (prevRunStatusRef.current === 'running' && status && status !== 'running') {
      setIsRunning(false);
    }
    prevRunStatusRef.current = status;
  }, [flowRun?.status]);

  // 运行整条 Flow（stopAtNodeId 可选：从 Start 执行到该节点为止）
  const runFlow = useCallback(async (stopAtNodeId) => {
    if (runningRef.current) return;

    const validationErrors = handleValidate();
    if (validationErrors && validationErrors.length > 0) {
      toast.error(`校验失败：${validationErrors.map((e) => e.message).join('；')}`);
      return;
    }

    if (!flow || !collection || !flow.flow) {
      toast.error('Flow 数据不完整，无法运行');
      return;
    }

    // 检查是否有从 Start 出发的连线
    const hasStartEdge = flow.flow.edges?.some((e) => e.source === 'start');
    if (!hasStartEdge) {
      toast.error('没有可执行的节点，请先连接 Start 到请求节点');
      return;
    }

    runningRef.current = true;
    setIsRunning(true);

    try {
      const { collectionItems, collectionCopy } = buildExecutionContext(flow, collection);
      const result = await executeFlow({
        flowUid: flow.uid,
        collectionUid: collection.uid,
        flow: flow.flow,
        collection: collectionCopy,
        collectionItems,
        dispatch,
        getState: store.getState,
        stopAtNodeId
      });
      if (result && !result.success) {
        toast.error(result.error || 'Flow 执行失败');
      }
    } finally {
      runningRef.current = false;
      setIsRunning(false);
    }
  }, [handleValidate, flow, collection, dispatch, store]);

  const handleRun = useCallback(() => runFlow(undefined), [runFlow]);

  // 运行到此节点（含）
  const handleRunUntilNode = useCallback(() => {
    if (!selectedNodeId) return;
    runFlow(selectedNodeId);
  }, [runFlow, selectedNodeId]);

  // 单跑选中节点（使用上游已缓存响应，不做全图校验）
  const handleRunNode = useCallback(async () => {
    if (!selectedNodeId || !flow || !collection || !flow.flow) return;
    if (runningRef.current) return;

    runningRef.current = true;
    setIsRunning(true);
    try {
      const { collectionItems, collectionCopy } = buildExecutionContext(flow, collection);
      const result = await executeSingleNode({
        flowUid: flow.uid,
        collectionUid: collection.uid,
        flow: flow.flow,
        collection: collectionCopy,
        collectionItems,
        stepId: selectedNodeId,
        dispatch,
        getState: store.getState
      });
      if (result && !result.success && !result.cancelled) {
        toast.error(result.error || '节点执行失败');
      }
    } finally {
      runningRef.current = false;
      setIsRunning(false);
    }
  }, [selectedNodeId, flow, collection, dispatch, store]);

  // 取消：置取消标记并中止请求；isRunning 由上方收尾 effect 统一复位
  const handleCancel = useCallback(() => {
    cancelFlow(flow?.uid, null, dispatch, store.getState);
  }, [flow?.uid, dispatch, store]);

  return {
    isRunning,
    runFlow,
    handleRun,
    handleRunUntilNode,
    handleRunNode,
    handleCancel
  };
}

export default useFlowRun;
