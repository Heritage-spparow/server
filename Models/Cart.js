const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },

  size: {
    type: String
  },
  addedAt: {
    type: Date,
    default: Date.now
  }
});

const cartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  items: [cartItemSchema],
  totalItems: {
    type: Number,
    default: 0
  },
  totalPrice: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  } 
});

// Calculate totals before saving
cartSchema.pre('save', async function (next) {
  const map = new Map();

  for (const item of this.items) {
    const key = `${item.product}_${item.size || 'NOSIZE'}`;

    if (map.has(key)) {
      map.get(key).quantity += item.quantity;
    } else {
      map.set(key, item);
    }
  }

  this.items = Array.from(map.values());

  await this.populate({ path: 'items.product', select: 'price discountPrice stock' });

  this.totalItems = this.items.reduce((t, i) => t + i.quantity, 0);
  this.totalPrice = this.items.reduce((t, i) => {
    const price = i.product.discountPrice || i.product.price || 0;
    return t + price * i.quantity;
  }, 0);

  this.updatedAt = Date.now();
  next();
});

// Method to add item to cart
cartSchema.methods.addItem = function (productId, quantity = 1, size) {
  const existingItem = this.items.find(
    (item) =>
      item.product.toString() === productId.toString() &&
      item.size === size
  );

  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    this.items.push({
      product: productId,
      quantity,
      size,
    });
  }
};

// Method to remove item from cart
cartSchema.methods.removeItem = function(itemId) {
  this.items = this.items.filter(item => item._id.toString() !== itemId.toString());
};

// Method to update item quantity
cartSchema.methods.updateItemQuantity = function(itemId, quantity) {
  const item = this.items.find(item => item._id.toString() === itemId.toString());
  if (item) {
    item.quantity = quantity;
  }
};

// Method to clear cart
cartSchema.methods.clearCart = function() {
  this.items = [];
  this.totalItems = 0;
  this.totalPrice = 0;
};

const Cart = mongoose.model('Cart', cartSchema);

module.exports = Cart;
