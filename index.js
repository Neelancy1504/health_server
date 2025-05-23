const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
const fileUpload = require("express-fileupload");
const verifyToken = require("./middleware/authMiddleware");
const adminOnly = require("./middleware/roleMiddleware");
const { verifyUser } = require("./middleware/authMiddleware");
const { verifyAdmin } = require("./middleware/roleMiddleware");
const { verifyDoctor } = require("./middleware/roleMiddleware");
const { verifyPatient } = require("./middleware/roleMiddleware");

// Update the ADMIN_SUPPORT_ID to use a real admin UUID
// Use Sahil bhai's ID from your database
const ADMIN_SUPPORT_ID = "66768b81-2d00-4eca-9145-4cf11f687fe8";

// Make sure to load environment variables right away
dotenv.config();

// Load Supabase config
const { supabase, supabaseAdmin } = require("./config/supabase");

// Create Express app
const app = express();

// Create HTTP server using Express app
const server = http.createServer(app);

// Create Socket.io server attached to HTTP server
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(
  cors({
    origin: ["https://health-verification.vercel.app", "http://localhost:3000"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept", "Range"],
    exposedHeaders: ["Content-Length", "Content-Range", "Content-Disposition"],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);
app.use(
  fileUpload({
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max file size
    useTempFiles: true,
    tempFileDir: "/tmp/",
    abortOnLimit: false,
    createParentPath: true,
    debug: true, // Enable debug for troubleshooting
    parseNested: false, // Simplify parsing
  })
);

// Routes
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const eventRoutes = require("./routes/events");
const userRoutes = require("./routes/users");
const uploadRoutes = require("./routes/uploads");
const coursesRoutes = require("./routes/courses");
const privateMeetingsRoutes = require("./routes/private-meetings");
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/users", userRoutes);
app.use("/api/private-meetings", privateMeetingsRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/courses", coursesRoutes);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Create an uploads directory
if (process.env.NODE_ENV !== "production") {
  const uploadsDir = path.join(__dirname, "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
}
// app.options('*', cors());
// // Update your CORS configuration
// app.use(
//   cors({
//     origin: ["https://health-verification.vercel.app", "http://localhost:3000", "*"], // Add your verification page URL
//     methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
//     allowedHeaders: ["Content-Type", "Authorization", "Range"],
//     exposedHeaders: ["Content-Length", "Content-Range", "Content-Disposition"],
//   })
// );
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
    res
      .status(500)
      .json({ message: "Supabase connection failed", error: error.message });
  }
});

// Create a simple test endpoint to verify Supabase connection
app.get("/api/test-events", async (req, res) => {
  try {
    // Test if events table exists and is accessible
    const { data, error } = await supabase.from("events").select("count");

    if (error) {
      throw error;
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error("Error accessing events table:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get all doctors endpoint
app.get("/api/doctors", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, name, role, degree, achievements")
      .eq("role", "doctor"); // Only get users with role 'doctor'

    if (error) throw error;

    console.log("Doctors fetched:", data.length);
    res.json(data);
  } catch (error) {
    console.error("Error fetching doctors:", error);
    res.status(500).json({ message: error.message });
  }
});

// Get chat messages endpoint
app.get("/api/messages/:roomId", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ message: error.message });
  }
});

// Add message via HTTP API (fallback method)
app.post("/api/messages", async (req, res) => {
  try {
    const messageData = req.body;
    console.log("Received message via HTTP:", messageData);

    // Add this admin ID handling
    const adminId =
      process.env.ADMIN_UUID || "00000000-0000-0000-0000-000000000000";

    // Message validation
    if (!messageData.content && messageData.text) {
      messageData.content = messageData.text;
    }

    // Field name compatibility
    if (!messageData.sender_id && messageData.senderId) {
      messageData.sender_id = messageData.senderId;
    }

    // Replace admin with real UUID
    if (
      messageData.receiver_id === "admin" ||
      messageData.receiverId === "admin"
    ) {
      messageData.receiver_id = ADMIN_SUPPORT_ID;
    } else if (!messageData.receiver_id && messageData.receiverId) {
      messageData.receiver_id = messageData.receiverId;
    }

    if (!messageData.sender_name && messageData.senderName) {
      messageData.sender_name = messageData.senderName;
    }

    if (!messageData.room_id && messageData.roomId) {
      messageData.room_id = messageData.roomId;
    }

    // Prepare the message object for insertion
    const messageToInsert = {
      content: messageData.content,
      sender_id: messageData.sender_id,
      sender_name: messageData.sender_name,
      receiver_id: messageData.receiver_id,
      room_id: messageData.room_id,
      // Add file attachment fields
      is_attachment: messageData.isAttachment || false,
      attachment_type: messageData.attachmentType,
      file_url: messageData.fileUrl,
      file_name: messageData.fileName,
      file_type: messageData.fileType,
      file_size: messageData.fileSize,
    };

    console.log("Inserting message into Supabase:", messageToInsert);

    const { data, error } = await supabase
      .from("messages")
      .insert(messageToInsert)
      .select();

    if (error) throw error;

    console.log("Message saved to Supabase via HTTP API:", data);

    // Broadcast to room via socket for real-time updates
    if (data && data.length > 0) {
      const savedMessage = data[0];

      const messageToEmit = {
        id: savedMessage.id,
        text: savedMessage.content,
        content: savedMessage.content,
        senderId: savedMessage.sender_id,
        sender_id: savedMessage.sender_id,
        senderName: savedMessage.sender_name,
        sender_name: savedMessage.sender_name,
        receiverId: savedMessage.receiver_id,
        receiver_id: savedMessage.receiver_id,
        timestamp: savedMessage.created_at,
        created_at: savedMessage.created_at,
        roomId: savedMessage.room_id,
        room_id: savedMessage.room_id,
        // Add attachment fields to emitted message
        isAttachment: savedMessage.is_attachment,
        attachmentType: savedMessage.attachment_type,
        fileUrl: savedMessage.file_url,
        fileName: savedMessage.file_name,
        fileType: savedMessage.file_type,
        fileSize: savedMessage.file_size,
      };

      io.to(savedMessage.room_id).emit("receive_message", messageToEmit);

      res.status(201).json({
        success: true,
        message: "Message saved successfully",
        id: savedMessage.id,
      });
    } else {
      res.status(201).json({
        success: true,
        message: "Message processed but no data returned",
      });
    }
  } catch (error) {
    console.error("Error saving message via HTTP:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save message",
      error: error.message,
    });
  }
});

