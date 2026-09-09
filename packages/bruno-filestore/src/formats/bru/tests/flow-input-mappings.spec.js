const { parseBruRequest, stringifyBruRequest } = require('../index');

describe('BRU Flow input mappings', () => {
  it('round-trips Flow and typed literal inputs', () => {
    const flow = {
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
            requestPath: 'supplier.bru',
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
    };

    const bru = stringifyBruRequest(flow);
    const reparsed = parseBruRequest(bru);

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
