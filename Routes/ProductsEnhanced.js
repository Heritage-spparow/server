const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const Product = require('../Models/Product');
const { protect, authorize } = require('../middleware/auth');

// @desc    Get categories
// @route   GET /api/products-enhanced/categories
// @access  Public
router.get('/categories', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      throw new Error('Database not connected');
    }
    if (!Product || typeof Product.distinct !== 'function') {
      throw new Error('Product model is not properly defined');
    }
    const categories = await Product.distinct('category', { active: true });
    res.status(200).json({
      success: true,
      categories: categories || []
    });
  } catch (error) {
    console.error('Error in /categories:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @desc    Get top rated products
// @route   GET /api/products-enhanced/top/rated
// @access  Public
router.get('/top/rated', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const products = await Product.find({ active: true })
      .sort({ averageRating: -1, numReviews: -1 })
      .limit(limit)
      .lean();
    res.status(200).json({
      success: true,
      products
    });
  } catch (error) {
    console.error('Error in /top/rated:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @desc    Get featured products
// @route   GET /api/products-enhanced/featured
// @access  Public
router.get('/featured', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const products = await Product.find({ featured: true, active: true })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.status(200).json({
      success: true,
      products
    });
  } catch (error) {
    console.error('Error in /featured:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});
 
// @desc    Get all products with filtering, sorting, and pagination
// @route   GET /api/products-enhanced
// @access  Public
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    // Build query
    let query = Product.find({ active: true }).lean();

    // Filtering
    if (req.query.category) {
      query = query.where('category').equals(req.query.category);
    }

    if (req.query.subcategory) {
      query = query.where('subcategory').equals(req.query.subcategory);
    }

    if (req.query.brand) {
      query = query.where('brand').equals(req.query.brand);
    }

    if (req.query.minPrice || req.query.maxPrice) {
      query = query.where('price');
      if (req.query.minPrice) query = query.gte(req.query.minPrice);
      if (req.query.maxPrice) query = query.lte(req.query.maxPrice);
    }

    if (req.query.rating) {
      query = query.where('averageRating').gte(req.query.rating);
    }

    if (req.query.featured) {
      query = query.where('featured').equals(req.query.featured === 'true');
    }

    if (req.query.inStock) {
      query = query.where('stock').gt(0);
    }

    // Search
    if (req.query.search) {
      // Use text index instead of regex for better performance
      query = query.find({ $text: { $search: req.query.search } });
    }

    // Sorting
    let sortBy = '-createdAt';
    if (req.query.sortBy) {
      const sortOptions = {
        'price-asc': 'price',
        'price-desc': '-price',
        'rating': '-averageRating',
        'name': 'name',
        'newest': '-createdAt',
        'oldest': 'createdAt'
      };
      sortBy = sortOptions[req.query.sortBy] || sortBy;
    }

    query = query.sort(sortBy);

    // Execute query with pagination
    const products = await query.skip(skip).limit(limit).populate('reviews.user', 'name');
    const total = await Product.countDocuments(query.getQuery());

    res.status(200).json({
      success: true,
      products,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Error in /products:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @desc    Get single product
// @route   GET /api/products-enhanced/:id
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    // Validate ObjectId
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID'
      });
    }
    const product = await Product.findById(req.params.id).populate('reviews.user', 'name').lean();
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    res.status(200).json({
      success: true,
      product
    });
  } catch (error) {
    console.error('Error in /products/:id:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @desc    Create new product
// @route   POST /api/products-enhanced
// @access  Private/Admin
router.post('/', protect, authorize('admin'), [
  body('name').notEmpty().withMessage('Product name is required'),
  body('description').notEmpty().withMessage('Product description is required'),
  body('price').isNumeric().withMessage('Price must be a number'),
  body('category').notEmpty().withMessage('Category is required'),
  body('stock').isInt({ min: 0 }).withMessage('Stock must be a non-negative integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    const product = await Product.create(req.body);
    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      product
    });
  } catch (error) {
    console.error('Error in POST /products:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Product with this SKU already exists'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @desc    Update product
// @route   PUT /api/products-enhanced/:id
// @access  Private/Admin
router.put('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    // Validate ObjectId
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID'
      });
    }
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    );
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      product
    });
  } catch (error) {
    console.error('Error in PUT /products/:id:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @desc    Delete product
// @route   DELETE /api/products-enhanced/:id
// @access  Private/Admin
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    // Validate ObjectId
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID'
      });
    }
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    // Soft delete by setting active to false
    product.active = false;
    await product.save();
    res.status(200).json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Error in DELETE /products/:id:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @desc    Add product review
// @route   POST /api/products-enhanced/:id/reviews
// @access  Private
router.post('/:id/reviews', protect, [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('comment').notEmpty().withMessage('Comment is required')
], async (req, res) => {
  try {
    // Validate ObjectId
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID'
      });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    const { rating, comment } = req.body;
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    // Check if user already reviewed this product
    const alreadyReviewed = product.reviews.find(
      review => review.user.toString() === req.user._id.toString()
    );
    if (alreadyReviewed) {
      return res.status(400).json({
        success: false,
        message: 'Product already reviewed'
      });
    }
    const review = {
      user: req.user._id,
      name: req.user.name,
      rating: Number(rating),
      comment
    };
    product.reviews.push(review);
    product.calculateAverageRating();
    await product.save();
    res.status(201).json({
      success: true,
      message: 'Review added successfully'
    });
  } catch (error) {
    console.error('Error in POST /products/:id/reviews:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

module.exports = router;