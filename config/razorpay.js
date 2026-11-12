const Razorpay = require("razorpay");

// RAZORPAY_MODE=test  → uses RAZORPAY_TEST_KEY / RAZORPAY_TEST_SECRET
// RAZORPAY_MODE=live  → uses RAZORPAY_KEY / RAZORPAY_SECRET
// Defaults to test so a missing setting never charges real money.
const mode = (process.env.RAZORPAY_MODE || "test").toLowerCase() === "live" ? "live" : "test";

const keyId = mode === "live" ? process.env.RAZORPAY_KEY : process.env.RAZORPAY_TEST_KEY;
const keySecret = mode === "live" ? process.env.RAZORPAY_SECRET : process.env.RAZORPAY_TEST_SECRET;

const isConfigured = Boolean(keyId && keySecret);

if (!isConfigured) {
  console.error(`❌ Razorpay (${mode} mode) keys are missing. Payments will be rejected until they are set.`);
} else if (mode === "test" && !keyId.startsWith("rzp_test_")) {
  console.error("❌ RAZORPAY_MODE=test but RAZORPAY_TEST_KEY is not an rzp_test_ key.");
} else {
  console.log(`💳 Razorpay running in ${mode.toUpperCase()} mode`);
}

const razorpay = isConfigured
  ? new Razorpay({ key_id: keyId, key_secret: keySecret })
  : null;

// For testing payments: RAZORPAY_TEST_AMOUNT=1 charges ₹1 for every order
// (the order itself still stores the real total). Ignored when NODE_ENV=production.
const testAmount = Number(process.env.RAZORPAY_TEST_AMOUNT);
const useTestAmount =
  process.env.NODE_ENV !== "production" && Number.isFinite(testAmount) && testAmount > 0;

if (useTestAmount) {
  console.warn(`⚠️  RAZORPAY_TEST_AMOUNT active: every payment will charge ₹${testAmount}`);
}

// Amount (in paise) to charge on Razorpay for an order total in rupees
const chargeAmountPaise = (totalPrice) =>
  Math.round((useTestAmount ? testAmount : Number(totalPrice)) * 100);

module.exports = { razorpay, mode, keyId, keySecret, isConfigured, chargeAmountPaise };
