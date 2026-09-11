import React, { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import {
  IconPencil,
  IconCopy,
  IconTrash,
  IconPlus,
  IconCode,
  IconMaximize,
  IconMinimize,
  IconChevronRight,
  IconChevronLeft
} from '@tabler/icons';
import { validateInputMappings } from 'utils/flow/input-mapping';
import FlowResponsePicker from './FlowResponsePicker';
import {
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_WIDTH_STORAGE_KEY,
  SIDEBAR_COLLAPSED_STORAGE_KEY
} from './constants';

const SidebarRoot = styled.div`
  display: flex;
  flex-shrink: 0;
  height: 100%;
`;

const ResizeHandle = styled.div`
  width: 4px;
  cursor: col-resize;
  flex-shrink: 0;
  background: transparent;
  transition: background 0.15s ease;

  &:hover,
  &.$active {
    background: ${(props) => props.theme.colors?.accent || '#3b82f6'};
  }
`;

const SidebarContainer = styled.div`
  width: ${(props) => props.$width}px;
  padding: 16px;
  background: ${(props) => props.theme.background.base};
  border-left: 1px solid ${(props) => props.theme.border.border1};
  overflow-y: auto;
  overflow-x: hidden;
  flex-shrink: 0;
`;

const CollapsedBar = styled.div`
  width: 28px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 10px;
  background: ${(props) => props.theme.background.base};
  border-left: 1px solid ${(props) => props.theme.border.border1};
`;

const CollapseButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: ${(props) => props.theme.border.radius.sm};
  background: transparent;
  color: ${(props) => props.theme.colors.text.muted};
  cursor: pointer;

  &:hover {
    background: ${(props) => props.theme.background.surface1};
    color: ${(props) => props.theme.text};
  }
`;

const SidebarHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: ${(props) => props.$large ? 12 : 8}px;
`;

const SidebarTitle = styled.div`
  font-weight: 600;
  font-size: 14px;
  color: ${(props) => props.theme.text};
  margin-bottom: ${(props) => props.$large ? 12 : 8}px;
`;

const MutedText = styled.div`
  font-size: 12px;
  color: ${(props) => props.theme.colors.text.muted};
`;

const EmptyContent = styled.div`
  color: ${(props) => props.theme.colors.text.muted};
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
`;

const InputLabel = styled.label`
  display: block;
  font-size: 12px;
  color: ${(props) => props.theme.colors.text.muted};
  margin-bottom: 4px;
`;

const SidebarInput = styled.input`
  width: 100%;
  padding: 6px 8px;
  border-radius: ${(props) => props.theme.border.radius.sm};
  border: 1px solid ${(props) => props.theme.input.border};
  background: ${(props) => props.theme.input.bg || props.theme.background.surface0};
  color: ${(props) => props.theme.text};
  font-size: 13px;
  outline: none;

  &:focus {
    border-color: ${(props) => props.theme.input.focusBorder};
  }
`;

const SidebarTextarea = styled(SidebarInput)`
  resize: vertical;
  min-height: 60px;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.5;
`;

const SidebarSelect = styled.select`
  width: 100%;
  padding: 6px 8px;
  border-radius: ${(props) => props.theme.border.radius.sm};
  border: 1px solid ${(props) => props.theme.input.border};
  background: ${(props) => props.theme.input.bg || props.theme.background.surface0};
  color: ${(props) => props.theme.text};
  font-size: 13px;
  outline: none;

  &:focus {
    border-color: ${(props) => props.theme.input.focusBorder};
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
`;

const ActionButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: ${(props) => props.theme.border.radius.sm};
  border: none;
  cursor: pointer;
  font-size: 12px;
  text-align: left;
  background: ${(props) => props.$danger ? props.theme.button.danger.bg : props.theme.background.surface0};
  color: ${(props) => props.$danger ? props.theme.button.danger.color : props.theme.text};
  transition: background 0.15s ease;

  &:hover {
    background: ${(props) => props.$danger
      ? props.theme.button.danger.bg
      : props.theme.background.surface1};
  }
`;

const MappingHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
`;

const MappingButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 26px;
  padding: 4px 6px;
  border: 1px solid ${(props) => props.theme.border.border1};
  border-radius: ${(props) => props.theme.border.radius.sm};
  background: ${(props) => props.theme.background.surface0};
  color: ${(props) => props.theme.text};
  cursor: pointer;
  font-size: 11px;

  &:hover {
    background: ${(props) => props.theme.background.surface1};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
`;

const MappingRow = styled.div`
  padding: 8px;
  margin-bottom: 8px;
  border: 1px solid ${(props) => props.theme.border.border1};
  border-radius: ${(props) => props.theme.border.radius.sm};
  background: ${(props) => props.theme.background.surface0};
`;

const MappingRowHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
`;

const MappingField = styled.div`
  margin-top: 6px;
`;

const MappingError = styled.div`
  margin-top: 6px;
  color: ${(props) => props.theme.status.danger.text};
  font-size: 11px;
  line-height: 1.35;
`;

const IconButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: ${(props) => props.theme.border.radius.sm};
  background: transparent;
  color: ${(props) => props.theme.colors.text.muted};
  cursor: pointer;

  &:hover {
    background: ${(props) => props.theme.background.surface1};
    color: ${(props) => props.$danger ? props.theme.button.danger.color : props.theme.text};
  }
`;

const EmptyMappings = styled.div`
  font-size: 12px;
  color: ${(props) => props.theme.colors.text.muted};
  font-style: italic;
`;

const LITERAL_TYPES = [
  { value: 'string', label: '字符串' },
  { value: 'number', label: '数字' },
  { value: 'boolean', label: '布尔' },
  { value: 'json', label: 'JSON' },
  { value: 'null', label: 'Null' }
];

const createEmptyMapping = () => ({
  name: '',
  source: {
    kind: 'flow',
    expression: ''
  }
});

const normalizeMapping = (mapping) => {
  if (mapping?.source?.kind === 'literal') {
    return {
      name: mapping.name || '',
      source: {
        kind: 'literal',
        value: mapping.source.value === undefined ? '' : mapping.source.value,
        valueType: mapping.source.valueType || 'string'
      }
    };
  }

  return {
    name: mapping?.name || '',
    source: {
      kind: 'flow',
      expression: mapping?.source?.expression || ''
    }
  };
};

const isEmptyMapping = (mapping) => {
  if (mapping.name.trim()) return false;
  if (mapping.source.kind === 'flow') return !mapping.source.expression?.trim();
  return mapping.source.valueType !== 'null' && String(mapping.source.value ?? '').trim() === '';
};

const getMappingsFromNode = (selectedNode) => (selectedNode?.data?.inputs || []).map(normalizeMapping);

// 即时保存防抖时长（ms）
const AUTOSAVE_DEBOUNCE = 400;

const FlowSidebar = ({
  selectedNode,
  onUpdateNode,
  onUpdateInputs,
  onEditRequest,
  onDeleteRequest,
  onDuplicateRequest,
  flowRun,
  edges,
  nodes
}) => {
  const selectedNodeId = selectedNode?.id;
  const mappingSignature = JSON.stringify(selectedNode?.data?.inputs || []);
  const [mappings, setMappings] = useState(() => getMappingsFromNode(selectedNode));
  const [mappingErrors, setMappingErrors] = useState({});
  const [flowResponsePickerOpenIndex, setFlowResponsePickerOpenIndex] = useState(null);
  const [expandedExprIndex, setExpandedExprIndex] = useState(null);

  // 侧边栏宽度 / 折叠状态（持久化到 localStorage）
  const [width, setWidth] = useState(() => {
    const stored = Number(window.localStorage?.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
    return stored >= SIDEBAR_MIN_WIDTH && stored <= SIDEBAR_MAX_WIDTH ? stored : SIDEBAR_DEFAULT_WIDTH;
  });
  const [collapsed, setCollapsed] = useState(
    () => window.localStorage?.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1'
  );
  const [dragging, setDragging] = useState(false);
  const dragStateRef = useRef(null);
  const containerRef = useRef(null);

  const handleResizeStart = useCallback((event) => {
    event.preventDefault();
    dragStateRef.current = { startX: event.clientX, startWidth: width, nextWidth: width };
    setDragging(true);
  }, [width]);

  useEffect(() => {
    if (!dragging) return undefined;
    const clamp = (v) => Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, v));
    // 拖拽期间直接写 DOM 宽度，不触发 React 重渲染——
    // 避免每次 mousemove 都让 ReactFlow 重新布局，引发 ResizeObserver 循环告警
    const handleMouseMove = (e) => {
      const state = dragStateRef.current;
      if (!state || state.startX === undefined) return;
      state.nextWidth = clamp(state.startWidth + (state.startX - e.clientX));
      if (containerRef.current) {
        containerRef.current.style.width = `${state.nextWidth}px`;
      }
    };
    const handleMouseUp = () => {
      setDragging(false);
      const nextWidth = dragStateRef.current?.nextWidth;
      if (nextWidth != null) {
        setWidth(nextWidth);
        window.localStorage?.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(nextWidth));
      }
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      window.localStorage?.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, prev ? '0' : '1');
      return !prev;
    });
  }, []);

  // 外部数据同步（切换节点或 Redux inputs 变化）时跳过一次自动保存
  const skipAutosaveRef = useRef(true);
  const latestSignatureRef = useRef(mappingSignature);
  latestSignatureRef.current = mappingSignature;
  useEffect(() => {
    setMappings(getMappingsFromNode(selectedNode));
    setMappingErrors({});
    setExpandedExprIndex(null);
    skipAutosaveRef.current = true;
  }, [selectedNodeId, mappingSignature]);

  // 输入映射即时保存：编辑防抖后校验并写入（替代旧的手动「保存」按钮）
  useEffect(() => {
    if (!selectedNode) return undefined;
    const nodeType = selectedNode.data?.type || selectedNode.type;
    if (nodeType === 'start' || nodeType === 'end') return undefined;
    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false;
      return undefined;
    }

    const timer = setTimeout(() => {
      const preparedMappings = mappings.reduce((result, mapping, index) => {
        if (isEmptyMapping(mapping)) return result;
        result.push({
          index,
          mapping: {
            name: mapping.name.trim(),
            source: mapping.source.kind === 'flow'
              ? { kind: 'flow', expression: mapping.source.expression.trim() }
              : {
                  kind: 'literal',
                  value: mapping.source.value,
                  valueType: mapping.source.valueType || 'string'
                }
          }
        });
        return result;
      }, []);

      const errors = validateInputMappings(preparedMappings.map(({ mapping }) => mapping));
      if (errors.length > 0) {
        setMappingErrors(Object.fromEntries(
          errors.map(({ index, error }) => [preparedMappings[index].index, error])
        ));
        return;
      }

      setMappingErrors({});
      const sanitized = preparedMappings.map(({ mapping }) => mapping);
      // 内容未变化则跳过写入，避免 Redux 回写触发循环
      if (JSON.stringify(sanitized) === latestSignatureRef.current) return;
      onUpdateInputs?.(selectedNode.id, sanitized);
    }, AUTOSAVE_DEBOUNCE);

    return () => clearTimeout(timer);
  }, [mappings, selectedNode, onUpdateInputs]);

  if (collapsed) {
    return (
      <SidebarRoot>
        <CollapsedBar>
          <CollapseButton onClick={toggleCollapsed} title="展开配置面板" aria-label="展开配置面板">
            <IconChevronLeft size={16} />
          </CollapseButton>
        </CollapsedBar>
      </SidebarRoot>
    );
  }

  const updateMapping = (index, updates) => {
    setMappings((currentMappings) => currentMappings.map((mapping, mappingIndex) => (
      mappingIndex === index ? { ...mapping, ...updates } : mapping
    )));
  };

  const updateMappingSource = (index, updates) => {
    setMappings((currentMappings) => currentMappings.map((mapping, mappingIndex) => (
      mappingIndex === index
        ? { ...mapping, source: { ...mapping.source, ...updates } }
        : mapping
    )));
  };

  const handleSourceKindChange = (index, kind) => {
    updateMapping(index, {
      source: kind === 'flow'
        ? { kind: 'flow', expression: '' }
        : { kind: 'literal', value: '', valueType: 'string' }
    });
  };

  const handleLiteralTypeChange = (index, valueType) => {
    updateMappingSource(index, {
      valueType,
      value: valueType === 'null' ? null : ''
    });
  };

  const renderContent = () => {
    if (!selectedNode) {
      return <EmptyContent>选择一个节点查看配置</EmptyContent>;
    }

    const nodeData = selectedNode.data || {};
    const nodeType = nodeData.type || selectedNode.type;

    if (nodeType === 'start' || nodeType === 'end') {
      return (
        <>
          <SidebarTitle>
            {nodeType === 'start' ? 'Start 节点' : 'End 节点'}
          </SidebarTitle>
          <MutedText>
            此节点不可编辑
          </MutedText>
        </>
      );
    }

    // 跳转目标候选：除自身外的全部请求节点
    const jumpTargetOptions = (nodes || []).filter(
      (n) => n.type === 'request' && n.id !== selectedNode.id
    );

    return (
      <>
        <SidebarTitle $large>
          卡片配置
        </SidebarTitle>

        <div style={{ marginBottom: 12 }}>
          <InputLabel>
            别名 (Alias)
          </InputLabel>
          <SidebarInput
            value={nodeData.alias || ''}
            onChange={(event) => onUpdateNode && onUpdateNode(selectedNode.id, { alias: event.target.value })}
            placeholder="输入别名"
          />
        </div>

        <ButtonGroup>
          <ActionButton onClick={() => onEditRequest && onEditRequest(nodeData)}>
            <IconPencil size={14} />
            编辑请求
          </ActionButton>
          <ActionButton onClick={() => onDuplicateRequest && onDuplicateRequest(nodeData)}>
            <IconCopy size={14} />
            复制请求
          </ActionButton>
          <ActionButton $danger onClick={() => onDeleteRequest && onDeleteRequest(nodeData)}>
            <IconTrash size={14} />
            删除请求
          </ActionButton>
        </ButtonGroup>

        {/* 错误处理配置 */}
        <div style={{ marginTop: 12, marginBottom: 12 }}>
          <MappingHeader>
            <SidebarTitle style={{ fontSize: 13, marginBottom: 0 }}>
              错误处理
            </SidebarTitle>
          </MappingHeader>
          <MappingField>
            <InputLabel>失败策略</InputLabel>
            <SidebarSelect
              value={nodeData.errorHandler?.strategy || 'stop'}
              onChange={(event) => {
                const strategy = event.target.value;
                const updates = { errorHandler: { strategy } };
                if (strategy === 'stop') {
                  updates.errorHandler = null; // 默认行为无需存储
                }
                onUpdateNode && onUpdateNode(selectedNode.id, updates);
              }}
              aria-label="失败处理策略"
            >
              <option value="stop">终止流程（默认）</option>
              <option value="continue">忽略错误，继续执行</option>
              <option value="jump">跳转到指定节点</option>
            </SidebarSelect>
          </MappingField>

          {nodeData.errorHandler?.strategy === 'jump' && (
            <MappingField>
              <InputLabel>跳转目标节点</InputLabel>
              <SidebarSelect
                value={nodeData.errorHandler?.jumpToNodeId || ''}
                onChange={(event) => {
                  onUpdateNode && onUpdateNode(selectedNode.id, {
                    errorHandler: {
                      strategy: 'jump',
                      jumpToNodeId: event.target.value || null
                    }
                  });
                }}
                aria-label="跳转目标节点"
              >
                <option value="">请选择节点</option>
                {jumpTargetOptions.map((n) => (
                  <option key={n.id} value={n.id}>{n.alias || n.id}</option>
                ))}
              </SidebarSelect>
              {jumpTargetOptions.length === 0 && (
                <MutedText style={{ marginTop: 4 }}>流程中暂无其他请求节点可跳转</MutedText>
              )}
            </MappingField>
          )}
        </div>

        <div style={{ marginTop: 12 }}>
          <MappingHeader>
            <SidebarTitle style={{ fontSize: 13, marginBottom: 0 }}>
              输入映射
            </SidebarTitle>
            <MappingButton
              onClick={() => setMappings((currentMappings) => [...currentMappings, createEmptyMapping()])}
              title="添加输入映射（自动保存）"
              aria-label="添加输入映射"
            >
              <IconPlus size={14} />
              添加
            </MappingButton>
          </MappingHeader>

          {mappings.length === 0 ? (
            <EmptyMappings>
              暂无输入映射
            </EmptyMappings>
          ) : (
            mappings.map((mapping, index) => {
              const error = mappingErrors[index];
              const isFlowSource = mapping.source.kind === 'flow';
              const isNullLiteral = mapping.source.valueType === 'null';
              const isExprExpanded = expandedExprIndex === index;

              return (
                <MappingRow key={`${selectedNode.id}-${index}`}>
                  <MappingRowHeader>
                    <InputLabel style={{ marginBottom: 0 }}>映射 {index + 1}</InputLabel>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      {error && (
                        <span style={{ fontSize: 10, color: '#ef4444' }} title="校验未通过，修正后自动保存">未保存</span>
                      )}
                      <IconButton
                        $danger
                        onClick={() => setMappings((currentMappings) => currentMappings.filter((_, mappingIndex) => mappingIndex !== index))}
                        title="删除输入映射"
                        aria-label={`删除输入映射 ${index + 1}`}
                      >
                        <IconTrash size={14} />
                      </IconButton>
                    </div>
                  </MappingRowHeader>

                  <MappingField>
                    <InputLabel>变量名</InputLabel>
                    <SidebarInput
                      value={mapping.name}
                      onChange={(event) => updateMapping(index, { name: event.target.value })}
                      placeholder="例如 supplierId"
                      aria-label={`映射 ${index + 1} 变量名`}
                    />
                  </MappingField>

                  <MappingField>
                    <InputLabel>来源</InputLabel>
                    <SidebarSelect
                      value={mapping.source.kind}
                      onChange={(event) => handleSourceKindChange(index, event.target.value)}
                      aria-label={`映射 ${index + 1} 来源`}
                    >
                      <option value="flow">Flow 响应</option>
                      <option value="literal">字面量</option>
                    </SidebarSelect>
                  </MappingField>

                  {isFlowSource ? (
                    <MappingField>
                      <InputLabel>表达式</InputLabel>
                      <div style={{ display: 'flex', gap: 4, alignItems: isExprExpanded ? 'flex-start' : 'center' }}>
                        {isExprExpanded ? (
                          <SidebarTextarea
                            value={mapping.source.expression || ''}
                            onChange={(event) => updateMappingSource(index, { expression: event.target.value })}
                            placeholder="{{$flow.step_x.body.id}}"
                            aria-label={`映射 ${index + 1} Flow 表达式（展开编辑）`}
                            style={{ flex: 1 }}
                            autoFocus
                          />
                        ) : (
                          <SidebarInput
                            value={mapping.source.expression || ''}
                            onChange={(event) => updateMappingSource(index, { expression: event.target.value })}
                            placeholder="{{$flow.step_x.body.id}}"
                            aria-label={`映射 ${index + 1} Flow 表达式`}
                            style={{ flex: 1 }}
                          />
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <MappingButton
                            onClick={() => setFlowResponsePickerOpenIndex(index)}
                            title="从响应选取字段"
                            aria-label="从响应选取字段"
                          >
                            <IconCode size={14} />
                          </MappingButton>
                          <MappingButton
                            onClick={() => setExpandedExprIndex(isExprExpanded ? null : index)}
                            title={isExprExpanded ? '收起表达式编辑' : '展开表达式编辑'}
                            aria-label={isExprExpanded ? '收起表达式编辑' : '展开表达式编辑'}
                          >
                            {isExprExpanded ? <IconMinimize size={14} /> : <IconMaximize size={14} />}
                          </MappingButton>
                        </div>
                      </div>
                    </MappingField>
                  ) : (
                    <>
                      <MappingField>
                        <InputLabel>字面量类型</InputLabel>
                        <SidebarSelect
                          value={mapping.source.valueType || 'string'}
                          onChange={(event) => handleLiteralTypeChange(index, event.target.value)}
                          aria-label={`映射 ${index + 1} 字面量类型`}
                        >
                          {LITERAL_TYPES.map((type) => (
                            <option key={type.value} value={type.value}>{type.label}</option>
                          ))}
                        </SidebarSelect>
                      </MappingField>
                      {!isNullLiteral && (
                        <MappingField>
                          <InputLabel>字面量值</InputLabel>
                          <SidebarInput
                            value={mapping.source.value == null ? '' : String(mapping.source.value)}
                            onChange={(event) => updateMappingSource(index, { value: event.target.value })}
                            placeholder={mapping.source.valueType === 'json' ? '{"id": 1}' : '输入值'}
                            aria-label={`映射 ${index + 1} 字面量值`}
                          />
                        </MappingField>
                      )}
                    </>
                  )}

                  {error && <MappingError role="alert">{error}</MappingError>}
                </MappingRow>
              );
            })
          )}
        </div>
      </>
    );
  };

  return (
    <SidebarRoot>
      <ResizeHandle
        onMouseDown={handleResizeStart}
        className={dragging ? '$active' : ''}
        title="拖拽调整侧边栏宽度"
      />
      <SidebarContainer ref={containerRef} $width={width}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: -4 }}>
          <CollapseButton onClick={toggleCollapsed} title="折叠配置面板" aria-label="折叠配置面板">
            <IconChevronRight size={16} />
          </CollapseButton>
        </div>
        {renderContent()}
      </SidebarContainer>

      {flowResponsePickerOpenIndex !== null && selectedNode && (
        <FlowResponsePicker
          flowRun={flowRun}
          edges={edges}
          selectedNodeId={selectedNode.id}
          nodes={nodes}
          onClose={() => setFlowResponsePickerOpenIndex(null)}
          onInsertExpression={(expression) => {
            updateMappingSource(flowResponsePickerOpenIndex, { expression });
          }}
        />
      )}
    </SidebarRoot>
  );
};

export default FlowSidebar;
