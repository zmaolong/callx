let activeEditor = null;
let activeSelection = null;

const isUsableEditor = (editor) => Boolean(
  editor
  && typeof editor.getCursor === 'function'
  && typeof editor.replaceSelection === 'function'
  && typeof editor.getWrapperElement === 'function'
  && editor.getWrapperElement()
);

const clonePosition = (position) => (position ? { line: position.line, ch: position.ch } : null);

export const registerActiveEditor = (editor) => {
  if (!isUsableEditor(editor)) return () => {};

  const saveSelection = () => {
    if (!isUsableEditor(editor)) return;
    const selections = editor.listSelections?.();
    const selection = selections?.[0];
    const cursor = editor.getCursor();
    activeEditor = editor;
    activeSelection = selection
      ? { anchor: clonePosition(selection.anchor), head: clonePosition(selection.head) }
      : { anchor: clonePosition(cursor), head: clonePosition(cursor) };
  };

  const handleFocus = () => saveSelection();
  const handleCursorActivity = () => saveSelection();
  const handleBlur = () => saveSelection();
  const wrapper = editor.getWrapperElement();

  editor.on?.('focus', handleFocus);
  editor.on?.('cursorActivity', handleCursorActivity);
  editor.on?.('blur', handleBlur);
  wrapper?.addEventListener('mousedown', handleFocus, true);
  wrapper?.addEventListener('click', handleFocus, true);

  // 仅在编辑器当前已经获得焦点时初始化，避免后挂载的编辑器覆盖真实活动编辑器。
  const input = editor.getInputField?.();
  if (input?.contains(document.activeElement)) saveSelection();

  return () => {
    editor.off?.('focus', handleFocus);
    editor.off?.('cursorActivity', handleCursorActivity);
    editor.off?.('blur', handleBlur);
    wrapper?.removeEventListener('mousedown', handleFocus, true);
    wrapper?.removeEventListener('click', handleFocus, true);
    if (activeEditor === editor) {
      activeEditor = null;
      activeSelection = null;
    }
  };
};

export const insertTextAtActiveEditor = (text) => {
  if (!text || !isUsableEditor(activeEditor)) {
    activeEditor = null;
    activeSelection = null;
    return false;
  }

  try {
    activeEditor.focus?.();
    if (activeSelection && typeof activeEditor.setSelection === 'function') {
      activeEditor.setSelection(activeSelection.anchor, activeSelection.head);
    }
    activeEditor.replaceSelection(text, 'end');
    return true;
  } catch {
    activeEditor = null;
    activeSelection = null;
    return false;
  }
};

export const getActiveEditor = () => (isUsableEditor(activeEditor) ? activeEditor : null);

export const resetActiveEditor = () => {
  activeEditor = null;
  activeSelection = null;
};
