import '@testing-library/jest-dom';
import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'styled-components';
import FlowSidebar from './FlowSidebar';

const theme = {
  background: { base: '#fff', surface0: '#f7f7f7', surface1: '#eee' },
  border: { border1: '#ddd', radius: { sm: '4px' } },
  input: { border: '#bbb', bg: '#fff', focusBorder: '#666' },
  button: { danger: { bg: '#fee2e2', color: '#b91c1c' } },
  colors: { text: { muted: '#666' } },
  status: { danger: { text: '#b91c1c' } },
  text: '#111'
};

const selectedNode = {
  id: 'step_b',
  type: 'request',
  data: {
    id: 'step_b',
    type: 'request',
    alias: '查询供应商',
    inputs: []
  }
};

const renderWithTheme = (component) => render(
  <ThemeProvider theme={theme}>{component}</ThemeProvider>
);

// 推进即时保存防抖计时器
const advanceAutosave = () => {
  act(() => {
    jest.advanceTimersByTime(500);
  });
};

describe('FlowSidebar 输入映射（即时保存）', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    window.localStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('编辑后自动保存 Flow 来源和 typed literal 映射', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const onUpdateInputs = jest.fn();

    renderWithTheme(
      <FlowSidebar
        selectedNode={selectedNode}
        onUpdateNode={jest.fn()}
        onUpdateInputs={onUpdateInputs}
      />
    );

    await user.click(screen.getByRole('button', { name: '添加输入映射' }));
    await user.type(screen.getByLabelText('映射 1 变量名'), 'supplierId');
    fireEvent.change(screen.getByLabelText('映射 1 Flow 表达式'), {
      target: { value: '{{$flow.step_a.body.id}}' }
    });

    await user.click(screen.getByRole('button', { name: '添加输入映射' }));
    await user.type(screen.getByLabelText('映射 2 变量名'), 'retryCount');
    await user.selectOptions(screen.getByLabelText('映射 2 来源'), 'literal');
    await user.selectOptions(screen.getByLabelText('映射 2 字面量类型'), 'number');
    await user.type(screen.getByLabelText('映射 2 字面量值'), '3');

    advanceAutosave();

    expect(onUpdateInputs).toHaveBeenCalledWith('step_b', [
      {
        name: 'supplierId',
        source: {
          kind: 'flow',
          expression: '{{$flow.step_a.body.id}}'
        }
      },
      {
        name: 'retryCount',
        source: {
          kind: 'literal',
          value: '3',
          valueType: 'number'
        }
      }
    ]);
  });

  it('校验不通过时阻止自动保存并行内提示', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const onUpdateInputs = jest.fn();

    renderWithTheme(
      <FlowSidebar
        selectedNode={selectedNode}
        onUpdateNode={jest.fn()}
        onUpdateInputs={onUpdateInputs}
      />
    );

    await user.click(screen.getByRole('button', { name: '添加输入映射' }));
    await user.type(screen.getByLabelText('映射 1 变量名'), 'supplierId');

    advanceAutosave();

    expect(onUpdateInputs).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('flow 来源必须提供 expression 字符串');
  });

  it('外部回写后不重复保存（无循环）', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const ControlledSidebar = () => {
      const [node, setNode] = useState(selectedNode);
      const [saveCount, setSaveCount] = useState(0);
      return (
        <>
          <FlowSidebar
            selectedNode={node}
            onUpdateNode={jest.fn()}
            onUpdateInputs={(nodeId, inputs) => {
              setSaveCount((c) => c + 1);
              setNode({
                ...node,
                id: nodeId,
                data: { ...node.data, inputs }
              });
            }}
          />
          <div data-testid="save-count">{saveCount}</div>
        </>
      );
    };

    renderWithTheme(<ControlledSidebar />);

    await user.click(screen.getByRole('button', { name: '添加输入映射' }));
    await user.type(screen.getByLabelText('映射 1 变量名'), 'apiKey');
    fireEvent.change(screen.getByLabelText('映射 1 Flow 表达式'), {
      target: { value: '{{$flow.step_a.body.key}}' }
    });

    advanceAutosave();
    // 回写导致 Redux 数据变化后，再推进一轮防抖也不应触发第二次保存
    advanceAutosave();

    expect(screen.getByTestId('save-count')).toHaveTextContent('1');
    expect(screen.getByDisplayValue('apiKey')).toBeInTheDocument();
    expect(screen.getByDisplayValue('{{$flow.step_a.body.key}}')).toBeInTheDocument();
  });

  it('删除映射后自动保存剩余映射', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const onUpdateInputs = jest.fn();
    const nodeWithInputs = {
      ...selectedNode,
      data: {
        ...selectedNode.data,
        inputs: [
          { name: 'a', source: { kind: 'literal', value: '1', valueType: 'string' } },
          { name: 'b', source: { kind: 'literal', value: '2', valueType: 'string' } }
        ]
      }
    };

    renderWithTheme(
      <FlowSidebar
        selectedNode={nodeWithInputs}
        onUpdateNode={jest.fn()}
        onUpdateInputs={onUpdateInputs}
      />
    );

    await user.click(screen.getByRole('button', { name: '删除输入映射 2' }));

    advanceAutosave();

    expect(onUpdateInputs).toHaveBeenCalledWith('step_b', [
      { name: 'a', source: { kind: 'literal', value: '1', valueType: 'string' } }
    ]);
  });
});

