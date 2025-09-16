const jwt = require("jsonwebtoken");
require("dotenv").config();

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader) return res.status(401).json({ message: "Token required" });

  const token = authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ message: "Unathorized" });
  try {
    //verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    console.error(error);
    return res.status(403).json({ message: "Invalid token." });
  }
};
//function for generate JWT token
const generateToken = (userData) => {
  //generate new JWT token
  return jwt.sign(userData, process.env.JWT_SECRET, {
    expiresIn: "1d",
  });
};

module.exports = { verifyToken, generateToken };
