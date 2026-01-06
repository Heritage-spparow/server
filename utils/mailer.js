const nodemailer = require("nodemailer");

let transporter;

function getMailer() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: "smtp.titan.email",
      port:465,          // 🔴 IMPORTANT
      secure: true,       // 🔴 IMPORTANT
      auth: {
        user: process.env.EMAIL_USER,      // support@heritagesparrow.com
        pass: process.env.EMAIL_PASSWORD,  // NEW RESET PASSWORD
      },
    });

    console.log(
      "📨 Mailer initialized:",
      process.env.EMAIL_HOST,
      process.env.EMAIL_USER,
      process.env.EMAIL_PASSWORD,
      process.env.EMAIL_FROM

    );
  }

  return transporter;
}

module.exports = getMailer;
