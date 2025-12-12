const mongoose = require('mongoose');
const Product = require('../Models/Product'); // Adjust path as needed
const dotenv = require('dotenv');

dotenv.config();

// Connect to MongoDB
mongoose.connect('mongodb+srv://anandayush865:QLEf1j4nVpM3j3q8@cluster0.jupq9u8.mongodb.net/database?retryWrites=true&w=majority&appName=Cluster0', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// Arrays specific to jooti (ladies shoes)
const styles = ['Classic', 'Modern', 'Retro', 'Ethnic', 'Party', 'Casual', 'Formal'];
const colors = ['Red', 'Black', 'Beige', 'Gold', 'Silver', 'Pink', 'White', 'Blue', 'Green'];
const sizes = ['5', '6', '7', '8', '9', '10']; // Standard women's shoe sizes
const materials = ['Leather', 'Suede', 'Canvas', 'Synthetic', 'Velvet', 'Fabric'];
const brands = ['FabIndia', 'Bata', 'Metro', 'Mochi', 'Clarks', 'Steve Madden', 'Aldo'];
const tags = ['jooti', 'ladies shoes', 'womens footwear', 'ethnic', 'party', 'casual', 'formal'];

// Helper functions
const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const getRandomItems = (arr, count) => {
  const shuffled = arr.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

// Generate a single jooti product
const generateProduct = (index) => {
  const style = getRandomItems(styles, 1)[0];
  const material = getRandomItems(materials, 1)[0];
  const brand = getRandomItems(brands, 1)[0];
  const productColors = getRandomItems(colors, getRandomInt(1, 3));
  const productSizes = getRandomItems(sizes, getRandomInt(2, 4));
  const price = getRandomInt(800, 4000);
  const discountPrice = Math.random() > 0.3 ? getRandomInt(price * 0.6, price * 0.9) : null;

  // Generate 2-4 random images per product
  const imageCount = getRandomInt(2, 4);
  const images = Array.from({ length: imageCount }, (_, i) => ({
    url: `https://source.unsplash.com/400x400/?women,shoes,${style.toLowerCase()}&sig=${index * 10 + i}`,
    alt: `${brand} ${style} Jooti Image ${i + 1}`
  }));

  return {
    name: `${brand} ${style} Jooti ${index + 1}`,
    description: `A stylish ${style.toLowerCase()} ${material.toLowerCase()} jooti for women. Perfect for ${getRandomItems(['casual', 'formal', 'party'], 1)[0]} occasions.`,
    price,
    discountPrice,
    category: 'Women',
    subcategory: 'Jooti',
    brand,
    style,
    images,
    stock: getRandomInt(10, 100),
    colors: productColors.map(color => ({ name: color, code: `#${Math.floor(Math.random()*16777215).toString(16)}` })),
    sizes: productSizes.map(size => ({ name: size, stock: getRandomInt(5, 50) })),
    tags: getRandomItems(tags, getRandomInt(2, 4)).concat([style.toLowerCase(), material.toLowerCase()]),
    specifications: {
      material,
      fit: getRandomItems(['Slim', 'Regular'], 1)[0],
      occasion: getRandomItems(['Casual', 'Formal', 'Party'], 1)[0]
    },
    reviews: [],
    averageRating: 0,
    numReviews: 0,
    featured: Math.random() > 0.7,
    active: true,
    sku: `JOO-${index + 1}-${brand.slice(0, 3).toUpperCase()}`,
    weight: getRandomInt(200, 800),
    dimensions: {
      length: getRandomInt(20, 30),
      width: getRandomInt(8, 12),
      height: getRandomInt(5, 10)
    },
    shippingInfo: {
      freeShipping: Math.random() > 0.5,
      shippingCost: Math.random() > 0.5 ? getRandomInt(50, 200) : 0,
      estimatedDelivery: `${getRandomInt(3, 7)} days`
    },
    seo: {
      metaTitle: `${brand} ${style} Jooti for Women`,
      metaDescription: `Shop ${brand} ${style} ${material} jooti for women online.`,
      keywords: ['jooti', 'ladies shoes', style.toLowerCase(), material.toLowerCase(), brand.toLowerCase()]
    }
  };
};

// Seed 100 jooti products
const seedProducts = async () => {
  try {
    await Product.deleteMany({});
    console.log('Existing products cleared');

    const products = Array.from({ length: 100 }, (_, i) => generateProduct(i));
    await Product.insertMany(products);
    console.log('100 jooti products inserted successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding products:', error.message);
    process.exit(1);
  }
};

seedProducts();
