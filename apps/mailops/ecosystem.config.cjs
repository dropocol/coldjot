module.exports = {
  apps: [
    {
      name: "mailops",
      script: "./dist/server.js",
      instances: 4,
      exec_mode: "cluster",
      watch: false,
      max_memory_restart: "2G",
      node_args: "--expose-gc",
      env: {
        NODE_ENV: "development",
        NODE_OPTIONS: "--max-old-space-size=4096",
        PORT: 3001,
      },
      env_production: {
        NODE_ENV: "production",
        NODE_OPTIONS: "--max-old-space-size=4096",
        PORT: 3001,
      },
      exp_backoff_restart_delay: 100,
      merge_logs: true,
      error_file: "./logs/error.log",
      out_file: "./logs/out.log",
      log_file: "./logs/combined.log",
      time: true,
      log_type: "json",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      max_restarts: 10,
      min_uptime: "1m",
      autorestart: true,
      max_size: "10M",
      max_files: "14d",
      treekill: true,
      restart_delay: 4000,
      shutdown_with_message: true,
      wait_ready: true,
      listen_timeout: 10000,
      force: true,
    },
  ],
};