const express = require("express");
const router = express.Router();
const LandingPage = require("../Models/LandingPage");
const upload = require("../middleware/upload");
const getRedis = require("../utils/redis");

/* ================= PUBLIC ================= */
router.get("/", async (req, res) => {
  try {
    const redis = getRedis();
    const cacheKey = "landing:active";

    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.json({
          landing: JSON.parse(cached),
          cached: true,
        });
      }
    }

    const landing = await LandingPage.findOne({ active: true })
      .populate("sectionTwo.items.productId", "name")
      .lean();

    if (redis && landing) {
      await redis.setex(cacheKey, 300, JSON.stringify(landing));
    }

    res.json({ landing, cached: false });
  } catch (err) {
    console.error("❌ Landing fetch error:", err);
    res.status(500).json({ success: false });
  }
});

/* ================= ADMIN ================= */
router.post(
  "/",
  upload.fields([
    { name: "sectionOneImage", maxCount: 1 },
    { name: "sectionThreeImage", maxCount: 1 },
    { name: "carouselImages", maxCount: 10 },
  ]),
  async (req, res) => {
    try {
      const {
        sectionOneCategory,
        sectionOneCta,
        sectionTwoCta,
        sectionThreeLink,
        sectionThreeCta,
        carouselItems,
      } = req.body;

      const parsedItems = JSON.parse(carouselItems || "[]");
      const carouselFiles = req.files.carouselImages || [];

      /* ================= CAROUSEL IMAGE MIGRATION ================= */
      const items = await Promise.all(
        parsedItems.map(async (item, index) => {
          // New image uploaded
          if (carouselFiles[index]) {
            return {
              productId: item.productId,
              label: item.label,
              image: {
                url: carouselFiles[index].path,
                publicId: carouselFiles[index].filename,
              },
            };
          }

          // Auto migrate old cloudinary image
          if (item.image?.url) {
            if (!item.image.url.includes(process.env.CLOUDINARY_CLOUD_NAME)) {
              const uploaded = await uploadFromUrl(item.image.url);
              return {
                ...item,
                image: {
                  url: uploaded.secure_url,
                  publicId: uploaded.public_id,
                },
              };
            }
          }

          return item;
        })
      );

      /* ================= SECTION ONE IMAGE ================= */
      let sectionOneImage;
      if (req.files.sectionOneImage?.length) {
        sectionOneImage = {
          url: req.files.sectionOneImage[0].path,
          publicId: req.files.sectionOneImage[0].filename,
        };
      }

      /* ================= SECTION THREE IMAGE ================= */
      let sectionThreeImage;
      if (req.files.sectionThreeImage?.length) {
        sectionThreeImage = {
          url: req.files.sectionThreeImage[0].path,
          publicId: req.files.sectionThreeImage[0].filename,
        };
      }

      /* ================= PAYLOAD ================= */
      const payload = {
        sectionOne: {
          category: sectionOneCategory,
          ctaLabel: sectionOneCta,
          image: sectionOneImage,
        },
        sectionTwo: {
          ctaLabel: sectionTwoCta,
          items,
        },
        sectionThree: {
          link: sectionThreeLink,
          ctaLabel: sectionThreeCta,
          image: sectionThreeImage,
        },
      };

      const existing = await LandingPage.findOne();

      const landing = existing
        ? await LandingPage.findByIdAndUpdate(existing._id, payload, {
            new: true,
          })
        : await LandingPage.create(payload);

      /* 🔥 CACHE INVALIDATION */
      const redis = getRedis();
      if (redis) await redis.del("landing:active");

      res.json({
        success: true,
        message: "Landing page updated & images migrated successfully",
        landing,
      });
    } catch (err) {
      console.error("❌ Landing update error:", err);
      res.status(500).json({ message: err.message });
    }
  }
);

module.exports = router;
