const mongoose = require("mongoose");

const imageSchema = new mongoose.Schema({
  url: String,
  publicId: String,
});

const carouselItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  label: String,
  image: imageSchema,
});

const landingPageSchema = new mongoose.Schema(
  {
    sectionOne: {
      category: { type: String, required: true },
      ctaLabel: { type: String, default: "Explore Collection" },
      image: imageSchema,
    },

    sectionTwo: {
      ctaLabel: { type: String, default: "Shop Now" },
      items: [carouselItemSchema],
    },

    sectionThree: {
      link: { type: String, default: "/campaign" },
      ctaLabel: { type: String, default: "Explore Campaign" },
      image: imageSchema,
    },

    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("LandingPage", landingPageSchema);
