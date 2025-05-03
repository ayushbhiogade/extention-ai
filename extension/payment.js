// payment.js
document.addEventListener('DOMContentLoaded', async () => {
    const statusDiv = document.getElementById('status');
    const payButton = document.getElementById('payButton');
    const loadingDiv = document.getElementById('loading');
    const backendUrl = 'http://localhost:3000';

    function showStatus(message, isError = false) {
        statusDiv.textContent = message;
        statusDiv.className = isError ? 'error' : 'success';
    }

    function showLoading(isLoading) {
        loadingDiv.style.display = isLoading ? 'block' : 'none';
        payButton.disabled = isLoading;
    }

    async function initializePayment() {
        showLoading(true);
        showStatus('Preparing payment...');
        
        try {
            // Get userId from storage
            const { userId } = await chrome.storage.local.get('userId');
            if (!userId) {
                throw new Error('User ID not found.');
            }

            // Open payment page in a new tab
            const paymentUrl = `${backendUrl}/razorpay-payment.html?userId=${userId}`;
            window.open(paymentUrl, '_blank');
            
            showStatus('Payment page opened in a new tab. Please complete your payment there.');
            showLoading(false);
        } catch (error) {
            console.error('Payment initialization error:', error);
            showStatus(`Error: ${error.message}`, true);
            showLoading(false);
        }
    }

    payButton.addEventListener('click', initializePayment);
});

