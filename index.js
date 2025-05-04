const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");

// Make sure to load environment variables right away
dotenv.config();

// Load Supabase config
const { supabase, supabaseAdmin } = require("./config/supabase");

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Update your CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
  exposedHeaders: ['Content-Length', 'Content-Range', 'Content-Disposition'],
}));

// Routes
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const eventRoutes = require("./routes/events");
const userRoutes = require("./routes/users");
const uploadRoutes = require("./routes/uploads");
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/users", userRoutes);
app.use("/api/uploads", uploadRoutes);

// Create an uploads directory
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok", message: "Server is running" });
});

// Test Supabase connection
app.get("/api/test-supabase", async (req, res) => {
  try {
    const { data, error } = await supabase.from("users").select("count");
    
    if (error) {
      throw error;
    }
    
    res.json({ message: "Supabase connection successful", data });
  } catch (error) {
    console.error("Supabase connection error:", error);
    res.status(500).json({ message: "Supabase connection failed", error: error.message });
  }
});

// Create a simple test endpoint to verify Supabase connection
app.get("/api/test-events", async (req, res) => {
  try {
    // Test if events table exists and is accessible
    const { data, error } = await supabase
      .from('events')
      .select('count');
      
    if (error) {
      throw error;
    }
    
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error accessing events table:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// // index.js
// const express = require("express");
// const mongoose = require("mongoose");
// const cors = require("cors");
// const dotenv = require("dotenv");
// const fs = require("fs");
// const path = require("path");

// // Make sure to load environment variables right away
// dotenv.config();

// // Logging to verify environment variables are loaded
// console.log("Environment check:", {
//   hasCloudName: !!process.env.CLOUDINARY_CLOUD_NAME,
//   hasApiKey: !!process.env.CLOUDINARY_API_KEY,
//   hasApiSecret: !!process.env.CLOUDINARY_API_SECRET,
// });

// const app = express();
// app.use(express.json());
// app.use(cors());

// // Routes
// const authRoutes = require("./routes/auth");
// const adminRoutes = require("./routes/admin");
// const eventRoutes = require("./routes/events");
// const userRoutes = require("./routes/users");
// const uploadRoutes = require("./routes/uploads");
// app.use("/api/auth", authRoutes);
// app.use("/api/admin", adminRoutes);
// app.use("/api/events", eventRoutes);
// app.use("/api/users", userRoutes);
// app.use("/api/uploads", uploadRoutes);

// // Create an uploads directory
// const uploadsDir = path.join(__dirname, "uploads");
// if (!fs.existsSync(uploadsDir)) {
//   fs.mkdirSync(uploadsDir, { recursive: true });
// }

// // Connect to MongoDB
// mongoose
//   .connect(process.env.MONGO_URI)
//   .then(() => {
//     console.log("MongoDB Connected");
//     app.listen(5000, () => console.log("Server running on port 5000"));
//   })
//   .catch((err) => console.error(err));
