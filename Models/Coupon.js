const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema(
  {
    // Admin-visible name
    name: {
      type: String,
      required: true,
      trim: true,
    },

    // Customer-entered coupon
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },

    // Type of promotion
    offerType: {
      type: String,
      enum: [
        "percentage",
        "fixed",
        "buy_x_get_y_free",
        "buy_x_get_y_discount",
      ],
      required: true,
      index: true,
    },

    // Percentage / fixed discount
    discountValue: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Buy X
    buyQuantity: {
      type: Number,
      default: null,
      min: 1,
    },

    // Get Y
    getQuantity: {
      type: Number,
      default: null,
      min: 1,
    },

    
    getDiscountPercentage: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },

    applicableProducts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        index: true,
      },
    ],

    // If true, applies to every product
    appliesToAllProducts: {
      type: Boolean,
      default: false,
    },

    minOrderValue: {
      type: Number,
      default: 0,
      min: 0,
    },

    maxDiscount: {
      type: Number,
      default: null,
      min: 0,
    },

    startsAt: {
      type: Date,
      default: null,
    },

    expiresAt: {
      type: Date,
      default: null,
    },

    usageLimit: {
      type: Number,
      default: null,
      min: 1,
    },

    usedCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    perUserLimit: {
      type: Number,
      default: 1,
      min: 1,
    },

    active: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);


// Validate offer configuration
couponSchema.pre("validate", function (next) {
  if (
    this.offerType === "percentage" &&
    (this.discountValue <= 0 ||
      this.discountValue > 100)
  ) {
    return next(
      new Error(
        "Percentage discount must be between 0 and 100"
      )
    );
  }

  if (
    this.offerType === "fixed" &&
    this.discountValue <= 0
  ) {
    return next(
      new Error(
        "Fixed discount must be greater than 0"
      )
    );
  }

  if (
    this.offerType === "buy_x_get_y_free" ||
    this.offerType === "buy_x_get_y_discount"
  ) {
    if (
      !Number.isInteger(this.buyQuantity) ||
      this.buyQuantity < 1
    ) {
      return next(
        new Error("Buy quantity must be at least 1")
      );
    }

    if (
      !Number.isInteger(this.getQuantity) ||
      this.getQuantity < 1
    ) {
      return next(
        new Error("Get quantity must be at least 1")
      );
    }
  }

  if (
    this.offerType === "buy_x_get_y_discount"
  ) {
    if (
      this.getDiscountPercentage === null ||
      this.getDiscountPercentage < 0 ||
      this.getDiscountPercentage > 100
    ) {
      return next(
        new Error(
          "Get discount must be between 0 and 100"
        )
      );
    }
  }

  if (
    this.expiresAt &&
    this.startsAt &&
    this.expiresAt <= this.startsAt
  ) {
    return next(
      new Error(
        "Expiry date must be after start date"
      )
    );
  }

  if (
    !this.appliesToAllProducts &&
    (!this.applicableProducts ||
      this.applicableProducts.length === 0)
  ) {
    return next(
      new Error(
        "Select at least one applicable product"
      )
    );
  }

  next();
});


/*
 * Very important index:
 *
 * Makes active coupon lookup fast.
 */
couponSchema.index({
  code: 1,
  active: 1,
});

couponSchema.index({
  applicableProducts: 1,
  active: 1,
});

module.exports = mongoose.model(
  "Coupon",
  couponSchema
);