// Chat document upload endpoint - directly in index.js
app.post("/api/uploads/chat-document", async (req, res) => {
  try {
    console.log("Chat file upload request received", {
      hasFiles: !!req.files,
      contentType: req.headers["content-type"],
    });

    // Make sure files were uploaded
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ message: "No files were uploaded" });
    }

    // Get the file with key 'document'
    const file = req.files.document;
    if (!file) {
      return res.status(400).json({
        message: "File must be provided with the key 'document'",
      });
    }

    // Log detailed file information for debugging
    console.log("Chat file received:", {
      name: file.name,
      size: file.size,
      mimetype: file.mimetype,
      tempFilePath: file.tempFilePath || "N/A",
      md5: file.md5,
    });

    // Use userId from query param or a default for unauthenticated uploads
    const userId = req.query.userId || "anonymous";

    const fileExtension =
      path.extname(file.name) || `.${file.mimetype.split("/")[1]}`;
    const fileName = `${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 15)}${fileExtension}`;
    const filePath = `chat/${userId}/${fileName}`;

    // Get file data from tempFilePath if available, otherwise use data property
    let fileData;
    if (file.tempFilePath) {
      fileData = fs.readFileSync(file.tempFilePath);
    } else {
      fileData = file.data;
    }

    // Check file data is present
    if (!fileData || fileData.length === 0) {
      return res.status(400).json({ message: "File data is empty" });
    }

    // Upload to Supabase
    const { data, error } = await supabaseAdmin.storage
      .from("medevents")
      .upload(filePath, fileData, {
        contentType: file.mimetype || "application/octet-stream",
        cacheControl: "3600",
        upsert: true,
      });

    if (error) {
      console.error("Supabase storage error:", error);
      return res.status(500).json({
        message: "Failed to upload to storage",
        error: error.message,
      });
    }

    // Get public URL
    const { data: publicUrlData } = supabaseAdmin.storage
      .from("medevents")
      .getPublicUrl(filePath);

    // Clean up temp file if it exists
    if (file.tempFilePath && fs.existsSync(file.tempFilePath)) {
      fs.unlinkSync(file.tempFilePath);
    }

    res.status(200).json({
      success: true,
      url: publicUrlData.publicUrl,
      fileName: file.name,
      fileType: file.mimetype,
      size: file.size,
      storage_path: filePath,
    });
  } catch (error) {
    console.error("Chat file upload error:", error);
    res.status(500).json({ message: error.message });
  }
});

