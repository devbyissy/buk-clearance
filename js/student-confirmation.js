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

let student = null;
const originalTitle = document.title;

function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDate(value) {
    if (!value) return '';
    return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

function showPageError(text) {
    const box = document.getElementById('page-error');
    box.textContent = text;
    box.className = 'message err';
}

function showToast(text) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(() => toast.classList.remove('show'), 5000);
}

document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.href = 'index.html';
});

document.getElementById('print-btn').addEventListener('click', () => window.print());

// The browser can save the page as a PDF from its print window, so no extra tool is needed.
document.getElementById('download-btn').addEventListener('click', () => {
    document.title = 'Clearance Confirmation - ' + student.matric_no.replace(/\//g, '-');
    showToast('In the print window, choose "Save as PDF" as the printer, then click Save.');
    setTimeout(() => window.print(), 600);
});
window.addEventListener('afterprint', () => { document.title = originalTitle; });

async function loadConfirmation() {
    try {
        const { data: sessionData } = await supabaseClient.auth.getSession();
        const session = sessionData.session;
        if (!session) {
            window.location.href = 'index.html';
            return;
        }
        const userId = session.user.id;

        const [studentRes, confirmationRes, unitsRes, recordsRes] = await Promise.all([
            supabaseClient.from('students').select('id, name, matric_no, faculty, department').eq('id', userId).maybeSingle(),
            supabaseClient.from('clearance_confirmations').select('confirmation_code, date_issued').eq('student_id', userId).maybeSingle(),
            supabaseClient.from('clearance_units').select('unit_id, unit_name, code').order('unit_id'),
            supabaseClient.from('clearance_records').select('unit_id, status, date_actioned').eq('student_id', userId)
        ]);

        const problem = studentRes.error || confirmationRes.error || unitsRes.error || recordsRes.error;
        if (problem) throw problem;

        if (!studentRes.data) {
            showPageError('This page is for student accounts. Please log out and sign in with a student account.');
            return;
        }
        student = studentRes.data;
        document.getElementById('side-name').textContent = student.name;
        document.getElementById('side-matric').textContent = student.matric_no;

        // The confirmation is created by the database itself, so if it is missing it has not been earned yet
        if (!confirmationRes.data) {
            document.getElementById('not-ready').style.display = 'block';
            return;
        }

        document.getElementById('c-name').textContent = student.name;
        document.getElementById('c-matric').textContent = student.matric_no;
        document.getElementById('c-faculty').textContent = student.faculty;
        document.getElementById('c-department').textContent = student.department;
        document.getElementById('c-code').textContent = confirmationRes.data.confirmation_code;
        document.getElementById('c-date').textContent = formatDate(confirmationRes.data.date_issued);

        document.getElementById('c-offices').innerHTML = unitsRes.data.map(unit => {
            const record = recordsRes.data.find(r => r.unit_id === unit.unit_id);
            return `<tr>
        <td>${escapeHtml(DISPLAY_NAMES[unit.code] || unit.unit_name)}</td>
        <td><span class="pill pill--Cleared">Cleared</span></td>
        <td>${record && record.date_actioned ? escapeHtml(formatDate(record.date_actioned)) : '-'}</td>
      </tr>`;
        }).join('');

        document.getElementById('confirmation').style.display = 'block';
    } catch (err) {
        showPageError('Could not load your Clearance Confirmation: ' + err.message);
    }
}

loadConfirmation();