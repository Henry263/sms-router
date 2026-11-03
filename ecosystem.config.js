// PM2 process definition. Secrets and ports come from the server-side .env (never from this file).
module.exports = {
  apps: [
    {
      name: 'sms-router',
      script: 'src/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '200M',
      env: { NODE_ENV: 'production' }
    }
  ]
};
