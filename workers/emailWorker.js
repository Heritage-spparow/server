require('dotenv').config();
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const ejs = require('ejs');
const path = require('path');
const juice = require('juice');
const { emailQueue } = require('../queues/emailQueue');
const Order = require('../Models/Order');
const User = require('../Models/User');
const Product = require('../Models/Product'); // Ensure Product model is loaded
const { error } = require('console');

// Connect to MongoDB for the worker
(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    // eslint-disable-next-line no-console
    console.log('[worker] Connected to MongoDB');
  } catch (err) {
    console.error('[worker] MongoDB connection error:', err.message);
    process.exit(1);
  }
})();

// Setup Nodemailer transport (host/port preferred over service)
function createTransport() {
  if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT || 587),
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  }

  // Fallback to Gmail service if explicitly configured
  if (process.env.EMAIL_FROM && process.env.EMAIL_PASSWORD) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_FROM,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  }

  // Default to log messages if email configuration is missing
  // eslint-disable-next-line no-console
  console.warn('[worker] WARNING: Email transport not configured. Emails will be logged.');
  return nodemailer.createTransport({
    streamTransport: true,
    newline: 'unix',
    buffer: true
  });
}

const transporter = createTransport();

// Function to render EJS template and inline styles using juice
async function renderInvoice(order, user) {
    // 🚨 FIX: Use the new EJS template path
    const templatePath = path.join(__dirname, 'invoiceTemplate.ejs');
    const html = await ejs.renderFile(templatePath, { order, user, moment: require('moment') });

    // Use juice to inline all styles for email compatibility
    return juice(html);
}

// Process 'order_invoice' job
emailQueue.process('order_invoice', async (job) => {
  const { orderId } = job.data;

  const order = await Order.findById(orderId).populate('orderItems.product');
  if (!order) throw new Error(`Order not found: ${orderId}`);

  const user = await User.findById(order.user);
  if (!user) throw new Error(`User not found for order: ${orderId}`);

  const html = await renderInvoice(order, user);
  const textItems = order.orderItems.map(item => `${item.product?.name || item.name} - ${item.quantity} x ${Number(item.price).toFixed(2)}`).join('\n');

  const message = {
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: user.email,
    subject: `Invoice for Order #${order.orderNumber} - Heritage Sparrow`,
    html,
    text: `Hello ${user.fullName || user.firstName},\n\nThank you for your purchase!\n\nOrder #${order.orderNumber}\nItems:\n${textItems}\n\nTotal: ₹${order.totalPrice.toFixed(2)}`,
  };

  await transporter.sendMail(message);
  // eslint-disable-next-line no-console
  console.log(`[worker] Sent invoice email to ${user.email} for order ${order.orderNumber}`);
});

emailQueue.on('failed', (job, err) => {
  console.error(`[worker] Job ${job.id} failed:`, err.message);
});

// Graceful shutdown for worker
const shutdown = async () => {
  try {
    await emailQueue.close();
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close(false);
    }
    // eslint-disable-next-line no-console
    console.log('[worker] Worker gracefully shut down.');
    process.exit(0);
  } catch (err) {
    console.error('[worker] Error during worker shutdown:', err.message);
    process.exit(1);
  }
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
