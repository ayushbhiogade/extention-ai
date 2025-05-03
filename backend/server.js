// backend/server.js
require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const cors = require('cors');
const { Firestore } = require('@google-cloud/firestore'); // <-- Add Firestore require
const { GoogleGenerativeAI } = require("@google/generative-ai"); // <-- Add Gemini AI require
const stripe = require('stripe'); // <-- Add Stripe require

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

// --- Stripe Initialization ---
if (!process.env.STRIPE_SECRET_KEY) {
    console.error('FATAL ERROR: STRIPE_SECRET_KEY is not set in .env file.');
    process.exit(1);
}
if (!process.env.STRIPE_PRICE_ID) {
    console.error('FATAL ERROR: STRIPE_PRICE_ID is not set in .env file.');
    process.exit(1);
}
const stripeClient = stripe(process.env.STRIPE_SECRET_KEY);
console.log('Stripe initialized.');
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
// IMPORTANT: Stripe webhook endpoint needs raw body, so define it BEFORE express.json()
app.post('/api/stripe-webhook', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !webhookSecret) {
        console.error('Webhook error: Missing signature or secret.');
        return res.status(400).send('Webhook Error: Missing signature or secret.');
    }

    let event;

    try {
        event = stripeClient.webhooks.constructEvent(req.body, sig, webhookSecret);
        // console.log('Stripe webhook event received:', event.type);
    } catch (err) {
        console.error(`Webhook signature verification failed: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const userId = session.client_reference_id;
                // Retrieve subscription details to get end date if needed
                // For simplicity, we assume immediate access upon completion
                // A more robust approach might fetch the subscription object from Stripe
                console.log(`Checkout session completed for user ${userId}`);
                // Note: Stripe subscriptions might have a delay before becoming 'active'
                // We'll assume active on completion for now, but check subscription status below.
                // We might not get an end date directly here, depends on subscription setup
                // Let's just mark as subscribed for now. The subscription events will handle status.
                await updateUserSubscription(userId, true, null); // Mark as subscribed, null end date initially
                break;
            }
            case 'customer.subscription.updated': {
                const subscription = event.data.object;
                const userId = subscription.metadata.userId || subscription.client_reference_id; // Get userId if stored in metadata, fallback to client_ref
                 if (!userId) {
                    console.error('Webhook Error: Could not find userId in customer.subscription.updated event.');
                    break; // Skip processing if no user ID
                }
                const status = subscription.status === 'active';
                const endDate = subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null;
                console.log(`Subscription updated for user ${userId}: Status=${subscription.status}, EndDate=${endDate}`);
                await updateUserSubscription(userId, status, endDate);
                break;
            }
            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                 const userId = subscription.metadata.userId || subscription.client_reference_id;
                 if (!userId) {
                    console.error('Webhook Error: Could not find userId in customer.subscription.deleted event.');
                    break;
                }
                console.log(`Subscription deleted for user ${userId}`);
                await updateUserSubscription(userId, false, null);
                break;
            }
            // ... handle other event types as needed (e.g., payment_failed)
            default:
                console.log(`Unhandled Stripe event type ${event.type}`);
        }
    } catch (handlerError) {
        console.error(`Error handling webhook event ${event.id}:`, handlerError);
        // Return 500, but Stripe might retry if it sees non-200
        // Consider specific error handling or always returning 200 if the error is non-critical
        return res.status(500).json({ error: 'Webhook handler failed' });
    }

    // Return a 200 response to acknowledge receipt of the event
    res.status(200).json({ received: true });
});

// Enable CORS - Adjust origin later for security
app.use(cors({ origin: '*' })); // Allow all origins for now during development

// Parse JSON request bodies (for other routes)
app.use(express.json());

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

// POST /api/create-checkout-session
app.post('/api/create-checkout-session', async (req, res) => {
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ error: true, reason: 'bad_request', message: 'Missing required field: userId' });
    }

    // Define URLs - replace with your actual frontend URLs once deployed or setup
    // For local testing, you might point success back to the extension or a simple localhost page
    const successUrl = process.env.STRIPE_SUCCESS_URL || 'http://localhost:8080/success.html'; // Placeholder
    const cancelUrl = process.env.STRIPE_CANCEL_URL || 'http://localhost:8080/cancel.html';   // Placeholder

    try {
        console.log(`Creating checkout session for user ${userId}...`);
        const session = await stripeClient.checkout.sessions.create({
            mode: 'subscription',
            line_items: [
                {
                    price: process.env.STRIPE_PRICE_ID,
                    quantity: 1,
                },
            ],
            success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: cancelUrl,
            client_reference_id: userId, // Pass userId to identify user in webhook
            // subscription_data: { // Optional: set trial period if desired
            //   trial_period_days: 14
            // }
        });

        console.log(`Checkout session created for user ${userId}, URL: ${session.url}`);
        return res.json({ error: false, url: session.url });

    } catch (error) {
        console.error(`Error creating Stripe checkout session for user ${userId}:`, error);
        return res.status(500).json({ error: true, reason: 'stripe_error', message: 'Failed to create checkout session.' });
    }
});

// --- Start Server ---
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
