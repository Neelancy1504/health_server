const admin = require("firebase-admin");
const { supabase } = require("../config/supabase");

// Initialize Firebase Admin if not already initialized
let firebaseAdmin;
try {
  firebaseAdmin = admin.app();
} catch (e) {
  // Use environment variables instead of service account JSON file
  const firebaseConfig = {
    type: "service_account",
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI,
    token_uri: process.env.FIREBASE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL,
    client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
  };

  firebaseAdmin = admin.initializeApp({
    credential: admin.credential.cert(firebaseConfig),
  });
}

const notificationService = {
  // Generate UUID helper
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },

  // Save notification to database
  async saveNotificationToDatabase(userId, title, body, data = {}) {
    try {
      const cleanUserId = String(userId).trim();

      // Basic validation
      if (!cleanUserId || !title || !body) {
        const errorMsg = `Missing required fields: userId=${cleanUserId}, title=${title}, body=${body}`;
        console.error("❌ Basic validation failed:", errorMsg);
        throw new Error(errorMsg);
      }

      // Create notification record
      const notificationRecord = {
        id: this.generateUUID(),
        user_id: cleanUserId,
        title: String(title),
        body: String(body),
        data: data || {},
        read: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      console.log("💾 Saving notification to database:", {
        userId: cleanUserId,
        title,
        body,
        data
      });

      // Insert into database
      const { data: result, error } = await supabase
        .from("notifications")
        .insert(notificationRecord)
        .select("*");

      if (error) {
        console.error("❌ Database insertion error:", error);
        throw error;
      }

      if (!result || result.length === 0) {
        const errorMsg = "❌ Notification insert returned no data";
        console.error(errorMsg);
        throw new Error(errorMsg);
      }

      console.log("✅ Notification saved successfully:", result[0]);
      return result[0];
    } catch (error) {
      console.error("❌ Error saving notification to database:", error);
      throw error;
    }
  },

  // Send to specific user
  async sendToUser(userId, title, body, data = {}) {
    try {
      // Check for recent duplicate notifications
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      
      const { data: recentNotifications } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', userId)
        .eq('title', title)
        .eq('body', body)
        .gte('created_at', fiveMinutesAgo);

      // Skip if duplicate found within 5 minutes
      if (recentNotifications && recentNotifications.length > 0) {
        console.log(`⏭️ Skipping duplicate notification for user ${userId} (sent within 5 minutes)`);
        return;
      }

      console.log(`Sending notification to user: ${userId}`);

      // Always save to database first
      await this.saveNotificationToDatabase(userId, title, body, data);

      // Get user's FCM tokens
      const { data: tokens, error } = await supabase
        .from("user_fcm_tokens")
        .select("fcm_token")
        .eq("user_id", userId);

      if (error) {
        console.error("Error fetching FCM tokens:", error);
        return;
      }

      if (!tokens || tokens.length === 0) {
        console.log(`No FCM tokens found for user ${userId}`);
        return;
      }

      const fcmTokens = tokens.map((t) => t.fcm_token);
      console.log(`Found ${fcmTokens.length} FCM tokens for user`);

      return this.sendToTokens(fcmTokens, title, body, data);
    } catch (error) {
      console.error("Error sending notification to user:", error);
    }
  },

  // Send to multiple users
  async sendToUsers(userIds, title, body, data = {}) {
    try {
      console.log(`Sending notifications to ${userIds.length} users`);

      // Save to database for each user
      for (const userId of userIds) {
        await this.saveNotificationToDatabase(userId, title, body, data);
      }

      // Get tokens for multiple users
      const { data: tokens, error } = await supabase
        .from("user_fcm_tokens")
        .select("fcm_token")
        .in("user_id", userIds);

      if (error) {
        console.error("Error fetching FCM tokens:", error);
        return;
      }

      if (!tokens || tokens.length === 0) {
        console.log("No FCM tokens found for users");
        return;
      }

      const fcmTokens = tokens.map((t) => t.fcm_token);
      console.log(`Found ${fcmTokens.length} FCM tokens for users`);

      return this.sendToTokens(fcmTokens, title, body, data);
    } catch (error) {
      console.error("Error sending notification to users:", error);
    }
  },

  // Send to users with a specific role
  async sendToRole(role, title, body, data = {}) {
    try {
      console.log(`📬 sendToRole called for role: ${role}`);

      // Get users with the role
      const { data: users, error } = await supabase
        .from("users")
        .select("id, email, name")
        .eq("role", role);

      if (error) {
        console.error("Error fetching users by role:", error);
        return;
      }

      if (!users || users.length === 0) {
        console.log(`No users found with role ${role}`);
        return;
      }

      console.log(`📊 Found ${users.length} users with role ${role}`);
      console.log("📊 Users:", users);

      // Check for recent duplicate notifications to prevent spam
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      
      for (const user of users) {
        // Check if user already received same notification recently
        const { data: recentNotifications } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', user.id)
          .eq('title', title)
          .eq('body', body)
          .gte('created_at', oneHourAgo);

        // Skip if duplicate found within last hour
        if (recentNotifications && recentNotifications.length > 0) {
          console.log(`⏭️ Skipping duplicate notification for user ${user.id}`);
          continue;
        }

        // Send notification if no recent duplicate
        await this.sendToUser(user.id, title, body, data);
      }
    } catch (error) {
      console.error("Error sending notification to role:", error);
    }
  },

  // Send to all users
  async sendToAll(title, body, data = {}) {
    try {
      console.log("Sending notifications to all users");

      // Get all users
      const { data: users, error } = await supabase
        .from("users")
        .select("id");

      if (error) {
        console.error("Error fetching all users:", error);
        return;
      }

      if (!users || users.length === 0) {
        console.log("No users found");
        return;
      }

      // Save notification to database for each user
      for (const user of users) {
        await this.saveNotificationToDatabase(user.id, title, body, data);
      }

      // Send FCM notifications
      const userIds = users.map((u) => u.id);
      return this.sendToUsers(userIds, title, body, data);
    } catch (error) {
      console.error("Error sending notification to all users:", error);
    }
  },

  // Send to tokens using compatible approach for Firebase Admin
  async sendToTokens(tokens, title, body, data = {}) {
    if (!tokens || tokens.length === 0) {
      console.log("❌ No tokens provided to sendToTokens");
      return;
    }

    try {
      // Log the full notification payload for debugging
      console.log("📬 Attempting to send notification:");
      console.log("- Title:", title);
      console.log("- Body:", body);
      console.log("- Data:", JSON.stringify(data, null, 2));
      console.log("- Tokens count:", tokens.length);
      console.log(
        "- First token (partial):",
        tokens[0]?.substring(0, 15) + "..."
      );

      // Create a properly structured message for background notifications
      const message = {
        notification: {
          title,
          body,
        },
        data: {
          ...data,
          // Convert all values to strings for FCM compatibility
          title: String(title),
          body: String(body),
          type: String(data.type || "notification"),
          action: String(data.action || "view"),
          id: String(data.id || ""),
          click_action: "FLUTTER_NOTIFICATION_CLICK",
        },
        android: {
          priority: "high",
          notification: {
            channel_id: "default_notifications",
            priority: "high",
            default_sound: true,
            default_vibrate_timings: true,
          },
        },
        apns: {
          payload: {
            aps: {
              contentAvailable: true,
              sound: "default",
              badge: 1,
              category: "notification",
            },
          },
        },
      };

      // Log the full message structure
      console.log(
        "📦 Full FCM message payload:",
        JSON.stringify(message, null, 2)
      );

      let successCount = 0;
      let failureCount = 0;
      const failedTokens = [];

      // Send messages individually to each token
      for (const token of tokens) {
        try {
          const messageWithToken = {
            ...message,
            token: token,
          };

          console.log(`📤 Sending to token: ${token.substring(0, 10)}...`);
          const response = await admin.messaging().send(messageWithToken);
          console.log(`✅ Successfully sent message to token: ${response}`);
          successCount++;
        } catch (error) {
          console.error(
            `❌ Error sending to token: ${token.substring(0, 10)}...`,
            error.message
          );
          if (error.code) {
            console.error(`Error code: ${error.code}`);
          }
          failureCount++;
          failedTokens.push(token);
        }
      }

      console.log(
        `📊 Notification summary: ${successCount} successful, ${failureCount} failed`
      );

      if (failedTokens.length > 0) {
        console.log(`🧹 Removing ${failedTokens.length} invalid tokens`);
        await this.removeInvalidTokens(failedTokens);
      }

      return { successCount, failureCount };
    } catch (error) {
      console.error("❌ Critical error in sendToTokens:", error);
      if (error.stack) {
        console.error(error.stack);
      }
    }
  },

  // Remove invalid tokens
  async removeInvalidTokens(tokens) {
    try {
      console.log(`Removing ${tokens.length} invalid tokens`);

      const { error } = await supabase
        .from("user_fcm_tokens")
        .delete()
        .in("fcm_token", tokens);

      if (error) {
        console.error("Error removing invalid tokens:", error);
      }
    } catch (error) {
      console.error("Error removing invalid tokens:", error);
    }
  },
};

module.exports = notificationService;
