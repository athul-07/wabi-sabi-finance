const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isMonthEndBackupWindow } = require('../src/backup-reminder');

test('reminds on the last three calendar dates, including short and leap months', () => {
  for (const [date, expected] of [
    ['2026-09-27', false], ['2026-09-28', true], ['2026-09-30', true],
    ['2026-10-28', false], ['2026-10-29', true], ['2026-10-31', true],
    ['2026-02-25', false], ['2026-02-26', true], ['2026-02-28', true],
    ['2028-02-26', false], ['2028-02-27', true], ['2028-02-29', true],
  ]) {
    assert.equal(isMonthEndBackupWindow(new Date(`${date}T12:00:00`)), expected, date);
  }
});
