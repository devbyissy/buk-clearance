const messageBox = document.getElementById('message');
const registerBtn = document.getElementById('register-btn');

let faculties = [];
let departments = [];

function showMessage(text, type) {
    messageBox.textContent = text;
    messageBox.className = 'message ' + type;
}

function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
setupToggle('pw-toggle', 'password');
setupToggle('pw-toggle-2', 'confirm-password');

// The faculty and department lists come from the database, so everyone spells them the same way
async function loadFacultyChoices() {
    const [facultyRes, departmentRes] = await Promise.all([
        supabaseClient.from('faculties').select('faculty_id, name').order('name'),
        supabaseClient.from('departments').select('department_id, faculty_id, name').order('name')
    ]);
    if (facultyRes.error || departmentRes.error) {
        showMessage('Could not load the faculty list. Please refresh the page.', 'err');
        return;
    }
    faculties = facultyRes.data;
    departments = departmentRes.data;

    document.getElementById('faculty').innerHTML =
        '<option value="">Choose your faculty</option>' +
        faculties.map(f => `<option value="${f.faculty_id}">${escapeHtml(f.name)}</option>`).join('');
}

document.getElementById('faculty').addEventListener('change', () => {
    const facultyId = Number(document.getElementById('faculty').value);
    const choices = departments.filter(d => d.faculty_id === facultyId);
    document.getElementById('department').innerHTML = facultyId
        ? '<option value="">Choose your department</option>' +
        choices.map(d => `<option value="${d.department_id}">${escapeHtml(d.name)}</option>`).join('')
        : '<option value="">Choose a faculty first</option>';
});

document.getElementById('register-form').addEventListener('submit', async (event) => {
    event.preventDefault();

    const matric = document.getElementById('matric').value.trim().toUpperCase();
    const name = document.getElementById('name').value.trim();
    const facultyId = Number(document.getElementById('faculty').value);
    const departmentId = Number(document.getElementById('department').value);
    const level = document.getElementById('level').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    messageBox.className = 'message';

    const faculty = faculties.find(f => f.faculty_id === facultyId);
    const department = departments.find(d => d.department_id === departmentId);
    if (!faculty || !department) {
        showMessage('Please choose your faculty and your department.', 'err');
        return;
    }
    if (password.length < 8) {
        showMessage('Password must be at least 8 characters.', 'err');
        return;
    }
    if (password !== confirmPassword) {
        showMessage('The two passwords do not match.', 'err');
        return;
    }

    registerBtn.disabled = true;
    registerBtn.textContent = 'Creating account...';

    try {
        // Step 1: create the login account
        let userId;
        const signUp = await supabaseClient.auth.signUp({ email, password });

        if (signUp.error) {
            if (/already registered/i.test(signUp.error.message)) {
                // An earlier attempt may have created the login but not saved the student details
                const signIn = await supabaseClient.auth.signInWithPassword({ email, password });
                if (signIn.error) {
                    showMessage('An account with this email already exists. Please log in instead.', 'err');
                    return;
                }
                userId = signIn.data.user.id;
                const { data: existing } = await supabaseClient
                    .from('students').select('id').eq('id', userId).maybeSingle();
                if (existing) {
                    await supabaseClient.auth.signOut();
                    showMessage('This account is already registered. Please log in instead.', 'err');
                    return;
                }
            } else {
                showMessage(signUp.error.message, 'err');
                return;
            }
        } else {
            if (!signUp.data.session) {
                showMessage('Account created but you were not signed in. Check that "Confirm email" is switched off in Supabase.', 'err');
                return;
            }
            userId = signUp.data.user.id;
        }

        // Step 2: save the student's details
        const { error: insertError } = await supabaseClient.from('students').insert({
            id: userId,
            matric_no: matric,
            name: name,
            faculty: faculty.name,
            department: department.name,
            department_id: department.department_id,
            level: level,
            email: email
        });

        if (insertError) {
            await supabaseClient.auth.signOut();
            if (insertError.code === '23505') {
                showMessage('That matric number is already registered.', 'err');
            } else {
                showMessage('Could not save your details: ' + insertError.message, 'err');
            }
            return;
        }

        // Step 3: sign out and send the student to the login page
        await supabaseClient.auth.signOut();
        window.location.href = 'index.html?registered=1';
    } catch (err) {
        showMessage('Something went wrong: ' + err.message, 'err');
    } finally {
        registerBtn.disabled = false;
        registerBtn.textContent = 'Create Account';
    }
});

loadFacultyChoices();