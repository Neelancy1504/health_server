const nodemailer = require("nodemailer");

// Create reusable transporter using your configuration
const transporter = nodemailer.createTransport({
  service: "gmail", // You're using Gmail based on your .env
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Email verification functions
const sendVerificationEmail = async (user, verificationToken) => {
  // Generate the verification URL with the token - Using your deployed verification page
  //const verificationUrl = `https://health-verification.vercel.app/verify-email?token=${verificationToken}`;
  const verificationUrl = `https://health-verification.vercel.app?token=${verificationToken}`;
  // Email content
  const mailOptions = {
    from: `"MedEvent" <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: "Verify Your MedEvent Account",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #2e7af5;">MedEvent</h1>
        </div>
        
        <div style="background-color: #f7f9fc; padding: 20px; border-radius: 10px;">
          <h2>Verify Your Email Address</h2>
          <p>Hi ${user.name},</p>
          <p>Thank you for signing up with MedEvent. To complete your registration, please verify your email address by clicking the button below:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" style="background-color: #2e7af5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Verify Email Address</a>
          </div>
          
          <p>Or copy and paste this link in your browser:</p>
          <p style="word-break: break-all; color: #666;">${verificationUrl}</p>
          
          <p>If you did not sign up for MedEvent, please ignore this email.</p>
        </div>
        
        <div style="text-align: center; margin-top: 20px; color: #666; font-size: 14px;">
          <p>&copy; ${new Date().getFullYear()} MedEvent. All rights reserved.</p>
        </div>
      </div>
    `,
  };

  // Send the email
  const info = await transporter.sendMail(mailOptions);
  return info;
};

module.exports = {
  transporter,
  sendVerificationEmail,
};
