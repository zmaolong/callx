import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import {
  IconPencil,
  IconCopy,
  IconTrash,
  IconPlus,
  IconCheck
} from '@tabler/icons';
import { validateInputMappings } from 'utils/flow/input-mapping';

const SidebarContainer = styled.div`
  width: 280px;
  padding: 16px;
  background: ${(props) => props.theme.background.base};
  border-left: 1px solid ${(props) => props.theme.border.border1};
  overflow-y: auto;
`;

const SidebarEmpty = styled(SidebarContainer)`
  color: ${(props) => props.theme.colors.text.muted};
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-y: hidden;
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

const MappingActions = styled.div`
  display: flex;
  gap: 4px;
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
    color: ${(props) => props.theme.button.danger.color};
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

const FlowSidebar = ({
  selectedNode,
  onUpdateNode,
  onUpdateInputs,
  onEditRequest,
  onDeleteRequest,
  onDuplicateRequest
}) => {
  const selectedNodeId = selectedNode?.id;
  const mappingSignature = JSON.stringify(selectedNode?.data?.inputs || []);
  const [mappings, setMappings] = useState(() => getMappingsFromNode(selectedNode));
  const [mappingErrors, setMappingErrors] = useState({});
  const [isSavingMappings, setIsSavingMappings] = useState(false);

  useEffect(() => {
    setMappings(getMappingsFromNode(selectedNode));
    setMappingErrors({});
  }, [selectedNodeId, mappingSignature]);

  if (!selectedNode) {
    return (
      <SidebarEmpty>
        选择一个节点查看配置
      </SidebarEmpty>
    );
  }

  const nodeData = selectedNode.data || {};
  const nodeType = nodeData.type || selectedNode.type;

  if (nodeType === 'start' || nodeType === 'end') {
    return (
      <SidebarContainer>
        <SidebarTitle>
          {nodeType === 'start' ? 'Start 节点' : 'End 节点'}
        </SidebarTitle>
        <MutedText>
          此节点不可编辑
        </MutedText>
      </SidebarContainer>
    );
  }

  const updateMapping = (index, updates) => {
    setMappings((currentMappings) => currentMappings.map((mapping, mappingIndex) => (
      mappingIndex === index ? { ...mapping, ...updates } : mapping
    )));
    setMappingErrors({});
  };

  const updateMappingSource = (index, updates) => {
    setMappings((currentMappings) => currentMappings.map((mapping, mappingIndex) => (
      mappingIndex === index
        ? { ...mapping, source: { ...mapping.source, ...updates } }
        : mapping
    )));
    setMappingErrors({});
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

  const handleSaveMappings = async () => {
    if (isSavingMappings) return;

    const preparedMappings = mappings.reduce((result, mapping, index) => {
      if (isEmptyMapping(mapping)) return result;

      result.push({
        index,
        mapping: {
          name: mapping.name.trim(),
          source: mapping.source.kind === 'flow'
            ? {
                kind: 'flow',
                expression: mapping.source.expression.trim()
              }
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
      setMappingErrors(Object.fromEntries(errors.map(({ index, error }) => [preparedMappings[index].index, error])));
      return;
    }

    setMappingErrors({});
    setIsSavingMappings(true);
    try {
      await onUpdateInputs?.(selectedNode.id, preparedMappings.map(({ mapping }) => mapping));
    } catch {
      // 保存失败由 saveFlow 统一展示错误提示。
    } finally {
      setIsSavingMappings(false);
    }
  };

  return (
    <SidebarContainer>
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

      <div style={{ marginTop: 12 }}>
        <MappingHeader>
          <SidebarTitle style={{ fontSize: 13, marginBottom: 0 }}>
            输入映射
          </SidebarTitle>
          <MappingActions>
            <MappingButton
              onClick={() => setMappings((currentMappings) => [...currentMappings, createEmptyMapping()])}
              disabled={isSavingMappings}
              title={isSavingMappings ? '正在保存输入映射' : '添加输入映射'}
              aria-label="添加输入映射"
            >
              <IconPlus size={14} />
              添加
            </MappingButton>
            <MappingButton
              onClick={handleSaveMappings}
              disabled={isSavingMappings}
              title={isSavingMappings ? '正在保存输入映射' : '保存输入映射'}
              aria-label={isSavingMappings ? '正在保存输入映射' : '保存输入映射'}
            >
              <IconCheck size={14} />
              {isSavingMappings ? '保存中' : '保存'}
            </MappingButton>
          </MappingActions>
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

            return (
              <MappingRow key={`${selectedNode.id}-${index}`}>
                <MappingRowHeader>
                  <InputLabel style={{ marginBottom: 0 }}>映射 {index + 1}</InputLabel>
                  <IconButton
                    disabled={isSavingMappings}
                    onClick={() => setMappings((currentMappings) => currentMappings.filter((_, mappingIndex) => mappingIndex !== index))}
                    title="删除输入映射"
                    aria-label={`删除输入映射 ${index + 1}`}
                  >
                    <IconTrash size={14} />
                  </IconButton>
                </MappingRowHeader>

                <MappingField>
                  <InputLabel>变量名</InputLabel>
                  <SidebarInput
                    disabled={isSavingMappings}
                    value={mapping.name}
                    onChange={(event) => updateMapping(index, { name: event.target.value })}
                    placeholder="例如 supplierId"
                    aria-label={`映射 ${index + 1} 变量名`}
                  />
                </MappingField>

                <MappingField>
                  <InputLabel>来源</InputLabel>
                  <SidebarSelect
                    disabled={isSavingMappings}
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
                    <SidebarInput
                      disabled={isSavingMappings}
                      value={mapping.source.expression || ''}
                      onChange={(event) => updateMappingSource(index, { expression: event.target.value })}
                      placeholder="{{$flow.step_x.body.id}}"
                      aria-label={`映射 ${index + 1} Flow 表达式`}
                    />
                  </MappingField>
                ) : (
                  <>
                    <MappingField>
                      <InputLabel>字面量类型</InputLabel>
                      <SidebarSelect
                        disabled={isSavingMappings}
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
                          disabled={isSavingMappings}
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
    </SidebarContainer>
  );
};

export default FlowSidebar;
