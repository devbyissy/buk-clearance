const messageBox = document.getElementById('message');
const sendBtn = document.getElementById('send-btn');

function showMessage(text, type) {
    messageBox.textContent = text;
    messageBox.className = 'message ' + type;
}

document.getElementById('forgot-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('email').value.trim();

    messageBox.className = 'message';
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';

    try {
        // The link in the email brings the user back to reset-password.html
        const redirectTo = new URL('reset-password.html', window.location.href).href;

        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo });

        if (error) {
            const text = error.message || '';
            if (error.status === 429 || /rate limit|security purposes|too many/i.test(text)) {
                showMessage('Too many requests. Please wait a few minutes and try again.', 'err');
            } else if (/not authorized/i.test(text)) {
                showMessage('Supabase\'s free test email service can only send to addresses on your project team. For this test, use the email you log in to Supabase with.', 'err');
            } else {
                showMessage('Could not send the reset email: ' + text, 'err');
            }
            return;
        }

        showMessage('If an account exists for ' + email + ', a password reset link has been sent. Check your inbox and your spam folder.', 'ok');
    } catch (err) {
        showMessage('Something went wrong: ' + err.message, 'err');
    } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send reset link';
    }
});