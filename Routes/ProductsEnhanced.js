const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Product = require("../Models/Product");
const { protect, authorize } = require("../middleware/auth");
const upload = require("../middleware/upload");

/* =====================================================
   GET CATEGORIES
   GET /api/products-enhanced/categories
===================================================== */
router.get("/categories", async (req, res) => {
  try {
    const categories = await Product.distinct("category", { active: true });
    res.status(200).json({
      success: true,
      categories: categories || [],
    });
  } catch (error) {
    console.error("Error in /categories:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
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
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 12;
    const skip = (page - 1) * limit;

    let query = Product.find({ active: true });

    /* ---------- CATEGORY FILTER ---------- */
    if (req.query.category) {
      query = query.where("category").equals(req.query.category);
    }

    /* ---------- PRICE FILTER ---------- */
    if (req.query.minPrice || req.query.maxPrice) {
      query = query.where("price");
      if (req.query.minPrice) query = query.gte(Number(req.query.minPrice));
      if (req.query.maxPrice) query = query.lte(Number(req.query.maxPrice));
    }

    /* ---------- FEATURED FILTER ---------- */
    if (req.query.featured) {
      query = query.where("featured").equals(req.query.featured === "true");
    }

    /* ---------- 🔥 SAFE SEARCH (NO $text) ---------- */
    if (req.query.search) {
      const keyword = req.query.search.trim();
      query = query.find({
        $or: [
          { name: { $regex: keyword, $options: "i" } },
          { category: { $regex: keyword, $options: "i" } },
          { collection: { $regex: keyword, $options: "i" } },
          { description: { $regex: keyword, $options: "i" } },
        ],
      });
    }

    /* ---------- SORTING ---------- */
    let sortBy = "-createdAt";
    if (req.query.sortBy) {
      const sortOptions = {
        "price-asc": "price",
        "price-desc": "-price",
        name: "name",
        newest: "-createdAt",
        oldest: "createdAt",
      };
      sortBy = sortOptions[req.query.sortBy] || sortBy;
    }

    query = query.sort(sortBy);

    /* ---------- EXECUTE QUERY ---------- */
    const products = await query.skip(skip).limit(limit).lean();
    const total = await Product.countDocuments(query.getQuery());

    res.status(200).json({
      success: true,
      products,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
      },
    });
  } catch (error) {
    console.error("Error in GET /api/products-enhanced:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});


/* =====================================================
   GET SINGLE PRODUCT
   GET /api/products-enhanced/:id
===================================================== */
router.get("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    const product = await Product.findById(req.params.id).lean();

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.status(200).json({
      success: true,
      product,
    });
  } catch (error) {
    console.error("Error in GET /products/:id:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

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
    { name: "galleryImages", maxCount: 20},
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

      // ✅ Validations
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

      // ✅ Build product
      const product = new Product({
        name,
        category,
        collection,
        price: Number(price),
        description,
        shortDescription,
        comparePrice: comparePrice ? Number(comparePrice) : undefined,
        sizes: parsedSizes,

        /** 🔥 MAIN IMAGE */
        coverImage: {
          url: req.files.coverImage[0].path,
          publicId: req.files.coverImage[0].filename,
        },

        /** 🔥 GALLERY IMAGES */
        galleryImages: req.files.galleryImages
          ? req.files.galleryImages.map((file) => ({
              url: file.path,
              publicId: file.filename,
            }))
          : [],

        active: active !== undefined ? active : true,
      });

      await product.save();

      res.status(201).json({
        success: true,
        message: "Product created successfully",
        product,
      });
    } catch (error) {
      console.error("Error in POST /products:", error);
      res.status(500).json({
        success: false,
        message: "Server error",
      });
    }
  }
);

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


router.put(
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

      const product = await Product.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      );

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "Product updated successfully",
        product,
      });
    } catch (error) {
      console.error("Error in PUT /products/:id:", error);
      res.status(500).json({
        success: false,
        message: "Server error",
      });
    }
  }
);

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
