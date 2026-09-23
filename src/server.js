const createApp = require("./app");
const config = require("./config");
const logger = require("./logger");

const app = createApp();
const server = app.listen(config.PORT, () => {
  logger.info("server started", { port: config.PORT, env: config.NODE_ENV });
});

function shutdown(signal) {
  logger.info("shutdown signal received", { signal });
  server.close((err) => {
    if (err) {
      logger.error("error while closing server", { error: err.message });
      process.exit(1);
      return;
    }
    logger.info("server closed gracefully");
    process.exit(0);
  });

  // Don't hang forever if something keeps the event loop alive.
  setTimeout(() => {
    logger.warn("forcing shutdown after timeout");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
