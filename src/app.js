const express = require("express");
const path = require("path");
const deviceRoutes = require("./routes/devices");
const logger = require("./logger");
const config = require("./config");

function createApp() {
  const app = express();
  app.use(express.json());

  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      logger.info("request", {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        duration_ms: Date.now() - start,
      });
    });
    next();
  });

  // Simple read-only dashboard (static files), disabled during tests to
  // keep the test app minimal and free of filesystem lookups.
  if (config.NODE_ENV !== "test") {
    app.use(express.static(path.join(__dirname, "..", "public")));
  }

  app.use(deviceRoutes);

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") {
      return res.status(400).json({ error: "invalid JSON body" });
    }
    return res.status(500).json({ error: "internal server error" });
  });

  return app;
}

module.exports = createApp;
