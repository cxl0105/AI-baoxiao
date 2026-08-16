module.exports = {
  apps: [{
    name: 'ai-baoxiao-api',
    cwd: '/opt/ai-baoxiao/apps/api',
    script: '/opt/ai-baoxiao/node_modules/.bin/tsx',
    args: 'src/index.ts',
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '800M',
    env: {
      NODE_ENV: 'production',
      PORT: 4000
    },
    error_file: '/var/log/pm2/ai-baoxiao-api-error.log',
    out_file: '/var/log/pm2/ai-baoxiao-api-out.log',
    merge_logs: true
  }]
};
