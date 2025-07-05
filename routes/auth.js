const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { supabase } = require("../config/supabase");
const verifyToken = require("../middleware/authMiddleware");
const { verifyRole } = require("../middleware/roleMiddleware");
const { sendOTPEmail } = require("../config/email"); // Updated import
const {
  generateOTP,
  storeOTP,
  verifyOTP,
} = require("../utils/otpUtils"); // New utility

// Signup Route - Modified for OTP
router.post("/signup", async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role,
      degree,
      company,
      roleInCompany,
      phone,
      documents,
    } = req.body;

    console.log('🔍 Backend signup called with:', {
      name,
      email,
      role,
      documentsCount: documents?.length || 0
    });

    // Check if user exists
    const { data: existingUser, error: fetchError } = await supabase
      .from("users")
      .select("id, email_verified")
      .eq("email", email)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      throw new Error(fetchError.message);
    }

    if (existingUser && existingUser.email_verified) {
      return res.status(400).json({ message: "User already exists and is verified" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    let userId;

    if (existingUser && !existingUser.email_verified) {
      // Update existing unverified user
      const { data: updatedUser, error: updateError } = await supabase
        .from("users")
        .update({
          name,
          password: hashedPassword,
          role,
          degree: role === "doctor" ? degree : null,
          company: role === "pharma" ? company : null,
          phone: phone || null,
          role_in_company: role === "pharma" ? roleInCompany : null,
        })
        .eq("id", existingUser.id)
        .select()
        .single();

      if (updateError) throw new Error(updateError.message);
      userId = updatedUser.id;
    } else {
      // Create new user with email_verified set to false
      const { data: newUser, error: insertError } = await supabase
        .from("users")
        .insert({
          name,
          email,
          password: hashedPassword,
          role,
          degree: role === "doctor" ? degree : null,
          company: role === "pharma" ? company : null,
          phone: phone || null,
          role_in_company: role === "pharma" ? roleInCompany : null,
          email_verified: false,
        })
        .select()
        .single();

      if (insertError) throw new Error(insertError.message);
      userId = newUser.id;
    }

    console.log('✅ User created with ID:', userId);

    // Handle document uploads if provided
    if (documents && documents.length > 0) {
      console.log('📄 Processing documents:', documents.length);
      
      // Delete existing documents for this user if updating
      await supabase.from("documents").delete().eq("user_id", userId);

      const documentsToInsert = documents.map((doc) => ({
        user_id: userId,
        name: doc.name,
        type: doc.type,
        size: doc.size,
        storage_path: doc.storage_path,
        url: doc.url,
        upload_date: new Date().toISOString(),
        verified: false,
      }));

      const { error: docsError } = await supabase
        .from("documents")
        .insert(documentsToInsert);

      if (docsError) {
        console.error("Error storing document references:", docsError);
      } else {
        console.log('✅ Documents stored successfully');
      }
    }

    // Generate and store OTP
    console.log('📧 Generating OTP for email:', email);
    const otp = generateOTP();
    await storeOTP(email, otp);

    // Send OTP email
    await sendOTPEmail({ name, email }, otp);
    console.log('✅ OTP email sent successfully');

    // THIS IS THE CRUCIAL PART - MAKE SURE THIS RESPONSE IS SENT
    const responseData = {
      message: "User registered successfully. Please verify your email with the OTP sent to your email address.",
      email: email,
      needsOTPVerification: true, // This is crucial!
    };

    console.log('🚀 Sending response:', responseData);
    res.status(201).json(responseData);
    
  } catch (error) {
    console.error("❌ Signup error:", error);
    res.status(500).json({ message: error.message });
  }
});

// New route for OTP verification
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    // Verify OTP
    const isValidOTP = await verifyOTP(email, otp);
    
    if (!isValidOTP) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    // Update user as verified
    const { data: user, error: updateError } = await supabase
      .from("users")
      .update({ 
        email_verified: true, 
        email_verified_at: new Date().toISOString() 
      })
      .eq("email", email)
      .select()
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    // Create JWT token
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Remove password from response
    delete user.password;

    res.json({ 
      success: true,
      message: "Email verified successfully",
      token,
      user
    });
  } catch (error) {
    console.error("OTP verification error:", error);
    res.status(500).json({ message: error.message });
  }
});

// Resend OTP route
router.post("/resend-otp", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Find user by email
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .single();

    if (userError || !user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if already verified
    if (user.email_verified) {
      return res.status(400).json({ message: "Email is already verified" });
    }

    // Generate and store new OTP
    const otp = generateOTP();
    await storeOTP(email, otp);

    // Send OTP email
    await sendOTPEmail(user, otp);

    res.json({ message: "OTP sent successfully" });
  } catch (error) {
    console.error("Resend OTP error:", error);
    res.status(500).json({ message: error.message });
  }
});

// Login Route
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .single();

    if (error || !user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Check if email is verified
    if (!user.email_verified && user.role !== "admin") {
      return res.status(403).json({
        message: "Email not verified. Please verify your email with OTP.",
        needsOTPVerification: true,
        email: user.email,
      });
    }

    // Create JWT token
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Remove password from response
    delete user.password;

    res.json({ token, user });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: error.message });
  }
});

router.get("/protected", verifyToken, (req, res) => {
  res.json({
    message: "You are authorized",
    userId: req.user.id,
  });
});

// Only logged-in doctors can access this route
router.get("/doctor-only", verifyToken, verifyRole(["doctor"]), (req, res) => {
  res.json({
    message: "Welcome Doctor!",
    userId: req.user.id,
    role: req.user.role,
  });
});

// Only logged-in admins can access this route
router.get(
  "/admin-only",
  verifyToken,
  verifyRole(["admin", "doctor", "pharma"]),
  (req, res) => {
    res.json({
      message: "Welcome Admin!",
      userId: req.user.id,
      role: req.user.role,
    });
  }
);

// Both doctor and pharma can access this
router.get("/pharma-only", verifyToken, verifyRole(["pharma"]), (req, res) => {
  res.json({
    message: "Pharma Representative can access this!",
    userId: req.user.id,
    role: req.user.role,
  });
});

module.exports = router;
