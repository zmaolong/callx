/**
 * FlowCanvasContext — 画布回调函数上下文。
 *
 * 将 onToggleCollapse / onSelectChild / onChildContextMenu / onCancelRun
 * 等回调从节点 data 中剥离，通过 context 注入，避免 useMemo 重建 data 时
 * 每次都产生新闭包，导致所有自定义节点组件不必要的重渲染。
 */
import React from 'react';

export const FlowCanvasContext = React.createContext({});
