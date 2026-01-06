const nodemailer = require("nodemailer");

let transporter;

function getMailer() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: "smtp.titan.email",
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  }
  return transporter;
}

module.exports = getMailer;
