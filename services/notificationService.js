const admin = require('firebase-admin');
const { supabase } = require('../config/supabase');

// Initialize Firebase Admin if not already initialized
let firebaseAdmin;
try {
  firebaseAdmin = admin.app();
} catch (e) {
  // Use environment variables instead of service account JSON file
  const firebaseConfig = {
    type: 'service_account',
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI,
    token_uri: process.env.FIREBASE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL,
    client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL
  };

  firebaseAdmin = admin.initializeApp({
    credential: admin.credential.cert(firebaseConfig)
  });
}

const notificationService = {
  // Send to specific user
  async sendToUser(userId, title, body, data = {}) {
    try {
      console.log(`Sending notification to user: ${userId}`);
      
      // Get user's FCM tokens
      const { data: tokens, error } = await supabase
        .from('user_fcm_tokens')
        .select('fcm_token')
        .eq('user_id', userId);

      if (error) {
        console.error('Error fetching FCM tokens:', error);
        return;
      }

      if (!tokens || tokens.length === 0) {
        console.log(`No FCM tokens found for user ${userId}`);
        return;
      }

      const fcmTokens = tokens.map(t => t.fcm_token);
      console.log(`Found ${fcmTokens.length} FCM tokens for user`);
      
      return this.sendToTokens(fcmTokens, title, body, data);
    } catch (error) {
      console.error('Error sending notification to user:', error);
    }
  },

  // Send to multiple users
  async sendToUsers(userIds, title, body, data = {}) {
    try {
      console.log(`Sending notifications to ${userIds.length} users`);
      
      // Get tokens for multiple users
      const { data: tokens, error } = await supabase
        .from('user_fcm_tokens')
        .select('fcm_token')
        .in('user_id', userIds);

      if (error) {
        console.error('Error fetching FCM tokens:', error);
        return;
      }

      if (!tokens || tokens.length === 0) {
        console.log('No FCM tokens found for users');
        return;
      }

      const fcmTokens = tokens.map(t => t.fcm_token);
      console.log(`Found ${fcmTokens.length} FCM tokens for users`);
      
      return this.sendToTokens(fcmTokens, title, body, data);
    } catch (error) {
      console.error('Error sending notification to users:', error);
    }
  },

  // Send to users with a specific role
  async sendToRole(role, title, body, data = {}) {
    try {
      console.log(`Sending notifications to role: ${role}`);
      
      // Get users with the role
      const { data: users, error } = await supabase
        .from('users')
        .select('id')
        .eq('role', role);

      if (error) {
        console.error('Error fetching users by role:', error);
        return;
      }

      if (!users || users.length === 0) {
        console.log(`No users found with role ${role}`);
        return;
      }

      const userIds = users.map(u => u.id);
      console.log(`Found ${userIds.length} users with role ${role}`);
      
      return this.sendToUsers(userIds, title, body, data);
    } catch (error) {
      console.error('Error sending notification to role:', error);
    }
  },

  // Send to tokens using compatible approach for Firebase Admin
  async sendToTokens(tokens, title, body, data = {}) {
    if (!tokens || tokens.length === 0) return;

    const message = {
      notification: {
        title,
        body,
      },
      data: {
        ...data,
        title: String(title),
        body: String(body),
      },
    };

    try {
      let successCount = 0;
      let failureCount = 0;
      const failedTokens = [];

      // Send messages individually to each token
      for (const token of tokens) {
        try {
          const messageWithToken = {
            ...message,
            token: token
          };
          
          await admin.messaging().send(messageWithToken);
          successCount++;
        } catch (error) {
          console.error(`Error sending to token: ${token.substring(0, 10)}...`, error.message);
          failureCount++;
          failedTokens.push(token);
        }
      }

      console.log(`Sent notifications: ${successCount} successful, ${failureCount} failed`);
      
      // Remove invalid tokens
      if (failedTokens.length > 0) {
        await this.removeInvalidTokens(failedTokens);
      }
      
      return { successCount, failureCount };
    } catch (error) {
      console.error('Error sending notifications:', error);
    }
  },
  
  // Remove invalid tokens
  async removeInvalidTokens(tokens) {
    try {
      console.log(`Removing ${tokens.length} invalid tokens`);
      
      const { error } = await supabase
        .from('user_fcm_tokens')
        .delete()
        .in('fcm_token', tokens);
        
      if (error) {
        console.error('Error removing invalid tokens:', error);
      }
    } catch (error) {
      console.error('Error removing invalid tokens:', error);
    }
  }
};

module.exports = notificationService;