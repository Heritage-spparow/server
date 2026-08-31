const express = require("express");
const router = express.Router();

const Coupon = require("../Models/Coupon");
const Product = require("../Models/Product");
const {
  protect,
  authorize,
} = require("../middleware/auth");


// =====================================================
// GET PRODUCTS FOR ADMIN COUPON FORM
// GET /api/coupons/products
// =====================================================

router.get(
  "/products",
  protect,
  authorize("admin"),
  async (req, res) => {
    try {
      const products = await Product.find({
        active: true,
      })
        .select("_id name price coverImage")
        .sort({ name: 1 })
        .lean();

      res.json({
        success: true,
        products,
      });
    } catch (error) {
      console.error("Coupon products error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to load products",
      });
    }
  }
);
// =====================================================
// APPLY COUPON
// POST /api/coupons/apply
// Customer-facing coupon validation
// =====================================================

router.post(
  "/apply",
  protect,
  async (req, res) => {
    try {
      const {
        code,
        orderItems,
      } = req.body;

      // -----------------------------------------------
      // 1. BASIC VALIDATION
      // -----------------------------------------------

      if (!code?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Coupon code is required",
        });
      }

      if (
        !Array.isArray(orderItems) ||
        orderItems.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Your cart is empty",
        });
      }

      // -----------------------------------------------
      // 2. BUILD TRUSTED CART
      // -----------------------------------------------

      const {
        calculateCart,
        calculateCoupon,
      } = require("../utils/pricing");

      const cart =
        await calculateCart(orderItems);

      // -----------------------------------------------
      // 3. VALIDATE + CALCULATE COUPON
      // -----------------------------------------------

      const {
        coupon,
        discountPrice,
      } = await calculateCoupon({
        code,
        userId: req.user._id,
        itemsPrice: cart.itemsPrice,
        cartItems: cart.items,
      });

      // -----------------------------------------------
      // 4. COUPON NOT FOUND / INVALID
      // -----------------------------------------------

      if (!coupon) {
        return res.status(400).json({
          success: false,
          message: "Invalid coupon code",
        });
      }

      // -----------------------------------------------
      // 5. CALCULATE PREVIEW TOTAL
      //
      // This is ONLY for displaying the price
      // on the frontend.
      //
      // /orders/razorpay recalculates everything
      // again before taking payment.
      // -----------------------------------------------

      const country = String(
        req.body.shippingAddress?.country || ""
      )
        .trim()
        .toLowerCase();

      const shippingPrice =
        country === "india"
          ? 0
          : 1500;

      const taxPrice = 0;

      const finalPrice = Math.max(
        0,
        cart.itemsPrice -
          discountPrice +
          shippingPrice +
          taxPrice
      );

      // -----------------------------------------------
      // 6. RESPONSE
      // -----------------------------------------------

      return res.status(200).json({
        success: true,

        message:
          "Coupon applied successfully",

        coupon: {
          id:
            coupon._id,

          code:
            coupon.code,

          name:
            coupon.name,

          offerType:
            coupon.offerType,

          discountAmount:
            discountPrice,

          discountValue:
            coupon.discountValue,

          buyQuantity:
            coupon.buyQuantity,

          getQuantity:
            coupon.getQuantity,

          getDiscountPercentage:
            coupon.getDiscountPercentage,
        },

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
            finalPrice,
        },
      });

    } catch (error) {
      console.error(
        "Apply coupon error:",
        error
      );

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Unable to apply coupon",
      });
    }
  }
);

// =====================================================
// CREATE PROMOTION
// POST /api/coupons
// =====================================================

