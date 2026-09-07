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
const path = require("path");
const mongoose = require("mongoose");
const generateInvoicePDF = require("../utils/generateInvoicePDF");
const uploadInvoiceToCloudinary = require("../middleware/uploadInvoiceToCloudinary");
const CheckoutSession = require("../Models/CheckoutSession");
const {
  buildServerCart,
  calculateCart,
  calculateCoupon,
  calculateAutomaticDiscount,
  roundMoney,
} = require("../utils/pricing");

// 📧 Email utils
const ejs = require("ejs");
const juice = require("juice");
const moment = require("moment");
const getMailer = require("../utils/mailer");

async function queueInvoiceEmail(orderId) {
  try {
    await emailQueue.add(
      "order_invoice",
      { orderId: orderId.toString() },
      { jobId: `order-invoice-${orderId}` }
    );
  } catch (error) {
    console.error("❌ Invoice email job enqueue failed:", error);
  }
}


// ⭐ RAZORPAY IMPORTS
const Razorpay = require("razorpay");
const crypto = require("crypto");

// ⭐ Razorpay Instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY,
  key_secret: process.env.RAZORPAY_SECRET,
});

const fs = require("fs");

// console.log(
//   "📄 Template exists:",
//   fs.existsSync(path.join(__dirname, "../templates/invoiceTemplate.ejs")),

// );
router.post("/razorpay", protect, async (req, res) => {
  try {
    const {
      orderItems,
      shippingAddress,
      couponCode,
    } = req.body;

    // =====================================================
    // 1. VALIDATE REQUEST
    // =====================================================

    if (
      !Array.isArray(orderItems) ||
      orderItems.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Your cart is empty",
      });
    }

    if (!shippingAddress) {
      return res.status(400).json({
        success: false,
        message: "Shipping address is required",
      });
    }

    // =====================================================
    // 2. BUILD TRUSTED CART FROM DATABASE
    // =====================================================

    const cart = await buildServerCart(
      orderItems
    );
    // =====================================================
    // 3. AUTOMATIC COLLECTION DISCOUNT
    // =====================================================

    const automaticDiscount =
      await calculateAutomaticDiscount(
        cart.items
      );

    // =====================================================
    // 4. NORMAL COUPON
    // =====================================================

    const {
      coupon,
      discountPrice: couponDiscount,
    } =
      await calculateCoupon({
        code: couponCode,
        userId: req.user._id,
        itemsPrice: cart.itemsPrice,
        cartItems: cart.items,
      });

    // =====================================================
    // 5. TOTAL DISCOUNT
    // =====================================================
    //
    // Automatic collection discounts and coupon discounts
    // are both applied.
    //
    // Example:
    // Collection A → ₹400
    // Goldasta → ₹500
    // Coupon → ₹200
    //
    // Total → ₹1100
    // =====================================================

    const discountPrice = roundMoney(
      automaticDiscount + couponDiscount
    );

    // =====================================================
    // 4. SHIPPING
    // =====================================================

    const country = String(
      shippingAddress.country || ""
    )
      .trim()
      .toLowerCase();

    const shippingPrice =
      country === "india"
        ? 0
        : 1500;

    // =====================================================
    // 5. TAX
    // =====================================================

    const taxPrice = 0;

    // =====================================================
    // 6. FINAL SERVER-SIDE TOTAL
    // =====================================================

    const totalPrice = roundMoney(
      Math.max(
        0,
        cart.itemsPrice -
        discountPrice +
        shippingPrice +
        taxPrice
      )
    );

    if (
      !Number.isFinite(totalPrice) ||
      totalPrice <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid order amount",
      });
    }

    // =====================================================
    // 7. CREATE RAZORPAY ORDER
    // =====================================================

    const razorpayOrder =
      await razorpay.orders.create({
        amount:
          Math.round(totalPrice * 100),

        currency: "INR",

        receipt:
          `receipt_${Date.now()}`,
      });

    // =====================================================
    // 8. CREATE CHECKOUT SNAPSHOT
    // =====================================================

    const checkoutSession =
      await CheckoutSession.create({
        user:
          req.user._id,

        razorpayOrderId:
          razorpayOrder.id,

        orderItems:
          cart.items,

        shippingAddress,

        coupon: coupon
          ? {
            couponId:
              coupon._id,

            code:
              coupon.code,

            discountAmount:
              discountPrice,
          }
          : undefined,

        itemsPrice:
          cart.itemsPrice,

        discountPrice:
          discountPrice,

        shippingPrice:
          shippingPrice,

        taxPrice:
          taxPrice,

        totalPrice:
          totalPrice,

        status:
          "payment_pending",

        expiresAt:
          new Date(
            Date.now() +
            15 * 60 * 1000
          ),
      });

    // =====================================================
    // 9. RESPONSE
    // =====================================================

    return res.status(200).json({
      success: true,

      key:
        process.env.RAZORPAY_KEY,

      order:
        razorpayOrder,

      checkoutSessionId:
        checkoutSession._id,

      pricing: {
        itemsPrice:
          cart.itemsPrice,

        discountPrice:
          discountPrice,

        shippingPrice:
          shippingPrice,

        taxPrice:
          taxPrice,

        totalPrice:
          totalPrice,
      },

      coupon: coupon
        ? {
          code: coupon.code,
          offerType: coupon.offerType,
          discountAmount: couponDiscount,
        }
        : null,

      automaticDiscount:
        automaticDiscount > 0
          ? {
            amount: automaticDiscount,
            message:
              "Automatic collection discount applied",
          }
          : null,
    });

  } catch (error) {
    console.error(
      "❌ Razorpay order creation failed:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Payment initialization failed",
    });
  }
});

