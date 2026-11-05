const express = require("express");
const path = require("path");
const cors = require("cors");
const fs = require("fs");
const dotenv = require("dotenv");

// 1. Environment
const isProd = process.env.NODE_ENV === "production";
const envFile = isProd ? ".env" : ".env.local";

dotenv.config({ path: path.resolve(__dirname, envFile) });
console.log(`Environment loaded: ${envFile}`);

const { verifyToken } = require("./middleware/jwt");
const viewerReadOnly = require("./middleware/viewerReadOnly");

// 2. App setup
const app = express();
const port = process.env.PORT || 3000;

// Single uploads directory (env override supported), created if missing
const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

// 3. Middleware
app.use(cors());
// 1mb: the desk's bulk sync can send up to 200 enquiries in one call
app.use(express.json({ limit: "1mb" }));

const serv_angular = path.join(__dirname, "public/dist/browser");
app.use(
  express.static(serv_angular, {
    // Angular's hashed JS/CSS can be cached long-term; index.html must always be fresh
    maxAge: isProd ? "1y" : 0,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html"))
        res.setHeader("Cache-Control", "no-cache");
    },
  }),
);
app.use("/uploads", express.static(uploadsDir));

// 4. Database connection
require("./config/connection");

// 5. Routes
const AuthRoutes = require("./core/auth/authRoutes");
const CustomerRoutes = require("./core/customers/customerRoutes");
const ChatRoutes = require("./core/chats/chatRoutes");
const SoldRoutes = require("./core/solds/soldRoutes");
const searchProductRoutes = require("./core/products/searchProductRoutes");
const VideoRoutes = require("./core/videos/videosRoutes");
const SharedLink = require("./core/sharelinks/shareLinkRoutes");
const favList = require("./core/sharelinks/favoriteListRoutes");
const AIChatRoutes = require("./routes/aiChatRoutes");

// Orders routes
const categoryRoutes = require("./core/orders/categoryRoutes");
const statusRoutes = require("./core/orders/statusRoutes");
const karigarRoutes = require("./core/karigars/karigarRoutes");
const ordersRoutes = require("./core/orders/ordersRoutes");
const imageSearchRoutes = require("./core/similar-images/imageSearchRoutes");
const salestargetRoutes = require("./core/targets/salestargetRoutes");
const FeedbackRoutes = require("./core/fedback/Feedback.routes");

// CRM Catalog Desk (enquiries, send logs, market rules)
const DeskRoutes = require("./routes/desk.routes");

app.use("/api/auth", AuthRoutes);

app.use("/api/customers", verifyToken, viewerReadOnly, CustomerRoutes);
app.use("/api/chat", verifyToken, viewerReadOnly, ChatRoutes);
app.use("/api/sold", verifyToken, viewerReadOnly, SoldRoutes);
app.use("/api/products", verifyToken, searchProductRoutes);
app.use("/api/videos", verifyToken, viewerReadOnly, VideoRoutes);
app.use("/api/videos/shared", verifyToken, viewerReadOnly, SharedLink);
app.use("/api/videos/favorite", verifyToken, viewerReadOnly, favList);

app.use("/api/orders/category", verifyToken, viewerReadOnly, categoryRoutes);
app.use("/api/orders/status", verifyToken, viewerReadOnly, statusRoutes);
app.use("/api/orders/karigar", verifyToken, viewerReadOnly, karigarRoutes);
app.use("/api/orders", verifyToken, viewerReadOnly, ordersRoutes);
app.use("/api/targets", verifyToken, viewerReadOnly, salestargetRoutes);
app.use("/api/image-search", verifyToken, viewerReadOnly, imageSearchRoutes);
app.use("/api/ai-chat", verifyToken, viewerReadOnly, AIChatRoutes);
app.use("/api/desk", verifyToken, viewerReadOnly, DeskRoutes);

app.use("/api/feedback", FeedbackRoutes);

// Unknown API paths get JSON 404 (not the Angular page)
app.use("/api", (req, res) => {
  res
    .status(404)
    .json({ message: `Not found: ${req.method} ${req.originalUrl}` });
});

// Wildcard route: serve the Angular app for deep links / page refreshes
app.get("/*splat", (req, res) => {
  res.sendFile(path.join(serv_angular, "index.html"));
});

// 6. Error handler (keeps async route errors as JSON, hides details in production)
app.use((err, req, res, next) => {
  console.error(`[${req.method} ${req.originalUrl}]`, err);
  if (res.headersSent) return next(err);
  const status =
    err.status ||
    err.statusCode ||
    (err.name === "ValidationError" ? 400 : 500);
  res.status(status).json({
    message:
      status >= 500 && isProd
        ? "Internal server error"
        : err.message || "Error",
  });
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

// 7. Start server
app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});
