/**
 * useFlowSave — Flow 手动保存（顶栏按钮 / Ctrl+S 共用）。
 */
import { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import { saveFlow } from 'providers/ReduxStore/slices/collections/actions';

export function useFlowSave({ flow, collectionUid }) {
  const dispatch = useDispatch();

  // 手动保存：立即执行，显示成功/失败反馈（请求配置在标准请求 Tab 中编辑与保存）
  const handleManualSave = useCallback(() => {
    if (!flow?.uid || !collectionUid) {
      toast.error('无法保存：Flow 数据不完整');
      return;
    }
    const result = dispatch(saveFlow(flow.uid, collectionUid, false));
    toast.loading('正在保存 Flow...', { id: 'flow-save' });
    if (result && result.then) {
      result.then(() => { toast.success('Flow 保存成功!', { id: 'flow-save' }); })
        .catch((err) => { toast.error('保存失败: ' + (err?.message || err), { id: 'flow-save' }); });
    }
  }, [collectionUid, flow?.uid, dispatch]);

  return { handleManualSave };
}

export default useFlowSave;
