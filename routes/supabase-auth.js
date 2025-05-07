const express = require("express");
const router = express.Router();
const { supabase, supabaseAdmin } = require("../config/supabase");

// Sign up with email
router.post("/signup", async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role,
      degree,
      company,
      phone,
      roleInCompany,
    } = req.body;

    // Register the user with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          role,
          degree: role === "doctor" ? degree : null,
          company: role === "pharma" ? company : null,
          phone: phone || null,
          role_in_company: role === "pharma" ? roleInCompany : null,
        },
        emailRedirectTo:
          process.env.EMAIL_CONFIRMATION_URL ||
          "https://medevent.yourdomain.com/verify-email",
      },
    });

    if (authError) {
      return res.status(400).json({ message: authError.message });
    }

    // Return success with confirmation message
    res.status(201).json({
      message: "User registered. Please check your email for verification.",
      user: authData.user,
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ message: error.message });
  }
});

// Phone OTP Authentication
router.post("/phone/start", async (req, res) => {
  try {
    const { phone } = req.body;

    // Start phone verification using phone OTP
    const { data, error } = await supabaseAdmin.auth.signInWithOtp({
      phone,
    });

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    res.json({ message: "OTP sent to your phone", data });
  } catch (error) {
    console.error("Phone verification error:", error);
    res.status(500).json({ message: error.message });
  }
});

// Verify Phone OTP
router.post("/phone/verify", async (req, res) => {
  try {
    const { phone, token } = req.body;

    // Verify the OTP token
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: "sms",
    });

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    res.json({
      message: "Phone verified successfully",
      user: data.user,
      session: data.session,
    });
  } catch (error) {
    console.error("OTP verification error:", error);
    res.status(500).json({ message: error.message });
  }
});

// Login with email
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Sign in with Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    // Check if email is verified
    if (!data.user.email_confirmed_at && data.user.role !== "admin") {
      return res.status(401).json({
        message:
          "Email not verified. Please check your inbox to verify your email.",
        needsVerification: true,
      });
    }

    res.json({
      token: data.session.access_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: data.user.user_metadata.role,
        name: data.user.user_metadata.name,
        ...data.user.user_metadata,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: error.message });
  }
});

// Resend email verification
router.post("/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;

    const { data, error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo:
          process.env.EMAIL_CONFIRMATION_URL ||
          "https://medevent.yourdomain.com/verify-email",
      },
    });

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    res.json({ message: "Verification email resent successfully" });
  } catch (error) {
    console.error("Resend verification error:", error);
    res.status(500).json({ message: error.message });
  }
});

// Get current user
router.get("/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    // Get user by session token
    const { data, error } = await supabase.auth.getUser(token);

    if (error) {
      return res.status(401).json({ message: error.message });
    }

    res.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        role: data.user.user_metadata.role,
        name: data.user.user_metadata.name,
        ...data.user.user_metadata,
      },
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ message: error.message });
  }
});

// Logout
router.post("/logout", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      await supabase.auth.signOut({ accessToken: token });
    }

    res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ message: error.message });
  }
});

// Update user profile
router.put("/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const { name, phone, degree, company, roleInCompany } = req.body;

    // Update user metadata
    const { data, error } = await supabase.auth.updateUser(
      {
        data: {
          name,
          phone,
          degree,
          company,
          role_in_company: roleInCompany,
        },
      },
      {
        accessToken: token,
      }
    );

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    res.json({
      message: "Profile updated successfully",
      user: {
        id: data.user.id,
        email: data.user.email,
        role: data.user.user_metadata.role,
        name: data.user.user_metadata.name,
        ...data.user.user_metadata,
      },
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
