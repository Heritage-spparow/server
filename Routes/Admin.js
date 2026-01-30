const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { protect, authorize } = require("../middleware/auth");

const Order = require("../Models/Order");
const Product = require("../Models/Product");
const User = require("../Models/User");
const AboutPage = require("../Models/AboutPage");
const upload = require("../middleware/upload");

/* =====================================================
   ALL ADMIN ROUTES REQUIRE AUTH
===================================================== */
router.use(protect);

/* =====================================================
   🌍 PUBLIC ABOUT PAGE (Frontend)
   GET /api/admin/about
===================================================== */
router.get("/about", async (req, res) => {
  try {
    const about = await AboutPage.findOne();
    res.json({ success: true, data: about });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* =====================================================
   ✏️ CREATE / UPDATE ABOUT PAGE (ADMIN)
   POST /api/admin/about
===================================================== */
router.post(
  "/upload",
  authorize("admin"),
  upload.single("file"),
  async (req, res) => {
    try {
      const stream = cloudinary.uploader.upload_stream(
        { folder: "about" },
        (err, result) => {
          if (err) {
            return res.status(500).json({ success: false });
          }
          res.json({ success: true, url: result.secure_url });
        }
      );

      stream.end(req.file.buffer);
    } catch (err) {
      res.status(500).json({ success: false });
    }
  }
);

/* =====================================================
   ADMIN DASHBOARD OVERVIEW
===================================================== */
router.get(
  "/overview",
  authorize("admin", "manager", "support"),
  async (req, res) => {
    try {
      const startOfMonth = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1
      );

      const monthAgg = await Order.aggregate([
        { $match: { isPaid: true, createdAt: { $gte: startOfMonth } } },
        {
          $group: {
            _id: null,
            revenue: { $sum: "$totalPrice" },
            orders: { $sum: 1 },
          },
        },
      ]);

      const statusAgg = await Order.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]);

      const ordersOverview = statusAgg.reduce((acc, s) => {
        acc[s._id] = s.count;
        return acc;
      }, {});

      const activeProducts = await Product.countDocuments({ active: true });

      const lowStockCount = await Product.countDocuments({
        active: true,
        sizes: { $elemMatch: { stock: { $lte: 5 } } },
      });

      res.json({
        success: true,
        sales: {
          month: {
            revenue: monthAgg[0]?.revenue || 0,
            orders: monthAgg[0]?.orders || 0,
          },
        },
        ordersOverview,
        activeProducts,
        lowStockCount,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

/* =====================================================
   ⭐ ADMINS LIST
===================================================== */
router.get(
  "/admins",
  authorize("admin"),
  async (req, res) => {
    try {
      const admins = await User.find(
        { role: "admin" },
        { password: 0, resetPasswordToken: 0, resetPasswordExpire: 0 }
      ).sort({ createdAt: -1 });

      res.json({ success: true, admins });
    } catch (err) {
      res.status(500).json({ success: false, message: "Failed to fetch admins" });
    }
  }
);

/* =====================================================
   🔔 NEW ORDERS NOTIFICATIONS
===================================================== */
router.get(
  "/notifications/orders",
  authorize("admin", "manager", "support"),
  async (req, res) => {
    try {
      const since = req.query.since
        ? new Date(req.query.since)
        : new Date(Date.now() - 60 * 1000);

      const newOrders = await Order.find({
        createdAt: { $gt: since },
      })
        .select("_id orderNumber totalPrice createdAt")
        .sort({ createdAt: -1 })
        .limit(5);

      res.json({
        success: true,
        count: newOrders.length,
        orders: newOrders,
        now: new Date(),
      });
    } catch (err) {
      res.status(500).json({ success: false });
    }
  }
);

/* =====================================================
   TOGGLE ADMIN STATUS
===================================================== */
router.put(
  "/admins/:id/status",
  authorize("admin"),
  async (req, res) => {
    try {
      const admin = await User.findById(req.params.id);

      if (!admin || admin.role !== "admin") {
        return res.status(404).json({ success: false, message: "Admin not found" });
      }

      if (admin._id.toString() === req.user._id.toString()) {
        return res.status(400).json({
          success: false,
          message: "You cannot suspend yourself",
        });
      }

      admin.accountStatus =
        admin.accountStatus === "active" ? "suspended" : "active";

      await admin.save();

      res.json({ success: true, status: admin.accountStatus });
    } catch (err) {
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

/* =====================================================
   DELETE ADMIN
===================================================== */
router.delete(
  "/admins/:id",
  authorize("admin"),
  async (req, res) => {
    try {
      if (req.params.id === req.user._id.toString()) {
        return res.status(400).json({
          success: false,
          message: "You cannot delete yourself",
        });
      }

      const admin = await User.findOneAndDelete({
        _id: req.params.id,
        role: "admin",
      });

      if (!admin) {
        return res.status(404).json({ success: false, message: "Admin not found" });
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

/* =====================================================
   CUSTOMERS LIST
===================================================== */
router.get(
  "/customers",
  authorize("admin"),
  async (req, res) => {
    try {
      const customers = await User.find(
        { role: "user" },
        { password: 0 }
      ).sort({ createdAt: -1 });

      res.json({ success: true, customers });
    } catch (err) {
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

/* =====================================================
   SALES REPORT
===================================================== */
router.get(
  "/reports/sales",
  authorize("admin"),
  async (req, res) => {
    try {
      const data = await Order.aggregate([
        { $match: { isPaid: true } },
        {
          $group: {
            _id: {
              $dateTrunc: {
                date: "$createdAt",
                unit: "day",
              },
            },
            revenue: { $sum: "$totalPrice" },
            orders: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

module.exports = router;
