const path = require('node:path');

const backend = (name, dir) => ({
  name,
  cwd: path.resolve(__dirname, 'backend', dir),
  script: 'dist/server.js',
  exec_mode: 'fork',
  instances: 1,
  autorestart: true,
  max_restarts: 10,
  max_memory_restart: '300M',
  kill_timeout: 12000,
  env: { NODE_ENV: 'production' },
});

module.exports = {
  apps: [
    backend('gateway', 'gateway'),
    backend('pr-chat-api', 'pr-chat'),
    backend('pr-auth-api', 'pr-auth'),
    backend('pr-admin-api', 'pr-admin'),
  ],
};
