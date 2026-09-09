import '@testing-library/jest-dom';
import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

describe('FlowSidebar 输入映射', () => {
  it('保存 Flow 来源和 typed literal 映射', async () => {
    const user = userEvent.setup();
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

    await user.click(screen.getByRole('button', { name: '保存输入映射' }));

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

  it('阻止保存不完整的 Flow 表达式', async () => {
    const user = userEvent.setup();
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
    await user.click(screen.getByRole('button', { name: '保存输入映射' }));

    expect(onUpdateInputs).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('flow 来源必须提供 expression 字符串');
  });

  it('保存期间禁用控件并在完成后恢复', async () => {
    const user = userEvent.setup();
    let resolveSave;
    const onUpdateInputs = jest.fn(() => new Promise((resolve) => {
      resolveSave = resolve;
    }));

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

    await user.click(screen.getByRole('button', { name: '保存输入映射' }));

    expect(onUpdateInputs).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '正在保存输入映射' })).toBeDisabled();
    expect(screen.getByLabelText('映射 1 变量名')).toBeDisabled();

    resolveSave();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '保存输入映射' })).toBeEnabled();
      expect(screen.getByLabelText('映射 1 变量名')).toBeEnabled();
    });
  });

  it('保存失败后恢复编辑控件', async () => {
    const user = userEvent.setup();
    const onUpdateInputs = jest.fn(() => Promise.reject(new Error('保存失败')));

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

    await user.click(screen.getByRole('button', { name: '保存输入映射' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '保存输入映射' })).toBeEnabled();
      expect(screen.getByLabelText('映射 1 变量名')).toBeEnabled();
    });
  });

  it('接收保存后的映射作为新的卡片数据', async () => {
    const user = userEvent.setup();
    const ControlledSidebar = () => {
      const [node, setNode] = useState(selectedNode);
      return (
        <FlowSidebar
          selectedNode={node}
          onUpdateNode={jest.fn()}
          onUpdateInputs={(nodeId, inputs) => setNode({
            ...node,
            id: nodeId,
            data: { ...node.data, inputs }
          })}
        />
      );
    };

    renderWithTheme(<ControlledSidebar />);

    await user.click(screen.getByRole('button', { name: '添加输入映射' }));
    await user.type(screen.getByLabelText('映射 1 变量名'), 'apiKey');
    fireEvent.change(screen.getByLabelText('映射 1 Flow 表达式'), {
      target: { value: '{{$flow.step_a.body.key}}' }
    });
    await user.click(screen.getByRole('button', { name: '保存输入映射' }));

    expect(screen.getByDisplayValue('apiKey')).toBeInTheDocument();
    expect(screen.getByDisplayValue('{{$flow.step_a.body.key}}')).toBeInTheDocument();
  });
});
