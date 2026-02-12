const express = require("express");
const path = require("path");
const cors = require("cors");
const fs = require("fs");
require("dotenv").config();

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

// 4. Database connection
require("./connection");

// 5. Routes
const AuthRoutes = require("./routes/auth");
const CustomerRoutes = require("./routes/customerRoutes");
const ChatRoutes = require("./routes/chatRoutes");
const SoldRoutes = require("./routes/soldRoutes");
const searchProductRoutes = require("./routes/searchProductRoutes");
const VideoRoutes = require("./routes/videosRoutes");
const SharedLink = require("./routes/shareLinkRoutes");
const favList = require("./routes/favoriteListRoutes");
const FootfallRoutes = require("./routes/footfallRoutes");
// Orders routes
const categoryRoutes = require("./routes/orders/categoryRoutes");
const salespersonRoutes = require("./routes/orders/salespersonRoutes");
const statusRoutes = require("./routes/orders/statusRoutes");
const karigarRoutes = require("./routes/orders/karigarRoutes");
const ordersRoutes = require("./routes/orders/ordersRoutes");

app.use("/api/auth", AuthRoutes);
app.use("/api/customers", CustomerRoutes);
app.use("/api/chat", ChatRoutes);
app.use("/api/sold", SoldRoutes);
app.use("/api/products", searchProductRoutes);
app.use("/api/videos", VideoRoutes);
app.use("/api/videos/shared", SharedLink);
app.use("/api/videos/favorite", favList);
app.use("/api/footfall", FootfallRoutes);
// Orders routes
app.use("/api/orders/category", categoryRoutes);
app.use("/api/orders/salesperson", salespersonRoutes);
app.use("/api/orders/status", statusRoutes);
app.use("/api/orders/karigar", karigarRoutes);
app.use("/api/orders", ordersRoutes);

// Wildcard route to serve Angular app
app.get("/*splat", async (req, res) => {
  res.sendFile(path.join(__dirname, serv_angular));
});

// 6. Start server
app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});
