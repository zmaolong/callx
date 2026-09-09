/**
 * Flow 运行态 Redux slice
 *
 * 运行态不写回 Flow 文件，仅保留在当前 Flow Tab 的内存/Redux 状态中。
 * 关闭 Flow Tab 后丢弃。
 */
import { createSlice } from '@reduxjs/toolkit';
import { uuid } from 'utils/common';

/**
 * 节点运行状态
 * idle → queued → running → success
 *                    ├→ failed
 *                    ├→ cancelled
 *                    └→ skipped
 */
const NODE_STATUS = {
  IDLE: 'idle',
  QUEUED: 'queued',
  RUNNING: 'running',
  SUCCESS: 'success',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  SKIPPED: 'skipped'
};

/**
 * Flow 整体运行状态
 */
const FLOW_STATUS = {
  IDLE: 'idle',
  RUNNING: 'running',
  SUCCESS: 'success',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

const initialState = {
  // key: flowUid
  runs: {}
};

const flowRunSlice = createSlice({
  name: 'flowRun',
  initialState,
  reducers: {
    /**
     * 初始化一次 Flow 运行。
     * 若该 Flow 正在运行中，则拒绝。
     */
    initFlowRun: (state, action) => {
      const { flowUid, nodes } = action.payload;
      const existing = state.runs[flowUid];
      if (existing && existing.status === FLOW_STATUS.RUNNING) {
        return; // 拒绝并发
      }

      const flowRunId = uuid();
      const nodeStates = {};
      for (const node of nodes) {
        nodeStates[node.id] = {
          status: NODE_STATUS.IDLE,
          body: null,
          duration: null,
          error: null
        };
      }

      state.runs[flowUid] = {
        flowRunId,
        flowUid,
        status: FLOW_STATUS.RUNNING,
        cancelled: false,
        nodes: nodeStates
      };
    },

    /**
     * 更新单个节点的状态。
     */
    updateFlowNodeStatus: (state, action) => {
      const { flowUid, stepId, status, body, duration, error } = action.payload;
      const run = state.runs[flowUid];
      if (!run) return;

      if (run.nodes[stepId]) {
        run.nodes[stepId] = {
          status: status || run.nodes[stepId].status,
          body: body !== undefined ? body : run.nodes[stepId].body,
          duration: duration !== undefined ? duration : run.nodes[stepId].duration,
          error: error !== undefined ? error : run.nodes[stepId].error
        };
      }
    },

    /**
     * 将多个节点批量标记为 skipped。
     */
    markNodesSkipped: (state, action) => {
      const { flowUid, stepIds, error } = action.payload;
      const run = state.runs[flowUid];
      if (!run) return;

      for (const stepId of stepIds) {
        if (run.nodes[stepId]) {
          run.nodes[stepId].status = NODE_STATUS.SKIPPED;
          run.nodes[stepId].error = error || null;
        }
      }
    },

    /**
     * 设置 Flow 整体运行状态为成功/失败。
     */
    setFlowRunStatus: (state, action) => {
      const { flowUid, status } = action.payload;
      const run = state.runs[flowUid];
      if (!run) return;
      run.status = status;
    },

    /**
     * 标记取消请求（异步执行，实际取消由 executor 处理）。
     */
    cancelFlowRun: (state, action) => {
      const { flowUid } = action.payload;
      const run = state.runs[flowUid];
      if (!run) return;
      run.cancelled = true;
    },

    /**
     * 清理 Flow 运行态（关闭 Tab 时调用）。
     */
    clearFlowRunState: (state, action) => {
      const { flowUid } = action.payload;
      delete state.runs[flowUid];
    },

    /**
     * 清理所有 Flow 运行态。
     */
    clearAllFlowRunStates: (state) => {
      state.runs = {};
    }
  }
});

export const {
  initFlowRun,
  updateFlowNodeStatus,
  markNodesSkipped,
  setFlowRunStatus,
  cancelFlowRun,
  clearFlowRunState,
  clearAllFlowRunStates
} = flowRunSlice.actions;

export { NODE_STATUS, FLOW_STATUS };
export default flowRunSlice.reducer;
