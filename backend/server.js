// backend/server.js
require('dotenv').config({ path: require('path').join(__dirname, '.env') }); // Load environment variables from .env file
const express = require('express');
const cors = require('cors');
const { Firestore } = require('@google-cloud/firestore'); // <-- Add Firestore require
const { GoogleGenerativeAI } = require("@google/generative-ai"); // <-- Add Gemini AI require
const Razorpay = require('razorpay'); // <-- Add Razorpay require
const crypto = require('crypto'); // <-- Add crypto for webhook signature verification

// --- Firestore Initialization ---
const db = new Firestore(); // Automatically uses GOOGLE_APPLICATION_CREDENTIALS from .env
const usersCollection = db.collection('users'); // Define the collection we'll use
console.log('Firestore initialized.');
// ------

// --- Gemini AI Initialization ---
if (!process.env.GEMINI_API_KEY) {
    console.error('FATAL ERROR: GEMINI_API_KEY is not set in .env file.');
    process.exit(1); // Stop the server if the key is missing
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash"}); // Or your preferred model
console.log('Gemini AI initialized.');
// ------

// --- Razorpay Initialization ---
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    console.error('FATAL ERROR: RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set in .env file.');
    process.exit(1);
}
if (!process.env.RAZORPAY_PLAN_ID) {
    console.error('FATAL ERROR: RAZORPAY_PLAN_ID is not set in .env file.');
    process.exit(1);
}
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});
console.log('Razorpay initialized.');
// ------

// --- Firestore Helper Functions ---

/**
 * Gets user data from Firestore or creates a new user if they don't exist.
 * @param {string} userId The unique ID for the user.
 * @returns {Promise<object>} The user data object.
 */
async function getUser(userId) {
    if (!userId) {
        throw new Error('User ID is required.');
    }
    const userRef = usersCollection.doc(userId);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
        console.log(`User ${userId} not found, creating new user.`);
        const newUser = {
            userId: userId,
            usageCount: 0,
            isSubscribed: false,
            subscriptionEndDate: null,
            createdAt: Firestore.FieldValue.serverTimestamp()
        };
        await userRef.set(newUser);
        return newUser;
    } else {
        // console.log(`User ${userId} found.`);
        return userSnap.data();
    }
}

/**
 * Increments the usage count for a user.
 * @param {string} userId The unique ID for the user.
 */
async function updateUserUsage(userId) {
    if (!userId) {
        throw new Error('User ID is required.');
    }
    const userRef = usersCollection.doc(userId);
    try {
        await userRef.update({
            usageCount: Firestore.FieldValue.increment(1)
        });
        // console.log(`Usage count updated for user ${userId}.`);
    } catch (error) {
        console.error(`Error updating usage count for user ${userId}:`, error);
        // Decide if we should re-throw or handle differently
        throw error;
    }
}

/**
 * Updates the subscription status and end date for a user.
 * @param {string} userId The unique ID for the user.
 * @param {boolean} status The new subscription status (true = subscribed).
 * @param {Date | null} endDate The subscription end date (or null if not applicable).
 */
async function updateUserSubscription(userId, status, endDate) {
    if (!userId) {
        throw new Error('User ID is required.');
    }
    const userRef = usersCollection.doc(userId);
    try {
        await userRef.update({
            isSubscribed: status,
            subscriptionEndDate: endDate ? Firestore.Timestamp.fromDate(new Date(endDate)) : null // Store as Firestore Timestamp
        });
        console.log(`Subscription status updated for user ${userId}: Subscribed=${status}, EndDate=${endDate}`);
    } catch (error) {
        console.error(`Error updating subscription for user ${userId}:`, error);
        throw error;
    }
}

// ------

const app = express();
const port = process.env.PORT || 3000;

