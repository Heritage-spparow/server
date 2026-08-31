const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  razorpayOrderId: { type: String, unique: true, sparse: true, index: true },
  orderItems: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    name: String,
    image: String,
    price: Number,
    quantity: Number,
    size: Number,
    color: String,
  }],
  shippingAddress: mongoose.Schema.Types.Mixed,
  coupon: {
    couponId: mongoose.Schema.Types.ObjectId,
    code: String,
    discountAmount: Number,
  },
  itemsPrice: { type: Number, required: true },
  discountPrice: { type: Number, default: 0 },
  shippingPrice: { type: Number, default: 0 },
  taxPrice: { type: Number, default: 0 },
  totalPrice: { type: Number, required: true },
  status: { type: String, enum: ["created", "payment_pending", "paid", "completed", "failed", "expired"], default: "created", index: true },
  paymentId: { type: String, unique: true, sparse: true, index: true },
  expiresAt: {
  type: Date,
  required: true,
  index: true,
},
}, { timestamps: true });

schema.index({ user: 1, createdAt: -1 });

schema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);
module.exports = mongoose.model("CheckoutSession", schema);