// @route   POST /api/orders/capture
// @desc    Capture Razorpay payment + create order + send email
// @access  Private
router.post("/capture", protect, async (req, res) => {
  return res.status(410).json({
    success: false,
    message: "This payment endpoint is retired. Use /orders/razorpay/verify.",
  });

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

    /* 🔐 VERIFY SIGNATURE */
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_SECRET)
      .update(`${razorpayOrderId}|${paymentId}`)
      .digest("hex");

    if (expectedSignature !== signature) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid payment signature" });
    }

    /* ✅ VALIDATE STOCK */
    const items = [];
    for (const item of orderItems) {
      const product = await Product.findById(item.product);

      const sizeValue = Number(item.size);
      const sizeObj = product?.sizes.find((s) => s.size === sizeValue);

      if (!sizeObj || sizeObj.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${product.name}`,
        });
      }

      items.push({
        product: product._id,
        name: product.name,
        image: product.coverImage?.url,
        price: item.price,
        quantity: item.quantity,
        size: sizeValue,
        color: item.color,
      });
    }
    const order = await Order.create({
      user: req.user._id,
      orderItems: items,
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
      status: "confirmed",
    });

    /* 🔻 REDUCE STOCK */
    for (const item of items) {
      await Product.updateOne(
        { _id: item.product, "sizes.size": item.size },
        { $inc: { "sizes.$.stock": -item.quantity } }
      );
    }

    /* 🧹 CLEAR CART */
    await Cart.findOneAndUpdate(
      { user: req.user._id },
      { $set: { items: [], totalItems: 0, totalPrice: 0 } }
    );

    /* 🚀 RESPOND IMMEDIATELY (CRITICAL) */
    res.json({ success: true, order });

    await queueInvoiceEmail(order._id);

  } catch (err) {
    console.error("❌ Capture failed:", err);
    res.status(500).json({ success: false });
  }
});


// @route   POST /api/orders/razorpay/verify
// @desc    Verify Razorpay Payment Signature
// @access  Private
// @route   POST /api/orders/razorpay/verify
// @desc    Verify Razorpay payment and create order
// @access  Private
router.post("/razorpay/verify", protect, async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    // =====================================================
    // 1. BASIC VALIDATION
    // =====================================================

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing Razorpay payment details",
      });
    }

    // =====================================================
    // 2. VERIFY RAZORPAY SIGNATURE
    // =====================================================

    const generatedSignature = crypto
      .createHmac(
        "sha256",
        process.env.RAZORPAY_SECRET
      )
      .update(
        `${razorpay_order_id}|${razorpay_payment_id}`
      )
      .digest("hex");

    if (
      generatedSignature !==
      razorpay_signature
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    // =====================================================
    // 3. FETCH RAZORPAY ORDER + PAYMENT
    // =====================================================

    const razorpayOrder =
      await razorpay.orders.fetch(
        razorpay_order_id
      );

    const razorpayPayment =
      await razorpay.payments.fetch(
        razorpay_payment_id
      );

    // Payment must belong to this Razorpay order
    if (
      razorpayPayment.order_id !==
      razorpay_order_id
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Payment does not belong to this order",
      });
    }

    // Payment must actually be captured
    if (
      razorpayPayment.status !==
      "captured"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Payment has not been captured",
      });
    }

    // =====================================================
    // 4. DUPLICATE PAYMENT PROTECTION
    // =====================================================

    const existingOrder =
      await Order.findOne({
        "paymentResult.id":
          razorpay_payment_id,
      });

    if (existingOrder) {
      return res.status(200).json({
        success: true,
        order: existingOrder,
        payment: {
          id: razorpay_payment_id,
          status: "paid",
        },
      });
    }

    // =====================================================
    // 5. GET CHECKOUT SNAPSHOT
    // =====================================================

    const checkoutSession =
      await CheckoutSession.findOne({
        user: req.user._id,

        razorpayOrderId:
          razorpay_order_id,

        status:
          "payment_pending",
      });

    if (!checkoutSession) {
      return res.status(400).json({
        success: false,
        message:
          "Checkout session not found or already completed",
      });
    }

    // =====================================================
    // 6. CHECK CHECKOUT SESSION EXPIRY
    // =====================================================

    if (
      checkoutSession.expiresAt &&
      new Date(
        checkoutSession.expiresAt
      ) <= new Date()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Checkout session has expired",
      });
    }

    // =====================================================
    // 7. VERIFY RAZORPAY AMOUNT AGAINST
    //    SERVER-SIDE CHECKOUT SNAPSHOT
    // =====================================================

    const expectedAmount =
      Math.round(
        Number(
          checkoutSession.totalPrice
        ) * 100
      );

    if (
      Number(razorpayOrder.amount) !==
      expectedAmount
    ) {
      console.error(
        "❌ Razorpay amount mismatch",
        {
          razorpayOrderId:
            razorpay_order_id,

          razorpayAmount:
            razorpayOrder.amount,

          expectedAmount,
        }
      );

      return res.status(400).json({
        success: false,
        message:
          "Payment amount does not match checkout",
      });
    }

    // Currency must match
    if (
      razorpayOrder.currency !==
      "INR"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid payment currency",
      });
    }

    // =====================================================
    // 8. START TRANSACTION
    // =====================================================

    session.startTransaction();

    // =====================================================
    // 9. RELOAD CHECKOUT SESSION INSIDE
    //    TRANSACTION
    // =====================================================

    const lockedCheckoutSession =
      await CheckoutSession.findOne({
        _id:
          checkoutSession._id,

        user:
          req.user._id,

        razorpayOrderId:
          razorpay_order_id,

        status:
          "payment_pending",
      }).session(session);

    if (!lockedCheckoutSession) {
      throw new Error(
        "Checkout session is no longer available"
      );
    }

    // =====================================================
    // 10. CREATE ORDER FROM CHECKOUT SNAPSHOT
    // =====================================================

    const [order] =
      await Order.create(
        [
          {
            user:
              req.user._id,

            orderItems:
              lockedCheckoutSession.orderItems,

            shippingAddress:
              lockedCheckoutSession.shippingAddress,

            paymentMethod:
              "razorpay",

            paymentResult: {
              id:
                razorpay_payment_id,

              status:
                "paid",

              updateTime:
                Date.now(),

              emailAddress:
                req.user.email,
            },

            itemsPrice:
              lockedCheckoutSession.itemsPrice,

            discountPrice:
              lockedCheckoutSession.discountPrice,

            couponCode:
              lockedCheckoutSession
                .coupon?.code || null,

            taxPrice:
              lockedCheckoutSession.taxPrice,

            shippingPrice:
              lockedCheckoutSession.shippingPrice,

            totalPrice:
              lockedCheckoutSession.totalPrice,

            isPaid:
              true,

            paidAt:
              Date.now(),

            status:
              "confirmed",
          },
        ],
        { session }
      );

    // =====================================================
    // 11. ATOMIC STOCK REDUCTION
    // =====================================================

    for (
      const item of
      lockedCheckoutSession.orderItems
    ) {
      const result =
        await Product.updateOne(
          {
            _id:
              item.product,

            sizes: {
              $elemMatch: {
                size:
                  item.size,

                stock: {
                  $gte:
                    item.quantity,
                },
              },
            },
          },

          {
            $inc: {
              "sizes.$[size].stock":
                -item.quantity,
            },
          },

          {
            arrayFilters: [
              {
                "size.size":
                  item.size,

                "size.stock": {
                  $gte:
                    item.quantity,
                },
              },
            ],

            session,
          }
        );

      if (
        result.modifiedCount !== 1
      ) {
        throw new Error(
          `Insufficient stock for ${item.name} (size ${item.size})`
        );
      }
    }

    // =====================================================
    // 12. COUPON REDEMPTION
    // =====================================================

    const couponId =
      lockedCheckoutSession
        .coupon?.couponId;

    const savedCouponCode =
      lockedCheckoutSession
        .coupon?.code;

    const discountPrice =
      Number(
        lockedCheckoutSession
          .discountPrice || 0
      );

    if (couponId) {
      const CouponRedemption =
        require(
          "../Models/CouponRedemption"
        );

      // -----------------------------------------------
      // Check per-user usage again inside transaction
      // -----------------------------------------------

      const previousUses =
        await CouponRedemption.countDocuments({
          coupon:
            couponId,

          user:
            req.user._id,
        }).session(session);

      // Get current coupon
      const coupon =
        await Coupon.findOne({
          _id:
            couponId,

          active:
            true,
        }).session(session);

      if (!coupon) {
        throw new Error(
          "Coupon is no longer available"
        );
      }

      if (
        previousUses >=
        Number(
          coupon.perUserLimit || 1
        )
      ) {
        throw new Error(
          "You have already used this coupon"
        );
      }

      // -----------------------------------------------
      // Atomically increment global usage
      // -----------------------------------------------

      const couponUpdate =
        await Coupon.updateOne(
          {
            _id:
              couponId,

            active:
              true,

            $or: [
              {
                usageLimit:
                  null,
              },

              {
                $expr: {
                  $lt: [
                    "$usedCount",
                    "$usageLimit",
                  ],
                },
              },
            ],
          },

          {
            $inc: {
              usedCount:
                1,
            },
          },

          {
            session,
          }
        );

      if (
        couponUpdate.modifiedCount !==
        1
      ) {
        throw new Error(
          "Coupon usage limit was reached"
        );
      }

      // -----------------------------------------------
      // Create redemption
      // -----------------------------------------------

      await CouponRedemption.create(
        [
          {
            coupon:
              couponId,

            user:
              req.user._id,

            order:
              order._id,

            code:
              savedCouponCode,

            discountAmount:
              discountPrice,
          },
        ],
        {
          session,
        }
      );
    }

    // =====================================================
    // 13. CLEAR CART
    // =====================================================

    await Cart.findOneAndUpdate(
      {
        user:
          req.user._id,
      },

      {
        $set: {
          items: [],
          totalItems: 0,
          totalPrice: 0,
        },
      },

      {
        session,
      }
    );

    // =====================================================
    // 14. MARK CHECKOUT SESSION COMPLETED
    // =====================================================

    lockedCheckoutSession.status =
      "completed";

    lockedCheckoutSession.paymentId =
      razorpay_payment_id;

    await lockedCheckoutSession.save({
      session,
    });

    // =====================================================
    // 15. COMMIT EVERYTHING
    // =====================================================

    await session.commitTransaction();
    session.endSession();

    // =====================================================
    // 16. RESPOND
    // =====================================================

    res.status(200).json({
      success: true,

      order,

      payment: {
        id:
          razorpay_payment_id,

        status:
          "paid",
      },

      pricing: {
        itemsPrice:
          order.itemsPrice,

        discountPrice:
          order.discountPrice,

        shippingPrice:
          order.shippingPrice,

        taxPrice:
          order.taxPrice,

        totalPrice:
          order.totalPrice,
      },
    });

    await queueInvoiceEmail(order._id);

  } catch (error) {
    // Only abort if transaction is still active
    if (
      session.inTransaction()
    ) {
      await session.abortTransaction();
    }

    session.endSession();

    console.error(
      "❌ Razorpay verification failed:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Payment verification failed",
    });
  }
});


// @route   POST /api/orders
// @desc    Create COD order + send confirmation email (Vercel safe)
// @access  Private
router.post("/", protect, async (req, res) => {
  try {
    const {
      orderItems,
      shippingAddress,
      paymentMethod,
      itemsPrice,
      taxPrice,
      shippingPrice,
      totalPrice,
    } = req.body;

    if (paymentMethod !== "cod") {
      return res.status(400).json({ success: false });
    }

    const items = [];

    /* ✅ VALIDATE STOCK */
    for (const item of orderItems) {
      const product = await Product.findById(item.product);

      const sizeValue = Number(item.size);
      const sizeObj = product?.sizes.find((s) => s.size === sizeValue);

      if (!sizeObj || sizeObj.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${product.name} (size ${sizeValue})`,
        });
      }

      items.push({
        product: product._id,
        name: product.name,
        image: product.coverImage?.url,
        price: item.price,
        quantity: item.quantity,
        size: sizeValue,
        color: item.color,
      });
    }

    /* ✅ CREATE ORDER (FAST) */
    const order = await Order.create({
      user: req.user._id,
      orderItems: items,
      shippingAddress,
      paymentMethod: "cod",
      itemsPrice,
      taxPrice,
      shippingPrice,
      totalPrice,
      status: "confirmed",
      isPaid: false,
    });

    /* 🔻 REDUCE STOCK */
    for (const item of items) {
      await Product.updateOne(
        { _id: item.product, "sizes.size": item.size },
        { $inc: { "sizes.$.stock": -item.quantity } }
      );
    }

    /* 🧹 CLEAR CART (FAST) */
    await Cart.findOneAndUpdate(
      { user: req.user._id },
      { $set: { items: [], totalItems: 0, totalPrice: 0 } }
    );

    /* 🚀 RESPOND IMMEDIATELY (CRITICAL) */
    res.status(201).json({ success: true, order });

    await queueInvoiceEmail(order._id);

  } catch (err) {
    console.error("❌ COD order failed:", err);
    res.status(500).json({ success: false });
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

router.get('/:id/invoice', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('user', 'name email firstName lastName');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const isOwner = order.user._id.toString() === req.user._id.toString();
    const isStaff = ['admin', 'manager', 'support'].includes(req.user.role);

    if (!isOwner && !isStaff) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }

    const pdfBuffer = await generateInvoicePDF(order, order.user);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Invoice-${order.orderNumber}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('Invoice download failed:', error);
    return res.status(500).json({ success: false, message: 'Invoice unavailable' });
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
  return res.status(410).json({
    success: false,
    message: 'Manual payment updates are disabled. Use Razorpay verification.',
  });

  try {
    const order = await Order.findById(req.params.id);

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }

    order.isPaid = true;
    order.paidAt = Date.now();
    order.status = 'confirmed';

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

/* =====================================================
   CANCEL ORDER + RESTORE STOCK + SEND EMAIL
===================================================== */
router.put("/:id/cancel", protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // 🔒 Authorization
    if (
      order.user.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(401).json({
        success: false,
        message: "Not authorized",
      });
    }

    // 🚫 Cannot cancel shipped/delivered
    if (["shipped", "delivered"].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: "Order cannot be cancelled at this stage",
      });
    }

    // 🛑 Already cancelled
    if (order.status === "cancelled") {
      return res.json({ success: true, order });
    }

    /* 🔁 RESTORE STOCK (SIZE-WISE) */
    for (const item of order.orderItems) {
      await Product.updateOne(
        { _id: item.product, "sizes.size": item.size },
        { $inc: { "sizes.$.stock": item.quantity } }
      );
    }

    order.status = "cancelled";
    await order.save();

    /* 📧 SEND CANCELLATION EMAIL (NON-BLOCKING) */
    try {
      const transporter = getMailer();

      const templatePath = path.join(
        __dirname,
        "../templates/orderCancelledTemplate.ejs"
      );

      const htmlRaw = await ejs.renderFile(templatePath, {
        order,
        user: req.user,
        moment,
      });

      const html = juice(htmlRaw);

      await transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: req.user.email,
        subject: `Order Cancelled – #${order.orderNumber}`,
        html,
      });

      console.log("✅ Order cancellation email sent:", req.user.email);
    } catch (err) {
      console.error("❌ Cancellation email failed:", err.message);
    }

    res.json({
      success: true,
      message: "Order cancelled successfully",
      order,
    });
  } catch (error) {
    console.error("❌ Cancel order failed:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cancel order",
    });
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
  body('status').isIn(['confirmed', 'shipped', 'delivered'])
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