// Socket connection handling
io.on("connection", (socket) => {
  console.log("New client connected", socket.id);

  socket.on("join_room", (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room: ${roomId}`);
  });

  // Update the socket.on("send_message") handler to use ADMIN_SUPPORT_ID
  socket.on("send_message", async (messageData) => {
    console.log("Message received via socket:", messageData);

    try {
      // Handle field name compatibility and admin room IDs
      const messageToInsert = {
        content: messageData.content || messageData.text,
        sender_id: messageData.sender_id || messageData.senderId,
        sender_name: messageData.sender_name || messageData.senderName,
        // Replace "admin" with ADMIN_SUPPORT_ID
        receiver_id:
          messageData.receiver_id === "admin" ||
          messageData.receiverId === "admin"
            ? ADMIN_SUPPORT_ID
            : messageData.receiver_id || messageData.receiverId,
        room_id: messageData.room_id || messageData.roomId,
        is_attachment: messageData.isAttachment || false,
        attachment_type: messageData.attachmentType,
        file_url: messageData.fileUrl,
        file_name: messageData.fileName,
        file_type: messageData.fileType,
        file_size: messageData.fileSize,
      };

      // Insert message into database
      const { data: insertedMessage, error } = await supabase
        .from("messages")
        .insert(messageToInsert)
        .select();

      if (error) throw error;

      const messageToEmit = {
        id: insertedMessage[0].id,
        ...messageData,
        timestamp: insertedMessage[0].created_at,
      };

      io.to(messageData.room_id || messageData.roomId).emit(
        "receive_message",
        messageToEmit
      );

      socket.emit("message_confirmed", messageToEmit);
    } catch (error) {
      console.error("Error saving message via socket:", error);
      socket.emit("message_error", {
        success: false,
        message: "Failed to save message",
        error: error.message,
      });
    }
  });

  socket.on("typing", (data) => {
    // Forward typing indicator to the room
    socket.to(data.roomId || data.room_id).emit("user_typing", {
      userId: data.userId || data.user_id,
      userName: data.userName || data.user_name,
      roomId: data.roomId || data.room_id,
      isTyping: data.isTyping,
    });
  });

  socket.on("leave_room", (roomId) => {
    socket.leave(roomId);
    console.log(`User ${socket.id} left room: ${roomId}`);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected", socket.id);
  });
});

// Create a chat room API
app.post("/api/chat-rooms", async (req, res) => {
  try {
    const { name, user1_id, user2_id, type = "direct" } = req.body;

    if (!user1_id || !user2_id) {
      return res.status(400).json({
        success: false,
        message: "Both users are required to create a chat room",
      });
    }

    // Check if room already exists between these users
    let roomId;
    const { data: existingRooms, error: roomError } = await supabase
      .from("chat_rooms")
      .select("*")
      .eq("type", "direct")
      .or(`user1_id.eq.${user1_id},user1_id.eq.${user2_id}`)
      .or(`user2_id.eq.${user1_id},user2_id.eq.${user2_id}`);

    if (roomError) throw roomError;

    if (existingRooms && existingRooms.length > 0) {
      // Room exists - return existing room
      const existingRoom = existingRooms.find(
        (room) =>
          (room.user1_id === user1_id && room.user2_id === user2_id) ||
          (room.user1_id === user2_id && room.user2_id === user1_id)
      );

      if (existingRoom) {
        return res.status(200).json({
          success: true,
          message: "Chat room already exists",
          room: existingRoom,
        });
      }
    }

    // Create new room
    const roomData = {
      name: name || `Chat between ${user1_id} and ${user2_id}`,
      user1_id,
      user2_id,
      type,
      created_at: new Date().toISOString(),
    };

    const { data: newRoom, error: createError } = await supabase
      .from("chat_rooms")
      .insert(roomData)
      .select();

    if (createError) throw createError;

    res.status(201).json({
      success: true,
      message: "Chat room created successfully",
      room: newRoom[0],
    });
  } catch (error) {
    console.error("Error creating chat room:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create chat room",
      error: error.message,
    });
  }
});

// Get chat rooms for a user
app.get("/api/chat-rooms/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    // Get rooms where user is either user1 or user2
    const { data, error } = await supabase
      .from("chat_rooms")
      .select(
        `
        *,
        user1:user1_id(id, name, role, avatar_url),
        user2:user2_id(id, name, role, avatar_url)
      `
      )
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);

    if (error) throw error;

    res.json({
      success: true,
      rooms: data,
    });
  } catch (error) {
    console.error("Error fetching chat rooms:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch chat rooms",
      error: error.message,
    });
  }
});

// Get user profile data
app.get("/api/user-profile/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const { data, error } = await supabase
      .from("users")
      .select(
        "id, name, email, role, avatar_url, degree, achievements, created_at"
      )
      .eq("id", userId)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(data);
  } catch (error) {
    console.error("Error fetching user profile:", error);
    res.status(500).json({ message: error.message });
  }
});

// Update user profile
app.put("/api/user-profile/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;

    // Remove sensitive fields that shouldn't be updated directly
    delete updates.id;
    delete updates.email;
    delete updates.created_at;

    const { data, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", userId)
      .select();

    if (error) throw error;

    res.json({
      success: true,
      message: "Profile updated successfully",
      user: data[0],
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update profile",
      error: error.message,
    });
  }
});

// Update the API endpoint to handle chat rooms correctly
app.get(
  "/api/admin/support-users",
  verifyToken,
  adminOnly,
  async (req, res) => {
    try {
      console.log("Admin support users endpoint accessed by:", req.user.id);

      // Find all chat rooms with user1_id or user2_id matching ADMIN_SUPPORT_ID
      // OR rooms with 'admin-' prefix in room_id
      const { data: rooms, error: roomsError } = await supabase
        .from("chat_rooms")
        .select("*")
        .or(
          `user1_id.eq.${ADMIN_SUPPORT_ID},user2_id.eq.${ADMIN_SUPPORT_ID},room_id.ilike.admin-%`
        );

      console.log("Room query executed, found rooms:", rooms?.length || 0);

      if (roomsError) {
        console.error("Room query error:", roomsError);
        throw roomsError;
      }

      // If no rooms found, return empty array immediately
      if (!rooms || rooms.length === 0) {
        console.log("No admin chat rooms found");
        return res.json([]);
      }

      // Extract unique user IDs who have chatted with admin
      const userIds = Array.from(
        new Set(
          rooms.flatMap((room) => {
            // Extract user ID from room ID for rooms with 'admin-' prefix
            if (room.room_id && room.room_id.startsWith("admin-")) {
              const parts = room.room_id.split("-");
              if (parts.length > 1) {
                return [parts[1]];
              }
            }

            // Extract user ID from user1_id or user2_id
            if (room.user1_id === ADMIN_SUPPORT_ID) {
              return [room.user2_id];
            } else if (room.user2_id === ADMIN_SUPPORT_ID) {
              return [room.user1_id];
            }
            return [];
          })
        )
      );

      console.log("Extracted user IDs:", userIds);

      if (userIds.length === 0) {
        return res.json([]);
      }

      // Get user details
      const { data: users, error: usersError } = await supabase
        .from("users")
        .select("*")
        .in("id", userIds);

      if (usersError) {
        console.error("User query error:", usersError);
        throw usersError;
      }

      console.log("Found users:", users?.length || 0);
      res.json(users || []);
    } catch (error) {
      console.error("Error fetching support users:", error);
      // Return empty array instead of error to prevent loading state
      res.json([]);
    }
  }
);

// Add this new endpoint to fetch all potential support users

// Replace your current /api/admin/all-users endpoint with this optimized version

app.get("/api/admin/all-users", verifyToken, adminOnly, async (req, res) => {
  try {
    console.log("Fetching all users for admin chat");

    // Add pagination to improve performance
    const page = parseInt(req.query.page) || 0;
    const limit = parseInt(req.query.limit) || 100;
    const offset = page * limit;

    // Use more efficient query with pagination and basic fields only
    const { data: users, error, count } = await supabase
      .from("users")
      .select("id, name, email, role, verified, company, degree", { count: "exact" })
      .in("role", ["doctor", "pharma"])
      .order("name")
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Database error:", error);
      throw error;
    }

    console.log(`Found ${users?.length || 0} users (page ${page})`);
    res.json({
      users: users || [], 
      total: count || 0,
      hasMore: users && count > offset + users.length
    });
  } catch (error) {
    console.error("Error fetching all users:", error);
    // Return empty array instead of error to prevent loading state issues
    res.json({ users: [], total: 0, hasMore: false });
  }
});

// Update the existing endpoint or add a new one
// Add this near your other health check endpoints

app.get("/api/admin/health", verifyToken, adminOnly, async (req, res) => {
  try {
    // Simple query to test database access
    const { data, error } = await supabase
      .from("users")
      .select("count", { count: "exact", head: true })
      .limit(1);
      
    if (error) throw error;
    
    res.status(200).json({ 
      status: "ok", 
      message: "Admin API is healthy",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Admin health check failed:", error);
    res.status(500).json({ 
      status: "error", 
      message: "Database connection issue",
      error: error.message 
    });
  }
});
app.get(
  "/api/admin/all-platform-users",
  verifyToken,
  adminOnly,
  async (req, res) => {
    try {
      console.log("Fetching all platform users for admin chat");

      // Get all users (not just doctors and pharma)
      const { data: users, error } = await supabase
        .from("users")
        .select(
          "id, name, email, role, verified, company, degree, phone, created_at"
        )
        .order("role", { ascending: true }) // Group by role
        .order("name", { ascending: true }); // Then alphabetically

      if (error) throw error;

      // Format the response
      const formattedUsers = users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        verified: user.verified,
        company: user.company,
        degree: user.degree,
        phone: user.phone,
        joinDate: user.created_at,
      }));

      console.log(`Found ${formattedUsers.length} total users`);
      res.json(formattedUsers);
    } catch (error) {
      console.error("Error fetching all platform users:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Serve a welcome page at the root route
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>MedEvent API Server</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 800px;
                margin: 0 auto;
                padding: 20px;
            }
            .container {
                background-color: #fff;
                border-radius: 8px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                padding: 30px;
                margin-top: 40px;
            }
            h1 {
                color: #2e7af5;
                margin-top: 0;
                border-bottom: 2px solid #eee;
                padding-bottom: 10px;
            }
            .status {
                display: inline-block;
                background-color: #4caf50;
                color: white;
                padding: 4px 12px;
                border-radius: 16px;
                font-size: 14px;
                margin-left: 10px;
            }
            .endpoint {
                background-color: #f5f5f5;
                border-left: 4px solid #2e7af5;
                padding: 8px 16px;
                margin: 12px 0;
                font-family: monospace;
                font-size: 14px;
            }
            .footer {
                margin-top: 40px;
                text-align: center;
                font-size: 14px;
                color: #666;
            }
            .logo {
                text-align: center;
                margin-bottom: 20px;
            }
            .logo span {
                font-size: 48px;
                color: #2e7af5;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="logo">
                <span>💊</span>
            </div>
            <h1>MedEvent API Server <span class="status">Online</span></h1>
            <p>Welcome to the MedEvent API server. This backend service powers the MedEvent mobile application, providing functionalities for medical events management, user authentication, and real-time communication.</p>
            
            <h2>API Status</h2>
            <p>The server is up and running. All systems operational.</p>
            
            <h2>Available Endpoints</h2>
            <p>Some key endpoints include:</p>
            <div class="endpoint">/api/health</div>
            <div class="endpoint">/api/auth/login</div>
            <div class="endpoint">/api/events</div>
            <div class="endpoint">/api/doctors</div>
            
            <p>This server also supports WebSocket connections for real-time chat functionality.</p>
            
            <h2>For Developers</h2>
            <p>If you're a developer working on the MedEvent application, please refer to the API documentation for detailed information on available endpoints and request formats.</p>
            
            <div class="footer">
                MedEvent Server &copy; ${new Date().getFullYear()} | Server Time: ${new Date().toLocaleString()}
            </div>
        </div>
    </body>
    </html>
  `);
});

// Serve static assets in production
if (process.env.NODE_ENV === "production") {
  // Set static folder
  const clientBuildPath = path.join(__dirname, "../client/build");

  if (fs.existsSync(clientBuildPath)) {
    app.use(express.static(clientBuildPath));

    app.get("*", (req, res) => {
      res.sendFile(path.resolve(__dirname, "../client", "build", "index.html"));
    });
  } else {
    console.warn("Client build folder not found.");
  }
}

// Set port
const PORT = process.env.PORT || 5000;

// Server listening logic for local development
if (process.env.NODE_ENV !== "production") {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  });
}

// For Vercel serverless deployment
module.exports = app;
