/**
 * Flow 编辑态 slice
 *
 * 只承载响应式 UI 状态：画布是否有未保存修改（顶栏脏点、关闭确认）、
 * 磁盘变更与未保存修改冲突的提示标记。
 * 权威的快照基准在 utils/flow/dirty-registry（模块级），由 flowDirtyMiddleware 同步。
 */
import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  // flowUid → boolean
  dirtyByUid: {},
  // flowUid → boolean（树重建遇到脏图时保留内存版本后的一次性提示）
  externalChangeByUid: {}
};

const flowEditorSlice = createSlice({
  name: 'flowEditor',
  initialState,
  reducers: {
    setFlowDirty: (state, action) => {
      const { flowUid } = action.payload;
      state.dirtyByUid[flowUid] = true;
    },
    clearFlowDirty: (state, action) => {
      const { flowUid } = action.payload;
      delete state.dirtyByUid[flowUid];
    },
    setFlowExternalChange: (state, action) => {
      const { flowUid } = action.payload;
      state.externalChangeByUid[flowUid] = true;
    },
    clearFlowExternalChange: (state, action) => {
      const { flowUid } = action.payload;
      delete state.externalChangeByUid[flowUid];
    }
  }
});

export const {
  setFlowDirty,
  clearFlowDirty,
  setFlowExternalChange,
  clearFlowExternalChange
} = flowEditorSlice.actions;

export default flowEditorSlice.reducer;
