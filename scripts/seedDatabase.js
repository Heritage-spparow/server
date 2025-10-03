const mongoose = require('mongoose');
const Product = require('../Models/Product'); // Adjust path as needed
const dotenv = require('dotenv');

dotenv.config();

// Connect to MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/?directConnection=true&serverSelectionTimeoutMS=2000&appName=mongosh+2.5.8', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// Sample data arrays for generating random products
const colors = ['White', 'Beige', 'Light Blue', 'Green', 'Black', 'Navy', 'Red', 'Grey', 'Yellow', 'Pink'];
const sizes = ['S', 'M', 'L', 'XL', 'XXL'];
const categories = ['Men', 'Women', 'Kids'];
const subcategories = ['Kurta', 'Shirt', 'T-Shirt', 'Dress', 'Pants', 'Jeans', 'Jacket', 'Sweater'];
const brands = ['FabIndia', 'Manyavar', 'Zara', 'H&M', 'Levi’s', 'Nike', 'Adidas', 'Puma'];
const materials = ['Cotton', 'Silk', 'Linen', 'Polyester', 'Denim', 'Wool'];
const tags = ['casual', 'formal', 'ethnic', 'western', 'summer', 'winter', 'sports', 'party'];

// Helper function to generate random number
const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Helper function to get random array items
const getRandomItems = (arr, count) => {
  const shuffled = arr.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

// Generate a single dummy product
const generateProduct = (index) => {
  const category = getRandomItems(categories, 1)[0];
  const subcategory = getRandomItems(subcategories, 1)[0];
  const material = getRandomItems(materials, 1)[0];
  const brand = getRandomItems(brands, 1)[0];
  const productColors = getRandomItems(colors, getRandomInt(2, 5));
  const productSizes = getRandomItems(sizes, getRandomInt(2, 4));
  const price = getRandomInt(500, 5000);
  const discountPrice = Math.random() > 0.3 ? getRandomInt(price * 0.6, price * 0.9) : null;

  return {
    name: `${brand} ${material} ${subcategory} ${index + 1}`,
    description: `A comfortable and stylish ${material.toLowerCase()} ${subcategory.toLowerCase()} for ${category.toLowerCase()}. Perfect for casual and ${getRandomItems(tags, 1)[0]} wear.`,
    price,
    discountPrice,
    category,
    subcategory,
    brand,
    images: [{
      url: `../assets/images${getRandomInt(1, 10)}.jpeg`,
      alt: `${brand} ${subcategory} Image`
    }],
    stock: getRandomInt(10, 100),
    colors: productColors.map(color => ({ name: color, code: `#${Math.floor(Math.random()*16777215).toString(16)}` })),
    sizes: productSizes.map(size => ({ name: size, stock: getRandomInt(5, 50) })),
    tags: getRandomItems(tags, getRandomInt(2, 4)).concat([subcategory.toLowerCase(), material.toLowerCase()]),
    specifications: {
      material,
      fit: getRandomItems(['Slim', 'Regular', 'Loose'], 1)[0],
      occasion: getRandomItems(['Casual', 'Formal', 'Party'], 1)[0]
    },
    reviews: [],
    averageRating: 0,
    numReviews: 0,
    featured: Math.random() > 0.8,
    active: true,
    sku: `SKU-${index + 1}-${brand.slice(0, 3).toUpperCase()}`,
    weight: getRandomInt(200, 1000),
    dimensions: {
      length: getRandomInt(50, 100),
      width: getRandomInt(30, 60),
      height: getRandomInt(5, 20)
    },
    shippingInfo: {
      freeShipping: Math.random() > 0.5,
      shippingCost: Math.random() > 0.5 ? getRandomInt(50, 200) : 0,
      estimatedDelivery: `${getRandomInt(3, 7)} days`
    },
    seo: {
      metaTitle: `${brand} ${subcategory} for ${category}`,
      metaDescription: `Shop ${brand} ${material} ${subcategory} for ${category} online.`,
      keywords: [subcategory.toLowerCase(), material.toLowerCase(), category.toLowerCase(), brand.toLowerCase()]
    }
  };
};

// Generate and insert 100 products
const seedProducts = async () => {
  try {
    // Clear existing products (optional, comment out if not needed)
    await Product.deleteMany({});
    console.log('Existing products cleared');

    const products = Array.from({ length: 100 }, (_, i) => generateProduct(i));
    await Product.insertMany(products);
    console.log('100 dummy products inserted successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding products:', error.message);
    process.exit(1);
  }
};

// Run the seeding function
seedProducts();