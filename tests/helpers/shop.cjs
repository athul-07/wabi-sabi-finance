// Synthetic test data only. Never imported by the production application.
module.exports = {
  customers: [{ id: 'CUST-TEST', phone: '9876543210', name: 'Test Customer', email: '', address: '', notes: '' }],
  inventory: Array.from({ length: 24 }, (_, i) => ({
    id: `WS-${String(i + 1).padStart(3, '0')}`, name: `Test outfit ${i + 1}`, category: 'Groom',
    purchaseCost: 1000, salePrice: 16400, rentalPrice: 3200, deposit: 1500,
    cleaning: 0, repair: 0, status: 'Available', stockQty: 1, purchaseDate: '2026-01-01',
  })),
  sales: [], rentals: [], transactions: [],
  settings: { lateFeePerDay: 1000, shopName: 'Test Shop' },
};
