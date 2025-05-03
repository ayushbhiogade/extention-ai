// content.js

// Listen for messages from the popup script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getPageContent') {
        console.log('Content script received request for page content.');
        try {
            // Attempt to extract meaningful text. This is a basic approach.
            // It might grab unwanted text (nav, footer) or miss content in complex SPAs.
            // More sophisticated extraction might target specific elements (e.g., <article>, <main>) or use readability libraries.
            const bodyText = document.body.innerText || '';
            console.log('Extracted text length:', bodyText.length);
            sendResponse({ success: true, content: bodyText });
        } catch (error) {
            console.error('Error extracting page content:', error);
            sendResponse({ success: false, error: error.message });
        }
        return true; // Indicates response will be sent asynchronously (important!)
    }
});

console.log('AI Q&A content script loaded.'); // For debugging
