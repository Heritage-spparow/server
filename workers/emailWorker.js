require('dotenv').config();
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const ejs = require('ejs');
const path = require('path');
const juice = require('juice');
const { emailQueue } = require('../queues/emailQueue');
const Order = require('../Models/Order');
const User = require('../Models/User');

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

  throw new Error('Email transport is not configured. Set EMAIL_HOST/EMAIL_USER/EMAIL_PASSWORD or EMAIL_FROM/EMAIL_PASSWORD');
}

const transporter = createTransport();

async function renderInvoice(order, user) {
  try {
    const templatePath = path.join(__dirname, '../invoice.ejs');
    const orderDate = new Date(order.createdAt);
    const formattedDate = orderDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const formattedTime = orderDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    let html = await ejs.renderFile(templatePath, { order, user, formattedDate, formattedTime });
    html = juice(html);
    return html;
  } catch (err) {
    // If template missing, fall back to a simple HTML
    const items = order.orderItems.map(i => `${i.name} (${i.quantity} x ${Number(i.price).toFixed(2)})`).join('<br/>');
    return `
      <div>
        <h2>Order #${order.orderNumber}</h2>
        <p>Hello ${user.fullName || user.firstName}, thanks for your purchase.</p>
        <p>Date: ${new Date(order.createdAt).toLocaleString()}</p>
        <h3>Items</h3>
        <p>${items}</p>
        <p>Subtotal: ${order.itemsPrice.toFixed(2)}<br/>
           Tax: ${order.taxPrice.toFixed(2)}<br/>
           Shipping: ${order.shippingPrice.toFixed(2)}<br/>
           <strong>Total: ${order.totalPrice.toFixed(2)}</strong></p>
      </div>
    `;
  }
}

emailQueue.process('order_invoice', async (job) => {
  const { orderId } = job.data;

  const order = await Order.findById(orderId).populate('orderItems.product');
  if (!order) throw new Error(`Order not found: ${orderId}`);

  const user = await User.findById(order.user);
  if (!user) throw new Error(`User not found for order: ${orderId}`);

  const html = await renderInvoice(order, user);
  const textItems = order.orderItems.map(item => `${item.name} - ${item.quantity} x ${Number(item.price).toFixed(2)}`).join('\n');

  const message = {
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: user.email,
    subject: `Invoice for Order #${order.orderNumber} - Heritage Sparrow`,
    html,
    text: `Hello ${user.fullName || user.firstName},\n\nThank you for your purchase!\n\nOrder #${order.orderNumber}\nItems:\n${textItems}\n\nTotal: ${order.totalPrice.toFixed(2)}`,
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
  } catch (e) {
    // ignore
  } finally {
    process.exit(0);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
