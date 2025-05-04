// const express = require("express");
// const cors = require("cors");
// const dotenv = require("dotenv");
// const fs = require("fs");
// const path = require("path");
// const http = require('http');
// const { Server } = require("socket.io");

// // Make sure to load environment variables right away
// dotenv.config();

// // Load Supabase config
// const { supabase, supabaseAdmin } = require("./config/supabase");

// // Create Express app
// const app = express();

// // Create HTTP server using Express app
// const server = http.createServer(app);

// // Create Socket.io server attached to HTTP server
// const io = new Server(server, {
//   cors: {
//     origin: "*",
//     methods: ["GET", "POST"]
//   }
// });

// // Middleware
// app.use(express.json({ limit: '50mb' }));
// app.use(express.urlencoded({ extended: true, limit: '50mb' }));
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

// // Health check endpoint
// app.get("/api/health", (req, res) => {
//   res.status(200).json({ status: "ok", message: "Server is running" });
// });

// // Test Supabase connection
// app.get("/api/test-supabase", async (req, res) => {
//   try {
//     const { data, error } = await supabase.from("users").select("count");
    
//     if (error) {
//       throw error;
//     }
    
//     res.json({ message: "Supabase connection successful", data });
//   } catch (error) {
//     console.error("Supabase connection error:", error);
//     res.status(500).json({ message: "Supabase connection failed", error: error.message });
//   }
// });

// // Create a simple test endpoint to verify Supabase connection
// app.get("/api/test-events", async (req, res) => {
//   try {
//     // Test if events table exists and is accessible
//     const { data, error } = await supabase
//       .from('events')
//       .select('count');
      
//     if (error) {
//       throw error;
//     }
    
//     res.json({ success: true, data });
//   } catch (error) {
//     console.error('Error accessing events table:', error);
//     res.status(500).json({ error: error.message });
//   }
// });

// // Get all doctors endpoint
// app.get('/api/doctors', async (req, res) => {
//   try {
//     const { data, error } = await supabase
//       .from('users')
//       .select('id, name, role, degree, achievements')
//       .eq('role', 'doctor');  // Only get users with role 'doctor'
    
//     if (error) throw error;
    
//     console.log('Doctors fetched:', data.length);
//     res.json(data);
//   } catch (error) {
//     console.error('Error fetching doctors:', error);
//     res.status(500).json({ message: error.message });
//   }
// });

// // Get chat messages endpoint
// app.get('/api/messages/:roomId', async (req, res) => {
//   try {
//     const { roomId } = req.params;
//     const { data, error } = await supabase
//       .from('messages')
//       .select('*')
//       .eq('room_id', roomId)
//       .order('created_at', { ascending: false })
//       .limit(50);
    
//     if (error) throw error;
    
//     res.json(data);
//   } catch (error) {
//     console.error('Error fetching messages:', error);
//     res.status(500).json({ message: error.message });
//   }
// });

// // Add message via HTTP API (fallback method)
// app.post('/api/messages', async (req, res) => {
//   try {
//     const messageData = req.body;
//     console.log('Received message via HTTP:', messageData);
    
//     // Message validation
//     if (!messageData.content && messageData.text) {
//       messageData.content = messageData.text;
//     }
    
//     if (!messageData.sender_id && messageData.senderId) {
//       messageData.sender_id = messageData.senderId;
//     }
    
//     if (!messageData.sender_name && messageData.senderName) {
//       messageData.sender_name = messageData.senderName;
//     }
    
//     if (!messageData.receiver_id && messageData.receiverId) {
//       messageData.receiver_id = messageData.receiverId;
//     }
    
//     if (!messageData.room_id && messageData.roomId) {
//       messageData.room_id = messageData.roomId;
//     }
    
//     // Prepare the message object for insertion
//     const messageToInsert = {
//       content: messageData.content,
//       sender_id: messageData.sender_id,
//       sender_name: messageData.sender_name,
//       receiver_id: messageData.receiver_id,
//       room_id: messageData.room_id,
//       // created_at is handled automatically by Supabase
//     };
    
//     console.log('Inserting message into Supabase:', messageToInsert);
    
//     const { data, error } = await supabase
//       .from('messages')
//       .insert(messageToInsert)
//       .select();
    
//     if (error) throw error;
    
//     console.log('Message saved to Supabase via HTTP API:', data);
    
//     // Broadcast to room via socket for real-time updates
//     if (data && data.length > 0) {
//       const savedMessage = data[0];
      
//       const messageToEmit = {
//         id: savedMessage.id,
//         text: savedMessage.content,
//         content: savedMessage.content,
//         senderId: savedMessage.sender_id,
//         sender_id: savedMessage.sender_id,
//         senderName: savedMessage.sender_name,
//         sender_name: savedMessage.sender_name,
//         receiverId: savedMessage.receiver_id,
//         receiver_id: savedMessage.receiver_id,
//         timestamp: savedMessage.created_at,
//         created_at: savedMessage.created_at,
//         roomId: savedMessage.room_id,
//         room_id: savedMessage.room_id
//       };
      
//       io.to(savedMessage.room_id).emit('receive_message', messageToEmit);
      
