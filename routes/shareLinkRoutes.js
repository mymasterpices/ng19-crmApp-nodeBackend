const express = require("express");
const router = express.Router();
const SharedLink = require("../models/shareLinkSchema");

router.get("/get", async (req, res) => {
  try {
    const data = await SharedLink.find();
    console.log("data fetched");
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: "Error in creating ShareLink" });
    console.error(error);
  }
});

module.exports = router;
