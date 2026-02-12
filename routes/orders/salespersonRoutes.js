const router = require("express").Router();
const SalesPerson = require("../../models/orders/salespersonSchema");
const { verifyToken } = require("../../middleware/jwt");
const { authorizeRoles } = require("../../middleware/checkRoles");

// Create a new SalesPerson
router.post(
  "/create",
  verifyToken,

  async (req, res) => {
    try {
      const { name } = req.body;
      const newSalesPerson = new SalesPerson({ name });
      await newSalesPerson.save();
      res.status(201).json(newSalesPerson);
    } catch (error) {
      res.status(500).json({ message: "Error creating SalesPerson", error });
    }
  },
);

// Get all categories
router.get("/get", verifyToken, async (req, res) => {
  try {
    const categories = await SalesPerson.find();
    res.status(200).json(categories);
  } catch (error) {
    res.status(500).json({ message: "Error fetching categories", error });
  }
});

//delete SalesPerson
router.delete(
  "/:id",
  verifyToken,

  async (req, res) => {
    try {
      const SalesPersonId = req.params.id;
      const deletedSalesPerson =
        await SalesPerson.findByIdAndDelete(SalesPersonId);
      if (!deletedSalesPerson) {
        return res.status(404).json({ message: "SalesPerson not found" });
      }
      res.status(200).json({ message: "SalesPerson deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Error deleting SalesPerson", error });
    }
  },
);

module.exports = router;
