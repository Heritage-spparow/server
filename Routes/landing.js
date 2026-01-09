const express = require("express");
const router = express.Router();
const LandingPage = require("../Models/LandingPage");
const upload = require("../middleware/upload");

/* ================= PUBLIC ================= */
router.get("/", async (req, res) => {
  const landing = await LandingPage.findOne({ active: true })
    .populate("sectionTwo.items.productId", "name");
  res.json({ landing });
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

      const payload = {
        sectionOne: {
          category: sectionOneCategory,
          ctaLabel: sectionOneCta,
          image: req.files.sectionOneImage
            ? {
                url: req.files.sectionOneImage[0].path,
                publicId: req.files.sectionOneImage[0].filename,
              }
            : undefined,
        },
        sectionTwo: {
          ctaLabel: sectionTwoCta,
          items,
        },
        sectionThree: {
          link: sectionThreeLink,
          ctaLabel: sectionThreeCta,
          image: req.files.sectionThreeImage
            ? {
                url: req.files.sectionThreeImage[0].path,
                publicId: req.files.sectionThreeImage[0].filename,
              }
            : undefined,
        },
      };

      const existing = await LandingPage.findOne();
      const landing = existing
        ? await LandingPage.findByIdAndUpdate(existing._id, payload, {
            new: true,
          })
        : await LandingPage.create(payload);

      res.json({ success: true, landing });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

module.exports = router;
