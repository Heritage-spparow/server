/* =====================================================
   ENV
===================================================== */
const { configDotenv } = require("dotenv");
configDotenv();

/* =====================================================
   CORE
===================================================== */
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const cookieParser = require("cookie-parser");

/* =====================================================
   SECURITY
===================================================== */
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const hpp = require("hpp");

/* =====================================================
   RATE LIMIT (MEMORY – SAFE FOR VERCEL)
===================================================== */
const rateLimit = require("express-rate-limit");
const slowDown = require("express-slow-down");

/* =====================================================
   DB
===================================================== */
const db = require("./connection/db");

/* =====================================================
   AUTH / ROUTES
===================================================== */
const passport = require("./config/passport");
const authRoutes = require("./Routes/Auth");
const productRoutes = require("./Routes/ProductsEnhanced");
const cartRoutes = require("./Routes/Cart");
const orderRoutes = require("./Routes/Order");
const adminRoutes = require("./Routes/Admin");
const landingRoutes = require("./Routes/landing");


/* =====================================================
   APP
===================================================== */
const app = express();

/* =====================================================
   BASIC MIDDLEWARE
===================================================== */
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use(cookieParser());
app.use(compression());
app.use(passport.initialize());

/* =====================================================
   TRUST PROXY (REQUIRED ON VERCEL)
===================================================== */
app.set("trust proxy", 1);

/* =====================================================
   ✅ CORS – FINAL FIX
===================================================== */
const allowedOrigins = new Set([
  // Local
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:5174",

  // Production domains
  "https://www.heritagesparrow.com",
  "https://heritagesparrow.com",
  "https://api.heritagesparrow.com",

  // Vercel preview / fallback
  "https://heritage-spparow-client.vercel.app",
  "https://admin-pannel-mu-ten.vercel.app" ,

  process.env.CLIENT_URL,
]);

app.use(
  cors({
    origin(origin, callback) {
      // Allow server-to-server / Postman / curl
      if (!origin) return callback(null, true);

      if (allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      console.warn("❌ CORS blocked:", origin);
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Origin",
      "Content-Type",
      "Accept",
      "Authorization",
      "Cache-Control",
      "X-Requested-With",
    ],
    exposedHeaders: ["Content-Length"],
  })
);

/* IMPORTANT: Preflight support */
app.options("*", cors());

/* =====================================================
   SECURITY MIDDLEWARE
===================================================== */
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(mongoSanitize());
app.use(xss());
app.use(
  hpp({
    whitelist: ["page", "limit", "sort", "category", "price"],
  })
);

/* =====================================================
   RATE LIMIT (NO REDIS)
===================================================== */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});

const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 100,
  delayMs: () => 300,
});

app.use("/api", apiLimiter, speedLimiter);

/* =====================================================
   MONGODB (SERVERLESS-SAFE REUSE)
===================================================== */
let mongoReady = false;

app.use(async (req, res, next) => {
  if (!mongoReady) {
    try {
      await db.connect(process.env.MONGO_URI);
      mongoReady = true;
      console.log("✅ MongoDB connected (Vercel reuse)");
    } catch (err) {
      console.error("❌ MongoDB error:", err);
      return res.status(500).json({ error: "Database unavailable" });
    }
  }
  next();
});

/* =====================================================
   HEALTH CHECK
===================================================== */
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/* =====================================================
   ROUTES
===================================================== */
app.use("/api/auth", authRoutes);
app.use("/api/products-enhanced", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/landing", landingRoutes);

/* =====================================================
   ROOT
===================================================== */
app.get("/", (req, res) => {
  res.json({
    name: "Heritage Sparrow API",
    status: "running",
    environment: process.env.NODE_ENV || "production",
  });
});

/* =====================================================
   404
===================================================== */
app.use((req, res) => {
  res.status(404).json({ error: "Not Found" });
});

/* =====================================================
   ERROR HANDLER
===================================================== */
app.use((err, req, res, next) => {
  console.error("❌ API ERROR:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

/* =====================================================
   EXPORT (NO LISTEN!)
===================================================== */
module.exports = app;
