/**
 * ConfigTab — 节点配置：别名、错误处理策略、请求操作、输入映射编辑。
 */
import React from 'react';
import {
  IconPencil,
  IconCopy,
  IconTrash,
  IconPlus,
  IconCode,
  IconMaximize,
  IconMinimize
} from '@tabler/icons';
import {
  ActionButton,
  EmptyContent,
  EmptyMappings,
  IconButton,
  InputLabel,
  LITERAL_TYPES,
  MappingButton,
  MappingError,
  MappingField,
  MappingHeader,
  MappingRow,
  MappingRowHeader,
  MutedText,
  SectionTitle,
  SidebarInput,
  SidebarSelect,
  SidebarTextarea,
  UnsavedMark
} from './styled';

const ConfigTab = ({
  selectedNode,
  nodes,
  editor,
  onUpdateNode,
  onEditRequest,
  onDeleteRequest,
  onDuplicateRequest
}) => {
  if (!selectedNode) {
    return <EmptyContent>选择一个节点查看配置</EmptyContent>;
  }

  const nodeData = selectedNode.data || {};
  const nodeType = nodeData.type || selectedNode.type;

  if (nodeType === 'start' || nodeType === 'end') {
    return (
      <>
        <SectionTitle>
          {nodeType === 'start' ? 'Start 节点' : 'End 节点'}
        </SectionTitle>
        <MutedText>
          此节点不可编辑
        </MutedText>
      </>
    );
  }

  // 并行组节点：别名 + 子请求列表信息
  if (nodeType === 'parallel') {
    const childRequestNodes = (nodes || []).filter((n) => n.parentId === selectedNode.id && n.type === 'request');
    return (
      <>
        <div style={{ marginBottom: 12 }}>
          <InputLabel>
            别名 (Alias)
          </InputLabel>
          <SidebarInput
            value={nodeData.alias || ''}
            onChange={(event) => onUpdateNode && onUpdateNode(selectedNode.id, { alias: event.target.value })}
            placeholder="例如 批量查询用户"
            aria-label="并行组别名 (Alias)"
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <SectionTitle>
            子请求（{childRequestNodes.length} 个）
          </SectionTitle>
          {childRequestNodes.length === 0 ? (
            <MutedText>
              画布中无子请求节点。请将请求节点拖拽到并行组内加入。
            </MutedText>
          ) : (
            childRequestNodes.map((cn) => (
              <div
                key={cn.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 8px',
                  marginBottom: 4,
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  fontSize: 12
                }}
              >
                <span style={{ fontWeight: 600 }}>{cn.alias || cn.id}</span>
              </div>
            ))
          )}

          <MutedText style={{ marginTop: 10, lineHeight: 1.6 }}>
            并行组内的子请求将同时（Promise.all）发起执行。所有子请求结束后才流转到下一个节点。
            <br />
            任一子请求失败即终止整个流程。子请求结果通过
            {' '}<code>{'{{$flow.子请求StepId.body}}'}</code> 在下游节点中引用。
          </MutedText>
        </div>
      </>
    );
  }

  // 循环节点：别名 + 数据源/收集/迭代上限（无错误策略、请求操作与输入映射）
  if (nodeType === 'loop') {
    return (
      <>
        <div style={{ marginBottom: 12 }}>
          <InputLabel>
            别名 (Alias)
          </InputLabel>
          <SidebarInput
            value={nodeData.alias || ''}
            onChange={(event) => onUpdateNode && onUpdateNode(selectedNode.id, { alias: event.target.value })}
            placeholder="例如 分页拉取"
            aria-label="循环别名 (Alias)"
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <MappingHeader>
            <SectionTitle style={{ marginBottom: 0 }}>
              循环数据源
            </SectionTitle>
          </MappingHeader>
          <MappingField style={{ marginTop: 0 }}>
            <InputLabel>数据源类型</InputLabel>
            <SidebarSelect
              value={nodeData.loopConfig?.source?.kind || 'expression'}
              onChange={(event) => {
                const kind = event.target.value;
                const source = kind === 'expression'
                  ? { kind, expression: '' }
                  : kind === 'literal'
                    ? { kind, value: '' }
                    : { kind, variableName: '' };
                onUpdateNode && onUpdateNode(selectedNode.id, {
                  loopConfig: { ...nodeData.loopConfig, source }
                });
              }}
              aria-label="循环数据源类型"
            >
              <option value="expression">上游响应表达式</option>
              <option value="literal">字面量 JSON 数组</option>
              <option value="variable">环境/集合变量</option>
            </SidebarSelect>
          </MappingField>

          {(nodeData.loopConfig?.source?.kind || 'expression') === 'expression' && (
            <MappingField>
              <InputLabel>数据源表达式（求值结果须为数组）</InputLabel>
              <SidebarInput
                value={nodeData.loopConfig?.source?.expression || ''}
                onChange={(event) => onUpdateNode && onUpdateNode(selectedNode.id, {
                  loopConfig: { ...nodeData.loopConfig, source: { kind: 'expression', expression: event.target.value } }
                })}
                placeholder="{{$flow.step_x.body.data.list}}"
                aria-label="循环数据源表达式"
              />
            </MappingField>
          )}

          {nodeData.loopConfig?.source?.kind === 'literal' && (
            <MappingField>
              <InputLabel>字面量 JSON 数组</InputLabel>
              <SidebarTextarea
                value={nodeData.loopConfig?.source?.value ?? ''}
                onChange={(event) => onUpdateNode && onUpdateNode(selectedNode.id, {
                  loopConfig: { ...nodeData.loopConfig, source: { kind: 'literal', value: event.target.value } }
                })}
                placeholder={'[1, 2, 3] 或 [{"id": 1}]'}
                aria-label="循环字面量数据源"
              />
            </MappingField>
          )}

          {nodeData.loopConfig?.source?.kind === 'variable' && (
            <MappingField>
              <InputLabel>变量名（值须为数组）</InputLabel>
              <SidebarInput
                value={nodeData.loopConfig?.source?.variableName || ''}
                onChange={(event) => onUpdateNode && onUpdateNode(selectedNode.id, {
                  loopConfig: { ...nodeData.loopConfig, source: { kind: 'variable', variableName: event.target.value } }
                })}
                placeholder="例如 pageList"
                aria-label="循环数据源变量名"
              />
            </MappingField>
          )}

          <MappingField>
            <InputLabel>收集表达式（可选，每轮求值一次：数组拼接、标量追加）</InputLabel>
            <SidebarInput
              value={nodeData.loopConfig?.collectExpression || ''}
              onChange={(event) => onUpdateNode && onUpdateNode(selectedNode.id, {
                loopConfig: { ...nodeData.loopConfig, collectExpression: event.target.value }
              })}
              placeholder="{{$flow.step_x.body.data.list}}"
              aria-label="循环收集表达式"
            />
          </MappingField>

          <MappingField>
            <InputLabel>迭代上限（超出判失败，防止死循环）</InputLabel>
            <SidebarInput
              type="number"
              min={1}
              value={nodeData.loopConfig?.maxIterations ?? 1000}
              onChange={(event) => onUpdateNode && onUpdateNode(selectedNode.id, {
                loopConfig: { ...nodeData.loopConfig, maxIterations: event.target.value }
              })}
              aria-label="循环迭代上限"
            />
          </MappingField>

          <MutedText style={{ marginTop: 8, lineHeight: 1.6 }}>
            连线：循环节点的前两条出边自动设为「循环体」和「完成后」；
            循环体尾节点连回循环节点即形成回边。循环体节点用
            {' '}<code>{'{{$flow.<循环>.item}}'}</code>、<code>.index</code>、<code>.iterations</code> 引用当前迭代，
            完成后链用 <code>{'{{$flow.<循环>.collected}}'}</code> 取收集结果。
          </MutedText>
        </div>
      </>
    );
  }

  const {
    mappings,
    mappingErrors,
    setFlowResponsePickerOpenIndex,
    expandedExprIndex,
    setExpandedExprIndex,
    updateMapping,
    updateMappingSource,
    handleSourceKindChange,
    handleLiteralTypeChange,
    addMapping,
    removeMapping
  } = editor;

  // 跳转目标候选：除自身外的全部请求节点
  const jumpTargetOptions = (nodes || []).filter(
    (n) => n.type === 'request' && n.id !== selectedNode.id
  );

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <InputLabel>
          别名 (Alias)
        </InputLabel>
        <SidebarInput
          value={nodeData.alias || ''}
          onChange={(event) => onUpdateNode && onUpdateNode(selectedNode.id, { alias: event.target.value })}
          placeholder="输入别名"
          aria-label="别名 (Alias)"
        />
      </div>

      {/* 错误处理配置 */}
      <div style={{ marginBottom: 16 }}>
        <MappingHeader>
          <SectionTitle style={{ marginBottom: 0 }}>
            错误处理
          </SectionTitle>
        </MappingHeader>
        <MappingField style={{ marginTop: 0 }}>
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

      {/* 请求操作：请求配置（url/body/headers 等）在标准请求 Tab 中编辑 */}
      <div style={{ marginBottom: 16 }}>
        <MappingHeader>
          <SectionTitle style={{ marginBottom: 0 }}>
            请求
          </SectionTitle>
        </MappingHeader>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
        </div>
      </div>

      <div>
        <MappingHeader>
          <SectionTitle style={{ marginBottom: 0 }}>
            输入映射
          </SectionTitle>
          <MappingButton
            onClick={addMapping}
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
                      <UnsavedMark title="校验未通过，修正后自动保存">未保存</UnsavedMark>
                    )}
                    <IconButton
                      $danger
                      onClick={() => removeMapping(index)}
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

export default ConfigTab;
