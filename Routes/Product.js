const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Product = require('../Models/Product');

// router.post("/", upload.array("images", 6), async (req, res) => {
//   try {
//     const { name, category, collection, sizes, price, description, shortDescription, comparePrice } = req.body;

//     const parsedSizes = typeof sizes === 'string' ? JSON.parse(sizes) : sizes;
//     console.log("BODY:", req.body);
//     console.log("FILES:", req.files);
//     const product = new Product({
//       name,
//       category,
//       collection,
//       price: parseFloat(price),
//       description,
//       shortDescription,
//       comparePrice: comparePrice ? parseFloat(comparePrice) : undefined,
//       sizes: parsedSizes,
//       images: req.files.map((file) => ({
//         url: file.path,
//         publicId: file.filename,
//       })),
//     });

//     await product.save();
//     res.status(201).json({ message: "Product created", product });
//   } catch (err) {
//     console.log("BODY:", req.body);
//     console.log("FILES:", req.files);
//     console.error(err);
//     res.status(500).json({ error: err.message });
//   }
// });


router.put(
  "/:id",
  upload.array("images", 6),
  async (req, res) => {
    try {
      const { id } = req.params;

      let {
        name,
        category,
        collection,
        sizes,
        price,
        description,
        shortDescription,
        comparePrice,
        active,
        existingImages
      } = req.body;

      // Parse sizes safely
      const parsedSizes =
        typeof sizes === "string" ? JSON.parse(sizes) : sizes;

      // Parse existing images
      const parsedExistingImages =
        typeof existingImages === "string"
          ? JSON.parse(existingImages)
          : existingImages || [];

      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }

      // Merge old + new images
      const newImages = req.files.map(file => ({
        url: file.path,
        publicId: file.filename,
      }));

      product.name = name;
      product.category = category;
      product.collection = collection;
      product.price = Number(price);
      product.description = description;
      product.shortDescription = shortDescription;
      product.comparePrice = comparePrice ? Number(comparePrice) : undefined;
      product.sizes = parsedSizes;
      product.active = active === "true" || active === true;
      product.images = [...parsedExistingImages, ...newImages];

      await product.save();

      res.status(200).json({
        success: true,
        message: "Product updated successfully",
        product,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Search Products
router.get('/search', async (req, res) => {
  try {
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

    if (category) {
      query.where('category').equals(category);
    }

    if (priceRange) {
      const [min, max] = priceRange.split('-').map(Number);
      query.where('price').gte(min).lte(max);
    }

    if (ratings) {
      query.where('averageRating').gte(ratings);
    }

    if (sortBy) {
      const sortCriteria = sortBy.split(',').join(' ');
      query.sort(sortCriteria);
    }

    const products = await query.exec();
    res.status(200).json({ products });
  } catch (error) {
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

module.exports = router;
