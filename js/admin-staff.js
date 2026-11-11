// Names shown on screen. Each office has a fixed code in the database, so renaming an office never breaks anything.
const DISPLAY_NAMES = {
    'HOD': 'HOD',
    'DEAN': 'Faculty Dean',
    'LIBRARY': 'Library',
    'HEALTH': 'Health / Clinic',
    'SPORTS': 'Sports (University Coach)',
    'HOSTEL': 'Hostel (Caretaker)',
    'BURSARY': 'Bursary',
    'HALL': 'Hall Administrator'
};

let units = [];
let faculties = [];
let departments = [];
let staffList = [];

// A separate, temporary connection used only to create a login for a new officer.
// It does not store anything in the browser, so the administrator stays signed in.
const creator = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: 'buk-staff-creator'
    }
});

function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function officeName(unitId) {
    const unit = units.find(u => u.unit_id === unitId);
    return unit ? (DISPLAY_NAMES[unit.code] || unit.unit_name) : 'Office';
}

// The department (for an HOD) or faculty (for a Dean) an officer is responsible for
function scopeName(staff) {
    if (staff.department_id) {
        const department = departments.find(d => d.department_id === staff.department_id);
        return department ? department.name : '';
    }
    if (staff.faculty_id) {
        const faculty = faculties.find(f => f.faculty_id === staff.faculty_id);
        return faculty ? faculty.name : '';
    }
    return '';
}

function showPageError(text) {
    const box = document.getElementById('page-error');
    box.textContent = text;
    box.className = 'message err';
}

const formMessage = document.getElementById('form-message');
function showFormMessage(text, type) {
    formMessage.textContent = text;
    formMessage.className = 'message ' + type;
}

document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.href = 'index.html';
});

function showStaff() {
    document.getElementById('staff-body').innerHTML = staffList.length === 0
        ? '<tr><td colspan="5" style="text-align:center; color:var(--muted);">No staff accounts yet.</td></tr>'
        : staffList.map(s => {
            const scope = scopeName(s);
            return `
      <tr>
        <td>${escapeHtml(s.name)}</td>
        <td>${escapeHtml(officeName(s.unit_id))}${scope ? ' &middot; ' + escapeHtml(scope) : ''}</td>
        <td>${escapeHtml(s.email)}</td>
        <td>${escapeHtml(s.staff_code)}</td>
        <td><span class="pill pill--Active">Active</span></td>
      </tr>`;
        }).join('');
}

function showOfficeChoices() {
    document.getElementById('staff-unit').innerHTML = units
        .map(u => `<option value="${u.unit_id}">${escapeHtml(DISPLAY_NAMES[u.code] || u.unit_name)}</option>`)
        .join('');
}

function selectedUnit() {
    return units.find(u => u.unit_id === Number(document.getElementById('staff-unit').value));
}

// An HOD is tied to a department and a Dean to a faculty. The other offices need neither.
function updateScopeField() {
    const unit = selectedUnit();
    const field = document.getElementById('scope-field');
    const select = document.getElementById('staff-scope');

    if (unit && unit.code === 'HOD') {
        document.getElementById('scope-label').textContent = 'Department';
        document.getElementById('scope-hint').textContent = 'This HOD will see and clear only the students of this department.';
        select.innerHTML = '<option value="">Choose a department</option>' + faculties.map(f =>
            '<optgroup label="' + escapeHtml(f.name) + '">' +
            departments.filter(d => d.faculty_id === f.faculty_id)
                .map(d => `<option value="${d.department_id}">${escapeHtml(d.name)}</option>`).join('') +
            '</optgroup>').join('');
        field.style.display = 'block';
    } else if (unit && unit.code === 'DEAN') {
        document.getElementById('scope-label').textContent = 'Faculty';
        document.getElementById('scope-hint').textContent = 'This Dean will see and clear only the students of this faculty.';
        select.innerHTML = '<option value="">Choose a faculty</option>' +
            faculties.map(f => `<option value="${f.faculty_id}">${escapeHtml(f.name)}</option>`).join('');
        field.style.display = 'block';
    } else {
        field.style.display = 'none';
        select.innerHTML = '';
    }
}
document.getElementById('staff-unit').addEventListener('change', updateScopeField);

async function loadStaffList() {
    const staffRes = await supabaseClient
        .from('staff').select('id, name, staff_code, unit_id, email, faculty_id, department_id').order('name');
    if (staffRes.error) throw staffRes.error;
    staffList = staffRes.data;
    showStaff();
}

