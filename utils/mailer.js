const nodemailer = require("nodemailer");

let transporter;

function getMailer() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD, // App Password
      },
    });

    console.log(
      "📨 Mailer initialized with Gmail:",
      process.env.EMAIL_USER
    );
  }

  return transporter;
}

module.exports = getMailer;
