/**
 * useMappingEditor — 输入映射编辑器状态。
 *
 * 从 FlowWorkbench 拆出：映射行编辑、防抖自动保存（校验通过才写 Redux）、
 * 外部数据同步（切换节点 / Redux inputs 变化时跳过一次自动保存）。
 * 状态挂在 FlowWorkbench 层：切换到结果 Tab 再回来，未保存的编辑不丢。
 *
 * 注意：组件 unmount 时会 flush 防抖定时器，确保未保存的映射不丢失。
 */
import { useEffect, useRef, useState } from 'react';
import { validateInputMappings } from 'utils/flow/input-mapping';
import {
  AUTOSAVE_DEBOUNCE,
  createEmptyMapping,
  getMappingsFromNode,
  isEmptyMapping
} from './styled';

export function useMappingEditor({ selectedNode, onUpdateInputs }) {
  const selectedNodeId = selectedNode?.id;
  const mappingSignature = JSON.stringify(selectedNode?.data?.inputs || []);
  const [mappings, setMappings] = useState(() => getMappingsFromNode(selectedNode));
  const [mappingErrors, setMappingErrors] = useState({});
  const [flowResponsePickerOpenIndex, setFlowResponsePickerOpenIndex] = useState(null);
  const [expandedExprIndex, setExpandedExprIndex] = useState(null);

  // 外部数据同步（切换节点或 Redux inputs 变化）时跳过一次自动保存
  const skipAutosaveRef = useRef(true);
  const latestSignatureRef = useRef(mappingSignature);
  latestSignatureRef.current = mappingSignature;

  useEffect(() => {
    setMappings(getMappingsFromNode(selectedNode));
    setMappingErrors({});
    setExpandedExprIndex(null);
    setFlowResponsePickerOpenIndex(null);
    skipAutosaveRef.current = true;
  }, [selectedNodeId, mappingSignature]);

  // 输入映射即时保存：编辑防抖后校验并写入
  // 组件 unmount 时 flush 防抖，避免未保存数据丢失
  const flushRef = useRef(null);
  const saveMappings = () => {
    if (!selectedNode) return;
    const nodeType = selectedNode.data?.type || selectedNode.type;
    if (nodeType === 'start' || nodeType === 'end') return;
    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false;
      return;
    }

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
  };

  useEffect(() => {
    if (!selectedNode) return undefined;
    const nodeType = selectedNode.data?.type || selectedNode.type;
    if (nodeType === 'start' || nodeType === 'end') return undefined;
    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false;
      return undefined;
    }

    const timer = setTimeout(() => {
      saveMappings();
    }, AUTOSAVE_DEBOUNCE);
    flushRef.current = timer;

    return () => clearTimeout(timer);
  }, [mappings, selectedNode, onUpdateInputs]);

  // unmount 时 flush 防抖（通过 onUpdateInputs 引用变化的时序执行一次保存）
  useEffect(() => {
    return () => {
      if (flushRef.current) {
        clearTimeout(flushRef.current);
        flushRef.current = null;
      }
      // 组件卸载前立即保存未完成的编辑
      saveMappings();
    };
  }, []); // 仅在 unmount 时执行

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

  const addMapping = () => {
    setMappings((currentMappings) => [...currentMappings, createEmptyMapping()]);
  };

  const removeMapping = (index) => {
    setMappings((currentMappings) => currentMappings.filter((_, mappingIndex) => mappingIndex !== index));
  };

  return {
    mappings,
    mappingErrors,
    flowResponsePickerOpenIndex,
    setFlowResponsePickerOpenIndex,
    expandedExprIndex,
    setExpandedExprIndex,
    updateMapping,
    updateMappingSource,
    handleSourceKindChange,
    handleLiteralTypeChange,
    addMapping,
    removeMapping
  };
}

export default useMappingEditor;
