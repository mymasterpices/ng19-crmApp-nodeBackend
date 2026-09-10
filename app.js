const express = require("express");
const path = require("path");
const cors = require("cors");
const fs = require("fs");
require("dotenv").config();

// near your other requires
const { verifyToken } = require("./middleware/jwt");
const viewerReadOnly = require("./middleware/viewerReadOnly");

// 2. App setup
const app = express();
const port = process.env.PORT || 3000;

// Ensure uploads directory exists
const uploadsPath = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath);
}

// 3. Middleware
app.use(cors());
app.use(express.json());
const serv_angular = "public/dist/browser/";
app.use(express.static(path.join(__dirname, serv_angular))); // Serve Angular frontend
app.use("/uploads", express.static("uploads"));

const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, "uploads");
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
const FootfallRoutes = require("./core/footfalls/footfallRoutes");
const AIChatRoutes = require("./routes/aiChatRoutes");

// Orders routes
const categoryRoutes = require("./core/orders/categoryRoutes");
const statusRoutes = require("./core/orders/statusRoutes");
const karigarRoutes = require("./core/karigars/karigarRoutes");
const ordersRoutes = require("./core/orders/ordersRoutes");
const imageSearchRoutes = require("./core/similar-images/imageSearchRoutes");
const salestargetRoutes = require("./core/targets/salestargetRoutes");
const footfalldataRoutes = require("./core/footfalls/footfalldataRoutes");

app.use("/api/auth", AuthRoutes);

app.use("/api/customers", verifyToken, viewerReadOnly, CustomerRoutes);
app.use("/api/chat", verifyToken, viewerReadOnly, ChatRoutes);
app.use("/api/sold", verifyToken, viewerReadOnly, SoldRoutes);
app.use("/api/products", verifyToken, viewerReadOnly, searchProductRoutes);
app.use("/api/videos", verifyToken, viewerReadOnly, VideoRoutes);
app.use("/api/videos/shared", verifyToken, viewerReadOnly, SharedLink);
app.use("/api/videos/favorite", verifyToken, viewerReadOnly, favList);
app.use("/api/footfall", verifyToken, viewerReadOnly, FootfallRoutes);
app.use("/api/orders/category", verifyToken, viewerReadOnly, categoryRoutes);
app.use("/api/orders/status", verifyToken, viewerReadOnly, statusRoutes);
app.use("/api/orders/karigar", verifyToken, viewerReadOnly, karigarRoutes);
app.use("/api/orders", verifyToken, viewerReadOnly, ordersRoutes);
app.use("/api/targets", verifyToken, viewerReadOnly, salestargetRoutes);
app.use("/api/image-search", verifyToken, viewerReadOnly, imageSearchRoutes);
app.use(
  "/api/footfall/footfalldata",
  verifyToken,
  viewerReadOnly,
  footfalldataRoutes,
);
app.use("/api/ai-chat", verifyToken, viewerReadOnly, AIChatRoutes);

// Wildcard route to serve Angular app
app.get("/*splat", async (req, res) => {
  res.sendFile(path.join(__dirname, serv_angular));
});

// 6. Start server
app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});
