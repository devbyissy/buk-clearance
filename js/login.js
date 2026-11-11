const messageBox = document.getElementById('message');
const loginBtn = document.getElementById('login-btn');

function showMessage(text, type) {
    messageBox.textContent = text;
    messageBox.className = 'message ' + type;
}

// Show or hide the password
document.getElementById('pw-toggle').addEventListener('click', () => {
    const input = document.getElementById('password');
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    document.getElementById('pw-toggle').textContent = isHidden ? 'HIDE' : 'SHOW';
});

// Find out whether this person is an admin, staff member or student
async function findRole(userId) {
    const tables = [['admins', 'admin'], ['staff', 'staff'], ['students', 'student']];
    for (const [table, role] of tables) {
        const { data, error } = await supabaseClient
            .from(table)
            .select('id')
            .eq('id', userId)
            .maybeSingle();
        if (error) throw error;
        if (data) return role;
    }
    return null;
}

document.getElementById('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    messageBox.className = 'message';
    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) {
            showMessage('Email or password is not correct.', 'err');
            return;
        }

        const role = await findRole(data.user.id);
        if (!role) {
            await supabaseClient.auth.signOut();
            showMessage('Your account has no role yet. Please contact the administrator.', 'err');
            return;
        }

        if (role === 'student') {
            window.location.href = 'student-dashboard.html';
            return;
        }
        if (role === 'staff') {
            window.location.href = 'staff-dashboard.html';
            return;
        }
        if (role === 'admin') {
            window.location.href = 'admin-dashboard.html';
            return;
        }

        showMessage('Login successful. You are signed in as: ' + role, 'ok');
    } catch (err) {
        showMessage('Something went wrong: ' + err.message, 'err');
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Log in';
    }
});