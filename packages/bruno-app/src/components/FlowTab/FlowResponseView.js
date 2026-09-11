import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import QueryResult, {
  useInitialResponseFormat,
  useResponsePreviewFormatOptions
} from 'components/ResponsePane/QueryResult';
import QueryResultTypeSelector from 'components/ResponsePane/QueryResult/QueryResultTypeSelector';

const ViewRoot = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
`;

const ViewToolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 4px 0 8px;
  flex-shrink: 0;
`;

const ViewBody = styled.div`
  flex: 1;
  min-height: 0;
  position: relative;
`;

/**
 * Flow 节点结果 Tab 的响应视图。
 *
 * 复用请求 Tab 的 QueryResult（编辑器/预览/表格三种模式与 JSONPath 过滤），
 * 但状态由组件自持（不走 tabs slice）。传入真实请求 item，
 * 使响应编辑器内的 Ctrl+S 保存到该请求文件。
 */
const FlowResponseView = ({ requestItem, collection, runState }) => {
  const data = runState?.body ?? null;
  const dataBuffer = runState?.dataBuffer ?? null;
  const headers = runState?.headers ?? null;

  const { initialFormat, initialTab } = useInitialResponseFormat(dataBuffer, headers);
  const previewFormatOptions = useResponsePreviewFormatOptions(dataBuffer, headers);

  // 本地视图状态：默认跟随内容类型推断
  const [selectedFormat, setSelectedFormat] = useState(null);
  const [selectedTab, setSelectedTab] = useState('editor');
  const [filter, setFilter] = useState('');
  const [filterExpanded, setFilterExpanded] = useState(false);
  const [tablePath, setTablePath] = useState('data');

  // 切换节点/响应变化时重置为推断值
  const responseKey = `${requestItem?.uid}-${runState?.status}-${runState?.duration}`;
  const prevResponseKeyRef = useRef(null);
  useEffect(() => {
    if (prevResponseKeyRef.current !== responseKey) {
      prevResponseKeyRef.current = responseKey;
      setSelectedFormat(initialFormat || 'json');
      setSelectedTab(initialTab || 'editor');
      setFilter('');
      setTablePath('data');
    }
  }, [responseKey, initialFormat, initialTab]);

  const effectiveFormat = selectedFormat ?? initialFormat ?? 'json';
  const effectiveTab = selectedTab ?? initialTab ?? 'editor';

  // 结果区为只读展示，禁用响应编辑器内的运行快捷键；保存走真实请求 item
  const compositeItem = useMemo(
    () => ({ ...requestItem, response: { size: runState?.size } }),
    [requestItem, runState?.size]
  );

  const handleFormatChange = useCallback((newFormat) => setSelectedFormat(newFormat), []);
  const handleViewTabChange = useCallback((newViewTab) => setSelectedTab(newViewTab), []);

  return (
    <ViewRoot>
      <ViewToolbar>
        <QueryResultTypeSelector
          formatOptions={previewFormatOptions}
          formatValue={effectiveFormat}
          onFormatChange={handleFormatChange}
          onPreviewTabSelect={handleViewTabChange}
          selectedTab={effectiveTab}
          isActiveTab={effectiveTab === 'editor' || effectiveTab === 'preview' || effectiveTab === 'table'}
          onTabSelect={() => handleViewTabChange('editor')}
        />
      </ViewToolbar>
      <ViewBody>
        <QueryResult
          item={compositeItem}
          collection={collection}
          data={data}
          dataBuffer={dataBuffer}
          headers={headers}
          error={null}
          disableRunEventListener={true}
          selectedFormat={effectiveFormat}
          selectedTab={effectiveTab}
          filter={filter}
          filterExpanded={filterExpanded}
          onFilterChange={setFilter}
          onFilterExpandChange={setFilterExpanded}
          tablePath={tablePath}
          onTablePathChange={setTablePath}
          docKey={`flow-response-${requestItem?.uid || 'view'}`}
        />
      </ViewBody>
    </ViewRoot>
  );
};

export default FlowResponseView;
