// payment.js
document.addEventListener('DOMContentLoaded', async () => {
    const statusDiv = document.getElementById('status');
    const payButton = document.getElementById('payButton');
    const loadingDiv = document.getElementById('loading');
    const paymentFrame = document.getElementById('paymentFrame');
    const backendUrl = 'http://localhost:3000';

    function showStatus(message, isError = false) {
        statusDiv.textContent = message;
        statusDiv.className = isError ? 'error' : 'success';
    }

    function showLoading(isLoading) {
        loadingDiv.style.display = isLoading ? 'block' : 'none';
        payButton.disabled = isLoading;
    }

    // Check payment status periodically
    function checkPaymentStatus(paymentId) {
        const checkInterval = setInterval(async () => {
            try {
                const response = await fetch(`${backendUrl}/api/check-payment-status?paymentId=${paymentId}`);
                const result = await response.json();
                
                if (result.status === 'successful') {
                    clearInterval(checkInterval);
                    await chrome.storage.local.set({ isSubscribed: true });
                    showStatus('Payment successful! You now have unlimited access.');
                    setTimeout(() => window.close(), 2000);
                } else if (result.status === 'failed') {
                    clearInterval(checkInterval);
                    showStatus('Payment failed: ' + (result.message || 'Unknown error'), true);
                }
            } catch (error) {
                console.error('Error checking payment status:', error);
            }
        }, 3000); // Check every 3 seconds
    }

    async function initializePayment() {
        showLoading(true);
        payButton.style.display = 'none';
        showStatus('Preparing payment...');
        
        try {
            // Get userId from storage
            const { userId } = await chrome.storage.local.get('userId');
            if (!userId) {
                throw new Error('User ID not found.');
            }

            // Create payment session on backend
            const apiResponse = await fetch(`${backendUrl}/api/create-payment-url`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });

            const result = await apiResponse.json();
            if (!apiResponse.ok || result.error) {
                throw new Error(result.message || `Failed to create payment URL. Status: ${apiResponse.status}`);
            }

            // Open in a new tab instead of redirecting the current window
            window.open(result.paymentUrl, '_blank');
            showStatus('Payment page opened in a new tab. Please complete your payment there.');
            
            // Store payment ID for status checking
            if (result.paymentId) {
                checkPaymentStatus(result.paymentId);
            }
        } catch (error) {
            console.error('Payment initialization error:', error);
            showStatus(`Error: ${error.message}`, true);
            payButton.style.display = 'block';
            showLoading(false);
        }
    }

    payButton.addEventListener('click', initializePayment);
});
