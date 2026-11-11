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

const STAGE_LABELS = {
    1: 'Stage 1',
    2: 'Stage 2',
    3: 'Stage 3 (these five open together)',
    4: 'Final stage'
};

function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function showPageError(text) {
    const box = document.getElementById('page-error');
    box.textContent = text;
    box.className = 'message err';
}

document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.href = 'index.html';
});

const NOT_ASSIGNED = '<span style="color:var(--orange);">Not assigned yet</span>';

function names(people) {
    return people.length === 0 ? NOT_ASSIGNED : people.map(s => escapeHtml(s.name)).join(', ');
}

function line(label, people) {
    return `<div style="padding:2px 0;"><strong style="font-weight:500;">${escapeHtml(label)}:</strong> ${names(people)}</div>`;
}

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

        const [unitsRes, staffRes, facultiesRes, departmentsRes] = await Promise.all([
            supabaseClient.from('clearance_units').select('unit_id, unit_name, code, stage').order('unit_id'),
            supabaseClient.from('staff').select('id, name, unit_id, faculty_id, department_id').order('name'),
            supabaseClient.from('faculties').select('faculty_id, name').order('name'),
            supabaseClient.from('departments').select('department_id, faculty_id, name').order('name')
        ]);
        if (unitsRes.error) throw unitsRes.error;
        if (staffRes.error) throw staffRes.error;
        if (facultiesRes.error) throw facultiesRes.error;
        if (departmentsRes.error) throw departmentsRes.error;

        const faculties = facultiesRes.data;
        const departments = departmentsRes.data;

        document.getElementById('areas-body').innerHTML = unitsRes.data.map((unit, i) => {
            const assigned = staffRes.data.filter(s => s.unit_id === unit.unit_id);
            let cell;

            if (unit.code === 'HOD') {
                // one line for every department, so a department with no HOD stands out
                cell = faculties.map(f => departments
                    .filter(d => d.faculty_id === f.faculty_id)
                    .map(d => line(d.name, assigned.filter(s => s.department_id === d.department_id)))
                    .join('')).join('');
                const unplaced = assigned.filter(s => !s.department_id);
                if (unplaced.length) cell += line('No department set', unplaced);
            } else if (unit.code === 'DEAN') {
                cell = faculties.map(f => line(f.name, assigned.filter(s => s.faculty_id === f.faculty_id))).join('');
                const unplaced = assigned.filter(s => !s.faculty_id);
                if (unplaced.length) cell += line('No faculty set', unplaced);
            } else {
                cell = names(assigned);
            }

            return `<tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(DISPLAY_NAMES[unit.code] || unit.unit_name)}</td>
        <td>${escapeHtml(STAGE_LABELS[unit.stage] || '-')}</td>
        <td>${cell}</td>
      </tr>`;
        }).join('');
    } catch (err) {
        showPageError('Could not load this page: ' + err.message);
    }
}

loadPage();