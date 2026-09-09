import stringifyItem from './stringifyItem';
import parseItem from './parseItem';

// Typed bruno vars on `request.vars.req` serialize to OC's `{ type, data }`
// struct. `dataType: 'string'` is the implicit default and stays a raw string.

describe('stringifyItem — Flow input mappings', () => {
  it('round-trips Flow and typed literal inputs', () => {
    const item = {
      uid: 'flow_1',
      type: 'flow',
      name: 'Supplier Flow',
      seq: 1,
      flow: {
        nodes: [
          { id: 'start', type: 'start', position: { x: 80, y: 200 } },
          {
            id: 'step_supplier',
            type: 'request',
            requestUid: 'request_1',
            requestPath: 'supplier.yml',
            alias: '查询供应商',
            position: { x: 320, y: 200 },
            inputs: [
              {
                name: 'supplierId',
                source: {
                  kind: 'flow',
                  expression: '{{$flow.last.body.id}}'
                }
              },
              {
                name: 'retryCount',
                source: {
                  kind: 'literal',
                  value: 3,
                  valueType: 'number'
                }
              }
            ]
          },
          { id: 'end', type: 'end', position: { x: 920, y: 200 } }
        ],
        edges: [
          { id: 'edge_start_supplier', source: 'start', target: 'step_supplier' },
          { id: 'edge_supplier_end', source: 'step_supplier', target: 'end' }
        ]
      }
    } as any;

    const yml = stringifyItem(item);
    const reparsed = parseItem(yml);

    expect(reparsed).toMatchObject({
      type: 'flow',
      name: 'Supplier Flow',
      flow: {
        nodes: expect.arrayContaining([
          expect.objectContaining({
            id: 'step_supplier',
            inputs: [
              {
                name: 'supplierId',
                source: {
                  kind: 'flow',
                  expression: '{{$flow.last.body.id}}'
                }
              },
              {
                name: 'retryCount',
                source: {
                  kind: 'literal',
                  value: 3,
                  valueType: 'number'
                }
              }
            ]
          })
        ]),
        edges: [
          { id: 'edge_start_supplier', source: 'start', target: 'step_supplier' },
          { id: 'edge_supplier_end', source: 'step_supplier', target: 'end' }
        ]
      }
    });
  });
});

describe('stringifyItem — typed runtime.variables', () => {
  it('round-trips typed values and omits a typed struct for the implicit string default', () => {
    const item = {
      uid: 'i1',
      type: 'http-request',
      name: 'r',
      seq: 1,
      request: {
        url: 'https://example.com',
        method: 'GET',
        headers: [],
        params: [],
        body: { mode: 'none' },
        auth: { mode: 'none' },
        script: { req: null, res: null },
        tests: null,
        vars: {
          req: [
            { uid: 'v1', name: 'count', value: 42, enabled: true, dataType: 'number' },
            { uid: 'v2', name: 'enabled', value: true, enabled: true, dataType: 'boolean' },
            { uid: 'v3', name: 'config', value: { a: 1 }, enabled: true, dataType: 'object' },
            { uid: 'v4', name: 'greeting', value: 'hi', enabled: true, dataType: 'string' },
            { uid: 'v5', name: 'plain', value: 'hello', enabled: true }
          ],
          res: []
        }
      }
    } as any;

    const yml = stringifyItem(item);

    // `type: string` is never written out.
    expect(yml).not.toMatch(/type:\s*string/);

    const reparsed = parseItem(yml);
    const reqVars = reparsed.request!.vars!.req!;

    expect(reqVars).toHaveLength(5);
    expect(reqVars[0]).toMatchObject({ name: 'count', value: 42, dataType: 'number' });
    expect(reqVars[1]).toMatchObject({ name: 'enabled', value: true, dataType: 'boolean' });
    expect(reqVars[2]).toMatchObject({ name: 'config', value: { a: 1 }, dataType: 'object' });
    expect(reqVars[3]).toMatchObject({ name: 'greeting', value: 'hi' });
    expect(reqVars[3].dataType).toBeUndefined();
    expect(reqVars[4]).toMatchObject({ name: 'plain', value: 'hello' });
    expect(reqVars[4].dataType).toBeUndefined();
  });
});
