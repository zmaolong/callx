/**
 * useFlowUndo — Flow 画布操作撤销/重做历史栈。
 *
 * 在 dispatch 修改 Flow 的 nodes/edges 之前调用 takeSnapshot() 记录快照；
 * undo()/redo() 返回上一个/下一个快照，由调用方 dispatch 到 Redux。
 *
 * 用法:
 *   const { canUndo, canRedo, takeSnapshot, undo, redo } = useFlowUndo(flow?.uid);
 *   takeSnapshot(flow.flow.nodes, flow.flow.edges);
 *   dispatch(updateFlowNodes(...));
 *
 *   const snapshot = undo(currentNodes, currentEdges);
 *   if (snapshot) dispatch(updateFlowNodes(snapshot.nodes));
 *
 * @param {string|null} flowUid — 当前 Flow 的 uid，为空时跳过记录
 * @returns {{ canUndo: boolean, canRedo: boolean, takeSnapshot: Function, undo: Function, redo: Function }}
 */
import { useCallback, useRef, useState } from 'react';

const MAX_HISTORY = 50;

export function useFlowUndo(flowUid) {
  const pastRef = useRef([]);
  const futureRef = useRef([]);
  const [, forceUpdate] = useState(0);

  const takeSnapshot = useCallback(
    (nodes, edges) => {
      if (!flowUid) return;
      pastRef.current.push({
        nodes: JSON.parse(JSON.stringify(nodes || [])),
        edges: JSON.parse(JSON.stringify(edges || []))
      });
      if (pastRef.current.length > MAX_HISTORY) {
        pastRef.current.shift();
      }
      // 新操作清空 redo 栈
      futureRef.current = [];
      forceUpdate((v) => v + 1);
    },
    [flowUid]
  );

  const undo = useCallback(
    (currentNodes, currentEdges) => {
      if (pastRef.current.length === 0 || !flowUid) return null;

      const snapshot = pastRef.current.pop();

      futureRef.current.push({
        nodes: JSON.parse(JSON.stringify(currentNodes || [])),
        edges: JSON.parse(JSON.stringify(currentEdges || []))
      });

      forceUpdate((v) => v + 1);
      return snapshot;
    },
    [flowUid]
  );

  const redo = useCallback(
    (currentNodes, currentEdges) => {
      if (futureRef.current.length === 0 || !flowUid) return null;

      const snapshot = futureRef.current.pop();

      pastRef.current.push({
        nodes: JSON.parse(JSON.stringify(currentNodes || [])),
        edges: JSON.parse(JSON.stringify(currentEdges || []))
      });

      forceUpdate((v) => v + 1);
      return snapshot;
    },
    [flowUid]
  );

  return {
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    takeSnapshot,
    undo,
    redo
  };
}

export default useFlowUndo;