// --- Middleware ---
// IMPORTANT: Razorpay webhook endpoint needs raw body, so define it BEFORE express.json()
app.post('/api/razorpay-webhook', express.raw({type: 'application/json'}), async (req, res) => {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const shasum = crypto.createHmac('sha256', webhookSecret);
    shasum.update(JSON.stringify(req.body));
    const digest = shasum.digest('hex');

    if (digest !== req.headers['x-razorpay-signature']) {
        console.error('Invalid webhook signature');
        return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    const event = req.body;

    try {
        switch (event.event) {
            case 'subscription.authenticated': {
                const subscription = event.payload.subscription.entity;
                const userId = subscription.notes.userId; // We'll add this when creating subscription
                if (!userId) {
                    console.error('No userId found in subscription.');
                    return res.status(400).json({ error: 'Missing userId in subscription' });
                }
                console.log(`Subscription authenticated for user ${userId}`);
                await updateUserSubscription(userId, true, null);
                break;
            }
            case 'subscription.charged': {
                const subscription = event.payload.subscription.entity;
                const userId = subscription.notes.userId;
                if (!userId) {
                    console.error('No userId found in subscription charge.');
                    return res.status(400).json({ error: 'Missing userId in subscription' });
                }
                const endDate = new Date();
                endDate.setMonth(endDate.getMonth() + 1); // Add one month to current date
                
                console.log(`Subscription charged for user ${userId}, valid until ${endDate}`);
                await updateUserSubscription(userId, true, endDate);
                break;
            }
            case 'subscription.cancelled': {
                const subscription = event.payload.subscription.entity;
                const userId = subscription.notes.userId;
                if (!userId) {
                    console.error('No userId found in subscription cancellation.');
                    return res.status(400).json({ error: 'Missing userId in subscription' });
                }
                console.log(`Subscription cancelled for user ${userId}`);
                await updateUserSubscription(userId, false, null);
                break;
            }
            default:
                console.log(`Unhandled Razorpay event: ${event.event}`);
        }
    } catch (handlerError) {
        console.error(`Error handling webhook event:`, handlerError);
        return res.status(500).json({ error: 'Webhook handler failed' });
    }

    res.status(200).json({ received: true });
});

// Enable CORS - More secure configuration
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, curl requests)
    if (!origin) return callback(null, true);
    
    // List of allowed origins
    const allowedOrigins = [
      'chrome-extension://*',  // Chrome extension
      'http://localhost:3000', // Local development
      'https://ai-qa-extension-backend.onrender.com' // Render deployment URL (update this)
    ];
    
    // Check if origin is allowed
    let isAllowed = false;
    for (const pattern of allowedOrigins) {
      if (pattern === '*' || pattern === origin || 
          (pattern.endsWith('*') && origin.startsWith(pattern.slice(0, -1)))) {
        isAllowed = true;
        break;
      }
    }
    
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed for this origin'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true
}));

// Parse JSON request bodies (for other routes)
app.use(express.json());

// Serve static files (like test-payment.html)
app.use(express.static(__dirname)); // Serve static files from the backend directory

// --- Routes ---
app.get('/', (req, res) => {
  res.send('AI Q&A Backend is running!');
});

// --- API Endpoints ---

// POST /api/query
app.post('/api/query', async (req, res) => {
    const { question, pageContent, userId } = req.body;

    // Basic Input Validation
    if (!question || !pageContent || !userId) {
        return res.status(400).json({ error: true, reason: 'bad_request', message: 'Missing required fields: question, pageContent, userId' });
    }

    try {
        // 1. Get/Create User
        const user = await getUser(userId);

        // 2. Check Limits
        const freeUsageLimit = 5;
        const isAllowed = user.isSubscribed || user.usageCount < freeUsageLimit;

        if (!isAllowed) {
            console.log(`User ${userId} limit reached (Usage: ${user.usageCount}, Subscribed: ${user.isSubscribed})`);
            return res.status(403).json({ error: true, reason: 'limit_reached' });
        }

        // 3. Call Gemini API
        console.log(`Processing query for user ${userId}...`);
        // Basic prompt - consider adding more instructions or formatting
        const prompt = `Based *only* on the following webpage content, answer the user's question.

Webpage Content:
---
${pageContent}
---

User Question: ${question}

Answer:`;

        let aiResponseText = '';
        try {
            // Limit context size if necessary (simple truncation here, could be smarter)
            const maxContentLength = 10000; // Example limit, adjust as needed
            const truncatedContent = pageContent.length > maxContentLength 
                ? pageContent.substring(0, maxContentLength) + '... [Content Truncated]' 
                : pageContent;
                
            const effectivePrompt = `Based *only* on the following webpage content, answer the user's question.

Webpage Content:
---
${truncatedContent}
---

User Question: ${question}

Answer:`;

            const result = await model.generateContent(effectivePrompt);
            const response = await result.response;
            aiResponseText = await response.text();
            console.log(`User ${userId} - AI response received.`);

        } catch (aiError) {
            console.error(`Gemini API error for user ${userId}:`, aiError);
            return res.status(500).json({ error: true, reason: 'ai_error', message: 'Failed to get response from AI model.' });
        }

        // 4. Update Usage (if successful & not subscribed)
        if (!user.isSubscribed) {
            try {
                await updateUserUsage(userId);
            } catch (usageUpdateError) {
                // Log the error but still return the AI response to the user
                console.error(`Failed to update usage count for user ${userId} after successful query:`, usageUpdateError);
            }
        }

        // 5. Send Response
        return res.json({ error: false, answer: aiResponseText });

    } catch (error) {
        console.error(`Error in /api/query for user ${userId}:`, error);
        // Differentiate between known errors (like getUser failure) and unexpected ones
        if (error.message.includes('User ID is required')) {
             return res.status(400).json({ error: true, reason: 'bad_request', message: error.message });
        }
        // Generic server error for other issues
        return res.status(500).json({ error: true, reason: 'server_error', message: 'An internal server error occurred.' });
    }
});

