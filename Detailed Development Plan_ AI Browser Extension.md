# **Development Plan: AI Webpage Q\&A Browser Extension (Monetized)**

Version: 1.0  
Date: May 2, 2025  
Tech Stack:

* **Frontend (Extension):** HTML, CSS, Vanilla JavaScript  
* **Backend:** Node.js, Express.js  
* **Database:** Google Firestore  
* **Payment:** Stripe  
* **AI:** Google Gemini API

## **Phase 1: Project Setup & Foundation (Est. Time: 1-2 days)**

1. **Directory Structure:**  
   * Create a main project folder (e.g., ai-qa-extension).  
   * Inside, create two subfolders: extension (for frontend code) and backend.  
2. **Backend Setup (Node.js):**  
   * Navigate to the backend folder in your terminal.  
   * Initialize Node.js project: npm init \-y  
   * Install core dependencies:  
     npm install express dotenv cors node-fetch@2 \# Use node-fetch v2 for CommonJS compatibility if not using ES Modules  
     npm install @google-cloud/firestore \# Firestore SDK  
     npm install @google/generative-ai \# Gemini API SDK  
     npm install stripe \# Stripe SDK  
     npm install \--save-dev nodemon \# Optional: for auto-restarting server during development

   * Create main server file: server.js (or index.js).  
   * Create .env file for environment variables.  
   * Create .gitignore file and add node\_modules/ and .env.  
3. **Frontend Setup (Extension):**  
   * Navigate to the extension folder.  
   * Create core files:  
     * manifest.json  
     * popup.html  
     * popup.css  
     * popup.js  
     * content.js (Content script for extracting text)  
     * background.js (Service worker)  
     * Optional: images/ folder for icons (16x16, 48x48, 128x128).  
4. **Version Control:**  
   * Initialize Git repository in the main project folder: git init  
   * Make an initial commit: git add . \-\> git commit \-m "Initial project setup"  
