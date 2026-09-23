const fs = require('node:fs');
const path = require('node:path');

const allowed = new Set(['gateway', 'pr-chat-api', 'pr-auth-api', 'pr-admin-api']);
const unit = process.env.DEPLOY_UNIT_ID;
const release = process.env.DEPLOY_RELEASE_PATH;
const runtimeFile = process.env.DEPLOY_RUNTIME_ENV_FILE;
if (!allowed.has(unit) || !release || !path.isAbsolute(release) || !runtimeFile || !path.isAbsolute(runtimeFile)) {
  throw new Error('PM2 发布参数无效');
}

const runtime = {};
for (const line of fs.readFileSync(runtimeFile, 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const separator = line.indexOf('=');
  if (separator <= 0) throw new Error('runtime.env 格式无效');
  const name = line.slice(0, separator);
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw new Error('runtime.env 变量名无效');
  runtime[name] = JSON.parse(line.slice(separator + 1));
}

module.exports = {
  apps: [{
    name: unit,
    cwd: release,
    script: 'dist/server.js',
    exec_mode: 'fork',
    instances: 1,
    autorestart: true,
    max_restarts: 10,
    max_memory_restart: '300M',
    kill_timeout: 12000,
    env: runtime,
  }],
};