//       res.status(201).json({
//         success: true,
//         message: 'Message saved successfully',
//         id: savedMessage.id
//       });
//     } else {
//       res.status(201).json({
//         success: true,
//         message: 'Message processed but no data returned'
//       });
//     }
//   } catch (error) {
//     console.error('Error saving message via HTTP:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to save message',
//       error: error.message
//     });
//   }
// });

// // Socket connection handling
// io.on('connection', (socket) => {
//   console.log('New client connected', socket.id);
  
//   socket.on('join_room', (roomId) => {
//     socket.join(roomId);
//     console.log(`User ${socket.id} joined room: ${roomId}`);
//   });

//   socket.on('send_message', async (messageData) => {
//     console.log('Message received:', messageData);
    
//     try {
//       // Insert message into Supabase
//       const { data, error } = await supabase
//         .from('messages')
//         .insert({
//           content: messageData.text,
//           sender_id: messageData.senderId,
//           sender_name: messageData.senderName,
//           receiver_id: messageData.receiverId,
//           room_id: messageData.roomId,
//           // created_at is handled automatically by Supabase
//         });
        
//       if (error) throw error;
      
//       console.log('Message saved to Supabase');
      
//       // Broadcast the message to the room
//       io.to(messageData.roomId).emit('receive_message', messageData);
//     } catch (error) {
//       console.error('Error saving message:', error);
//       // Still emit the message to not break the flow
//       io.to(messageData.roomId).emit('receive_message', messageData);
//     }
//   });

//   socket.on('disconnect', () => {
//     console.log('Client disconnected', socket.id);
//   });
// });

// // Setup Supabase realtime subscription to sync with Socket.io
// const setupSupabaseRealtimeSync = async () => {
//   // Use the admin client to access the realtime subscription
//   // This subscription will forward new messages to all connected clients
//   const client = supabaseAdmin || supabase;
  
//   const subscription = client
//     .channel('messages_changes')
//     .on('postgres_changes', 
//       { 
//         event: 'INSERT', 
//         schema: 'public', 
//         table: 'messages'
//       }, 
//       (payload) => {
//         // When a new message is inserted into Supabase
//         // convert it to the format expected by the client
//         const messageData = {
//           id: payload.new.id,
//           text: payload.new.content,
//           senderId: payload.new.sender_id,
//           senderName: payload.new.sender_name,
//           receiverId: payload.new.receiver_id,
//           timestamp: payload.new.created_at,
//           roomId: payload.new.room_id
//         };
        
//         // Emit to the appropriate room
//         io.to(messageData.roomId).emit('receive_message', messageData);
//       }
//     )
//     .subscribe();
    
//   console.log('Supabase realtime subscription established');
  
//   // Return subscription for cleanup
//   return subscription;
// };

// // Start the server
// const PORT = process.env.PORT || 5000;
// server.listen(PORT, async () => {
//   console.log(`Server running on port ${PORT}`);
  
//   // Setup realtime sync
//   const subscription = await setupSupabaseRealtimeSync();
  
//   // Handle graceful shutdown
//   process.on('SIGINT', () => {
//     console.log('Shutting down server...');
//     subscription.unsubscribe();
//     server.close();
//     process.exit(0);
//   });
// });
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const http = require('http');
const { Server } = require("socket.io");

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
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors());

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

// Get all doctors endpoint
app.get('/api/doctors', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, role, degree, achievements')
      .eq('role', 'doctor');  // Only get users with role 'doctor'
    
    if (error) throw error;
    
    console.log('Doctors fetched:', data.length);
    res.json(data);
  } catch (error) {
    console.error('Error fetching doctors:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get chat messages endpoint
app.get('/api/messages/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (error) throw error;
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ message: error.message });
  }
});

// Add message via HTTP API (fallback method)
app.post('/api/messages', async (req, res) => {
  try {
    const messageData = req.body;
    console.log('Received message via HTTP:', messageData);
    
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
      // created_at is handled automatically by Supabase
    };
    
    console.log('Inserting message into Supabase:', messageToInsert);
    
    const { data, error } = await supabase
      .from('messages')
      .insert(messageToInsert)
      .select();
    
    if (error) throw error;
    
    console.log('Message saved to Supabase via HTTP API:', data);
    
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
        room_id: savedMessage.room_id
      };
      
      io.to(savedMessage.room_id).emit('receive_message', messageToEmit);
      
      res.status(201).json({
        success: true,
        message: 'Message saved successfully',
        id: savedMessage.id
      });
    } else {
      res.status(201).json({
        success: true,
        message: 'Message processed but no data returned'
      });
    }
  } catch (error) {
    console.error('Error saving message via HTTP:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save message',
      error: error.message
    });
  }
});

