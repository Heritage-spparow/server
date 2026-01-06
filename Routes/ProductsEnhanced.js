const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Product = require("../Models/Product");
const getRedis = require("../utils/redis");
const upload = require("../middleware/upload");
const { protect, authorize } = require("../middleware/auth");

/* =====================================================
   GET CATEGORIES
   GET /api/products-enhanced/categories
===================================================== */
router.get("/categories", async (req, res) => {
  try {
    const redis = getRedis();
    const cacheKey = "product_categories";

    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.json({
          success: true,
          categories: JSON.parse(cached),
          cached: true,
        });
      }
    }

    const categories = await Product.distinct("category", { active: true });

    if (redis) {
      await redis.setex(cacheKey, 600, JSON.stringify(categories));
    }

    res.json({ success: true, categories, cached: false });
  } catch (err) {
    console.error("❌ Categories error:", err);
    res.status(500).json({ success: false });
  }
});


/* =====================================================
   GET FEATURED PRODUCTS
   GET /api/products-enhanced/featured
===================================================== */
router.get("/featured", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const products = await Product.find({
      featured: true,
      active: true,
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.status(200).json({
      success: true,
      products,
    });
  } catch (error) {
    console.error("Error in /featured:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

/* =====================================================
   GET ALL PRODUCTS (FILTER + SORT + PAGINATION)
   GET /api/products-enhanced
===================================================== */
/* =====================================================
   GET ALL PRODUCTS (FILTER + SORT + PAGINATION + SEARCH)
   GET /api/products-enhanced
===================================================== */
router.get("/", async (req, res) => {
  try {
    const redis = getRedis();

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 12;
    const skip = (page - 1) * limit;

    const cacheKey = `products:${JSON.stringify(req.query)}`;

    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.json({
          success: true,
          ...JSON.parse(cached),
          cached: true,
        });
      }
    }

    const filter = { active: true };

    if (req.query.category) filter.category = req.query.category;

    if (req.query.search) {
      const q = req.query.search.trim();
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { category: { $regex: q, $options: "i" } },
        { description: { $regex: q, $options: "i" } },
      ];
    }

    const products = await Product.find(filter)
      .skip(skip)
      .limit(limit)
      .sort("-createdAt")
      .lean();

    const total = await Product.countDocuments(filter);

    const response = {
      products,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
      },
    };

    if (redis) {
      await redis.setex(cacheKey, 300, JSON.stringify(response));
    }

    res.json({ success: true, ...response, cached: false });
  } catch (err) {
    console.error("❌ Products fetch error:", err);
    res.status(500).json({ success: false });
  }
});

/* =====================================================
   GET SINGLE PRODUCT
   GET /api/products-enhanced/:id
===================================================== */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false });
    }

    const redis = getRedis();
    const cacheKey = `product:${id}`;

    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.json({
          success: true,
          product: JSON.parse(cached),
          cached: true,
        });
      }
    }

    const product = await Product.findOne({ _id: id, active: true }).lean();
    if (!product) return res.status(404).json({ success: false });

    if (redis) {
      await redis.setex(cacheKey, 300, JSON.stringify(product));
    }

    res.json({ success: true, product, cached: false });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

/* =====================================================
   CREATE PRODUCT (ADMIN)
   POST /api/products-enhanced
===================================================== */
/* =====================================================
   CREATE PRODUCT (ADMIN)
   POST /api/products-enhanced
===================================================== */
router.post(
  "/",
  protect,
  authorize("admin"),
  upload.fields([
    { name: "coverImage", maxCount: 1 },
    { name: "galleryImages", maxCount: 20 },
  ]),
  async (req, res) => {
    try {
      const {
        name,
        category,
        collection,
        sizes,
        price,
        description,
        shortDescription,
        comparePrice,
        active,
      } = req.body;

      const parsedSizes =
        typeof sizes === "string" ? JSON.parse(sizes) : sizes;

      // ✅ Validation
      if (!name || !category || !price || !parsedSizes?.length) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields",
        });
      }

      if (!req.files?.coverImage?.length) {
        return res.status(400).json({
          success: false,
          message: "Cover image is required",
        });
      }

      // ✅ Create product
      const product = await Product.create({
        name,
        category,
        collection,
        price: Number(price),
        description,
        shortDescription,
        comparePrice: comparePrice ? Number(comparePrice) : undefined,
        sizes: parsedSizes,
        coverImage: {
          url: req.files.coverImage[0].path,
          publicId: req.files.coverImage[0].filename,
        },
        galleryImages: req.files.galleryImages
          ? req.files.galleryImages.map((file) => ({
            url: file.path,
            publicId: file.filename,
          }))
          : [],
        active: active !== undefined ? active : true,
      });

      /* 🔥 CACHE INVALIDATION */
      const redis = getRedis();
      if (redis) {
        await redis.del("product_categories");
        await redis.del(`product:${product._id}`);
        await redis.flushall();
      } // optional but safe for small catalog

      res.status(201).json({
        success: true,
        message: "Product created successfully",
        product,
      });
    } catch (error) {
      console.error("❌ Create product error:", error);
      res.status(500).json({
        success: false,
        message: "Server error",
      });
    }
  }
);

