// middleware/viewerReadOnly.js
module.exports = function viewerReadOnly(req, res, next) {
  if (req.user && req.user.role === "viewer" && req.method !== "GET") {
    return res.status(403).json({ message: "Viewer accounts are read-only" });
  }
  next();
};
