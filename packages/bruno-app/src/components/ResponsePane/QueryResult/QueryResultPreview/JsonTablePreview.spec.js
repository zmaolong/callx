import {
  formatCellValue,
  getTableColumns,
  getValueAtPath,
  parseJsonData
} from './JsonTablePreview';

describe('JsonTablePreview helpers', () => {
  it('parses JSON strings and preserves objects', () => {
    expect(parseJsonData('{"data":[]}')).toEqual({ value: { data: [] }, error: null });
    const data = { data: [] };
    expect(parseJsonData(data)).toEqual({ value: data, error: null });
  });

  it('reports invalid JSON', () => {
    expect(parseJsonData('{invalid}').error).toBeTruthy();
  });

  it('resolves nested dot-separated paths', () => {
    const data = { result: { records: [{ id: 1 }] } };
    expect(getValueAtPath(data, 'result.records')).toEqual({ found: true, value: [{ id: 1 }] });
    expect(getValueAtPath(data, 'result.items')).toEqual({ found: false, value: undefined });
  });

  it('converts an object target into a single table row', () => {
    const target = { id: 1, name: 'Alice' };
    const rows = Array.isArray(target) ? target : [target];
    expect(rows).toEqual([{ id: 1, name: 'Alice' }]);
    expect(getTableColumns(rows)).toEqual(['id', 'name']);
  });

  it('uses the union of row fields in their first-seen order', () => {
    expect(getTableColumns([{ id: 1, name: 'A' }, { id: 2, active: true }]))
      .toEqual(['id', 'name', 'active']);
  });

  it('formats primitive, empty, and nested values', () => {
    expect(formatCellValue(null)).toBe('');
    expect(formatCellValue(false)).toBe('false');
    expect(formatCellValue({ tags: ['a'] })).toBe('{"tags":["a"]}');
  });
});
