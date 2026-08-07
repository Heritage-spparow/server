const mongoose = require("mongoose");

const collectionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    coverImage: {
      public_id: String,
      url: String,
    },
  },
  {
    timestamps: true,
  } 
);

module.exports = mongoose.model("Collection", collectionSchema);