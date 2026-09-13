/**
 * useFlowHistory — Flow 运行历史的加载、回看读取、清空与运行结束自动刷新。
 */
import { useCallback, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import {
  listFlowRunRecords,
  loadFlowRunRecord,
  clearFlowRunRecords
} from 'utils/flow/run-history';
import { setFlowHistory, clearFlowHistory } from 'providers/ReduxStore/slices/flowRun';

export function useFlowHistory({ flow, collectionUid, flowRun }) {
  const dispatch = useDispatch();
  const flowHistory = useSelector((state) => state.flowRun?.history?.[flow?.uid]);

  // 挂载时加载运行历史列表
  useEffect(() => {
    if (!flow?.uid || !collectionUid) return;
    let cancelled = false;
    listFlowRunRecords(collectionUid, flow.uid).then((records) => {
      if (!cancelled) {
        dispatch(setFlowHistory({ flowUid: flow.uid, records }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [flow?.uid, collectionUid, dispatch]);

  // 运行结束后刷新历史列表（运行态变化触发）
  const prevRunStatusRef = useRef(null);
  useEffect(() => {
    const status = flowRun?.status;
    if (prevRunStatusRef.current === 'running' && status && status !== 'running' && collectionUid && flow?.uid) {
      listFlowRunRecords(collectionUid, flow.uid).then((records) => {
        dispatch(setFlowHistory({ flowUid: flow.uid, records }));
      });
    }
    prevRunStatusRef.current = status;
  }, [flowRun?.status, collectionUid, flow?.uid, dispatch]);

  // 读取一次完整历史记录（供工作台回看）
  const handleLoadHistoryRecord = useCallback(async (runId) => {
    if (!collectionUid || !flow?.uid) return null;
    return loadFlowRunRecord(collectionUid, flow.uid, runId);
  }, [collectionUid, flow?.uid]);

  // 清空运行历史
  const handleClearHistory = useCallback(async () => {
    if (!collectionUid || !flow?.uid) return;
    await clearFlowRunRecords(collectionUid, flow.uid);
    dispatch(clearFlowHistory({ flowUid: flow.uid }));
    toast.success('运行历史已清空');
  }, [collectionUid, flow?.uid, dispatch]);

  return { flowHistory, handleLoadHistoryRecord, handleClearHistory };
}

export default useFlowHistory;