router.post(
  "/",
  protect,
  authorize("admin"),
  async (req, res) => {
    try {
      const {
        name,
        code,
        offerType,

        discountValue,

        buyQuantity,
        getQuantity,
        getDiscountPercentage,

        applicableProducts,
        appliesToAllProducts,

        minOrderValue,
        maxDiscount,

        startsAt,
        expiresAt,

        usageLimit,
        perUserLimit,

        active,
      } = req.body;


      // -----------------------------
      // BASIC VALIDATION
      // -----------------------------

      if (!name?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Promotion name is required",
        });
      }

      if (!code?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Coupon code is required",
        });
      }

      const normalizedCode =
        code.trim().toUpperCase();


      // -----------------------------
      // CHECK DUPLICATE CODE
      // -----------------------------

      const existingCoupon =
        await Coupon.findOne({
          code: normalizedCode,
        });

      if (existingCoupon) {
        return res.status(400).json({
          success: false,
          message:
            "Coupon code already exists",
        });
      }


      // -----------------------------
      // PRODUCT VALIDATION
      // -----------------------------

      const allProducts =
        Boolean(appliesToAllProducts);

      let selectedProducts =
        Array.isArray(applicableProducts)
          ? applicableProducts
          : [];

      if (!allProducts &&
          selectedProducts.length === 0) {
        return res.status(400).json({
          success: false,
          message:
            "Select at least one product",
        });
      }


      if (selectedProducts.length > 0) {
        const count =
          await Product.countDocuments({
            _id: {
              $in: selectedProducts,
            },
            active: true,
          });

        if (count !== selectedProducts.length) {
          return res.status(400).json({
            success: false,
            message:
              "One or more selected products are invalid",
          });
        }
      }


      // -----------------------------
      // OFFER VALIDATION
      // -----------------------------

      const allowedOfferTypes = [
        "percentage",
        "fixed",
        "buy_x_get_y_free",
        "buy_x_get_y_discount",
      ];

      if (
        !allowedOfferTypes.includes(
          offerType
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid offer type",
        });
      }


      // Percentage
      if (
        offerType === "percentage"
      ) {
        const discount =
          Number(discountValue);

        if (
          !Number.isFinite(discount) ||
          discount <= 0 ||
          discount > 100
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Percentage must be between 1 and 100",
          });
        }
      }


      // Fixed
      if (
        offerType === "fixed"
      ) {
        const discount =
          Number(discountValue);

        if (
          !Number.isFinite(discount) ||
          discount <= 0
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Fixed discount must be greater than 0",
          });
        }
      }


      // Buy X Get Y
      if (
        offerType ===
          "buy_x_get_y_free" ||
        offerType ===
          "buy_x_get_y_discount"
      ) {
        if (
          !Number.isInteger(
            Number(buyQuantity)
          ) ||
          Number(buyQuantity) < 1
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Buy quantity must be at least 1",
          });
        }

        if (
          !Number.isInteger(
            Number(getQuantity)
          ) ||
          Number(getQuantity) < 1
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Get quantity must be at least 1",
          });
        }
      }


      // Buy X Get Y Discount
      if (
        offerType ===
        "buy_x_get_y_discount"
      ) {
        const discount =
          Number(
            getDiscountPercentage
          );

        if (
          !Number.isFinite(discount) ||
          discount < 0 ||
          discount > 100
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Get discount must be between 0 and 100",
          });
        }
      }


      // -----------------------------
      // CREATE PROMOTION
      // -----------------------------

      const coupon =
        await Coupon.create({
          name: name.trim(),

          code: normalizedCode,

          offerType,

          discountValue:
            Number(discountValue || 0),

          buyQuantity:
            offerType ===
                "buy_x_get_y_free" ||
            offerType ===
                "buy_x_get_y_discount"
              ? Number(buyQuantity)
              : null,

          getQuantity:
            offerType ===
                "buy_x_get_y_free" ||
            offerType ===
                "buy_x_get_y_discount"
              ? Number(getQuantity)
              : null,

          getDiscountPercentage:
            offerType ===
            "buy_x_get_y_discount"
              ? Number(
                  getDiscountPercentage
                )
              : null,

          applicableProducts:
            allProducts
              ? []
              : selectedProducts,

          appliesToAllProducts:
            allProducts,

          minOrderValue:
            Number(minOrderValue || 0),

          maxDiscount:
            maxDiscount === "" ||
            maxDiscount == null
              ? null
              : Number(maxDiscount),

          startsAt:
            startsAt || null,

          expiresAt:
            expiresAt || null,

          usageLimit:
            usageLimit === "" ||
            usageLimit == null
              ? null
              : Number(usageLimit),

          perUserLimit:
            Number(perUserLimit || 1),

          active:
            active !== false,
        });


      res.status(201).json({
        success: true,
        message:
          "Promotion created successfully",
        coupon,
      });

    } catch (error) {
      console.error(
        "Create promotion error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          error.message ||
          "Failed to create promotion",
      });
    }
  }
);


module.exports = router;