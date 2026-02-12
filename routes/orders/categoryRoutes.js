const router = require("express").Router();
const Category = require("../../models/orders/categorySchema");
const { verifyToken } = require("../../middleware/jwt");
const { authorizeRoles } = require("../../middleware/checkRoles");

// Create a new category
router.post(
  "/create",
  verifyToken,

  async (req, res) => {
    try {
      const { name } = req.body;
      const newCategory = new Category({ name });
      await newCategory.save();
      res.status(201).json(newCategory);
    } catch (error) {
      res.status(500).json({ message: "Error creating category", error });
    }
  },
);

// Get all categories
router.get("/get", async (req, res) => {
  try {
    const categories = await Category.find();
    res.status(200).json(categories);
  } catch (error) {
    res.status(500).json({ message: "Error fetching categories", error });
  }
});

//delete category
router.delete(
  "/:id",
  verifyToken,

  async (req, res) => {
    try {
      const categoryId = req.params.id;
      const deletedCategory = await Category.findByIdAndDelete(categoryId);
      if (!deletedCategory) {
        return res.status(404).json({ message: "Category not found" });
      }
      res.status(200).json({ message: "Category deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Error deleting category", error });
    }
  },
);

module.exports = router;
