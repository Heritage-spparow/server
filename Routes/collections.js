const express = require("express");
const router = express.Router();
const Product = require("../Models/Product");
const Collection = require("../Models/Collection");
const upload = require("../middleware/upload");

const { protect, authorize } = require("../middleware/auth");

router.get("/", async (req, res) => {
  try {
    const collections = await Collection.find({})
      .sort({ name: 1 })
      .lean();
    res.status(200).json({
      success: true,
      collections,
    });  
  } catch (err) {
    console.error("Collections fetch error:", err);

    res.status(500).json({
      success: false,
      message: "Failed to fetch collections",
    });
  }
});
router.post(
  "/sync",
  protect,
  authorize("admin"),
  async (req, res) => {
    try {
      const productCollections = await Product.distinct("collection");

      let created = 0;

      for (const collectionName of productCollections) {
        if (!collectionName) continue;

        await Collection.updateOne(
          {
            name: collectionName.trim(),
          },
          {
            $setOnInsert: {
              name: collectionName.trim(),
            },
          },
          {
            upsert: true,
          }
        );

        const exists = await Collection.findOne({
          name: collectionName.trim(),
        });

        if (exists) created++;
      }

      const collections = await Collection.find().sort({
        name: 1,
      });

      res.json({
        success: true,
        collections,
      });
    } catch (err) {
      console.error(err);

      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }
);
router.put(
  "/:name/cover",
  protect,
  authorize("admin"),
  upload.single("coverImage"),
  async (req, res) => {
    try {
      const { name } = req.params;

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Cover image is required",
        });
      }

      // Find existing collection (case-insensitive)
      const collection = await Collection.findOne({
        name: {
          $regex: new RegExp(`^${name}$`, "i"),
        },
      });

      if (!collection) {
        return res.status(404).json({
          success: false,
          message:
            "Collection not found. Please run collection sync first.",
        });
      }

      collection.coverImage = {
        public_id: req.file.filename,
        url: req.file.path,
      };

      await collection.save();

      return res.status(200).json({
        success: true,
        message: "Collection cover image updated successfully",
        collection,
      });
    } catch (err) {
      console.error("Collection cover upload error:", err);

      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }
);

router.get("/cover/:name", async (req, res) => {
  try {
    const collection = await Collection.findOne({
      name: req.params.name,
    });

    if (!collection) {
      return res.status(404).json({
        success: false,
        message: "Collection not found",
      });
    }

    res.json({
      success: true,
      coverImage: collection.coverImage,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

module.exports = router;