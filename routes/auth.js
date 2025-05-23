const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { supabase } = require("../config/supabase");
const verifyToken = require("../middleware/authMiddleware");
const verifyRole = require("../middleware/roleMiddleware");
const { sendVerificationEmail } = require('../config/email');
const { 
  generateVerificationToken, 
  storeVerificationToken,
  verifyToken: verifyEmailToken // Rename this import to avoid the conflict
} = require('../utils/tokenUtils');

// Signup Route
router.post("/signup", async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role,
      degree,
      company,
      documents,
      phone,
      roleInCompany,
    } = req.body;

    // Check if user exists
    const { data: existingUser, error: fetchError } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      throw new Error(fetchError.message);
    }

    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user with email_verified set to false
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
        email_verified: false, // Initially set to false
      })
      .select()
      .single();

    if (insertError) throw new Error(insertError.message);

    // Generate and store verification token
    const verificationToken = generateVerificationToken();
    await storeVerificationToken(newUser.id, verificationToken);

    // Send verification email
    await sendVerificationEmail(newUser, verificationToken);

    // Handle document uploads if provided
    if (
      (role === "doctor" || role === "pharma") &&
      documents &&
      documents.length > 0
    ) {
      const documentsToInsert = documents.map((doc) => ({
        user_id: newUser.id,
        name: doc.name,
        type: doc.type,
        size: doc.size,
        storage_path: doc.storage_path,
        url: doc.url,
        upload_date: new Date().toISOString(),
      }));

      const { error: docsError } = await supabase
        .from("documents")
        .insert(documentsToInsert);

      if (docsError) {
        console.error("Error storing document references:", docsError);
      }
    }

    res.status(201).json({
      message:
        "User registered successfully. Please check your email to verify your account.",
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ message: error.message });
  }
});

// Add a new route for verifying email
router.get("/verify-email", async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res
        .status(400)
        .json({ message: "No verification token provided" });
    }

    await verifyEmailToken(token);

    // Redirect to the verification success page
    //res.redirect(`${process.env.FRONTEND_URL}/verification-success`);
    res.json({ success: true , message: "Email verified successfully" });
  } catch (error) {
    onsole.error("Email verification error:", error);
    return res.status(400).json({ 
      success: false, 
      message: error.message || "Verification failed" 
    });
  }
});

// Add a route for resending verification emails
router.post("/resend-verification", async (req, res) => {
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

    // Generate new token
    const verificationToken = generateVerificationToken();
    await storeVerificationToken(user.id, verificationToken);

    // Send verification email
    await sendVerificationEmail(user, verificationToken);

    res.json({ message: "Verification email sent successfully" });
  } catch (error) {
    console.error("Resend verification error:", error);
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
        message:
          "Email not verified. Please verify your email before logging in.",
        needsVerification: true,
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
