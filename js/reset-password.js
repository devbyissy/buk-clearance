const messageBox = document.getElementById('message');
const checking = document.getElementById('checking');
const form = document.getElementById('reset-form');
const done = document.getElementById('done');
const requestNew = document.getElementById('request-new');
const saveBtn = document.getElementById('save-btn');

let recoveryReady = false;
let finished = false;

function showMessage(text, type) {
    messageBox.textContent = text;
    messageBox.className = 'message ' + type;
}

function setupToggle(buttonId, inputId) {
    const button = document.getElementById(buttonId);
    const input = document.getElementById(inputId);
    button.addEventListener('click', () => {
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        button.textContent = isHidden ? 'HIDE' : 'SHOW';
    });
}
setupToggle('pw-toggle', 'new-password');
setupToggle('pw-toggle-2', 'confirm-password');

function showInvalidLink() {
    checking.textContent = 'We could not verify your reset link.';
    form.style.display = 'none';
    showMessage('This reset link is invalid or has expired. Please request a new one.', 'err');
    requestNew.style.display = 'block';
}

// Supabase puts an error in the web address when a link is expired or already used
const addressParams = new URLSearchParams(window.location.hash.substring(1) + '&' + window.location.search.substring(1));
if (addressParams.get('error') || addressParams.get('error_code')) {
    showInvalidLink();
}

// Supabase tells us when the person arrived from a valid reset link
supabaseClient.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
        recoveryReady = true;
        checking.textContent = 'Enter and confirm your new password below.';
        messageBox.className = 'message';
        requestNew.style.display = 'none';
        form.style.display = 'block';
    }
});

// If no valid reset link was found after a few seconds, tell the user
setTimeout(() => {
    if (!recoveryReady && !finished) {
        showInvalidLink();
    }
}, 4000);

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    messageBox.className = 'message';

    if (password.length < 8) {
        showMessage('Password must be at least 8 characters.', 'err');
        return;
    }
    if (password !== confirmPassword) {
        showMessage('The two passwords do not match.', 'err');
        return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
        const { error } = await supabaseClient.auth.updateUser({ password: password });

        if (error) {
            if (/different from the old password/i.test(error.message)) {
                showMessage('Your new password must be different from your old password.', 'err');
            } else {
                showMessage('Could not save your new password: ' + error.message, 'err');
            }
            return;
        }

        finished = true;
        await supabaseClient.auth.signOut();
        checking.textContent = 'All done.';
        form.style.display = 'none';
        showMessage('Your password has been updated. You can now log in with your new password.', 'ok');
        done.style.display = 'block';
    } catch (err) {
        showMessage('Something went wrong: ' + err.message, 'err');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save new password';
    }
});