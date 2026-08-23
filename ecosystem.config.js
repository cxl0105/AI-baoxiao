module.exports = {
  apps: [{
    name: 'ai-baoxiao-web',
    cwd: '/opt/ai-baoxiao/apps/web',
    script: 'node_modules/next/dist/bin/next',
    args: 'start -p 3000 -H 127.0.0.1',
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1200M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_API_URL: 'https://www.aibaoxiao.top/api/v1'
    },
    error_file: '/var/log/pm2/ai-baoxiao-error.log',
    out_file: '/var/log/pm2/ai-baoxiao-out.log',
    merge_logs: true
  }]
};
