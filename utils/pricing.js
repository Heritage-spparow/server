const Product = require("../Models/Product");
const Coupon = require("../Models/Coupon");
const CouponRedemption = require("../Models/CouponRedemption");

/**
 * Money helpers
 */
const roundMoney = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const normalizeCouponCode = (value) =>
  String(value || "").trim().toUpperCase();

/**
 * Build a trusted cart from MongoDB.
 *
 * NEVER trust:
 * - item.price
 * - item.name
 * - item.image
 *
 * from the frontend.
 *
 * Only product ID, quantity, size and color are accepted
 * from the client.
 */
async function buildServerCart(orderItems, session = null) {
  if (
    !Array.isArray(orderItems) ||
    orderItems.length === 0
  ) {
    throw new Error("Your cart is empty");
  }

  const items = [];
  let itemsPrice = 0;

  for (const raw of orderItems) {
    const productId =
      raw?.product?._id || raw?.product;

    const quantity = Number(raw.quantity);
    const size = Number(raw.size);

    if (
      !productId ||
      !Number.isInteger(quantity) ||
      quantity < 1
    ) {
      throw new Error("Invalid cart item");
    }

    if (
      !Number.isInteger(size) ||
      size < 0
    ) {
      throw new Error("Invalid product size");
    }

    const query = Product.findById(productId)
      .select(
        "name price active coverImage sizes"
      );

    if (session) {
      query.session(session);
    }

    const product = await query;

    if (
      !product ||
      !product.active
    ) {
      throw new Error(
        "One of the products is no longer available"
      );
    }

    const sizeObj =
      product.sizes?.find(
        (s) => Number(s.size) === size
      );

    if (!sizeObj) {
      throw new Error(
        `${product.name}: selected size is unavailable`
      );
    }

    if (
      Number(sizeObj.stock) < quantity
    ) {
      throw new Error(
        `Insufficient stock for ${product.name} (size ${size})`
      );
    }

    const price = roundMoney(
      Number(product.price)
    );

    const lineTotal = roundMoney(
      price * quantity
    );

    itemsPrice = roundMoney(
      itemsPrice + lineTotal
    );

    items.push({
      product: product._id,
      name: product.name,
      image: product.coverImage?.url,
      price,
      quantity,
      size,
      color: raw.color,
    });
  }

  return {
    items,
    itemsPrice: roundMoney(itemsPrice),
  };
}

/**
 * Check whether a coupon applies to a product.
 */
function couponAppliesToProduct(
  coupon,
  productId
) {
  if (coupon.appliesToAllProducts) {
    return true;
  }

  return (
    Array.isArray(
      coupon.applicableProducts
    ) &&
    coupon.applicableProducts.some(
      (id) =>
        String(id) === String(productId)
    )
  );
}

/**
 * Calculate the eligible cart items for
 * the coupon.
 */
function getEligibleItems(
  coupon,
  cartItems
) {
  return cartItems.filter((item) =>
    couponAppliesToProduct(
      coupon,
      item.product
    )
  );
}

/**
 * Calculate percentage/fixed discount.
 */
function calculateNormalDiscount(
  coupon,
  eligibleSubtotal
) {
  let discount = 0;

  if (
    coupon.offerType ===
    "percentage"
  ) {
    discount =
      (eligibleSubtotal *
        Number(coupon.discountValue)) /
      100;
  }

  if (
    coupon.offerType ===
    "fixed"
  ) {
    discount =
      Number(coupon.discountValue);
  }

  return discount;
}

/**
 * Calculate Buy X Get Y Free / Discount.
 *
 * Example:
 *
 * Buy 2 Get 1 Free
 *
 * Cart:
 * A = ₹100
 * B = ₹200
 * C = ₹300
 *
 * The cheapest eligible "get" item is free.
 *
 * With quantity 6 and Buy 2 Get 1:
 *
 * groups = floor(6 / 3) = 2
 * 2 cheapest eligible units become free.
 */
function calculateBuyXGetYDiscount(
  coupon,
  eligibleItems
) {
  const buyQuantity =
    Number(coupon.buyQuantity);

  const getQuantity =
    Number(coupon.getQuantity);

  if (
    !Number.isInteger(buyQuantity) ||
    buyQuantity < 1 ||
    !Number.isInteger(getQuantity) ||
    getQuantity < 1
  ) {
    throw new Error(
      "Invalid Buy X Get Y configuration"
    );
  }

  /**
   * Expand quantities into individual units.
   *
   * This makes mixed products work correctly.
   */
  const units = [];

  for (const item of eligibleItems) {
    const price = roundMoney(
      Number(item.price)
    );

    for (
      let i = 0;
      i < item.quantity;
      i++
    ) {
      units.push(price);
    }
  }

  if (units.length < buyQuantity) {
    return 0;
  }

  /**
   * For every X + Y units:
   *
   * Buy 2 Get 1
   * total group size = 3
   */
  const groupSize =
    buyQuantity + getQuantity;

  const groups = Math.floor(
    units.length / groupSize
  );

  const freeOrDiscountedUnits =
    groups * getQuantity;

  if (
    freeOrDiscountedUnits <= 0
  ) {
    return 0;
  }

  /**
   * Cheapest items should be the free/
   * discounted items.
   *
   * This prevents customers from getting
   * the most expensive product free.
   */
  units.sort(
    (a, b) => a - b
  );

  let discount = 0;

  for (
    let i = 0;
    i < freeOrDiscountedUnits;
    i++
  ) {
    const unitPrice = units[i];

    if (
      coupon.offerType ===
      "buy_x_get_y_free"
    ) {
      discount += unitPrice;
    }

    if (
      coupon.offerType ===
      "buy_x_get_y_discount"
    ) {
      const percentage =
        Number(
          coupon.getDiscountPercentage
        );

      discount +=
        (unitPrice * percentage) /
        100;
    }
  }

  return discount;
}

