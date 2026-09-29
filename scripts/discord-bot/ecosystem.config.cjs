// eslint-disable-next-line @typescript-eslint/no-require-imports -- PM2 loads this configuration as CommonJS.
const path = require('node:path');
module.exports = {
  apps: [{
    name: 'shrimp-discord-bot',
    cwd: path.resolve(__dirname, '../..'),
    script: path.join(__dirname, 'bot.mjs'),
    interpreter: process.execPath,
    instances: 1,
    autorestart: true,
    restart_delay: 10000,
    max_restarts: 5,
    min_uptime: 30000,
    kill_timeout: 45000,
    watch: false,
    time: true,
  }],
};
