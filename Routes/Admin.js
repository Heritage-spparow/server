const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { protect, authorize } = require('../middleware/auth');
const Order = require('../Models/Order');
const Product = require('../Models/Product');
const User = require('../Models/User');

// All admin routes require auth
router.use(protect);

// Overview stats
// GET /api/admin/overview
router.get('/overview', authorize('admin', 'manager', 'support'), async (req, res) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Sales totals (paid orders)
    const [todayAgg, weekAgg, monthAgg, statusAgg, topProducts] = await Promise.all([
      Order.aggregate([
        { $match: { isPaid: true, createdAt: { $gte: startOfToday } } },
        { $group: { _id: null, revenue: { $sum: '$totalPrice' }, count: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: { isPaid: true, createdAt: { $gte: startOfWeek } } },
        { $group: { _id: null, revenue: { $sum: '$totalPrice' }, count: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: { isPaid: true, createdAt: { $gte: startOfMonth } } },
        { $group: { _id: null, revenue: { $sum: '$totalPrice' }, count: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $unwind: '$orderItems' },
        { $group: { _id: '$orderItems.product', qty: { $sum: '$orderItems.quantity' }, revenue: { $sum: { $multiply: ['$orderItems.price', '$orderItems.quantity'] } } } },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
        { $unwind: '$product' },
        { $project: { _id: 0, productId: '$product._id', name: '$product.name', revenue: 1, qty: 1 } },
      ]),
    ]);

    // Low stock count
    const lowStockCount = await Product.countDocuments({ active: true, stock: { $lte: 10 } });

    res.json({
      success: true,
      sales: {
        today: { revenue: todayAgg[0]?.revenue || 0, orders: todayAgg[0]?.count || 0 },
        week: { revenue: weekAgg[0]?.revenue || 0, orders: weekAgg[0]?.count || 0 },
        month: { revenue: monthAgg[0]?.revenue || 0, orders: monthAgg[0]?.count || 0 },
      },
      ordersOverview: statusAgg.reduce((acc, s) => { acc[s._id] = s.count; return acc; }, {}),
      bestSelling: topProducts,
      lowStockCount,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

// Low stock list
// GET /api/admin/inventory/low-stock
router.get('/inventory/low-stock', authorize('admin', 'manager'), async (req, res) => {
  try {
    const threshold = parseInt(req.query.threshold) || 10;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const products = await Product.find({ active: true, stock: { $lte: threshold } })
      .sort({ stock: 1 })
      .limit(limit)
      .lean();
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

// Customers list with order stats
// GET /api/admin/customers
router.get('/customers', authorize('admin'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const pipeline = [
      { $group: { _id: '$user', orders: { $sum: 1 }, totalSpend: { $sum: '$totalPrice' } } },
      { $sort: { totalSpend: -1 } },
      { $skip: skip },
      { $limit: limit },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $project: { _id: 0, userId: '$user._id', name: { $concat: ['$user.firstName', ' ', '$user.lastName'] }, email: '$user.email', orders: 1, totalSpend: 1 } },
    ];

    const [rows, totalAgg] = await Promise.all([
      Order.aggregate(pipeline),
      Order.aggregate([{ $group: { _id: '$user' } }, { $count: 'total' }]),
    ]);

    const total = totalAgg[0]?.total || 0;

    res.json({ success: true, customers: rows, pagination: { current: page, pages: Math.ceil(total / limit), total } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

// Sales report
// GET /api/admin/reports/sales?granularity=day&start=ISO&end=ISO
router.get('/reports/sales', authorize('admin'), async (req, res) => {
  try {
    const granularity = ['day', 'week', 'month'].includes(req.query.granularity) ? req.query.granularity : 'day';
    const start = req.query.start ? new Date(req.query.start) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = req.query.end ? new Date(req.query.end) : new Date();

    const data = await Order.aggregate([
      { $match: { isPaid: true, createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: { $dateTrunc: { date: '$createdAt', unit: granularity } }, revenue: { $sum: '$totalPrice' }, orders: { $sum: 1 } } },
      { $sort: { '_id': 1 } },
      { $project: { date: '$_id', revenue: 1, orders: 1, _id: 0 } },
    ]);

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

// Notifications (placeholder)
router.get('/notifications', authorize('admin', 'manager', 'support'), async (req, res) => {
  res.json({ success: true, notifications: [] });
});

module.exports = router;
