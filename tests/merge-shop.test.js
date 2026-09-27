const { test } = require('node:test');
const assert = require('node:assert/strict');
const mergeShopData = require('../src/merge-shop');

test('merges concurrent changes to separate records and fields', () => {
    const base = {
        inventory: [{ id: 'WS-001', name: 'Blazer', salePrice: 100, stockQty: 1 }],
        sales: [{ id: 'GR-001', itemId: 'WS-001', received: 0 }],
        settings: { shopName: 'Wabi Sabi' },
    };
    const submitted = structuredClone(base);
    submitted.inventory[0].salePrice = 125;
    submitted.sales.push({ id: 'GR-002', itemId: 'WS-001', received: 50 });
    const current = structuredClone(base);
    current.inventory[0].stockQty = 2;
    current.sales.push({ id: 'GR-003', itemId: 'WS-001', received: 25 });

    const merged = mergeShopData(base, submitted, current);

    assert.deepEqual(merged.conflicts, []);
    assert.deepEqual(merged.data.inventory, [{ id: 'WS-001', name: 'Blazer', salePrice: 125, stockQty: 2 }]);
    assert.deepEqual(merged.data.sales.map(sale => sale.id), ['GR-001', 'GR-003', 'GR-002']);
});

test('reports a conflict when both users change the same field differently', () => {
    const base = { inventory: [{ id: 'WS-001', discount: 0 }] };
    const submitted = { inventory: [{ id: 'WS-001', discount: 10 }] };
    const current = { inventory: [{ id: 'WS-001', discount: 20 }] };

    const merged = mergeShopData(base, submitted, current);

    assert.deepEqual(merged.conflicts, ['inventory.WS-001.discount']);
});