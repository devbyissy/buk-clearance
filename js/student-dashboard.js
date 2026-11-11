// Names shown on screen. Each office has a fixed code in the database, so renaming an office never breaks the rules.
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
const JOURNEY_NAMES = {
    'HOD': 'HOD',
    'DEAN': 'Faculty Dean',
    'LIBRARY': 'Library',
    'HEALTH': 'Health / Clinic',
    'SPORTS': 'Sports',
    'HOSTEL': 'Hostel',
    'BURSARY': 'Bursary',
    'HALL': 'Hall Administrator'
};

// What each clearance office needs from the student (from the investigation in Chapter 3)
const AREA_REQUIREMENTS = {
    'HOD': 'Your name must be on the departmental graduating list and your Final Year Project must be submitted.',
    'DEAN': 'The Faculty Dean countersigns after the departmental checks are complete.',
    'LIBRARY': 'Return your library borrowing card. A fine of ₦500 applies if it was lost or never registered.',
    'HEALTH': 'Return your medical (doctor\'s) folder card. A fine of ₦500 applies if it was lost or never registered.',
    'SPORTS': 'Return any sports equipment issued to you. If you never registered for sports, the University Coach will confirm this.',
    'HOSTEL': 'Return your bed, key and mattress. If you were never in the hostel, the Caretaker will confirm this.',
    'BURSARY': 'Submit your Remita receipts for Levels 1 to 4. The RRR on each receipt is checked.',
    'HALL': 'This is the final sign-off by the Hall Administrator, given after the seven other offices have cleared you.'
};

const RING_LENGTH = 276.46; // the distance around the progress ring
const LOCK_ICON = '<svg class="icon icon--sm" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

let areas = []; // one entry per clearance office, built from the database

function displayName(area) { return DISPLAY_NAMES[area.code] || area.name; }

function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDate(value) {
    if (!value) return '';
    return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
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
    window.toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}

// Work out the status of every office. Locked is worked out here from the stages.
// (The database enforces the same rules, so hiding a button is never the only protection.)
//   Stage 1 = HOD, Stage 2 = Faculty Dean, Stage 3 = the five middle offices, Stage 4 = Hall Administrator
function buildAreas(units, records) {
    const list = units.map(unit => {
        const record = records.find(r => r.unit_id === unit.unit_id);
        return {
            id: unit.unit_id,
            name: unit.unit_name,
            code: unit.code,
            stage: unit.stage,
            stored: record ? record.status : 'Not requested',
            comment: record ? record.comment : null,
            date: record ? record.date_actioned : null
        };
    });

    const knownStage = a => a.stage === 1 || a.stage === 2 || a.stage === 3 || a.stage === 4;
    const stageIsCleared = stage => {
        const inStage = list.filter(a => a.stage === stage);
        return inStage.length > 0 && inStage.every(a => a.stored === 'Cleared');
    };
    const beforeFinal = list.filter(a => knownStage(a) && a.stage < 4);
    const clearedBeforeFinal = beforeFinal.filter(a => a.stored === 'Cleared').length;

    list.forEach(area => {
        area.status = area.stored; // Pending, Cleared or Rejected
        area.lockHint = '';
        if (area.stored === 'Not requested') {
            let hint = '';
            if (!knownStage(area)) {
                hint = 'Not available yet.';
            } else if (area.stage === 2 && !stageIsCleared(1)) {
                hint = 'Unlocks after the HOD clears you.';
            } else if (area.stage === 3 && !stageIsCleared(2)) {
                hint = 'Unlocks after the Faculty Dean clears you.';
            } else if (area.stage === 4 && clearedBeforeFinal < beforeFinal.length) {
                hint = 'Unlocks after all seven other offices clear you (' + clearedBeforeFinal + ' of ' + beforeFinal.length + ' so far).';
            }
            area.lockHint = hint;
            area.status = hint ? 'Locked' : 'Open'; // Open = ready for the student to request
        }
    });
    return list;
}

function showProfile(student) {
    document.getElementById('side-name').textContent = student.name;
    document.getElementById('side-matric').textContent = student.matric_no;
    document.getElementById('welcome-title').textContent = 'Welcome, ' + student.name.split(' ')[0];
    document.getElementById('profile-grid').innerHTML = `
    <div class="profile-grid__item"><span>Name</span>${escapeHtml(student.name)}</div>
    <div class="profile-grid__item"><span>Matric number</span>${escapeHtml(student.matric_no)}</div>
    <div class="profile-grid__item"><span>Faculty</span>${escapeHtml(student.faculty)}</div>
    <div class="profile-grid__item"><span>Department</span>${escapeHtml(student.department)}</div>
    <div class="profile-grid__item"><span>Level</span>${escapeHtml(student.level)}</div>
    <div class="profile-grid__item"><span>Email</span>${escapeHtml(student.email)}</div>
  `;
}

