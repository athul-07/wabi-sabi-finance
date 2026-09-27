const ExcelJS = require('exceljs');
const { publicUser } = require('./permissions');

const sections = ['inventory', 'customers', 'sales', 'rentals', 'transactions'];

function addRows(workbook, name, rows) {
  const sheet = workbook.addWorksheet(name);
  const fields = [...new Set(rows.flatMap(row => Object.keys(row || {})))];
  if (!fields.length) fields.push('id');
  sheet.addRow(fields);
  for (const row of rows) sheet.addRow(fields.map(field => {
    const value = row?.[field];
    return value && typeof value === 'object' ? JSON.stringify(value) : value ?? '';
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.columns = fields.map(field => ({ width: Math.min(40, Math.max(16, field.length + 4)) }));
}

async function exportWorkbook(record, users) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Wabi Sabi';
  const metadata = workbook.addWorksheet('Backup info');
  metadata.addRows([
    ['Field', 'Value'],
    ['Exported at', new Date().toISOString()],
    ['Shop version', record.version],
    ['Last updated at', record.updatedAt || ''],
    ['Last updated by', record.updatedBy || ''],
  ]);
  metadata.getRow(1).font = { bold: true };
  metadata.getColumn(1).width = 22;
  metadata.getColumn(2).width = 36;
  for (const section of sections) addRows(workbook, section[0].toUpperCase() + section.slice(1), record.data[section] || []);
  addRows(workbook, 'Settings', Object.entries(record.data.settings || {}).map(([key, value]) => ({ key, value })));
  addRows(workbook, 'Users', users.map(publicUser));
  return workbook.xlsx.writeBuffer();
}

module.exports = { exportWorkbook };
