/**
 * useFlowUndo 测试
 *
 * 覆盖：takeSnapshot 记录快照、undo 返回上一个快照并记录当前到 redo、
 * redo 返回下一个快照、MAX_HISTORY 限制、canUndo/canRedo 状态、
 * clearRedo=false 保留 redo 栈（用于非破坏性操作如拖拽）、
 * flowUid 为空时跳过记录。
 */
import { act, renderHook } from '@testing-library/react';
import { useFlowUndo } from 'hooks/useFlowUndo';

describe('useFlowUndo', () => {
  const FLOW_UID = 'flow-test-1';

  const makeNode = (id) => ({ id, type: 'request', position: { x: 100, y: 200 } });
  const makeEdge = (source, target) => ({ id: `e_${source}_${target}`, source, target });

  it('初始状态下 canUndo 和 canRedo 均为 false', () => {
    const { result } = renderHook(() => useFlowUndo(FLOW_UID));
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('flowUid 为空时不记录快照', () => {
    const { result } = renderHook(() => useFlowUndo(null));
    act(() => {
      result.current.takeSnapshot([], []);
    });
    expect(result.current.canUndo).toBe(false);
  });

  it('takeSnapshot 后 canUndo 为 true', () => {
    const { result } = renderHook(() => useFlowUndo(FLOW_UID));
    act(() => {
      result.current.takeSnapshot([makeNode('a')], []);
    });
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('undo 返回上一个快照且 canRedo 为 true', () => {
    const { result } = renderHook(() => useFlowUndo(FLOW_UID));

    // 初始状态 A，拍照后变更到状态 B
    const nodesA = [makeNode('a')];
    const edgesA = [];
    act(() => {
      result.current.takeSnapshot(nodesA, edgesA);
    });

    // 模拟外部变更：状态已变为 B，拍照记录 B 供后续撤销
    const nodesB = [makeNode('a'), makeNode('b')];
    const edgesB = [makeEdge('a', 'b')];
    act(() => {
      result.current.takeSnapshot(nodesB, edgesB);
    });

    // 模拟外部变更到状态 C，用户要撤销：undo(C) 应返回 B
    const nodesC = [makeNode('a'), makeNode('b'), makeNode('c')];
    const edgesC = [makeEdge('a', 'b'), makeEdge('b', 'c')];
    let snapshot;
    act(() => {
      snapshot = result.current.undo(nodesC, edgesC);
    });

    expect(snapshot).toBeTruthy();
    expect(snapshot.nodes).toEqual(nodesB); // 返回倒数第二次记录的状态 B
    expect(snapshot.edges).toEqual(edgesB);
    expect(result.current.canUndo).toBe(true); // 还有快照 A
    expect(result.current.canRedo).toBe(true); // 状态 C 在 redo 栈
  });

  it('redo 返回下一个快照', () => {
    const { result } = renderHook(() => useFlowUndo(FLOW_UID));

    const nodesA = [makeNode('a')];
    const nodesB = [makeNode('a'), makeNode('b')];
    const edgesEmpty = [];

    // 模拟三阶段：A → B → C，然后 undo 到 B
    act(() => { result.current.takeSnapshot(nodesA, edgesEmpty); });
    act(() => { result.current.takeSnapshot(nodesB, edgesEmpty); });
    const nodesC = [makeNode('a'), makeNode('b'), makeNode('c')];
    act(() => { result.current.undo(nodesC, edgesEmpty); });

    let snapshot;
    act(() => {
      snapshot = result.current.redo(nodesB, edgesEmpty);
    });

    expect(snapshot).toBeTruthy();
    expect(snapshot.nodes).toEqual(nodesC); // redo 应返回状态 C
    expect(result.current.canRedo).toBe(false); // redo 栈空
  });

  it('undo 为空栈时返回 null', () => {
    const { result } = renderHook(() => useFlowUndo(FLOW_UID));

    let snapshot;
    act(() => {
      snapshot = result.current.undo([], []);
    });

    expect(snapshot).toBeNull();
  });

  it('redo 为空栈时返回 null', () => {
    const { result } = renderHook(() => useFlowUndo(FLOW_UID));

    let snapshot;
    act(() => {
      snapshot = result.current.redo([], []);
    });

    expect(snapshot).toBeNull();
  });

  it('MAX_HISTORY 限制栈深度（超过 50 时丢弃最早快照）', () => {
    const { result } = renderHook(() => useFlowUndo(FLOW_UID));

    // 连续拍照 51 次
    for (let i = 0; i < 51; i++) {
      act(() => {
        result.current.takeSnapshot([makeNode(`node_${i}`)], []);
      });
    }

    expect(result.current.canUndo).toBe(true);
    // 最多 50 步可撤销
    let undoCount = 0;
    for (let i = 0; i < 60; i++) {
      let snapshot;
      act(() => {
        snapshot = result.current.undo([makeNode('current')], []);
      });
      if (!snapshot) break;
      undoCount++;
    }
    expect(undoCount).toBe(50);
  });

  it('clearRedo=false 时保留 redo 栈', () => {
    const { result } = renderHook(() => useFlowUndo(FLOW_UID));

    // 拍照 A → undo（状态 A 在 undo 栈）
    act(() => { result.current.takeSnapshot([makeNode('a')], []); });
    act(() => { result.current.undo([makeNode('a')], []); });
    expect(result.current.canRedo).toBe(true);

    // 用 clearRedo=false 拍照（模拟拖拽），redo 栈应保留
    act(() => {
      result.current.takeSnapshot([makeNode('b')], [], { clearRedo: false });
    });

    // redo 栈仍存在（可以恢复状态 A）
    expect(result.current.canRedo).toBe(true);

    // 用默认 clearRedo=true 拍照，redo 栈应被清空
    act(() => {
      result.current.takeSnapshot([makeNode('c')], []);
    });
    expect(result.current.canRedo).toBe(false);
  });

  it('undo 返回的快照应具有正确的节点和边', () => {
    const { result } = renderHook(() => useFlowUndo(FLOW_UID));

    const nodes1 = [makeNode('a')];
    const edges1 = [];
    const nodes2 = [makeNode('a'), makeNode('b')];
    const edges2 = [makeEdge('a', 'b')];

    act(() => { result.current.takeSnapshot(nodes1, edges1); });
    act(() => { result.current.takeSnapshot(nodes2, edges2); });

    // 当前状态 C（3 个节点），undo 应返回 B
    const nodes3 = [makeNode('a'), makeNode('b'), makeNode('c')];
    let snapshot;
    act(() => {
      snapshot = result.current.undo(nodes3, edges2);
    });

    expect(snapshot.nodes).toHaveLength(2);
    expect(snapshot.nodes.find((n) => n.id === 'a')).toBeTruthy();
    expect(snapshot.nodes.find((n) => n.id === 'b')).toBeTruthy();
    expect(snapshot.edges).toHaveLength(1);
  });

  it('undo 和 redo 可来回切换多次', () => {
    const { result } = renderHook(() => useFlowUndo(FLOW_UID));

    const stateA = { nodes: [makeNode('a')], edges: [] };
    const stateB = { nodes: [makeNode('a'), makeNode('b')], edges: [makeEdge('a', 'b')] };
    const stateC = { nodes: [makeNode('a'), makeNode('b'), makeNode('c')], edges: [makeEdge('a', 'b'), makeEdge('b', 'c')] };
    const stateD = { nodes: [makeNode('a'), makeNode('b'), makeNode('c'), makeNode('d')], edges: [makeEdge('a', 'b'), makeEdge('b', 'c'), makeEdge('c', 'd')] };

    // 状态 A → B → C 各拍照一次，当前是 D
    act(() => { result.current.takeSnapshot(stateA.nodes, stateA.edges); });
    act(() => { result.current.takeSnapshot(stateB.nodes, stateB.edges); });
    act(() => { result.current.takeSnapshot(stateC.nodes, stateC.edges); });

    // undo 一次：D → C
    let s;
    act(() => { s = result.current.undo(stateD.nodes, stateD.edges); });
    expect(s.nodes).toEqual(stateC.nodes);

    // undo 两次：C → B
    act(() => { s = result.current.undo(stateC.nodes, stateC.edges); });
    expect(s.nodes).toEqual(stateB.nodes);

    // redo 一次：B → C
    act(() => { s = result.current.redo(stateB.nodes, stateB.edges); });
    expect(s.nodes).toEqual(stateC.nodes);

    // redo 两次：C → D
    act(() => { s = result.current.redo(stateC.nodes, stateC.edges); });
    expect(s.nodes).toEqual(stateD.nodes);

    // 回到 D 后，redo 应为空
    expect(result.current.canRedo).toBe(false);
  });
});
