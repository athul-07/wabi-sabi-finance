function isMonthEndBackupWindow(date) {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return date.getDate() >= lastDay - 2;
}

module.exports = { isMonthEndBackupWindow };
