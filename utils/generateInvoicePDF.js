const PDFDocument = require("pdfkit");
const moment = require("moment");
const axios = require("axios");

/* ================= AMOUNT IN WORDS ================= */
function amountInWords(num) {
  const a = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const inWords = (n) => {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "");
    if (n < 1000)
      return a[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + inWords(n % 100) : "");
    if (n < 100000)
      return inWords(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + inWords(n % 1000) : "");
    if (n < 10000000)
      return inWords(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + inWords(n % 100000) : "");
    return inWords(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + inWords(n % 10000000) : "");
  };

  return inWords(Math.floor(num)).trim() + " only";
}

/* ================= GST SPLIT ================= */
function splitGST(inclusiveAmount, isPunjab) {
  const net = inclusiveAmount / 1.18;

  if (isPunjab) {
    return {
      net,
      cgst: net * 0.09,
      sgst: net * 0.09,
      igst: 0,
    };
  }

  return {
    net,
    cgst: 0,
    sgst: 0,
    igst: net * 0.18,
  };
}

/* ================= MAIN PDF ================= */
module.exports = async function generateInvoicePDF(order, user) {
  /* ===== LOAD SIGNATURE IMAGE (BUFFER) ===== */
  let signatureBuffer = null;
  try {
    const imgRes = await axios.get(
      "https://res.cloudinary.com/drcy8edfo/image/upload/v1767876770/Screenshot_2026-01-08_at_6.22.29_PM_y6b9dy.png",
      { responseType: "arraybuffer" }
    );
    signatureBuffer = Buffer.from(imgRes.data);
  } catch (err) {
    console.warn("⚠️ Signature image failed, continuing without it");
  }
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      const buffers = [];

      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => resolve(Buffer.concat(buffers)));


      const isIndia = order.shippingAddress.country?.toLowerCase() === "india";
      const isPunjab = isIndia && order.shippingAddress.state?.toLowerCase() === "punjab";

      /* ================= HEADER ================= */
      doc.font("Helvetica-Bold").fontSize(18).text("HERITAGE SPARROW", 40, 40);
      doc.fontSize(10).font("Helvetica-Bold")
        .text("Tax Invoice / Bill of Supply / Cash Memo", 350, 40, { align: "right" });
      doc.fontSize(9).font("Helvetica")
        .text("(Original for Recipient)", 350, 55, { align: "right" });

      /* ================= SELLER ================= */
      let y = 90;
      const leftX = 40;
      const rightX = 330;

      doc.font("Helvetica-Bold").fontSize(9).text("Sold By:", leftX, y);
      y += 14;
      doc.font("Helvetica").text("Heritage Sparrow", leftX, y);
      y += 14;
      doc.text("Village Gurusar Jodha", leftX, y);
      y += 14;
      doc.text("Tehsil Malout, District Sri Muktsar Sahib", leftX, y);
      y += 14;
      doc.text("Punjab - 152115, India", leftX, y);
      y += 14;
      doc.text("GSTIN: 03OQCPS0310B1ZF", leftX, y);

      /* ================= BILLING ================= */
      let ry = 90;
      doc.font("Helvetica-Bold").text("Billing Address:", rightX, ry);
      ry += 14;
      doc.font("Helvetica").text(user.name, rightX, ry);
      ry += 14;
      doc.text(order.shippingAddress.address, rightX, ry, { width: 230 });
      ry += 14;
      doc.text(
        `${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.postalCode}`,
        rightX,
        ry
      );
      ry += 14;
      doc.text(order.shippingAddress.country, rightX, ry);
      ry += 14;
      doc.text(`State/UT Code: ${isPunjab ? "03" : "Other"}`, rightX, ry);

      /* ================= SHIPPING ================= */
      ry += 24;
      doc.font("Helvetica-Bold").text("Shipping Address:", rightX, ry);
      ry += 14;
      doc.font("Helvetica").text(user.name, rightX, ry);
      ry += 14;
      doc.text(order.shippingAddress.address, rightX, ry, { width: 230 });
      ry += 14;
      doc.text(
        `${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.postalCode}`,
        rightX,
        ry
      );
      ry += 14;
      doc.text(order.shippingAddress.country, rightX, ry); 
      ry += 14;
      doc.text(`Place of Supply: ${order.shippingAddress.state}`, rightX, ry);
      ry += 14;
      doc.text(`Place of Delivery: ${order.shippingAddress.state}`, rightX, ry);

      /* ================= ORDER META ================= */
      ry += 24;
      doc.text(`Order No: ${order.orderNumber}`, rightX, ry);
      ry += 14;
      doc.text(`Order Date: ${moment(order.createdAt).format("DD/MM/YYYY")}`, rightX, ry);
      ry += 14;
      doc.text(`Invoice No: INV-${order.orderNumber}`, rightX, ry);
      ry += 14;
      doc.text(`Invoice Date: ${moment(order.createdAt).format("DD/MM/YYYY")}`, rightX, ry);

      /* ================= TABLE ================= */
      let tableY = 430;

      const col = {
        sl: 40,
        desc: 65,
        unit: 270,
        qty: 320,
        net: 360,
        cgst: 410,
        sgst: 455,
        igst: 500,
        total: 540,
      };

      doc.font("Helvetica-Bold").fontSize(8);
      doc.text("Sl", col.sl, tableY);
      doc.text("Description", col.desc, tableY);
      doc.text("Unit", col.unit, tableY);
      doc.text("Qty", col.qty, tableY);
      doc.text("Net", col.net, tableY);
      doc.text("CGST", col.cgst, tableY);
      doc.text("SGST", col.sgst, tableY);
      doc.text("IGST", col.igst, tableY);
      doc.text("Total", col.total, tableY);

      doc.moveTo(40, tableY + 12).lineTo(560, tableY + 12).stroke();

      /* ================= ROWS ================= */
      let rowY = tableY + 18;
      let totalNet = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0;

      doc.font("Helvetica").fontSize(8);

      order.orderItems.forEach((item, i) => {
        const inclusiveTotal = item.price * item.quantity;
        const { net, cgst, sgst, igst } = splitGST(inclusiveTotal, isPunjab);

        const rowTotal = net + cgst + sgst + igst;

        totalNet += net;
        totalCgst += cgst;
        totalSgst += sgst;
        totalIgst += igst;

        doc.text(i + 1, col.sl, rowY);
        doc.text(`${item.name}\nHSN: 6403`, col.desc, rowY, { width: 180 });
        doc.text(`₹${item.price.toFixed(2)}`, col.unit, rowY, { align: "right" });
        doc.text(item.quantity, col.qty, rowY, { align: "center" });
        doc.text(`₹${net.toFixed(2)}`, col.net, rowY, { align: "right" });
        doc.text(`₹${cgst.toFixed(2)}`, col.cgst, rowY, { align: "right" });
        doc.text(`₹${sgst.toFixed(2)}`, col.sgst, rowY, { align: "right" });
        doc.text(`₹${igst.toFixed(2)}`, col.igst, rowY, { align: "right" });
        doc.text(`₹${rowTotal.toFixed(2)}`, col.total, rowY, { align: "right" });

        rowY += 34;
      });

      /* ================= TOTALS ================= */
      rowY += 10;
      doc.moveTo(340, rowY).lineTo(560, rowY).stroke();
      rowY += 10;

      doc.font("Helvetica-Bold");
      doc.text("Net Amount:", 340, rowY);
      doc.text(`₹${totalNet.toFixed(2)}`, col.total, rowY, { align: "right" });
      rowY += 14;

      doc.text("Shipping:", 340, rowY);
      doc.text(`₹${order.shippingPrice.toFixed(2)}`, col.total, rowY, { align: "right" });
      rowY += 14;

      doc.font("Helvetica");
      doc.text("CGST (9%):", 340, rowY);
      doc.text(`₹${totalCgst.toFixed(2)}`, col.total, rowY, { align: "right" });
      rowY += 14;

      doc.text("SGST (9%):", 340, rowY);
      doc.text(`₹${totalSgst.toFixed(2)}`, col.total, rowY, { align: "right" });
      rowY += 14;

      doc.text("IGST (18%):", 340, rowY);
      doc.text(`₹${totalIgst.toFixed(2)}`, col.total, rowY, { align: "right" });
      rowY += 14;

      doc.moveTo(340, rowY).lineTo(560, rowY).stroke();
      rowY += 10;

      doc.font("Helvetica-Bold");
      doc.text("TOTAL AMOUNT:", 340, rowY);
      doc.text(`₹${order.totalPrice.toFixed(2)}`, col.total, rowY, { align: "right" });

      /* ================= AMOUNT IN WORDS ================= */
      rowY += 30;
      doc.font("Helvetica-Bold").text("Amount in Words:", 40, rowY);
      rowY += 14;
      doc.font("Helvetica").text(amountInWords(order.totalPrice), 40, rowY);

      /* ================= SIGNATURE ================= */
      rowY += 40;
      doc.text("For Heritage Sparrow", 420, rowY);
      rowY += 10;

      if (signatureBuffer) {
        doc.image(signatureBuffer, 420, rowY, { width: 100 });
        rowY += 40;
      }

      rowY += 40;
      doc.text("Authorized Signatory", 420, rowY);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};
