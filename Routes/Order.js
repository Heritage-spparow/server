const express = require('express');
const router = express.Router();
const Order = require('../Models/Order');
const User = require('../Models/User');
const Product = require('../Models/Product');
const Cart = require('../Models/Cart');
const { protect, authorize } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const { emailQueue } = require('../queues/emailQueue');
const PDFDocument = require('pdfkit');

// ⭐ RAZORPAY IMPORTS
const Razorpay = require("razorpay");
const crypto = require("crypto");

// ⭐ Razorpay Instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY,
  key_secret: process.env.RAZORPAY_SECRET,
});


// @route   POST /api/orders/razorpay
// @desc    Create Razorpay Order ID only (no DB order yet)
router.post("/razorpay", protect, async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid amount is required",
      });
    }

    // Convert to paise and ensure integer
    const amountInPaise = Math.round(parseFloat(amount) * 100);

    if (amountInPaise < 100) { // Min ₹1
      return res.status(400).json({
        success: false,
        message: "Minimum order amount is ₹1",
      });
    }

    const options = {
      amount: amountInPaise,
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
    };

    const razorpayOrder = await razorpay.orders.create(options);

    res.json({
      success: true,
      key: process.env.RAZORPAY_KEY,
      order: razorpayOrder,
    });
  } catch (error) {
    console.error("Razorpay order creation failed:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create payment order",
      error: error.message,
    });
  }
});

// @route   POST /api/orders/capture
// @desc    Capture payment + create order only after successful payment
// @access  Private
router.post("/capture", protect, async (req, res) => {
  try {
    const {
      paymentId,
      razorpayOrderId,
      signature,
      orderItems,
      shippingAddress,
      itemsPrice,
      taxPrice,
      shippingPrice,
      totalPrice,
    } = req.body;

    // 1. Verify signature
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_SECRET)
      .update(razorpayOrderId + "|" + paymentId)
      .digest("hex");

    if (expectedSignature !== signature) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    // 2. Validate stock again
    for (const item of orderItems) {
      const product = await Product.findById(item.product);
      if (!product || !product.active || product.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${item.name}`,
        });
      }
    }

    // 3. Create order now (only after payment success)
    const order = await Order.create({
      user: req.user._id,
      orderItems,
      shippingAddress,
      paymentMethod: "razorpay",
      paymentResult: {
        id: paymentId,
        status: "paid",
        updateTime: Date.now(),
        emailAddress: req.user.email,
      },
      itemsPrice,
      taxPrice,
      shippingPrice,
      totalPrice,
      isPaid: true,
      paidAt: Date.now(),
      status: "processing",
    });

    // 4. Reduce stock
    for (const item of order.orderItems) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { stock: -item.quantity },
      });
    }

    // 5. Clear cart
    await Cart.findOneAndUpdate(
      { user: req.user._id },
      { $set: { items: [], totalItems: 0, totalPrice: 0 } }
    );

    // 6. Send invoice email
    emailQueue.add('order_invoice', { orderId: order._id.toString() });

    res.json({
      success: true,
      order,
    });
  } catch (error) {
    console.error("Order capture failed:", error);
    res.status(500).json({
      success: false,
      message: "Payment captured but order creation failed",
    });
  }
});

// @route   POST /api/orders/razorpay/verify
// @desc    Verify Razorpay Payment Signature
// @access  Private
router.post("/razorpay/verify", protect, async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature"
      });
    }

    return res.status(200).json({
      success: true,
      payment: {
        id: razorpay_payment_id,
        status: "paid"
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Signature verification failed",
      error: error.message,
    });
  }
});



router.post('/', protect, [ 
  body('shippingAddress.address').notEmpty().withMessage('Address is required'),
  body('shippingAddress.city').notEmpty().withMessage('City is required'),
  body('shippingAddress.postalCode').notEmpty().withMessage('Postal code is required'),
  body('shippingAddress.country').notEmpty().withMessage('Country is required'),
  body('shippingAddress.phone').notEmpty().withMessage('Phone number is required'),
  body('paymentMethod').notEmpty().withMessage('Payment method is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { orderItems, shippingAddress, paymentMethod, itemsPrice, taxPrice, shippingPrice, totalPrice } = req.body;

    let items = orderItems;

    if (!items || items.length === 0) {
      const cart = await Cart.findOne({ user: req.user._id }).populate('items.product');

      if (!cart || cart.items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No items to order'
        });
      }

      items = cart.items.map(item => ({
        product: item.product._id,
        name: item.product.name,
        image: item.product.images[0]?.url || '',
        price: item.product.effectivePrice,
        quantity: item.quantity,
        color: item.color,
        size: item.size
      }));
    }

    for (const item of items) {
      const product = await Product.findById(item.product);

      if (!product || !product.active) {
        return res.status(400).json({
          success: false,
          message: `Product ${item.name} is not available`
        });
      }

      if (product.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${item.name}`
        });
      }
    }

    const calculatedItemsPrice = items.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const calculatedTaxPrice = calculatedItemsPrice * 0.08;
    const calculatedShippingPrice = calculatedItemsPrice > 100 ? 0 : 10;
    const calculatedTotalPrice = calculatedItemsPrice + calculatedTaxPrice + calculatedShippingPrice;

    const order = await Order.create({
      user: req.user._id,
      orderItems: items,
      shippingAddress,
      paymentMethod,
      itemsPrice: itemsPrice || calculatedItemsPrice,
      taxPrice: taxPrice || calculatedTaxPrice,
      shippingPrice: shippingPrice || calculatedShippingPrice,
      totalPrice: totalPrice || calculatedTotalPrice
    });

    // Empty cart after order
    if (!orderItems) {
      await Cart.findOneAndUpdate(
        { user: req.user._id },
        { $set: { items: [], totalItems: 0, totalPrice: 0 } }
      );
    }

    // Email invoice
    emailQueue.add('order_invoice', { orderId: order._id.toString() })
      .catch(err => console.error('Failed to enqueue invoice email:', err));

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

