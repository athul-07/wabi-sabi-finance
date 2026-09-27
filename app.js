// Vercel entry point: export the Express application without opening a port.
// Local development continues to use src/server.js.
const express = require('express');
const { createApp } = require('./src/app');
const db = require('./src/db');
const authClient = require('./src/auth-client');

const app = express();
app.disable('x-powered-by');
app.use(createApp({ db, authClient }));
module.exports = app;