function showStats(payments) {
    const total = areas.length;
    const cleared = areas.filter(a => a.status === 'Cleared').length;
    const pending = areas.filter(a => a.status === 'Pending').length;
    const rejected = areas.filter(a => a.status === 'Rejected').length;
    const open = areas.filter(a => a.status === 'Open');
    const outstanding = payments
        .filter(p => p.status === 'Unpaid')
        .reduce((sum, p) => sum + Number(p.amount), 0);

    document.getElementById('stat-cleared').textContent = cleared + '/' + total;
    document.getElementById('stat-pending').textContent = pending;
    document.getElementById('stat-rejected').textContent = rejected;
    document.getElementById('stat-outstanding').textContent = '₦' + outstanding.toLocaleString('en-NG');

    document.getElementById('ring-num').textContent = cleared + '/' + total;
    document.querySelector('.ring__label').textContent = cleared === total ? 'Complete' : 'Cleared';
    const ring = document.getElementById('ring-bar');
    ring.style.opacity = cleared === 0 ? 0 : 1;
    ring.style.strokeDasharray = ((cleared / total) * RING_LENGTH) + ' ' + RING_LENGTH;

    let sub;
    if (cleared === total) {
        sub = 'Your clearance is complete. Congratulations!';
    } else if (rejected > 0) {
        sub = rejected + (rejected === 1 ? ' office needs' : ' offices need') + ' your attention before you can continue.';
    } else if (open.length === 1) {
        sub = 'Next step: request clearance from the ' + displayName(open[0]) + '.';
    } else if (open.length > 1) {
        sub = 'You can now request clearance from ' + open.length + ' offices.';
    } else {
        sub = 'Your requests are waiting for review.';
    }
    document.getElementById('welcome-sub').textContent = sub;
    document.getElementById('confirmation-banner').style.display = (cleared === total) ? 'block' : 'none';
}

function showJourney() {
    document.getElementById('journey').innerHTML = areas.map((a, i) => {
        let symbol;
        if (a.status === 'Cleared') symbol = '&#10003;';
        else if (a.status === 'Rejected') symbol = '&#10005;';
        else if (a.status === 'Locked') symbol = LOCK_ICON;
        else symbol = i + 1;
        const label = a.status === 'Open' ? 'Ready to request' : a.status;
        const road = (i > 0 && a.status !== 'Locked') ? ' station--road' : '';
        return `
      <div class="station station--${a.status}${road}">
        <div class="station__dot">${symbol}</div>
        <div class="station__name">${escapeHtml(JOURNEY_NAMES[a.code] || a.name)}</div>
        <div class="station__status">${label}</div>
      </div>`;
    }).join('');
}

function statusCell(a) {
    if (a.status === 'Locked') return `<span class="pill pill--Locked">${LOCK_ICON}Locked</span>`;
    if (a.status === 'Open') return `<span class="not-requested">Not requested</span>`;
    return `<span class="pill pill--${a.status}">${a.status}</span>`;
}

function actionCell(a) {
    if (a.status === 'Open') {
        const label = a.stage === 4 ? 'Request Final Clearance' : 'Request Clearance';
        return `<button class="btn btn--sm" data-request="${a.id}">${label}</button>`;
    }
    if (a.status === 'Locked') {
        return `<span class="lock-hint">${escapeHtml(a.lockHint)}</span>`;
    }
    if (a.status === 'Pending') {
        return `<button class="btn btn--outline btn--sm" data-view="${a.id}">View</button>`;
    }
    if (a.status === 'Rejected') {
        return `<div class="row-actions">
      <button class="btn btn--outline btn--sm" data-view="${a.id}">View Reason</button>
      <button class="btn btn--sm" data-request="${a.id}">Request Again</button>
    </div>`;
    }
    return `<span class="lock-hint">${a.date ? 'Cleared on ' + escapeHtml(formatDate(a.date)) : '-'}</span>`;
}

function showTable() {
    document.getElementById('progress-body').innerHTML = areas.map(a => `
    <tr>
      <td>${escapeHtml(displayName(a))}</td>
      <td>${statusCell(a)}</td>
      <td>${actionCell(a)}</td>
    </tr>`).join('');
}

