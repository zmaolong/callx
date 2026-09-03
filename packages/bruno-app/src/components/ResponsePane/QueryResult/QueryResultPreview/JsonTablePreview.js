import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TableVirtuoso } from 'react-virtuoso';
import styled from 'styled-components';
import ErrorBanner from 'ui/ErrorBanner';

const DEFAULT_DATA_PATH = 'data';
const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 36;

const TableScroller = React.forwardRef(({ style, ...props }, ref) => (
  <div
    {...props}
    ref={ref}
    style={{
      ...style,
      overflow: 'auto',
      scrollbarGutter: 'stable'
    }}
  />
));
TableScroller.displayName = 'TableScroller';

export const parseJsonData = (data) => {
  if (typeof data === 'object' && data !== null) {
    return { value: data, error: null };
  }

  if (typeof data === 'string') {
    try {
      return { value: JSON.parse(data), error: null };
    } catch (error) {
      return { value: null, error: error.message };
    }
  }

  return { value: null, error: 'invalid-input' };
};

export const getValueAtPath = (data, path) => {
  const normalizedPath = path.trim();
  if (!normalizedPath) {
    return { found: true, value: data };
  }

  return normalizedPath.split('.').reduce((result, key) => {
    if (!result.found || result.value === null || typeof result.value !== 'object' || !(key in result.value)) {
      return { found: false, value: undefined };
    }
    return { found: true, value: result.value[key] };
  }, { found: true, value: data });
};

export const getTableColumns = (rows) => {
  const keys = new Set();
  rows.forEach((row) => Object.keys(row).forEach((key) => keys.add(key)));
  return Array.from(keys);
};

