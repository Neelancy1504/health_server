const crypto = require("crypto");
const { supabase } = require("../config/supabase");

// Generate a 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Store OTP in database with expiration
const storeOTP = async (email, otp, expiresInMinutes = 10) => {
  try {
    const expiration = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    // Delete any existing OTP for this email
    await supabase.from("email_otps").delete().eq("email", email);

    // Insert new OTP
    const { error } = await supabase.from("email_otps").insert({
      email,
      otp,
      expires_at: expiration.toISOString(),
      created_at: new Date().toISOString(),
    });

    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Error storing OTP:", error);
    throw error;
  }
};

// Verify OTP
const verifyOTP = async (email, otp) => {
  try {
    // Get OTP record from database
    const { data: otpRecord, error: otpError } = await supabase
      .from("email_otps")
      .select("*")
      .eq("email", email)
      .eq("otp", otp)
      .single();
    
    if (otpError || !otpRecord) {
      return false;
    }
    
    // Check if OTP is expired
    if (new Date(otpRecord.expires_at) < new Date()) {
      // Delete expired OTP
      await supabase.from("email_otps").delete().eq("id", otpRecord.id);
      return false;
    }
    
    // Delete the used OTP
    await supabase.from("email_otps").delete().eq("id", otpRecord.id);
    
    return true;
  } catch (error) {
    console.error("Error verifying OTP:", error);
    return false;
  }
};

// Clean expired OTPs (can be called periodically)
const cleanExpiredOTPs = async () => {
  try {
    const { error } = await supabase
      .from("email_otps")
      .delete()
      .lt("expires_at", new Date().toISOString());
    
    if (error) throw error;
  } catch (error) {
    console.error("Error cleaning expired OTPs:", error);
  }
};

module.exports = {
  generateOTP,
  storeOTP,
  verifyOTP,
  cleanExpiredOTPs,
};