const express = require("express");
const router = express.Router();

const LandingPage = require("../Models/LandingPage");
const upload = require("../middleware/upload");
const getRedis = require("../utils/redis");

/* =====================================================
   PUBLIC
===================================================== */

router.get("/", async (req, res) => {
  try {
    const redis = getRedis();
    const cacheKey = "landing:active";

    if (redis) {
      const cached = await redis.get(cacheKey);

      if (cached) {
        return res.json({
          success: true,
          landing: JSON.parse(cached),
          cached: true,
        });
      }
    }

    const landing = await LandingPage.findOne({ active: true })
      .populate(
        "sectionTwo.items.productId",
        "name slug category type collection coverImage price"
      )
      .lean();

    if (landing && redis) {
      await redis.setex(cacheKey, 300, JSON.stringify(landing));
    }

    return res.json({
      success: true,
      landing,
      cached: false,
    });
  } catch (err) {
    console.error("Landing fetch error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch landing page.",
    });
  }
});

/* =====================================================
   ADMIN
===================================================== */

router.post(
  "/",
  upload.fields([
    {
      name: "sectionOneCoverImage",
      maxCount: 1,
    },
    {
      name: "sectionThreeImage",
      maxCount: 1,
    },
    {
      name: "carouselImages",
      maxCount: 20,
    },
  ]),
  async (req, res) => {
    try {
      const {
        sectionOneCollection,
        sectionOneCta,

        sectionTwoCta,
        carouselItems,

        sectionThreeLink,
        sectionThreeCta,
      } = req.body;

      const parsedItems = JSON.parse(carouselItems || "[]");

      const carouselFiles = req.files.carouselImages || [];

      const items = parsedItems.map((item, index) => ({
        productId: item.productId,
        label: item.label,

        image: carouselFiles[index]
          ? {
              url: carouselFiles[index].path,
              publicId: carouselFiles[index].filename,
            }
          : item.image,
      }));

      let coverImage;

      if (req.files.sectionOneCoverImage?.length) {
        coverImage = {
          url: req.files.sectionOneCoverImage[0].path,
          publicId: req.files.sectionOneCoverImage[0].filename,
        };
      }

      let campaignImage;

      if (req.files.sectionThreeImage?.length) {
        campaignImage = {
          url: req.files.sectionThreeImage[0].path,
          publicId: req.files.sectionThreeImage[0].filename,
        };
      }

      const existing = await LandingPage.findOne();

      const payload = {
        sectionOne: {
          collection: sectionOneCollection,
          ctaLabel: sectionOneCta,
          ...(coverImage && {
            coverImage,
          }),
        },

        sectionTwo: {
          ctaLabel: sectionTwoCta,
          items,
        },

        sectionThree: {
          link: sectionThreeLink,
          ctaLabel: sectionThreeCta,

          ...(campaignImage && {
            image: campaignImage,
          }),
        },
      };

      const landing = existing
        ? await LandingPage.findByIdAndUpdate(existing._id, payload, {
            new: true,
            runValidators: true,
          })
        : await LandingPage.create(payload);

      const redis = getRedis();

      if (redis) {
        await redis.del("landing:active");
      }

      return res.json({
        success: true,
        message: "Landing page updated successfully.",
        landing,
      });
    } catch (err) {
      console.error("Landing update error:", err);

      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }
);

module.exports = router;