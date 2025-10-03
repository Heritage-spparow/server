const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Product = require('../Models/Product'); 

router.post('/add', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ error: 'Database connection not established' });
    }
    if (!req.body.name || !req.body.category || !req.body.price || !req.body.stock) {
      return res.status(400).json({ error: 'Name, category, price, and stock are required' });
    }

    const product = new Product(req.body);
    await product.save(); 
    res.status(201).json({ message: 'Product created successfully', product });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Duplicate key detected' });
    }
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Search Products
router.get('/search', async (req, res) => {
  try {
    const { keyword, category, priceRange, ratings, sortBy } = req.query;
    const query = Product.find();

    if (keyword) {
      query.or([
        { name: { $regex: keyword, $options: 'i' } },
        { description: { $regex: keyword, $options: 'i' } },
        { tags: { $in: [keyword] } }
      ]);
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
