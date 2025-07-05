const nodemailer = require("nodemailer");

// Create reusable transporter using your configuration
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Send OTP email
const sendOTPEmail = async (user, otp) => {
  const mailOptions = {
    from: `"MedEvent" <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: "Verify Your MedEvent Account - OTP",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #2e7af5;">MedEvent</h1>
        </div>
        
        <div style="background-color: #f7f9fc; padding: 20px; border-radius: 10px;">
          <h2>Email Verification</h2>
          <p>Hi ${user.name},</p>
          <p>Thank you for signing up with MedEvent. To complete your registration, please use the following OTP to verify your email address:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <div style="background-color: #2e7af5; color: white; padding: 20px; font-size: 32px; font-weight: bold; letter-spacing: 8px; border-radius: 8px; display: inline-block;">${otp}</div>
          </div>
          
          <p style="text-align: center; color: #666; font-size: 14px;">This OTP will expire in 10 minutes</p>
          
          <p>If you did not sign up for MedEvent, please ignore this email.</p>
        </div>
        
        <div style="text-align: center; margin-top: 20px; color: #666; font-size: 14px;">
          <p>&copy; ${new Date().getFullYear()} MedEvent. All rights reserved.</p>
        </div>
      </div>
    `,
  };

  const info = await transporter.sendMail(mailOptions);
  return info;
};

// Keep existing email verification function for backward compatibility
const sendVerificationEmail = async (user, verificationToken) => {
  const verificationUrl = `https://health-verification.vercel.app?token=${verificationToken}`;
  
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

  const info = await transporter.sendMail(mailOptions);
  return info;
};

module.exports = {
  transporter,
  sendOTPEmail,
  sendVerificationEmail,
};