5. **Cloud Services Setup:**  
   * **Firebase/Firestore:**  
     * Go to the [Firebase Console](https://console.firebase.google.com/).  
     * Create a new Firebase project.  
     * Navigate to "Firestore Database" and create a database (choose Native mode, select a location).  
     * Go to "Project settings" \> "Service accounts".  
     * Generate a new private key (JSON file). **Save this securely** – you'll need it for the backend. Add its path to .env.  
     * Go to "Firestore Database" \> "Rules". Set initial permissive rules for development (e.g., allow read, write: if true;). **Remember to tighten these later\!**  
   * **Stripe:**  
     * Sign up/log in to the [Stripe Dashboard](https://dashboard.stripe.com/).  
     * Find your API keys (Publishable and Secret). Add the **Secret Key** to your backend .env file. The Publishable Key might be needed in the frontend later if not using Stripe Checkout exclusively.  
     * Go to "Products" \> "Add product". Define your subscription product (e.g., "Pro Access") and add a recurring price. Note the Price ID (e.g., price\_xxxxxxxx). Add this Price ID to .env.  
     * Go to "Developers" \> "Webhooks". You'll add an endpoint later. Note the "Signing secret" for webhook verification – add it to .env.  
   * **Google AI (Gemini):**  
     * Ensure you have your Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey) or Google Cloud Console.  
     * Add the API key to your backend .env file.  
6. **.env File Structure (Backend):**  
   \# backend/.env  
   PORT=3000 \# Or any port you prefer  
   GOOGLE\_APPLICATION\_CREDENTIALS=./path/to/your/serviceAccountKey.json  
   GEMINI\_API\_KEY=YOUR\_GEMINI\_API\_KEY  
   STRIPE\_SECRET\_KEY=sk\_test\_YOUR\_STRIPE\_SECRET\_KEY \# Use test key initially  
   STRIPE\_WEBHOOK\_SECRET=whsec\_YOUR\_STRIPE\_WEBHOOK\_SECRET  
   STRIPE\_PRICE\_ID=price\_YOUR\_STRIPE\_PRICE\_ID  
   \# Add your extension's expected origin for CORS later  
   \# Example: EXTENSION\_ORIGIN=chrome-extension://your\_extension\_id\_once\_loaded

## **Phase 2: Backend Development (Node.js/Express) (Est. Time: 3-5 days)**

1. **Basic Express Server (backend/server.js):**  
   * Require express, dotenv, cors.  
   * Load environment variables: dotenv.config().  
   * Initialize Express app: const app \= express();.  
   * Middleware: app.use(cors({ origin: '\*' })); (Restrict origin later). app.use(express.json()); (for parsing JSON bodies). For Stripe webhook, use express.raw({type: 'application/json'}) *before* express.json() on the specific webhook route.  
   * Basic root route (/) for testing.  
   * Start server: app.listen(process.env.PORT, () \=\> console.log(...));.  
   * Add nodemon script to package.json for development: "dev": "nodemon server.js".  
2. **Firestore Initialization:**  
   * Require @google-cloud/firestore.  
   * Initialize Firestore client using service account credentials (path from .env).  
   * Define Firestore collection names (e.g., users).  
3. **User Identification & Tracking Logic:**  
   * Helper function getUser(userId): Fetches user data from Firestore by userId. Creates a new user document if not found, initializing usage count (e.g., usageCount: 0, isSubscribed: false, subscriptionEndDate: null).  
   * Helper function updateUserUsage(userId): Increments usageCount in Firestore.  
   * Helper function updateUserSubscription(userId, status, endDate): Updates subscription fields in Firestore.  
4. **/api/query Endpoint (POST):**  
   * Define route: app.post('/api/query', async (req, res) \=\> { ... });.  
   * **Get Input:** Extract question, pageContent, userId from req.body. **Validate input.**  
   * **Get/Create User:** Call getUser(userId).  
   * **Check Limits:**  
     * If user.isSubscribed is true (and subscriptionEndDate is valid), proceed.  
     * Else if user.usageCount \< 5 (or your defined limit), proceed.  
     * Else, return JSON response: { error: true, reason: 'limit\_reached' }.  
   * **Call Gemini API:**  
     * Initialize Gemini SDK (@google/generative-ai) with API key.  
     * Construct prompt combining pageContent and question. Be mindful of token limits. Consider summarizing pageContent if it's very long.  
     * Use try...catch block for the API call (model.generateContent(...)).  
     * If successful, get the text response.  
     * If error, log it and return JSON: { error: true, reason: 'ai\_error', message: '...' }.  
   * **Update Usage (if applicable):** If the call was successful and the user is *not* subscribed, call updateUserUsage(userId).  
   * **Send Response:** Return JSON: { error: false, answer: aiResponseText }.  
5. **/api/create-checkout-session Endpoint (POST):**  
   * Define route: app.post('/api/create-checkout-session', async (req, res) \=\> { ... });.  
   * Require stripe SDK and initialize with secret key.  
   * Extract userId from req.body. **Validate.**  
   * Use stripe.checkout.sessions.create({ ... }):  
     * mode: 'subscription'.  
     * line\_items: \[{ price: process.env.STRIPE\_PRICE\_ID, quantity: 1 }\].  
     * success\_url: Your extension page or a dedicated success page (e.g., YOUR\_WEBSITE/payment-success?session\_id={CHECKOUT\_SESSION\_ID}).  
     * cancel\_url: Your extension page or a dedicated cancel page.  
     * client\_reference\_id: userId (Crucial for linking payment to user in webhook).  
   * Use try...catch. Handle Stripe errors.  
   * Return JSON: { error: false, url: session.url }.  
6. **/api/stripe-webhook Endpoint (POST):**  
   * Define route: app.post('/api/stripe-webhook', express.raw({type: 'application/json'}), async (req, res) \=\> { ... }); (Use raw body parser).  
   * Require stripe.  
   * **Verify Signature:**  
     * Get signature from req.headers\['stripe-signature'\].  
     * Use stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE\_WEBHOOK\_SECRET). Wrap in try...catch to handle verification errors.  
   * **Handle Events:** Use a switch (event.type) statement:  
     * case 'checkout.session.completed':  
       * Get userId from event.data.object.client\_reference\_id.  
       * Get subscription details (e.g., end date if applicable) from the event object.  
       * Call updateUserSubscription(userId, true, subscriptionEndDate).  
     * case 'customer.subscription.updated': Check status (e.g., active, canceled, past\_due). Update Firestore accordingly. Get current\_period\_end timestamp.  
     * case 'customer.subscription.deleted': Mark user as unsubscribed: updateUserSubscription(userId, false, null).  
     * Add other events as needed (e.g., payment failures).  
   * **Return Response:** Send res.status(200).json({ received: true }); to acknowledge receipt to Stripe.

