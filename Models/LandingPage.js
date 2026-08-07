const mongoose = require("mongoose");

const imageSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
    },
    publicId: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

const carouselItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    label: {
      type: String,
      trim: true,
    },

    image: imageSchema,
  },
  { _id: true }
);

const landingPageSchema = new mongoose.Schema(
  {
    /* ============================================
       SECTION ONE (Hero Collection)
    ============================================ */

    sectionOne: {
      collection: {
        type: String,
        required: true,
        trim: true,
      },

      ctaLabel: {
        type: String,
        default: "Explore Collection",
      },

      coverImage: imageSchema,
    },

    /* ============================================
       SECTION TWO (Featured Carousel)
    ============================================ */

    sectionTwo: {
      ctaLabel: {
        type: String,
        default: "Shop Now",
      },

      items: {
        type: [carouselItemSchema],
        default: [],
      },
    },

    /* ============================================
       SECTION THREE (Campaign)
    ============================================ */

    sectionThree: {
      link: {
        type: String,
        default: "/campaign",
      },

      ctaLabel: {
        type: String,
        default: "Explore Campaign",
      },

      image: imageSchema,
    },

    /* ============================================
       GENERAL
    ============================================ */

    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("LandingPage", landingPageSchema);