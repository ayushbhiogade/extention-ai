// background.js

chrome.runtime.onInstalled.addListener(details => {
    if (details.reason === 'install') {
        chrome.storage.local.get(['userId', 'usageCount', 'isSubscribed'], data => {
            if (!data.userId) {
                const newUserId = crypto.randomUUID(); // Simple unique ID
                chrome.storage.local.set({ 
                    userId: newUserId, 
                    usageCount: 0, 
                    isSubscribed: false 
                }, () => {
                    console.log('User ID generated and initial state set:', newUserId);
                });
            } else {
                console.log('User ID already exists:', data.userId);
            }
        });
    }
});

// Listener to keep the service worker alive (optional but can help)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle messages if needed, or just keep the listener active
  // Returning true indicates you wish to send a response asynchronously
  // For now, just acknowledge receipt
  // console.log('Background script received message:', message);
  return true; // Keep the message channel open for async response if needed later
});