// POST /api/create-subscription (Original subscription creation endpoint)
app.post('/api/create-subscription', async (req, res) => {
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ error: true, reason: 'bad_request', message: 'Missing required field: userId' });
    }

    try {
        console.log(`Creating subscription for user ${userId}...`);
        const subscription = await razorpay.subscriptions.create({
            plan_id: process.env.RAZORPAY_PLAN_ID,
            customer_notify: 1,
            quantity: 1,
            notes: {
                userId: userId // This will be available in webhooks
            },
            total_count: 12 // Number of billing cycles (12 for yearly with monthly billing)
        });

        console.log(`Subscription created for user ${userId}, ID: ${subscription.id}`);
        return res.json({
            error: false,
            key: process.env.RAZORPAY_KEY_ID,
            subscription_id: subscription.id,
            amount: subscription.amount,
            currency: subscription.currency
        });
    } catch (error) {
        console.error(`Error creating Razorpay subscription for user ${userId}:`, error);
        return res.status(500).json({ error: true, reason: 'razorpay_error', message: 'Failed to create subscription.' });
    }
});

// POST /api/create-payment-url (Production Razorpay integration)
app.post('/api/create-payment-url', async (req, res) => {
    const { userId } = req.body;
    const amount = 499; // ₹499

    if (!userId) {
        return res.status(400).json({ error: true, reason: 'bad_request', message: 'Missing required field: userId' });
    }

    try {
        console.log(`Creating Razorpay order for user ${userId}...`);
        console.log('Razorpay Key ID from env:', process.env.RAZORPAY_KEY_ID);
        
        // Create an actual Razorpay order
        const order = await razorpay.orders.create({
            amount: amount * 100, // Amount in paise (Razorpay expects amount in smallest currency unit)
            currency: "INR",
            receipt: `rcpt_${Date.now().toString().slice(-10)}`,
            notes: { userId: userId } // Store userId in notes for webhook reference
        });
        
        console.log(`Razorpay order created for user ${userId}, order ID: ${order.id}`);
        
        // For testing purposes, directly use the key value
        // We know this key exists in the .env file
        const hardcodedKey = 'rzp_test_WGOahmp6PoxG8q';
        console.log('Using hardcoded Razorpay Key ID:', hardcodedKey);
        
        return res.json({
            error: false,
            key: hardcodedKey, // Use the hardcoded key temporarily
            order_id: order.id,
            amount: order.amount,
            currency: order.currency
        });
    } catch (error) {
        console.error(`Error creating Razorpay order for user ${userId}:`, error);
        return res.status(500).json({ error: true, reason: 'razorpay_error', message: 'Failed to create Razorpay order.' });
    }
});

