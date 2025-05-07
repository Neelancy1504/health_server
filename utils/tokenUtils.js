const crypto = require("crypto");
const { supabase } = require("../config/supabase");

// Generate a random token
const generateVerificationToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

// Store verification token in database
const storeVerificationToken = async (userId, token, expiresIn = 24) => {
  try {
    // Convert hours to milliseconds
    const expiration = new Date(Date.now() + expiresIn * 60 * 60 * 1000);

    // First check if a token already exists for this user and delete it
    await supabase.from("verification_tokens").delete().eq("user_id", userId);

    // Then insert a new token
    const { error } = await supabase.from("verification_tokens").insert({
      user_id: userId,
      token,
      expires_at: expiration.toISOString(),
    });

    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Error storing verification token:", error);
    throw error;
  }
};

// Verify token and mark user as verified
const verifyToken = async (token) => {
  try {
    // Get token record from database
    const { data: tokenRecord, error: tokenError } = await supabase
      .from('verification_tokens')
      .select('*')
      .eq('token', token)
      .single();
    
    if (tokenError || !tokenRecord) {
      throw new Error('Invalid or expired token');
    }
    
    // Check if token is expired
    if (new Date(tokenRecord.expires_at) < new Date()) {
      throw new Error('Token expired');
    }
    
    console.log('Found token record:', tokenRecord);
    
    // Mark user as verified - FIXED LINE BELOW
    const { error: updateError } = await supabase
      .from('users')
      .update({ 
        email_verified: true, 
        email_verified_at: new Date().toISOString() 
      })
      .eq('id', tokenRecord.user_id); // FIXED: Use user_id, not id
    
    if (updateError) {
      console.error('Error updating user verification status:', updateError);
      throw updateError;
    }
    
    // Delete the token after use
    await supabase
      .from('verification_tokens')
      .delete()
      .eq('token', token);
    
    return { success: true, userId: tokenRecord.user_id };
  } catch (error) {
    console.error('Token verification error:', error);
    throw error;
  }
};

module.exports = {
  generateVerificationToken,
  storeVerificationToken,
  verifyToken,
};
