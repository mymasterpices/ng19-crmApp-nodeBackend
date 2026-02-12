const router = require("express").Router();
const OrderStatus = require("../../models/orders/statusSchema");
const { verifyToken } = require("../../middleware/jwt");
const { authorizeRoles } = require("../../middleware/checkRoles");

// Create a new OrderStatus
router.post(
  "/create",
  verifyToken,

  async (req, res) => {
    try {
      const { name } = req.body;
      const newOrderStatus = new OrderStatus({ name });
      await newOrderStatus.save();
      res.status(201).json(newOrderStatus);
    } catch (error) {
      res.status(500).json({ message: "Error creating OrderStatus", error });
    }
  },
);

// Get all categories
router.get("/get", async (req, res) => {
  try {
    const categories = await OrderStatus.find();
    res.status(200).json(categories);
  } catch (error) {
    res.status(500).json({ message: "Error fetching categories", error });
  }
});

//delete OrderStatus
router.delete(
  "/:id",
  verifyToken,

  async (req, res) => {
    try {
      const OrderStatusId = req.params.id;
      const deletedOrderStatus =
        await OrderStatus.findByIdAndDelete(OrderStatusId);
      if (!deletedOrderStatus) {
        return res.status(404).json({ message: "OrderStatus not found" });
      }
      res.status(200).json({ message: "OrderStatus deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Error deleting OrderStatus", error });
    }
  },
);

module.exports = router;
