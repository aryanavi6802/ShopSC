const express = require("express");
const cors = require("cors");
const { requestLogger } = require("./config/logger");
const routes = require("./routes");
const path = require("path");

const app = express();

// Behind Caddy in production: trust the first proxy so req.ip / req.protocol are correct.
app.set("trust proxy", 1);
app.disable("x-powered-by");

// Extra browser origins allowed to call the API directly (comma-separated). Same-origin requests via the
// reverse proxy don't need this; localhost is always allowed for development.
const extraOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      const allow =
        !origin ||
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
        extraOrigins.includes(origin);
      cb(null, allow ? origin || true : false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(
  "/uploads",
  express.static(path.join(process.cwd(), "uploads"), {
    dotfiles: "deny",
    index: false,
    setHeaders: (res) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
    }
  })
);
app.use("/api", requestLogger, routes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
});

module.exports = app;