// Socket connection handling
io.on('connection', (socket) => {
  console.log('New client connected', socket.id);
  
  socket.on('join_room', (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room: ${roomId}`);
  });

  socket.on('send_message', async (messageData) => {
    console.log('Message received via socket:', messageData);
    
    try {
      // Handle field name compatibility
      const messageToInsert = {
        content: messageData.content || messageData.text,
        sender_id: messageData.sender_id || messageData.senderId,
        sender_name: messageData.sender_name || messageData.senderName,
        receiver_id: messageData.receiver_id || messageData.receiverId,
        room_id: messageData.room_id || messageData.roomId,
        // created_at is handled automatically by Supabase
      };
      
      console.log('Inserting message into Supabase:', messageToInsert);
      
      // Insert message into Supabase
      const { data, error } = await supabase
        .from('messages')
        .insert(messageToInsert)
        .select();
      
      if (error) throw error;
      
      console.log('Message saved to Supabase:', data);
      
      // If data is returned, use the saved message data
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
          room_id: savedMessage.room_id
        };
        
        // Broadcast the message to the room
        io.to(savedMessage.room_id).emit('receive_message', messageToEmit);
      } else {
        // If no data returned (some Supabase configs may not return data on insert)
        // Just use the original message data to broadcast
        io.to(messageToInsert.room_id).emit('receive_message', {
          ...messageData,
          content: messageToInsert.content,
          sender_id: messageToInsert.sender_id,
          sender_name: messageToInsert.sender_name,
          receiver_id: messageToInsert.receiver_id,
          room_id: messageToInsert.room_id
        });
      }
    } catch (error) {
      console.error('Error saving message via socket:', error);
      // Emit error back to sender
      socket.emit('message_error', {
        success: false,
        message: 'Failed to save message',
        error: error.message
      });
    }
  });

  socket.on('typing', (data) => {
    // Forward typing indicator to the room
    socket.to(data.roomId || data.room_id).emit('user_typing', {
      userId: data.userId || data.user_id,
      userName: data.userName || data.user_name,
      roomId: data.roomId || data.room_id,
      isTyping: data.isTyping
    });
  });

  socket.on('leave_room', (roomId) => {
    socket.leave(roomId);
    console.log(`User ${socket.id} left room: ${roomId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected', socket.id);
  });
});

// Create a chat room API
app.post('/api/chat-rooms', async (req, res) => {
  try {
    const { name, user1_id, user2_id, type = 'direct' } = req.body;
    
    if (!user1_id || !user2_id) {
      return res.status(400).json({ 
        success: false, 
        message: 'Both users are required to create a chat room'
      });
    }
    
    // Check if room already exists between these users
    let roomId;
    const { data: existingRooms, error: roomError } = await supabase
      .from('chat_rooms')
      .select('*')
      .eq('type', 'direct')
      .or(`user1_id.eq.${user1_id},user1_id.eq.${user2_id}`)
      .or(`user2_id.eq.${user1_id},user2_id.eq.${user2_id}`);
    
    if (roomError) throw roomError;
    
    if (existingRooms && existingRooms.length > 0) {
      // Room exists - return existing room
      const existingRoom = existingRooms.find(
        room => (room.user1_id === user1_id && room.user2_id === user2_id) || 
               (room.user1_id === user2_id && room.user2_id === user1_id)
      );
      
      if (existingRoom) {
        return res.status(200).json({
          success: true,
          message: 'Chat room already exists',
          room: existingRoom
        });
      }
    }
    
    // Create new room
    const roomData = {
      name: name || `Chat between ${user1_id} and ${user2_id}`,
      user1_id,
      user2_id,
      type,
      created_at: new Date().toISOString()
    };
    
    const { data: newRoom, error: createError } = await supabase
      .from('chat_rooms')
      .insert(roomData)
      .select();
    
    if (createError) throw createError;
    
    res.status(201).json({
      success: true,
      message: 'Chat room created successfully',
      room: newRoom[0]
    });
  } catch (error) {
    console.error('Error creating chat room:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create chat room',
      error: error.message
    });
  }
});

// Get chat rooms for a user
app.get('/api/chat-rooms/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get rooms where user is either user1 or user2
    const { data, error } = await supabase
      .from('chat_rooms')
      .select(`
        *,
        user1:user1_id(id, name, role, avatar_url),
        user2:user2_id(id, name, role, avatar_url)
      `)
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);
    
    if (error) throw error;
    
    res.json({
      success: true,
      rooms: data
    });
  } catch (error) {
    console.error('Error fetching chat rooms:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chat rooms',
      error: error.message
    });
  }
});

// Get user profile data
app.get('/api/user-profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, role, avatar_url, degree, achievements, specialization, created_at')
      .eq('id', userId)
      .single();
    
    if (error) throw error;
    
    if (!data) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update user profile
app.put('/api/user-profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;
    
    // Remove sensitive fields that shouldn't be updated directly
    delete updates.id;
    delete updates.email;
    delete updates.created_at;
    
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select();
    
    if (error) throw error;
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: data[0]
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message
    });
  }
});

// Serve static assets in production
if (process.env.NODE_ENV === 'production') {
  // Set static folder
  const clientBuildPath = path.join(__dirname, '../client/build');
  
  if (fs.existsSync(clientBuildPath)) {
    app.use(express.static(clientBuildPath));
    
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, '../client', 'build', 'index.html'));
    });
  } else {
    console.warn('Client build folder not found.');
  }
}

// Set port
const PORT = process.env.PORT || 5000;

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
});

module.exports = { app, server }; // Export for testing