/* =====================================================
   SEARCH PRODUCTS
   GET /api/products-enhanced/search
===================================================== */
router.get("/search", async (req, res) => {
  try {
    const { search, category, priceRange, ratings, sortBy } = req.query;

    let query = Product.find({ active: true });

    if (search) {
      const keyword = search.trim();
      query = query.find({
        $or: [
          { name: { $regex: keyword, $options: "i" } },
          { category: { $regex: keyword, $options: "i" } },
          { collection: { $regex: keyword, $options: "i" } },
          { description: { $regex: keyword, $options: "i" } },
        ],
      });
    }

    if (category) {
      query = query.where("category").equals(category);
    }

    if (priceRange) {
      const [min, max] = priceRange.split("-").map(Number);
      query = query.where("price").gte(min).lte(max);
    }

    if (ratings) {
      query = query.where("averageRating").gte(Number(ratings));
    }

    if (sortBy) {
      const sortCriteria = sortBy.split(",").join(" ");
      query = query.sort(sortCriteria);
    }

    const products = await query.lean();
    res.status(200).json({ success: true, products });
  } catch (error) {
    console.error("Error in /search:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});



/* =====================================================
   UPDATE PRODUCT (ADMIN)
   PUT /api/products-enhanced/:id
===================================================== */
router.put(
  "/:id",
  protect,
  authorize("admin"),
  upload.fields([
    { name: "coverImage", maxCount: 1 },
    { name: "galleryImages", maxCount: 20 },
  ]),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid product ID",
        });
      }

      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      const {
        name,
        category,
        collection,
        sizes,
        price,
        description,
        shortDescription,
        comparePrice,
        active,
        existingImages,
      } = req.body;

      // Parse sizes
      const parsedSizes =
        typeof sizes === "string" ? JSON.parse(sizes) : sizes;

      // Parse existing images
      const parsedExistingImages =
        typeof existingImages === "string"
          ? JSON.parse(existingImages)
          : existingImages || [];

      // Merge images
      const newGalleryImages = req.files?.galleryImages
        ? req.files.galleryImages.map((file) => ({
          url: file.path,
          publicId: file.filename,
        }))
        : [];

      if (req.files?.coverImage?.length) {
        product.coverImage = {
          url: req.files.coverImage[0].path,
          publicId: req.files.coverImage[0].filename,
        };
      }

      product.name = name ?? product.name;
      product.category = category ?? product.category;
      product.collection = collection ?? product.collection;
      product.price = price ? Number(price) : product.price;
      product.description = description ?? product.description;
      product.shortDescription =
        shortDescription ?? product.shortDescription;
      product.comparePrice = comparePrice
        ? Number(comparePrice)
        : product.comparePrice;
      product.sizes = parsedSizes ?? product.sizes;
      product.active =
        active !== undefined ? active === "true" || active === true : product.active;

      product.galleryImages = [
        ...parsedExistingImages,
        ...newGalleryImages,
      ];

      await product.save();

      /* 🔥 CACHE INVALIDATION */
      await redis.del("product_categories");
      await redis.del(`product:${product._id}`);
      await redis.flushall(); // clears product list cache safely

      res.status(200).json({
        success: true,
        message: "Product updated successfully",
        product,
      });
    } catch (error) {
      console.error("❌ Update product error:", error);
      res.status(500).json({
        success: false,
        message: "Server error",
      });
    }
  }
);

/* =====================================================
   DELETE PRODUCT (ADMIN)
   DELETE /api/products-enhanced/:id
===================================================== */
router.delete(
  "/:id",
  protect,
  authorize("admin"),
  async (req, res) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid product ID",
        });
      }

      const product = await Product.findById(req.params.id);

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      product.active = false;
      await product.save();

      res.status(200).json({
        success: true,
        message: "Product deleted successfully",
      });
    } catch (error) {
      console.error("Error in DELETE /products/:id:", error);
      res.status(500).json({
        success: false,
        message: "Server error",
      });
    }
  }
);

module.exports = router;
