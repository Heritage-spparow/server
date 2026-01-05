const mongoose = require("mongoose");

const sizeSchema = new mongoose.Schema({
  size: { type: Number, required: true },
  stock: { type: Number, required: true, min: 0 },
});

const imageSchema = new mongoose.Schema({
  url: { type: String, required: true },
  publicId: { type: String, required: true },
});

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    description: { type: String },
    shortDescription: { type: String },

    category: { type: String, required: true },
    collection: { type: String },

    price: { type: Number, required: true, min: 0 },
    comparePrice: { type: Number },

    sizes: {
      type: [sizeSchema],
      required: true,
      validate: [(v) => v.length > 0, "At least one size is required"],
    },

    /** ✅ MAIN COVER IMAGE */
    coverImage: {
      type: imageSchema,
      required: true,
    },

    /** ✅ OTHER PRODUCT IMAGES */
    galleryImages: {
      type: [imageSchema],
      default: [],
    },

    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", productSchema);
