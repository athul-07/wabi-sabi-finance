const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '..', '.env');
if (fs.existsSync(file)) process.loadEnvFile(file);