// POST /api/verify-payment (Verify Razorpay payment)
app.post('/api/verify-payment', async (req, res) => {
    const { payment_id, order_id, signature } = req.body;
    
    if (!payment_id || !order_id || !signature) {
        return res.status(400).json({ success: false, message: 'Missing required payment verification details' });
    }
    
    try {
        // Create a signature verification data string
        const body = order_id + "|" + payment_id;
        
        // Get the secret key
        const secret = process.env.RAZORPAY_KEY_SECRET;
        
        // Create the expected signature
        const expectedSignature = crypto
            .createHmac("sha256", secret)
            .update(body.toString())
            .digest("hex");
            
        // Compare the signatures
        const isValid = expectedSignature === signature;
        
        if (isValid) {
            console.log(`Payment verification successful for payment ${payment_id}`);
            
            try {
                // Fetch order to get user ID from notes
                const order = await razorpay.orders.fetch(order_id);
                const userId = order.notes.userId;
                
                if (!userId) {
                    console.error('No userId found in order notes');
                    return res.status(400).json({ success: false, message: 'User ID not found in order' });
                }
                
                // Set subscription end date (1 month from now)
                const endDate = new Date();
                endDate.setMonth(endDate.getMonth() + 1);
                
                // Update user subscription status
                await updateUserSubscription(userId, true, endDate);
                
                return res.json({
                    success: true,
                    message: 'Payment verified and subscription activated'
                });
            } catch (orderError) {
                console.error('Error processing order after verification:', orderError);
                return res.status(500).json({ success: false, message: 'Error processing subscription after payment' });
            }
        } else {
            console.error(`Payment signature verification failed for payment ${payment_id}`);
            return res.status(400).json({ success: false, message: 'Payment verification failed' });
        }
    } catch (error) {
        console.error(`Error verifying payment:`, error);
        return res.status(500).json({ success: false, message: 'Server error during payment verification' });
    }
});

// GET /api/check-payment-status
app.get('/api/check-payment-status', async (req, res) => {
    const { paymentId } = req.query;
    
    if (!paymentId) {
        return res.status(400).json({ error: true, reason: 'bad_request', message: 'Missing required field: paymentId' });
    }
    
    try {
        // In production, you would check Razorpay's API for the payment status
        // For now, we'll just return a mocked successful status
        return res.json({
            status: 'pending',
            message: 'Payment is being processed.'
        });
        
        // Once you implement real payment verification, you would do something like:
        // const payment = await razorpay.payments.fetch(paymentId);
        // return res.json({
        //     status: payment.status === 'captured' ? 'successful' : 'pending',
        //     message: payment.status === 'captured' ? 'Payment completed successfully' : 'Payment is being processed.'
        // });
    } catch (error) {
        console.error(`Error checking payment status for ID ${paymentId}:`, error);
        return res.status(500).json({ error: true, status: 'error', message: 'Failed to check payment status.' });
    }
});

// POST /api/simulate-payment-success - Endpoint to handle test payments
app.post('/api/simulate-payment-success', async (req, res) => {
    const { userId } = req.body;
    
    if (!userId) {
        return res.status(400).json({ success: false, message: 'Missing required field: userId' });
    }
    
    try {
        console.log(`Simulating successful payment for user ${userId}...`);
        
        // Calculate subscription end date (1 month from now)
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 1);
        
        // Update user subscription status
        await updateUserSubscription(userId, true, endDate);
        
        console.log(`User ${userId} subscription updated successfully. Valid until: ${endDate}`);
        return res.json({ success: true, message: 'Payment successful', endDate });
    } catch (error) {
        console.error(`Error simulating payment for user ${userId}:`, error);
        return res.status(500).json({ success: false, message: 'Failed to update subscription.' });
    }
});

// Temporary endpoint for testing - remove in production
app.post('/api/reset-subscription', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: true, message: 'User ID is required' });
    }
    
    await updateUserSubscription(userId, false, null);
    
    res.json({ 
      success: true, 
      message: 'Subscription reset successfully. User is now in free tier.',
      userId: userId
    });
  } catch (error) {
    console.error('Error in reset-subscription endpoint:', error);
    res.status(500).json({ error: true, message: 'Failed to reset subscription', details: error.message });
  }
});

// POST /api/create-payment-url - Create a new Razorpay order
app.post('/api/create-payment-url', async (req, res) => {
    const { userId } = req.body;
    
    if (!userId) {
        return res.status(400).json({ error: true, message: 'User ID is required' });
    }

    try {
        // Create a new order
        const amount = 499; // ₹499 per month
        const order = await razorpay.orders.create({
            amount: amount * 100, // Amount in paise
            currency: 'INR',
            receipt: `rcpt_${Date.now().toString().slice(-10)}`,
            notes: { userId: userId }
        });

        // Return the order details and Razorpay key
        return res.json({
            error: false,
            key: process.env.RAZORPAY_KEY_ID, // Send the key ID for client-side initialization
            amount: order.amount,
            currency: order.currency,
            order_id: order.id
        });
    } catch (error) {
        console.error('Error creating Razorpay order:', error);
        return res.status(500).json({
            error: true,
            message: 'Failed to create payment order',
            details: error.message
        });
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
