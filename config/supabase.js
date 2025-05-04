// const { createClient } = require('@supabase/supabase-js');
// const dotenv = require('dotenv');

// dotenv.config();

// const supabaseUrl = process.env.SUPABASE_URL;
// const supabaseKey = process.env.SUPABASE_KEY;
// const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

// if (!supabaseUrl || !supabaseKey) {
//   console.error('Missing Supabase credentials!');
//   process.exit(1);
// }

// // Regular client for normal operations
// const supabase = createClient(supabaseUrl, supabaseKey);

// // Admin client that bypasses RLS
// const supabaseAdmin = supabaseServiceKey 
//   ? createClient(supabaseUrl, supabaseServiceKey)
//   : null;

// module.exports = { supabase, supabaseAdmin };
// //module.exports = { supabase};
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Get Supabase credentials from environment variables
const supabaseUrl = process.env.SUPABASE_URL;
// Note: Changed from SUPABASE_KEY to SUPABASE_ANON_KEY for clarity
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

// Validate required credentials
if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_ANON_KEY/SUPABASE_KEY must be defined in .env file');
  process.exit(1);
}

// Regular client for normal operations (respects Row Level Security)
const supabase = createClient(supabaseUrl, supabaseKey);

// Admin client with service role that bypasses Row Level Security
// This is needed for some operations like realtime subscriptions
let supabaseAdmin = null;
if (supabaseServiceKey) {
  supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
} else {
  console.warn('Warning: SUPABASE_SERVICE_KEY not found. Realtime features may be limited.');
}

// Export both clients
module.exports = { supabase, supabaseAdmin };