## **Phase 3: Frontend Development (Browser Extension) (Est. Time: 4-6 days)**

1. **manifest.json Configuration:**  
   {  
     "manifest\_version": 3,  
     "name": "AI Webpage Q\&A",  
     "version": "0.1.0",  
     "description": "Ask questions about the current webpage using AI.",  
     "permissions": \[  
       "activeTab", // Access content of the \*current\* tab when invoked  
       "storage",   // Store user ID, usage count, status locally  
       "scripting"  // Inject content script  
     \],  
     "host\_permissions": \[  
       "http://localhost:3000/\*", // For local backend testing  
       "https://your-deployed-backend.com/\*" // Replace with deployed backend URL  
     \],  
     "action": {  
       "default\_popup": "popup.html",  
       "default\_icon": {  
         "16": "images/icon16.png",  
         "48": "images/icon48.png",  
         "128": "images/icon128.png"  
       }  
     },  
     "background": {  
       "service\_worker": "background.js"  
     },  
     "icons": {  
         "16": "images/icon16.png",  
         "48": "images/icon48.png",  
         "128": "images/icon128.png"  
     }  
   }

2. **popup.html Structure:**  
   * Basic HTML structure (\<\!DOCTYPE html\>, \<html\>, \<head\>, \<body\>).  
   * Link to popup.css.  
   * Include elements:  
     * Title (\<h1\>).  
     * Response display area (\<div id="responseArea"\>). Add a loading indicator (\<div id="loader" style="display: none;"\>Loading...\</div\>).  
     * Error message area (\<div id="errorArea" style="color: red;"\>\</div\>).  
     * Input form (\<form id="queryForm"\>).  
     * Text area (\<textarea id="questionInput" placeholder="Ask about this page..."\>\</textarea\>).  
     * Submit button (\<button type="submit"\>Ask AI\</button\>).  
     * Usage counter (\<div id="usageInfo"\>\</div\>).  
     * Upgrade section (\<div id="upgradeSection" style="display: none;"\>).  
       * Limit message (\<p\>Free limit reached.\</p\>).  
       * Upgrade button (\<button id="upgradeButton"\>Upgrade to Pro\</button\>).  
   * Link to popup.js at the end of \<body\>.  
3. **popup.css Styling:**  
   * Basic styling for body, form elements, response area, buttons.  
   * Style the loading indicator and error messages.  
   * Ensure a reasonable fixed width for the popup (e.g., width: 350px;).  
4. **background.js (Service Worker):**  
   * **Generate User ID on Install:**  
     chrome.runtime.onInstalled.addListener(details \=\> {  
       if (details.reason \=== 'install') {  
         chrome.storage.local.get('userId', data \=\> {  
           if (\!data.userId) {  
             const newUserId \= crypto.randomUUID(); // Simple unique ID  
             chrome.storage.local.set({ userId: newUserId, usageCount: 0, isSubscribed: false });  
             console.log('User ID generated:', newUserId);  
           }  
         });  
       }  
     });

5. **content.js (Content Script):**  
   * Keep it simple initially:  
     // content.js  
     // Try to get main content, fallback to body text  
     const mainContent \= document.querySelector('main, article, \#main, \#content');  
     const text \= mainContent ? mainContent.innerText : document.body.innerText;  
     // Send text back to the requester (popup.js)  
     chrome.runtime.sendMessage({ type: "CONTENT\_TEXT", text: text.trim().substring(0, 15000\) }); // Limit length

   * *Note:* This is basic. Real-world extraction is complex (handling SPAs, removing boilerplate, etc.). Consider libraries like Readability.js later if needed.  