router.get('/my', protect, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const orders = await Order.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('orderItems.product', 'name images')
      .lean();

    const total = await Order.countDocuments({ user: req.user._id });

    res.status(200).json({
      success: true,
      orders,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


router.get('/:id', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'name email')
      .populate('orderItems.product', 'name images')
      .lean();

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (order.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }

    res.status(200).json({ success: true, order });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});



router.put('/:id/pay', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }

    order.isPaid = true;
    order.paidAt = Date.now();
    order.status = 'processing';

    order.paymentResult = {
      id: req.body.id,
      status: req.body.status,
      updateTime: Date.now(),
      emailAddress: req.user.email
    };

    for (const item of order.orderItems) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { stock: -item.quantity }
      });
    }

    const updatedOrder = await order.save();

    res.status(200).json({
      success: true,
      message: 'Order updated to paid',
      order: updatedOrder
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/:id/cancel', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }

    if (order.status === 'shipped' || order.status === 'delivered') {
      return res.status(400).json({ success: false, message: 'Cannot cancel shipped orders' });
    }

    order.status = 'cancelled';

    if (order.isPaid) {
      for (const item of order.orderItems) {
        await Product.findByIdAndUpdate(item.product, {
          $inc: { stock: item.quantity }
        });
      }
    }

    await order.save();

    res.status(200).json({
      success: true,
      message: 'Order cancelled successfully',
      order
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


router.get('/', protect, authorize('admin', 'manager', 'support'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const query = {};

    if (req.query.status) query.status = req.query.status;

    if (req.query.startDate || req.query.endDate) {
      query.createdAt = {};
      if (req.query.startDate) query.createdAt.$gte = new Date(req.query.startDate);
      if (req.query.endDate) query.createdAt.$lte = new Date(req.query.endDate);
    }

    const orders = await Order.find(query)
      .populate('user', 'name email')
      .populate('orderItems.product', 'name images')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await Order.countDocuments(query);

    res.status(200).json({
      success: true,
      orders,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/* ============================================================
   ⭐ ADMIN: UPDATE ORDER STATUS
   ============================================================ */

router.put('/:id/status', protect, authorize('admin', 'manager', 'support'), [
  body('status').isIn(['pending', 'processing', 'shipped', 'delivered', 'cancelled'])
], async (req, res) => {
  try {
    const { status, trackingNumber } = req.body;

    const order = await Order.findById(req.params.id).populate('orderItems.product');

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    order.status = status;

    if (trackingNumber) order.trackingNumber = trackingNumber;

    if (status === 'delivered') {
      order.isDelivered = true;
      order.deliveredAt = Date.now();
    }

    await order.save();

    res.status(200).json({
      success: true,
      message: 'Order status updated',
      order
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