function openModal(html, addCloseButton = true) {
    const extra = addCloseButton
        ? '<div class="modal__actions"><button class="btn btn--outline btn--sm" id="modal-close">Close</button></div>'
        : '';
    document.getElementById('modal-box').innerHTML = html + extra;
    document.getElementById('modal-backdrop').classList.add('show');
    if (addCloseButton) {
        document.getElementById('modal-close').addEventListener('click', closeModal);
    }
}
function closeModal() {
    document.getElementById('modal-backdrop').classList.remove('show');
}
document.getElementById('modal-backdrop').addEventListener('click', (event) => {
    if (event.target.id === 'modal-backdrop') closeModal();
});

function findArea(unitId) {
    return areas.find(a => String(a.id) === String(unitId));
}

function openDetails(unitId) {
    const area = findArea(unitId);
    if (!area) return;
    const requirement = AREA_REQUIREMENTS[area.code] || '';
    const name = escapeHtml(displayName(area));
    let html;

    if (area.status === 'Rejected') {
        const when = formatDate(area.date);
        html = `<h3>${name}: Rejected</h3>
      <p>${escapeHtml(area.comment || 'No reason was recorded.')}${when ? ' (' + escapeHtml(when) + ')' : ''}</p>
      <p>When you have fixed this, press Request Again.</p>`;
    } else {
        html = `<h3>${name}: Pending</h3>
      <p>Your request is waiting for review by the ${name} office.</p>`;
        if (area.comment) {
            html += `<p>Last time this office rejected your request: ${escapeHtml(area.comment)}</p>`;
        }
    }
    if (requirement) {
        html += `<div class="req-note"><strong>What this office needs</strong>${escapeHtml(requirement)}</div>`;
    }
    openModal(html);
}

function confirmRequest(unitId) {
    const area = findArea(unitId);
    if (!area) return;
    const isFinal = area.stage === 4;
    openModal(`
    <h3>${isFinal ? 'Request final clearance' : 'Request clearance'}</h3>
    <p>Send your request to the ${escapeHtml(displayName(area))} office? The officer will see it on their dashboard.</p>
    <div class="modal__actions">
      <button class="btn btn--outline btn--sm" id="modal-cancel">Cancel</button>
      <button class="btn btn--sm" id="modal-send">Send request</button>
    </div>`, false);
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('modal-send').addEventListener('click', () => sendRequest(area));
}

async function sendRequest(area) {
    const sendButton = document.getElementById('modal-send');
    sendButton.disabled = true;
    sendButton.textContent = 'Sending...';

    const { error } = await supabaseClient.rpc('request_clearance', { p_unit_id: area.id });
    closeModal();

    if (error) {
        showToast(error.message);
    } else {
        showToast('Request sent to ' + displayName(area) + '.');
    }
    await loadDashboard(); // always show what the database now says
}

document.getElementById('progress-body').addEventListener('click', (event) => {
    const viewButton = event.target.closest('button[data-view]');
    if (viewButton) {
        openDetails(viewButton.dataset.view);
        return;
    }
    const requestButton = event.target.closest('button[data-request]');
    if (requestButton) {
        confirmRequest(requestButton.dataset.request);
    }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.href = 'index.html';
});

async function loadDashboard() {
    try {
        const { data: sessionData } = await supabaseClient.auth.getSession();
        const session = sessionData.session;
        if (!session) {
            window.location.href = 'index.html';
            return;
        }
        const userId = session.user.id;

        const [studentRes, unitsRes, recordsRes, paymentsRes] = await Promise.all([
            supabaseClient.from('students').select('*').eq('id', userId).maybeSingle(),
            supabaseClient.from('clearance_units').select('unit_id, unit_name, code, stage').order('unit_id'),
            supabaseClient.from('clearance_records').select('unit_id, status, comment, date_actioned').eq('student_id', userId),
            supabaseClient.from('payments').select('payment_id, unit_id, reason, amount, status').eq('student_id', userId)
        ]);

        const problem = studentRes.error || unitsRes.error || recordsRes.error || paymentsRes.error;
        if (problem) throw problem;

        const student = studentRes.data;
        if (!student) {
            showPageError('This page is for student accounts. Please log out and sign in with a student account.');
            return;
        }

        areas = buildAreas(unitsRes.data, recordsRes.data);

        showProfile(student);
        showStats(paymentsRes.data);
        showJourney();
        showTable();
    } catch (err) {
        showPageError('Could not load your clearance information: ' + err.message);
    }
}

loadDashboard();