6. **popup.js Logic:**  
   * **DOM References:** Get references to all HTML elements (form, input, buttons, display areas).  
   * **Constants:** Store backend URL (const BACKEND\_URL \= 'http://localhost:3000'; or deployed URL).  
   * **State Variables:** let isLoading \= false; let userId \= null; let usageCount \= 0; let isSubscribed \= false;  
   * **updateUI() Function:** Updates visibility of elements (loader, error, response, form, upgrade section) based on isLoading and isSubscribed/usageCount. Displays usage info.  
   * **getUserData() Function:**  
     * Uses chrome.storage.local.get(\['userId', 'usageCount', 'isSubscribed'\], data \=\> { ... }); to load state variables.  
     * Calls updateUI().  
   * **On Popup Load:** Call getUserData().  
   * **Form Submit Listener (queryForm.addEventListener('submit', async (e) \=\> { ... });):**  
     * e.preventDefault();.  
     * Get question text from input. Check if empty.  
     * If isLoading, return. Set isLoading \= true; updateUI();. Clear previous errors/response.  
     * **Get Active Tab:** const \[tab\] \= await chrome.tabs.query({ active: true, currentWindow: true });.  
     * **Inject Content Script:**  
       try {  
         await chrome.scripting.executeScript({  
           target: { tabId: tab.id },  
           files: \['content.js'\]  
         });  
         // Wait for response from content script (see message listener below)  
       } catch (err) {  
         // Handle injection error (e.g., page not allowed)  
         setError('Could not access page content.');  
         isLoading \= false; updateUI(); return;  
       }

   * **Message Listener (chrome.runtime.onMessage.addListener((message, sender, sendResponse) \=\> { ... });):**  
     * Listen for messages from content.js.  
     * If message.type \=== 'CONTENT\_TEXT':  
       * Get pageContent \= message.text;.  
       * **Call Backend:**  
         try {  
           const response \= await fetch(\`${BACKEND\_URL}/api/query\`, {  
             method: 'POST',  
             headers: { 'Content-Type': 'application/json' },  
             body: JSON.stringify({ question: questionText, pageContent, userId })  
           });  
           const data \= await response.json();

           if (data.error) {  
              if (data.reason \=== 'limit\_reached') {  
                // Show paywall  
                isSubscribed \= false; // Ensure state is correct  
                usageCount \= 5; // Or the limit  
                setError('Free limit reached. Please upgrade.');  
                // Update storage potentially? Or rely on backend truth?  
                // Show upgrade section in updateUI  
              } else {  
                setError(data.message || 'An error occurred.');  
              }  
           } else {  
              setResponse(data.answer);  
              // Increment local usage count if needed for UI feedback  
              if (\!isSubscribed) {  
                 usageCount++;  
                 chrome.storage.local.set({ usageCount: usageCount });  
              }  
           }  
         } catch (err) {  
             setError('Network error. Could not reach backend.');  
         } finally {  
             isLoading \= false;  
             updateUI();  
         }

   * **Upgrade Button Listener (upgradeButton.addEventListener('click', async () \=\> { ... });):**  
     * If isLoading, return. Set isLoading \= true; updateUI();.  
     * Call backend /api/create-checkout-session endpoint (POST) with { userId }.  
     * Handle errors.  
     * If successful, get checkoutUrl from response.  
     * Open Stripe Checkout: chrome.tabs.create({ url: checkoutUrl });.  
     * isLoading \= false; updateUI();.  
   * **Helper Functions:** setError(message), setResponse(text), clear functions.  
   * Initial call to getUserData() when the script loads.

## **Phase 4: Integration & Testing (Est. Time: 5-7 days)**

1. **Load Extension Locally:**  
   * Open Chrome \> Extensions (chrome://extensions).  
   * Enable "Developer mode".  
   * Click "Load unpacked" and select your extension folder. Note the generated Extension ID.  
   * Update EXTENSION\_ORIGIN in backend .env and CORS settings if needed. Restart backend.  
2. **Backend-Frontend Connection:**  
   * Open the extension popup on a webpage.  
   * Check browser console (popup and background) and backend console for errors.  
   * Verify CORS is configured correctly.  
   * Test asking a question. Check network requests in the popup's developer tools.  
3. **Firestore Testing:**  
   * Check Firestore console to see if user documents are created/updated correctly upon first use and subsequent queries.  
4. **Gemini API Testing:**  
   * Verify meaningful answers are returned based on page content and questions. Test edge cases (short/long content, different question types). Check backend logs for Gemini API errors.  
5. **Stripe Testing (Crucial):**  
   * **Webhook Local Testing:** Use Stripe CLI (stripe listen \--forward-to localhost:3000/api/stripe-webhook) or ngrok to forward webhooks to your local backend.  
   * **Checkout Flow:**  
     * Trigger the free limit.  
     * Click "Upgrade". Verify redirection to Stripe Checkout (test mode).  
     * Use Stripe's test card numbers to complete a subscription.  
     * Configure success/cancel URLs in Stripe Checkout session creation (or Stripe Dashboard) to redirect back appropriately (e.g., to a simple success/cancel HTML page in your extension or a hosted page).  
     * **Verify Webhook Handling:** Check backend logs to ensure the checkout.session.completed event is received and processed.  
     * **Verify Firestore Update:** Check Firestore to confirm the user's isSubscribed status is updated correctly.  
     * **Test Post-Subscription:** Reload the extension popup. Verify the paywall is gone and queries work without incrementing usage count (or check status).  
   * **Subscription Management Events:** Test webhook handling for subscription updates/cancellations using Stripe's dashboard tools to simulate events.  
6. **Usage Limit Testing:** Verify the 5-query limit works correctly and the paywall appears as expected.  
7. **Error Handling Tests:** Simulate errors (stop backend server, use invalid API key temporarily, disconnect network) and verify user-friendly error messages appear in the extension.  
8. **Content Script Testing:** Test on various websites (simple articles, complex pages, SPAs) to see how well content.js extracts text. Identify areas for improvement.

## **Phase 5: Deployment (Est. Time: 2-3 days)**

1. **Backend Deployment:**  
   * Choose a hosting provider (e.g., Render, Vercel (serverless functions), Heroku, Google Cloud Run, AWS Elastic Beanstalk).  
   * Configure deployment settings (build commands, start command).  
   * Set up environment variables in the hosting provider's dashboard (copy from .env, **use production keys**). Ensure the Firestore service account key file is securely handled (e.g., upload securely or store content in env var).  
   * Deploy the application. Get the public URL.  
2. **Update Extension:**  
   * Change BACKEND\_URL in popup.js to the deployed backend URL.  
   * Update host\_permissions in manifest.json to include the deployed backend URL. Remove localhost permission.  
3. **Stripe Production Configuration:**  
   * Switch Stripe account to **Live Mode**.  
   * Update backend .env (and hosting environment variables) with **Live** Stripe Secret Key and Price ID.  
   * Update the Stripe Webhook endpoint URL in the Stripe Dashboard to point to your deployed backend's /api/stripe-webhook endpoint. Use the **Live** Webhook Signing Secret in your backend configuration.  
4. **Privacy Policy:**  
   * Write a clear privacy policy explaining what data is collected (anonymized user ID, page content for processing, usage stats, payment via Stripe) and how it's used/stored.  
   * Host the policy page (e.g., using GitHub Pages, Netlify, or your own website).  
5. **Prepare Extension Package:**  
   * Remove console.log statements used for debugging.  
   * Ensure all icons and manifest details are correct.  
   * Create a ZIP file containing the contents of the extension folder.  
6. **Chrome Web Store Submission:**  
   * Go to the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole/). Pay the one-time developer registration fee if you haven't already.  
   * Create a new item.  
   * Upload the ZIP package.  
   * Fill in all required store listing information (name, description, icons, screenshots, privacy policy URL, etc.).  
   * Submit for review. This can take several days. Respond promptly to any feedback from the review team.

## **Phase 6: Maintenance & Iteration (Ongoing)**

1. **Monitoring:**  
   * Set up logging and monitoring on your backend hosting (e.g., check logs for errors, monitor response times, resource usage).  
   * Monitor Gemini API usage and costs in the Google Cloud Console.  
   * Monitor Stripe dashboard for payments, disputes, subscription metrics.  
2. **Bug Fixing:** Address bugs reported by users or found through monitoring.  
3. **Dependency Updates:** Regularly update Node.js, npm packages (check for security vulnerabilities), and browser extension APIs.  
4. **User Feedback:** Collect feedback through store reviews or dedicated channels.  
5. **Feature Development:** Prioritize and implement features from the PRD's "Future Considerations" based on feedback and strategy (e.g., better content extraction, conversation history, user accounts).  
6. **Security Review:** Periodically review backend security, Firestore rules (make them more restrictive than allow read, write: if true;), and data handling practices.

This detailed plan provides a comprehensive roadmap. Remember that development is iterative; you'll likely encounter challenges and adjust course along the way. Good luck\!