// popup.js

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const queryForm = document.getElementById('queryForm');
    const questionInput = document.getElementById('questionInput');
    const responseArea = document.getElementById('responseArea');
    const responseContent = document.getElementById('responseContent');
    const loader = document.getElementById('loader');
    const errorArea = document.getElementById('errorArea');
    const errorMessage = document.getElementById('errorMessage');
    const usageInfo = document.getElementById('usageInfo');
    const usageCountContainer = document.getElementById('usageCountContainer');
    const subscriptionInfo = document.getElementById('subscriptionInfo');
    const subscriptionStatus = document.getElementById('subscriptionStatus');
    const subscriptionExpiry = document.getElementById('subscriptionExpiry');
    const statusBadge = document.getElementById('statusBadge');
    const upgradeSection = document.getElementById('upgradeSection');
    const upgradeButton = document.getElementById('upgradeButton');
    const clearResponse = document.getElementById('clearResponse');
    const copyResponse = document.getElementById('copyResponse');
    const setMaxUsage = document.getElementById('setMaxUsage');
    const quickUpgradeBtn = document.getElementById('quickUpgradeBtn');

    // Backend URL - Production vs Development
    // const backendUrl = 'https://ai-qa-extension-backend.onrender.com'; // Production URL (commented out)
    const backendUrl = 'http://localhost:3000'; // Development URL

    // UI Update Functions
    function showLoading(isLoading) {
        loader.style.display = isLoading ? 'flex' : 'none';
        if (isLoading) {
            if (!responseArea.style.display || responseArea.style.display === 'none') {
                responseArea.style.display = 'block';
                responseContent.textContent = '';
            }
            errorArea.style.display = 'none';
            upgradeSection.style.display = 'none';
            
            // Scroll to the response area
            responseArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorArea.style.display = 'flex';
        if (!responseContent.textContent) {
            responseArea.style.display = 'none';
        }
        upgradeSection.style.display = 'none';
        showLoading(false);
    }

    function showResponse(text) {
        responseArea.style.display = 'block';
        responseContent.textContent = text;
        errorArea.style.display = 'none';
        showLoading(false);
    }

    function showUpgradePrompt() {
        errorMessage.textContent = 'You have reached your free usage limit.';
        errorArea.style.display = 'flex';
        responseArea.style.display = 'none';
        upgradeSection.style.display = 'block';
        showLoading(false);
    }

    // --- Form Submission Logic ---
    queryForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const question = questionInput.value.trim();
        if (!question) {
            showError('Please enter a question.');
            return;
        }

        showLoading(true);

        try {
            // 1. Get User ID from storage
            const { userId } = await chrome.storage.local.get('userId');
            if (!userId) {
                throw new Error('User ID not found. Please reinstall the extension.');
            }

            // 2. Get active tab to message content script
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!activeTab || !activeTab.id) {
                throw new Error('Could not get active tab.');
            }

            // 3. Ensure content script is injected and get page content
            let pageContent = '';
            try {
                // First, try to inject the content script
                await chrome.scripting.executeScript({
                    target: { tabId: activeTab.id },
                    files: ['content.js']
                }).catch(err => {
                    console.log('Content script already exists or failed to inject:', err);
                    // We can ignore the error if the script is already injected
                });

                // Now try to get the page content
                const response = await chrome.tabs.sendMessage(activeTab.id, { action: 'getPageContent' });
                if (response && response.success) {
                    pageContent = response.content;
                    console.log('Received page content length:', pageContent.length);
                } else {
                    throw new Error(response?.error || 'Failed to get page content from content script.');
                }
            } catch (err) {
                console.error("Error messaging content script:", err);
                if (err.message?.includes('Cannot access contents of url "chrome')) {
                    showError('Cannot analyze Chrome internal pages. Please try on a regular webpage.');
                } else if (err.message?.includes('Could not establish connection') || err.message?.includes('Receiving end does not exist')) {
                    showError('Error: Could not connect to the page. Please refresh the page and try again.');
                } else {
                    showError(`Error getting page content: ${err.message}`);
                }
                showLoading(false);
                return; // Stop processing
            }


            // 4. Call Backend API
            const apiResponse = await fetch(`${backendUrl}/api/query`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ question, pageContent, userId }),
            });

            const result = await apiResponse.json();

            if (!apiResponse.ok) {
                // Handle specific errors from backend
                if (apiResponse.status === 403 && result.reason === 'limit_reached') {
                    showUpgradePrompt();
                    // Update local storage count potentially (though backend is source of truth)
                    chrome.storage.local.set({ usageCount: 5 }); // Assume limit is 5
                    updateUsageDisplay(); // Update display
                } else {
                    throw new Error(result.message || `HTTP error! status: ${apiResponse.status}`);
                }
            } else if (result.error) {
                 // Handle errors indicated in the JSON body even with a 200 OK
                 throw new Error(result.message || 'Backend returned an error.');
            } else {
                showResponse(result.answer);
                // Increment usage count locally for immediate feedback (backend is source of truth)
                const currentData = await chrome.storage.local.get(['usageCount', 'isSubscribed']);
                if (!currentData.isSubscribed) {
                    const newCount = (currentData.usageCount || 0) + 1;
                    chrome.storage.local.set({ usageCount: newCount });
                    updateUsageDisplay(newCount, currentData.isSubscribed);
                }
            }

        } catch (error) {
            console.error('Error during query process:', error);
            showError(`An error occurred: ${error.message}`);
        } finally {
           // Ensure loading is always turned off unless handled by specific UI states like showUpgradePrompt
            if (loader.style.display === 'block') {
                 showLoading(false);
            }
        }
    });

    // --- Upgrade Button Logic ---
    upgradeButton.addEventListener('click', async () => {
        // Get the user ID first
        const { userId } = await chrome.storage.local.get('userId');
        if (!userId) {
            showError('User ID not found. Please reload the extension.');
            return;
        }
        
        // Open Razorpay payment page directly in a new popup window
        chrome.windows.create({
            url: `http://localhost:3000/razorpay-payment.html?userId=${userId}`,
            type: 'popup',
            width: 450,
            height: 700
        });
    });

    // --- Initial UI Update --- 
    // Function to update usage display
    async function updateUsageDisplay(count, subscribed) {
        const limit = 5; // The free limit
        let subscriptionDetails = null;

        if (typeof count !== 'number' || typeof subscribed !== 'boolean') {
            // Fetch from storage if not provided
            const data = await chrome.storage.local.get(['usageCount', 'isSubscribed', 'subscriptionDetails']);
            count = data.usageCount ?? 0;
            subscribed = data.isSubscribed ?? false;
            subscriptionDetails = data.subscriptionDetails;
        }
       
        if (subscribed) {
            // Show PRO subscription
            statusBadge.style.display = 'block';
            subscriptionInfo.style.display = 'flex';
            usageCountContainer.style.display = 'none';
            upgradeSection.style.display = 'none';
            quickUpgradeBtn.style.display = 'none'; // Hide quick upgrade button for PRO users

            // Display subscription details if available
            if (subscriptionDetails && subscriptionDetails.expiryDate) {
                const expiryDate = new Date(subscriptionDetails.expiryDate);
                const now = new Date();
                const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
                
                if (daysLeft > 0) {
                    subscriptionExpiry.textContent = `${daysLeft} days left`;
                } else {
                    subscriptionExpiry.textContent = 'Expiring soon';
                }
            } else {
                subscriptionExpiry.textContent = 'Active';
            }
        } else {
            // Show FREE tier
            statusBadge.style.display = 'none';
            subscriptionInfo.style.display = 'none';
            usageCountContainer.style.display = 'flex';
            quickUpgradeBtn.style.display = 'flex'; // Show quick upgrade button for FREE users
            
            // Check if usage limit is reached
            if (count >= limit && !upgradeSection.style.display) {
                showUpgradePrompt();
            }
        }
    }

    // Copy response functionality
    copyResponse.addEventListener('click', async () => {
        if (responseContent.textContent) {
            try {
                await navigator.clipboard.writeText(responseContent.textContent);
                
                // Turn the button green
                const iconElement = copyResponse.querySelector('.material-icons-round');
                iconElement.classList.add('copy-success');
                
                // Reset after 1.5 seconds
                setTimeout(() => {
                    iconElement.classList.remove('copy-success');
                }, 1500);
            } catch (err) {
                console.error('Failed to copy text: ', err);
                showError('Failed to copy to clipboard');
            }
        }
    });

    // Event Listeners
    clearResponse.addEventListener('click', () => {
        responseArea.style.display = 'none';
        responseContent.textContent = '';
    });

    
    // Quick upgrade button handler - same as main upgrade button
    quickUpgradeBtn.addEventListener('click', async () => {
        // Get the user ID first
        const { userId } = await chrome.storage.local.get('userId');
        if (!userId) {
            showError('User ID not found. Please reload the extension.');
            return;
        }
        
        // Open Razorpay payment page directly in a new popup window
        chrome.windows.create({
            url: `http://localhost:3000/razorpay-payment.html?userId=${userId}`,
            type: 'popup',
            width: 450,
            height: 700
        });
    });

    // Auto-resize textarea and handle Enter key
    questionInput.addEventListener('input', () => {
        questionInput.style.height = 'auto';
        questionInput.style.height = (questionInput.scrollHeight) + 'px';
    });

    // Enable form submission with Enter key
    questionInput.addEventListener('keydown', (event) => {
        // Submit on Enter without Shift key
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault(); // Prevent newline
            queryForm.dispatchEvent(new Event('submit'));
            
            // Remove focus from input to shift focus to response area
            questionInput.blur();
        }
    });

    // Update display when popup opens
    updateUsageDisplay();

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && (changes.usageCount || changes.isSubscribed || changes.subscriptionDetails)) {
            console.log('Storage changed, updating usage display.');
            updateUsageDisplay();
        }
    });

    // Focus input on popup open
    questionInput.focus();
});
