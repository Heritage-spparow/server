const mongoose = require("mongoose");

const AboutPageSchema = new mongoose.Schema(
  {
    hero: {
      brandName: String,
      tagline: String,
      logo: String,
    },

    story: {
      title: String,
      subtitle: String,
      paragraphs: [String],
      vision: String,
      image: String,
    },

    values: [
      {
        title: String,
        description: String,
      },
    ],

    artisans: [
      {
        name: String,
        craft: String,
        experience: String,
        image: String,
      },
    ],

    cta: {
      title: String,
      description: String,
      buttonText: String,
      categorySlug: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AboutPage", AboutPageSchema);