describe('FlowSidebar 错误处理', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    window.localStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const flowNodes = [
    { id: 'start', type: 'start', position: { x: 0, y: 0 } },
    { id: 'step_a', type: 'request', alias: '登录', position: { x: 0, y: 0 } },
    { id: 'step_b', type: 'request', alias: '查询供应商', position: { x: 0, y: 0 } },
    { id: 'end', type: 'end', position: { x: 0, y: 0 } }
  ];

  it('jump 策略下展示其他请求节点作为跳转目标', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const onUpdateNode = jest.fn();
    const nodeWithJump = {
      ...selectedNode,
      data: {
        ...selectedNode.data,
        errorHandler: { strategy: 'jump', jumpToNodeId: null }
      }
    };

    renderWithTheme(
      <FlowSidebar
        selectedNode={nodeWithJump}
        onUpdateNode={onUpdateNode}
        onUpdateInputs={jest.fn()}
        nodes={flowNodes}
      />
    );

    const targetSelect = screen.getByLabelText('跳转目标节点');
    // 候选中不包含自身 step_b，但包含 step_a（显示别名）
    expect(targetSelect).toHaveDisplayValue('请选择节点');
    const optionTexts = Array.from(targetSelect.querySelectorAll('option')).map((o) => o.textContent);
    expect(optionTexts).toContain('登录');
    expect(optionTexts).not.toContain('查询供应商');

    await user.selectOptions(targetSelect, 'step_a');
    expect(onUpdateNode).toHaveBeenCalledWith('step_b', {
      errorHandler: { strategy: 'jump', jumpToNodeId: 'step_a' }
    });
  });

  it('切换失败策略为 continue 时即时更新', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const onUpdateNode = jest.fn();

    renderWithTheme(
      <FlowSidebar
        selectedNode={selectedNode}
        onUpdateNode={onUpdateNode}
        onUpdateInputs={jest.fn()}
        nodes={flowNodes}
      />
    );

    await user.selectOptions(screen.getByLabelText('失败处理策略'), 'continue');
    expect(onUpdateNode).toHaveBeenCalledWith('step_b', {
      errorHandler: { strategy: 'continue' }
    });

    await user.selectOptions(screen.getByLabelText('失败处理策略'), 'stop');
    expect(onUpdateNode).toHaveBeenCalledWith('step_b', {
      errorHandler: null
    });
  });
});

describe('FlowSidebar 折叠与调宽', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('折叠后显示收起条，点击可重新展开', async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <FlowSidebar
        selectedNode={selectedNode}
        onUpdateNode={jest.fn()}
        onUpdateInputs={jest.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: '折叠配置面板' }));
    expect(screen.queryByText('卡片配置')).not.toBeInTheDocument();
    expect(window.localStorage.getItem('bruno.flowSidebarCollapsed')).toBe('1');

    await user.click(screen.getByRole('button', { name: '展开配置面板' }));
    expect(screen.getByText('卡片配置')).toBeInTheDocument();
    expect(window.localStorage.getItem('bruno.flowSidebarCollapsed')).toBe('0');
  });
});
