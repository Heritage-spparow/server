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
  let signatureBuffer = null;

  try {
    const imgRes = await axios.get(
      "https://res.cloudinary.com/drcy8edfo/image/upload/v1767876770/Screenshot_2026-01-08_at_6.22.29_PM_y6b9dy.png",
      { responseType: "arraybuffer" }
    );
    signatureBuffer = Buffer.from(imgRes.data);
  } catch {
    console.warn("⚠️ Signature image not loaded");
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
      doc.fontSize(10).text("Tax Invoice", 400, 40, { align: "right" });

      /* ================= SELLER ================= */
      let y = 90;
      doc.fontSize(9).font("Helvetica-Bold").text("Sold By:", 40, y);
      y += 14;
      doc.font("Helvetica").text("Heritage Sparrow", 40, y);
      y += 14;
      doc.text("Village Gurusar Jodha", 40, y);
      y += 14;
      doc.text("Sri Muktsar Sahib, Punjab - 152115", 40, y);
      y += 14;
      doc.text("GSTIN: 03OQCPS0310B1ZF", 40, y);

      /* ================= BILLING ================= */
      let ry = 90;
      doc.font("Helvetica-Bold").text("Billing Address:", 330, ry);
      ry += 14;
      doc.font("Helvetica").text(user.name, 330, ry);
      ry += 14;
      doc.text(order.shippingAddress.address, 330, ry, { width: 230 });
      ry += 28;
      doc.text(
        `${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.postalCode}`,
        330,
        ry
      );
      ry += 14;
      doc.text(order.shippingAddress.country, 330, ry);

      /* ================= ORDER META ================= */
      ry += 20;
      doc.text(`Order No: ${order.orderNumber}`, 330, ry);
      ry += 14;
      doc.text(`Order Date: ${moment(order.createdAt).format("DD/MM/YYYY")}`, 330, ry);

      /* ================= TABLE HEADER ================= */
      let tableY = 360;

      const col = {
        sl: 40,
        desc: 65,
        qty: 300,
        unit: 330,
        cgst: 380,
        sgst: 430,
        igst: 480,
        total: 530,
      };

      doc.font("Helvetica-Bold").fontSize(8);
      doc.text("Sl", col.sl, tableY);
      doc.text("Description", col.desc, tableY);
      doc.text("Qty", col.qty, tableY, { width: 30, align: "center" });
      doc.text("SUBTOTAL", col.unit, tableY, { width: 45, align: "right" });
      doc.text("CGST(9%)", col.cgst, tableY, { width: 45, align: "right" });
      doc.text("SGST(9%)", col.sgst, tableY, { width: 45, align: "right" });
      doc.text("IGST(18%)", col.igst, tableY, { width: 45, align: "right" });
      doc.text("Total", col.total, tableY, { width: 55, align: "right" });

      doc.moveTo(40, tableY + 12).lineTo(560, tableY + 12).stroke();

      /* ================= ROWS ================= */
      let rowY = tableY + 20;
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
        doc.text(`${item.name}`, col.desc, rowY, { width: 220 });
        doc.text(item.quantity, col.qty, rowY, { width: 30, align: "center" });
        doc.text(`₹${net.toFixed(2)}`, col.unit, rowY, { width: 45, align: "right" });
        doc.text(`₹${cgst.toFixed(2)}`, col.cgst, rowY, { width: 45, align: "right" });
        doc.text(`₹${sgst.toFixed(2)}`, col.sgst, rowY, { width: 45, align: "right" });
        doc.text(`₹${igst.toFixed(2)}`, col.igst, rowY, { width: 45, align: "right" });
        doc.text(`₹${rowTotal.toFixed(2)}`, col.total, rowY, { width: 55, align: "right" });

        rowY += 36;
      });


      /* ================= AMOUNT IN WORDS ================= */
      rowY += 24;
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

      doc.text("Authorized Signatory", 420, rowY + 20);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};