export const formatCellValue = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const StyledWrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;

  .table-path-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-bottom: 1px solid ${(props) => props.theme.table.border};
  }

  .table-path-label,
  .table-empty {
    color: ${(props) => props.theme.colors.text.muted};
    font-size: 12px;
  }

  .table-path-input {
    width: 240px;
    min-width: 0;
    max-width: 240px;
    padding: 4px 8px;
    border: 1px solid ${(props) => props.theme.workspace.border};
    border-radius: 4px;
    color: ${(props) => props.theme.text};
    background: transparent;
    font-size: 12px;
  }

  .json-table-container {
    flex: 1 1 auto;
    min-height: 0;
    margin: 12px 16px 16px;
    border: solid 1px ${(props) => props.theme.border.border0};
    border-radius: ${(props) => props.theme.border.radius.base};
    overflow: hidden;
  }

  table {
    width: max-content;
    min-width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  td {
    height: ${ROW_HEIGHT}px;
    min-width: 140px;
    max-width: 360px;
    box-sizing: border-box;
    padding: 7px 10px;
    border-right: 1px solid ${(props) => props.theme.table.border};
    border-bottom: 1px solid ${(props) => props.theme.table.border};
    color: ${(props) => props.theme.text};
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 20px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  tr td:first-child {
    border-left: none;
  }

  thead td:last-child,
  tbody td:last-child {
    border-right: none;
  }

  tbody tr:last-child td {
    border-bottom: 1px solid ${(props) => props.theme.table.border};
  }

  thead {
    background: ${(props) => props.theme.table.headerBackground};
    box-shadow: inset 0 -1px ${(props) => props.theme.border.border0};
  }

  thead td {
    position: relative;
    height: ${HEADER_HEIGHT}px;
    background: ${(props) => props.theme.table.headerBackground};
    border-bottom: 1px solid ${(props) => props.theme.border.border0};
    color: ${(props) => props.theme.colors.text.muted};
    font-family: inherit;
    font-weight: 500;
  }

  .table-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    padding: 16px;
  }
`;

const JsonTablePreview = ({ data, path = DEFAULT_DATA_PATH, onPathChange }) => {
  const { t } = useTranslation();
  const wrapperRef = useRef(null);
  const [availableTableHeight, setAvailableTableHeight] = useState(0);
  const [inputPath, setInputPath] = useState(path || DEFAULT_DATA_PATH);

  useEffect(() => {
    setInputPath(path || DEFAULT_DATA_PATH);
  }, [path]);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return undefined;

    const updateAvailableHeight = () => {
      const toolbarHeight = wrapper.querySelector('.table-path-toolbar')?.offsetHeight || 0;
      setAvailableTableHeight(Math.max(0, wrapper.clientHeight - toolbarHeight - 28));
    };

    updateAvailableHeight();
    const observer = new ResizeObserver(updateAvailableHeight);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  const parsedData = useMemo(() => parseJsonData(data), [data]);
  const target = useMemo(() => (
    parsedData.error ? null : getValueAtPath(parsedData.value, path || DEFAULT_DATA_PATH)
  ), [parsedData, path]);
  const targetValue = target?.value;
  const rows = target?.found
    ? (Array.isArray(targetValue) ? targetValue : [targetValue])
    : null;
  const columns = useMemo(() => (
    rows && rows.every((row) => row !== null && typeof row === 'object' && !Array.isArray(row))
      ? getTableColumns(rows)
      : []
  ), [rows]);

  const commitPath = () => {
    const nextPath = inputPath.trim() || DEFAULT_DATA_PATH;
    setInputPath(nextPath);
    onPathChange?.(nextPath);
  };

  const contentHeight = HEADER_HEIGHT + rows.length * ROW_HEIGHT;
  const tableHeight = availableTableHeight > 0
    ? Math.min(contentHeight, availableTableHeight)
    : contentHeight;

  let content;
  if (parsedData.error) {
    content = <ErrorBanner errors={[{ title: t('RESPONSE.TABLE_INVALID_JSON'), message: parsedData.error }]} />;
  } else if (!target?.found) {
    content = <div className="table-empty">{t('RESPONSE.TABLE_PATH_NOT_FOUND', { path: path || DEFAULT_DATA_PATH })}</div>;
  } else if (!Array.isArray(target.value) && (target.value === null || typeof target.value !== 'object')) {
    content = <div className="table-empty">{t('RESPONSE.TABLE_EXPECTS_OBJECT_OR_ARRAY')}</div>;
  } else if (!target.value.length && Array.isArray(target.value)) {
    content = <div className="table-empty">{t('RESPONSE.TABLE_EMPTY')}</div>;
  } else if (!rows.every((row) => row !== null && typeof row === 'object' && !Array.isArray(row))) {
    content = <div className="table-empty">{t('RESPONSE.TABLE_EXPECTS_OBJECT_ARRAY')}</div>;
  } else {
    content = (
      <div
        className="json-table-container"
        data-testid="json-response-table"
        style={{ height: `${tableHeight}px` }}
      >
        <TableVirtuoso
          style={{ height: '100%' }}
          components={{ Scroller: TableScroller }}
          data={rows}
          fixedItemHeight={ROW_HEIGHT}
          computeItemKey={(index, row) => row.id ?? row.uid ?? index}
          fixedHeaderContent={() => (
            <tr>{columns.map((column) => <td key={column}>{column}</td>)}</tr>
          )}
          itemContent={(_, row) => columns.map((column) => {
            const value = formatCellValue(row[column]);
            return <td key={column} title={value}>{value}</td>;
          })}
        />
      </div>
    );
  }

  return (
    <StyledWrapper ref={wrapperRef}>
      <div className="table-path-toolbar">
        <label className="table-path-label" htmlFor="response-table-path">{t('RESPONSE.TABLE_DATA_PATH')}</label>
        <input
          id="response-table-path"
          className="table-path-input"
          value={inputPath}
          onChange={(event) => setInputPath(event.target.value)}
          onBlur={commitPath}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            }
          }}
          placeholder={DEFAULT_DATA_PATH}
          data-testid="response-table-path"
        />
      </div>
      {content}
    </StyledWrapper>
  );
};

export default JsonTablePreview;
