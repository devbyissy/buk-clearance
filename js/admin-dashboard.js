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

const RING_LENGTH = 276.46; // the distance around the progress ring

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

function showStats(stats) {
    const total = stats.total_students;
    const full = stats.fully_cleared;
    const pending = stats.pending_clearance;

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-full').textContent = full;
    document.getElementById('stat-pending').textContent = pending;
    document.getElementById('stat-staff').textContent = stats.staff_accounts;

    document.getElementById('ring-num').textContent = full + '/' + total;
    const ring = document.getElementById('ring-bar');
    ring.style.opacity = full === 0 ? 0 : 1;
    ring.style.strokeDasharray = ((total === 0 ? 0 : full / total) * RING_LENGTH) + ' ' + RING_LENGTH;

    document.getElementById('welcome-sub').textContent = total === 0
        ? 'No students have registered yet.'
        : total + (total === 1 ? ' student has' : ' students have') + ' registered. ' +
        full + ' fully cleared and ' + pending + ' still in progress.';

    document.getElementById('areas-body').innerHTML = stats.areas.map(a => `
    <tr>
      <td>${escapeHtml(DISPLAY_NAMES[a.code] || a.unit_name)}</td>
      <td>${a.pending}</td>
      <td>${a.cleared}</td>
    </tr>`).join('');
}

async function loadAdmin() {
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
        document.getElementById('welcome-title').textContent = 'Welcome, ' + adminRes.data.name;

        const statsRes = await supabaseClient.rpc('admin_stats');
        if (statsRes.error) throw statsRes.error;
        showStats(statsRes.data);
    } catch (err) {
        showPageError('Could not load the figures: ' + err.message);
    }
}

loadAdmin();