/**
 * Validate coupon and calculate discount.
 *
 * Supports:
 *
 * 1. percentage
 * 2. fixed
 * 3. buy_x_get_y_free
 * 4. buy_x_get_y_discount
 *
 * Also supports:
 *
 * - selected products
 * - all products
 * - minimum order value
 * - maximum discount
 * - start date
 * - expiry date
 * - total usage limit
 * - per-user usage limit
 */
async function validateAndCalculateCoupon({
  code,
  userId,
  itemsPrice,
  cartItems,
  orderItems,
  session = null,
}) {
  const normalized =
    normalizeCouponCode(code);

  /**
   * No coupon supplied.
   */
  if (!normalized) {
    return {
      coupon: null,
      discountPrice: 0,
    };
  }

  /**
   * Find active coupon.
   */
  const couponQuery =
    Coupon.findOne({
      code: normalized,
      active: true,
    });

  if (session) {
    couponQuery.session(session);
  }

  const coupon =
    await couponQuery;

  if (!coupon) {
    throw new Error(
      "Invalid or inactive coupon code"
    );
  }

  const now = new Date();

  /**
   * Date validation
   */
  if (
    coupon.startsAt &&
    coupon.startsAt > now
  ) {
    throw new Error(
      "This coupon is not active yet"
    );
  }

  if (
    coupon.expiresAt &&
    coupon.expiresAt <= now
  ) {
    throw new Error(
      "This coupon has expired"
    );
  }

  /**
   * Total usage limit
   */
  if (
    coupon.usageLimit != null &&
    Number(coupon.usedCount) >=
      Number(coupon.usageLimit)
  ) {
    throw new Error(
      "This coupon has reached its usage limit"
    );
  }

  /**
   * Minimum order value is checked
   * against the complete cart.
   */
  if (
    Number(itemsPrice) <
    Number(coupon.minOrderValue || 0)
  ) {
    throw new Error(
      `Minimum order value for this coupon is ₹${coupon.minOrderValue}`
    );
  }

  /**
   * Check how many times this user
   * has already redeemed the coupon.
   */
  if (userId) {
    const redemptionQuery =
      CouponRedemption.countDocuments({
        coupon: coupon._id,
        user: userId,
      });

    if (session) {
      redemptionQuery.session(session);
    }

    const previousUses =
      await redemptionQuery;

    if (
      previousUses >=
      Number(coupon.perUserLimit || 1)
    ) {
      throw new Error(
        "You have already used this coupon"
      );
    }
  }

  /**
   * Normalize cart items.
   *
   * buildServerCart() returns `items`.
   *
   * For compatibility, allow callers to
   * provide either cartItems or orderItems.
   */
  const trustedItems =
    Array.isArray(cartItems)
      ? cartItems
      : Array.isArray(orderItems)
      ? orderItems
      : [];

  /**
   * Find products eligible for this coupon.
   */
  const eligibleItems =
    getEligibleItems(
      coupon,
      trustedItems
    );

  /**
   * If coupon targets specific products
   * but none are in the cart, no discount
   * should be given.
   */
  if (
    eligibleItems.length === 0
  ) {
    throw new Error(
      "This coupon does not apply to the products in your cart"
    );
  }

  /**
   * Calculate subtotal only for products
   * to which the coupon applies.
   */
  const eligibleSubtotal =
    roundMoney(
      eligibleItems.reduce(
        (sum, item) =>
          sum +
          Number(item.price) *
            Number(item.quantity),
        0
      )
    );

  let discount = 0;

  /**
   * Normal discounts
   */
  if (
    coupon.offerType ===
      "percentage" ||
    coupon.offerType ===
      "fixed"
  ) {
    discount =
      calculateNormalDiscount(
        coupon,
        eligibleSubtotal
      );
  }

  /**
   * Buy X Get Y
   */
  else if (
    coupon.offerType ===
      "buy_x_get_y_free" ||
    coupon.offerType ===
      "buy_x_get_y_discount"
  ) {
    discount =
      calculateBuyXGetYDiscount(
        coupon,
        eligibleItems
      );
  }

  else {
    throw new Error(
      "Unsupported coupon type"
    );
  }

  /**
   * Maximum discount cap.
   */
  if (
    coupon.maxDiscount != null
  ) {
    discount = Math.min(
      discount,
      Number(coupon.maxDiscount)
    );
  }

  /**
   * Never discount more than the
   * eligible products' value.
   */
  discount = Math.min(
    discount,
    eligibleSubtotal
  );

  discount = roundMoney(
    Math.max(0, discount)
  );

  return {
    coupon,
    discountPrice: discount,
  };
}

/**
 * Backward-compatible aliases.
 *
 * Your current Order.js route imports
 * calculateCart / calculateCoupon.
 *
 * These aliases prevent the route from
 * breaking while allowing the clearer
 * function names above.
 */
const calculateCart =
  buildServerCart;

const calculateCoupon = async ({
  code,
  userId,
  itemsPrice,
  orderItems,
  cartItems,
  session = null,
}) => {
  return validateAndCalculateCoupon({
    code,
    userId,
    itemsPrice,
    cartItems: cartItems || orderItems,
    session,
  });
};

module.exports = {
  roundMoney,
  normalizeCouponCode,

  buildServerCart,
  validateAndCalculateCoupon,

  // Compatibility with Order routes
  calculateCart,
  calculateCoupon,
};