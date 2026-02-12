const router = require("express").Router();
const Karigar = require("../../models/orders/karigarSchema");
const { verifyToken } = require("../../middleware/jwt");
const { authorizeRoles } = require("../../middleware/checkRoles");

// Create a new karigar
router.post(
  "/create",
  verifyToken,

  async (req, res) => {
    try {
      const { name } = req.body;
      const newKarigar = new Karigar({ name });
      await newKarigar.save();
      res.status(201).json(newKarigar);
    } catch (error) {
      res.status(500).json({ message: "Error creating Karigar", error });
    }
  },
);

// Get all categories
router.get("/get", async (req, res) => {
  try {
    const categories = await Karigar.find();
    res.status(200).json(categories);
  } catch (error) {
    res.status(500).json({ message: "Error fetching categories", error });
  }
});

//delete Karigar
router.delete(
  "/:id",
  verifyToken,

  async (req, res) => {
    try {
      const KarigarId = req.params.id;
      const deletedKarigar = await Karigar.findByIdAndDelete(KarigarId);
      if (!deletedKarigar) {
        return res.status(404).json({ message: "Karigar not found" });
      }
      res.status(200).json({ message: "Karigar deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Error deleting Karigar", error });
    }
  },
);

module.exports = router;
