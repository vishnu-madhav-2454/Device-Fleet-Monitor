const express = require("express");
const deviceRoutes = require("./routes/devices");

function createApp() {
  const app = express();
  app.use(express.json());
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
