// pm2 process config for local development.
// Usage:
//   pm2 start ecosystem.config.js   # start the Next.js dev server
//   pm2 logs shrimp-accounting       # follow logs
//   pm2 restart shrimp-accounting
//   pm2 stop shrimp-accounting
module.exports = {
  apps: [
    {
      name: "shrimp-accounting",
      cwd: __dirname,
      script: "npm",
      args: "run dev",
      env: {
        NODE_ENV: "development",
        PORT: "3000",
      },
      autorestart: true,
      watch: false,
    },
  ],
};
