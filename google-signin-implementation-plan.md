# Google Sign-In Implementation Plan for Page Bud AI

## Phase 1: Google Cloud Setup

### Step 1: Create a Google Cloud Project
1. Go to Google Cloud Console
2. Click on the project dropdown at the top of the page
3. Click "New Project"
4. Enter "Page Bud AI" as the project name
5. Click "Create"
6. Wait for the project to be created and switch to it

### Step 2: Enable Required APIs
1. In the Google Cloud Console, go to "APIs & Services" > "Library"
2. Search for "Google Identity" 
3. Click on "Google Identity Services API"
4. Click "Enable"
5. Go back to the API Library
6. Search for "People API" and enable it as well

### Step 3: Configure OAuth Consent Screen
1. Go to "APIs & Services" > "OAuth consent screen"
2. Select "External" user type (unless you have Google Workspace)
3. Click "Create"
4. Fill in the application details:
   - App name: Page Bud AI
   - User support email: Your email address
   - Developer contact information: Your email address
5. Click "Save and Continue"
6. For scopes, add:
   - userinfo.email
   - userinfo.profile
7. Click "Save and Continue"
8. Add any test users if needed (your email)
9. Click "Save and Continue" to complete the process

### Step 4: Create OAuth Client ID
1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. For Application type, select "Chrome App"
4. Name: Page Bud AI Extension
5. For Chrome Web Store Item ID:
   - If already published: Use your actual extension ID
   - If not yet published: Get the ID from your manifest.json or use your development ID
6. Click "Create"
7. Note down the Client ID (will look like: `1234567890-abcdefghijklmnopqrst.apps.googleusercontent.com`)
8. Download the JSON file with your credentials and save it securely

## Phase 2: Backend Implementation

### Step 5: Install Required Packages
1. Navigate to your backend directory
2. Install the necessary packages:
   - google-auth-library
   - jsonwebtoken

### Step 6: Update User Schema
1. Open or create your user model file (e.g., `models/User.js`)
2. Update the schema to include Google authentication fields:
   - googleId (String, unique)
   - email (String, required)
   - name (String)
   - profilePicture (String)
   - authMethod (String, enum with 'google' and 'anonymous')
   - refreshToken (String)
   - lastLoginAt (Date)

### Step 7: Create Authentication Middleware
1. Create a new file `middleware/auth.js`
2. Implement JWT token verification middleware
3. Add error handling for expired or invalid tokens

### Step 8: Create Authentication Routes
1. Create a new file `routes/auth.js`
2. Implement the following endpoints:
   - POST /api/auth/google - Google sign-in
   - POST /api/auth/refresh - Token refresh
   - POST /api/auth/logout - User logout
   - GET /api/auth/profile - Get user profile

### Step 9: Update Environmental Variables
1. Add these variables to your `.env` file:
   - GOOGLE_CLIENT_ID
   - JWT_SECRET (random secure string)
   - JWT_REFRESH_SECRET (another random secure string)

### Step 10: Update Server.js to Include Auth Routes
1. Import the auth routes
2. Add them to your Express app
3. Update existing endpoints to use the authentication middleware

## Phase 3: Extension Frontend Implementation

### Step 11: Update Manifest.json
1. Add the identity permission
2. Configure the OAuth2 settings with your Google Client ID
3. Update host permissions for your backend API

### Step 12: Create Authentication Module
1. Create a new file `extension/auth.js`
2. Implement functions for:
   - Google sign-in
   - Token refresh
   - Authentication status check
   - Logout

### Step 13: Update Popup HTML for Login UI
1. Add a login container with Google sign-in button
2. Update the header to show user information when logged in
3. Add a logout button
4. Include the auth.js script

### Step 14: Add CSS for Login UI
1. Style the login container
2. Style the Google sign-in button
3. Style the user profile display in header
4. Add animations for smooth transitions

### Step 15: Update Popup.js for Authentication
1. Add initialization to check authentication status
2. Implement UI state management based on auth status
3. Add event listeners for login and logout
4. Update API calls to include authentication tokens

## Phase 4: Integration and Testing

### Step 16: Integrate Authentication with Existing Features
1. Update the query function to use authenticated requests
2. Modify the payment flow to use the authenticated user
3. Update usage tracking to associate with Google account

### Step 17: Test Authentication Flow
1. Test sign-in process
2. Test token refresh
3. Test logout
4. Test persistence across browser restarts

### Step 18: Test Feature Integration
1. Test querying with authentication
2. Test payment flow with authentication
3. Test usage limits with authentication

## Phase 5: Deployment and Migration

### Step 19: Plan User Migration Strategy
1. Decide how to handle existing users
2. Implement migration logic to associate anonymous users with Google accounts

### Step 20: Update Privacy Policy
1. Update privacy policy to include Google authentication
2. Clarify what user data is stored and how it's used

### Step 21: Deploy the Updated Backend
1. Deploy the updated backend with authentication support
2. Verify all endpoints are working correctly

### Step 22: Submit Updated Extension
1. Update manifest.json with final production values
2. Package the extension
3. Submit to Chrome Web Store

## Phase 6: Post-Launch

### Step 23: Monitor Authentication Issues
1. Set up logging for authentication errors
2. Create a system to detect and respond to authentication problems

### Step 24: Gather User Feedback
1. Collect feedback on the authentication process
2. Make adjustments based on user experience

### Step 25: Plan Future Enhancements
1. Consider adding additional authentication methods
2. Plan for user preference syncing across devices
3. Consider implementing role-based access control for future features