async function createStaffAccount(name, staffCode, unitId, email, password, facultyId, departmentId) {
    // Step 1: create the officer's login with the temporary connection
    let userId;
    const signUp = await creator.auth.signUp({ email, password });

    if (signUp.error) {
        if (/already registered/i.test(signUp.error.message)) {
            // An earlier attempt may have created the login but not the staff record
            const signIn = await creator.auth.signInWithPassword({ email, password });
            if (signIn.error) {
                throw new Error('An account with this email already exists. Use a different email.');
            }
            userId = signIn.data.user.id;
        } else {
            throw new Error(signUp.error.message);
        }
    } else {
        userId = signUp.data.user.id;
    }

    // Step 2: make sure this login does not already belong to a student or an officer
    const [studentCheck, staffCheck] = await Promise.all([
        supabaseClient.from('students').select('id').eq('id', userId).maybeSingle(),
        supabaseClient.from('staff').select('id').eq('id', userId).maybeSingle()
    ]);
    if (studentCheck.data) throw new Error('This email already belongs to a student account.');
    if (staffCheck.data) throw new Error('This person is already a staff member.');

    // Step 3: save the staff record (only the administrator is allowed to do this)
    const { error } = await supabaseClient.from('staff').insert({
        id: userId,
        name: name,
        staff_code: staffCode,
        unit_id: unitId,
        email: email,
        faculty_id: facultyId,
        department_id: departmentId
    });
    if (error) {
        if (error.code === '23505') throw new Error('That Staff ID is already used by another officer.');
        throw new Error('Could not save the staff record: ' + error.message);
    }
    await creator.auth.signOut();
}

document.getElementById('staff-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = document.getElementById('staff-name').value.trim();
    const staffCode = document.getElementById('staff-code').value.trim();
    const unit = selectedUnit();
    const email = document.getElementById('staff-email').value.trim().toLowerCase();
    const password = document.getElementById('staff-password').value;
    const confirmPassword = document.getElementById('staff-confirm').value;
    const scopeValue = Number(document.getElementById('staff-scope').value);

    formMessage.className = 'message';

    let departmentId = null;
    let facultyId = null;
    if (unit.code === 'HOD') {
        if (!scopeValue) {
            showFormMessage('Please choose the department this HOD is responsible for.', 'err');
            return;
        }
        departmentId = scopeValue;
    } else if (unit.code === 'DEAN') {
        if (!scopeValue) {
            showFormMessage('Please choose the faculty this Dean is responsible for.', 'err');
            return;
        }
        facultyId = scopeValue;
    }

    if (password.length < 8) {
        showFormMessage('The password must be at least 8 characters.', 'err');
        return;
    }
    if (password !== confirmPassword) {
        showFormMessage('The two passwords do not match.', 'err');
        return;
    }

    const button = document.getElementById('create-btn');
    button.disabled = true;
    button.textContent = 'Creating...';

    try {
        await createStaffAccount(name, staffCode, unit.unit_id, email, password, facultyId, departmentId);
        document.getElementById('staff-form').reset();
        updateScopeField();
        showFormMessage('Staff account created for ' + name + '. They can sign in with ' + email + '.', 'ok');
        await loadStaffList();
    } catch (err) {
        showFormMessage(err.message, 'err');
    } finally {
        button.disabled = false;
        button.textContent = 'Create Staff Account';
    }
});

async function loadPage() {
    try {
        const { data: sessionData } = await supabaseClient.auth.getSession();
        const session = sessionData.session;
        if (!session) {
            window.location.href = 'index.html';
            return;
        }

        const adminRes = await supabaseClient
            .from('admins').select('id, name').eq('id', session.user.id).maybeSingle();
        if (adminRes.error) throw adminRes.error;
        if (!adminRes.data) {
            showPageError('This page is for the administrator. Please log out and sign in with the administrator account.');
            return;
        }
        document.getElementById('side-name').textContent = adminRes.data.name;

        const [unitsRes, facultiesRes, departmentsRes] = await Promise.all([
            supabaseClient.from('clearance_units').select('unit_id, unit_name, code, stage').order('unit_id'),
            supabaseClient.from('faculties').select('faculty_id, name').order('name'),
            supabaseClient.from('departments').select('department_id, faculty_id, name').order('name')
        ]);
        if (unitsRes.error) throw unitsRes.error;
        if (facultiesRes.error) throw facultiesRes.error;
        if (departmentsRes.error) throw departmentsRes.error;
        units = unitsRes.data;
        faculties = facultiesRes.data;
        departments = departmentsRes.data;

        showOfficeChoices();
        updateScopeField();
        await loadStaffList();
    } catch (err) {
        showPageError('Could not load this page: ' + err.message);
    }
}

loadPage();