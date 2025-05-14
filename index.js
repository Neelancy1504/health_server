const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
const fileUpload = require("express-fileupload");

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

    // Message validation
    if (!messageData.content && messageData.text) {
      messageData.content = messageData.text;
    }

    if (!messageData.sender_id && messageData.senderId) {
      messageData.sender_id = messageData.senderId;
    }

    if (!messageData.sender_name && messageData.senderName) {
      messageData.sender_name = messageData.senderName;
    }

    if (!messageData.receiver_id && messageData.receiverId) {
      messageData.receiver_id = messageData.receiverId;
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

// Socket connection handling
io.on("connection", (socket) => {
  console.log("New client connected", socket.id);

  socket.on("join_room", (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room: ${roomId}`);
  });

  // Update the socket handler for messages
  socket.on("send_message", async (messageData) => {
    console.log("Message received via socket:", messageData);

    try {
      // Handle field name compatibility
      const messageToInsert = {
        content: messageData.content || messageData.text,
        sender_id: messageData.sender_id || messageData.senderId,
        sender_name: messageData.sender_name || messageData.senderName,
        receiver_id: messageData.receiver_id || messageData.receiverId,
        room_id: messageData.room_id || messageData.roomId,
        // Add file attachment fields
        is_attachment: messageData.isAttachment || false,
        attachment_type: messageData.attachmentType,
        file_url: messageData.fileUrl,
        file_name: messageData.fileName,
        file_type: messageData.fileType,
        file_size: messageData.fileSize,
      };

      // Insert message into Supabase
      const { data, error } = await supabase
        .from("messages")
        .insert(messageToInsert)
        .select();

      if (error) throw error;

      // Only emit if data returned
      if (data && data.length > 0) {
        const savedMessage = data[0];

        // Create a message object with both naming conventions for full compatibility
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

        // Include the original sender's socket ID to prevent duplicate messages
        socket.to(savedMessage.room_id).emit("receive_message", messageToEmit);
        // Send back to sender with confirmation
        socket.emit("message_confirmed", messageToEmit);
      }
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
        "id, name, email, role, avatar_url, degree, achievements, specialization, created_at"
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
