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

let officer = null;   // the logged-in staff member
let myUnit = null;    // the office this officer works for
let allUnits = [];    // all eight offices
let queue = [];       // requests waiting for this office
let current = null;   // the request being reviewed

function displayName(unit) { return DISPLAY_NAMES[unit.code] || unit.unit_name; }

function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDate(value) {
    if (!value) return '';
    return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatNaira(amount) {
    return '₦' + Number(amount).toLocaleString('en-NG');
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

function openModal(html) {
    document.getElementById('modal-box').innerHTML = html;
    document.getElementById('modal-backdrop').classList.add('show');
}
function closeModal() {
    document.getElementById('modal-backdrop').classList.remove('show');
}
document.getElementById('modal-backdrop').addEventListener('click', (event) => {
    if (event.target.id === 'modal-backdrop') closeModal();
});

function statusCell(status) {
    if (status === 'Not requested') return '<span class="not-requested">Not requested</span>';
    return `<span class="pill pill--${escapeHtml(status)}">${escapeHtml(status)}</span>`;
}

function showList() {
    document.getElementById('detail-view').style.display = 'none';
    document.getElementById('list-view').style.display = 'block';
    window.scrollTo(0, 0);
}

function showHeader(clearedToday, rejected) {
    const office = displayName(myUnit);
    const waiting = queue.length;
    document.getElementById('side-name').textContent = officer.name;
    document.getElementById('side-office').textContent = office;
    document.getElementById('welcome-title').textContent = 'Welcome, ' + officer.name;
    document.getElementById('welcome-sub').textContent = 'Your Unit: ' + office + '. ' +
        (waiting === 0
            ? 'No requests are waiting for you right now.'
            : waiting + (waiting === 1 ? ' request is' : ' requests are') + ' waiting for your review.');
    document.getElementById('badge-num').textContent = waiting;
    document.getElementById('stat-pending').textContent = waiting;
    document.getElementById('stat-today').textContent = clearedToday;
    document.getElementById('stat-rejected').textContent = rejected;
}

function showQueue() {
    const term = document.getElementById('search').value.trim().toLowerCase();
    const rows = queue.filter(item =>
        !term ||
        item.student.name.toLowerCase().includes(term) ||
        item.student.matric_no.toLowerCase().includes(term));

    const body = document.getElementById('queue-body');
    if (rows.length === 0) {
        body.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--muted);">
      ${queue.length === 0 ? 'No requests are waiting for your office right now.' : 'No student matches that search.'}
    </td></tr>`;
        return;
    }
    body.innerHTML = rows.map(item => `
    <tr>
      <td>${escapeHtml(item.student.name)}</td>
      <td>${escapeHtml(item.student.matric_no)}</td>
      <td><span class="pill pill--Pending">Pending</span></td>
      <td><button class="btn btn--sm" data-record="${item.recordId}">View</button></td>
    </tr>`).join('');
}

document.getElementById('search').addEventListener('input', showQueue);

document.getElementById('queue-body').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-record]');
    if (button) openReview(button.dataset.record);
});

// Open the review page for one student
async function openReview(recordId, keepScroll = false) {
    const item = queue.find(q => String(q.recordId) === String(recordId));
    if (!item) return;
    current = item;

    const { data: records, error } = await supabaseClient
        .from('clearance_records')
        .select('record_id, unit_id, status, comment, date_actioned')
        .eq('student_id', item.student.id);
    if (error) {
        showToast('Could not load this student: ' + error.message);
        return;
    }

    // Only the Library and Health offices charge a card fee
    let fees = [];
    if (myUnit.code === 'LIBRARY' || myUnit.code === 'HEALTH') {
        const feesRes = await supabaseClient
            .from('payments')
            .select('payment_id, reason, amount, status, rrr, date_paid, waived_by_name, waived_at, waive_reason')
            .eq('student_id', item.student.id)
            .eq('unit_id', myUnit.unit_id)
            .order('payment_id');
        if (feesRes.error) {
            showToast('Could not load fee details: ' + feesRes.error.message);
            return;
        }
        fees = feesRes.data;
    }

    const s = item.student;
    document.getElementById('detail-profile').innerHTML = `
    <div class="profile-grid__item"><span>Name</span>${escapeHtml(s.name)}</div>
    <div class="profile-grid__item"><span>Matric number</span>${escapeHtml(s.matric_no)}</div>
    <div class="profile-grid__item"><span>Faculty</span>${escapeHtml(s.faculty)}</div>
    <div class="profile-grid__item"><span>Department</span>${escapeHtml(s.department)}</div>
    <div class="profile-grid__item"><span>Level</span>${escapeHtml(s.level)}</div>
    <div class="profile-grid__item"><span>Email</span>${escapeHtml(s.email)}</div>
  `;

    document.getElementById('detail-offices').innerHTML = allUnits.map(unit => {
        const record = records.find(r => r.unit_id === unit.unit_id);
        const status = record ? record.status : 'Not requested';
        const showDate = (status === 'Cleared' || status === 'Rejected') && record.date_actioned;
        const mine = unit.unit_id === myUnit.unit_id ? ' class="row--mine"' : '';
        return `<tr${mine}>
      <td>${escapeHtml(displayName(unit))}</td>
      <td>${statusCell(status)}</td>
      <td>${showDate ? escapeHtml(formatDate(record.date_actioned)) : '-'}</td>
    </tr>`;
    }).join('');

    document.getElementById('detail-note').innerHTML = myUnit.stage === 4
        ? '<div class="req-note"><strong>Final clearance</strong>Check that all seven earlier offices show Cleared, with their dates, before you give final clearance.</div>'
        : '';

    document.getElementById('history-title').textContent = 'Previous action by ' + displayName(myUnit);
    document.getElementById('detail-history').innerHTML = item.comment
        ? `<div class="history-item">
         <span class="pill pill--Rejected">Rejected</span>
         <span class="history-date">${escapeHtml(formatDate(item.date))}</span>
         <p>${escapeHtml(item.comment)}</p>
       </div>`
        : `<p class="muted">No previous action recorded for ${escapeHtml(displayName(myUnit))}.</p>`;

    showFeeCard(fees);

    document.getElementById('reason-box').classList.remove('open');
    document.getElementById('reason-text').value = '';
    document.getElementById('list-view').style.display = 'none';
    document.getElementById('detail-view').style.display = 'block';
    if (!keepScroll) window.scrollTo(0, 0);
}

// The card fee box (Library and Health only)
function feeLine(f) {
    let detail = escapeHtml(f.reason) + ' &middot; ' + formatNaira(f.amount);
    if (f.status === 'Paid') {
        detail += ' &middot; RRR ' + escapeHtml(f.rrr) + ' &middot; ' + escapeHtml(formatDate(f.date_paid));
    }
    let extra = '';
    if (f.status === 'Waived') {
        extra = `<p>Waived by ${escapeHtml(f.waived_by_name || 'an officer')} on ${escapeHtml(formatDate(f.waived_at))}. Reason: ${escapeHtml(f.waive_reason)}</p>`;
    }
    return `<div class="history-item">
    <span class="pill pill--${escapeHtml(f.status)}">${escapeHtml(f.status)}</span>
    <span class="history-date">${detail}</span>
    ${extra}
  </div>`;
}

function showFeeCard(fees) {
    const card = document.getElementById('fee-card');
    const clearButton = document.getElementById('clear-btn');
    clearButton.disabled = false;
    clearButton.title = '';

    if (!(myUnit.code === 'LIBRARY' || myUnit.code === 'HEALTH')) {
        card.style.display = 'none';
        return;
    }
    card.style.display = 'block';

    const info = document.getElementById('fee-info');
    const actions = document.getElementById('fee-actions');
    const unpaidFee = fees.find(f => f.status === 'Unpaid');
    const hasActiveFee = fees.some(f => f.status !== 'Waived'); // a waived fee no longer counts
    actions.innerHTML = '';

    info.innerHTML = fees.length === 0
        ? '<p class="muted">No fee has been charged to this student for this office.</p>'
        : fees.map(feeLine).join('');

    if (!hasActiveFee) {
        actions.innerHTML = '<button class="btn btn--outline btn--sm" id="charge-btn">Charge ₦500 card fee</button>';
        document.getElementById('charge-btn').addEventListener('click', confirmCharge);
    }

    if (unpaidFee) {
        actions.innerHTML = '<button class="btn btn--outline btn--sm" id="waive-btn">Waive fee</button>';
        document.getElementById('waive-btn').addEventListener('click', () => confirmWaive(unpaidFee));
        info.innerHTML += '<div class="req-note"><strong>Unpaid fee</strong>This student must pay the fee on their Payments page before you can clear them, unless you waive it.</div>';
        clearButton.disabled = true;
        clearButton.title = 'The student still has an unpaid fee';
    }
}

function confirmCharge() {
    const kind = myUnit.code === 'LIBRARY' ? 'Library' : 'Health';
    openModal(`
    <h3>Charge the card fee?</h3>
    <p>${escapeHtml(current.student.name)} will be charged ₦500 for a lost ${kind} card. They will see it on their Payments page and must pay it before you can clear them.</p>
    <div class="modal__actions">
      <button class="btn btn--outline btn--sm" id="modal-cancel">Cancel</button>
      <button class="btn btn--sm" id="modal-charge">Yes, charge the fee</button>
    </div>`);
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('modal-charge').addEventListener('click', async (event) => {
        event.target.disabled = true;
        event.target.textContent = 'Saving...';
        const { error } = await supabaseClient.rpc('charge_card_fee', { p_student_id: current.student.id });
        closeModal();
        showToast(error ? error.message : 'The ₦500 card fee has been charged.');
        await openReview(current.recordId, true); // show what the database now says
    });
}

function confirmWaive(fee) {
    openModal(`
    <h3>Waive this fee?</h3>
    <p>${escapeHtml(fee.reason)} (${formatNaira(fee.amount)}) for ${escapeHtml(current.student.name)} will be cancelled. Your name and your reason are recorded.</p>
    <div class="field">
      <label for="waive-reason">Reason for waiving (required)</label>
      <textarea id="waive-reason" placeholder="e.g. Charged by mistake"></textarea>
    </div>
    <div class="modal__actions">
      <button class="btn btn--outline btn--sm" id="modal-cancel">Cancel</button>
      <button class="btn btn--sm" id="modal-waive">Yes, waive the fee</button>
    </div>`);
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('modal-waive').addEventListener('click', async (event) => {
        const reason = document.getElementById('waive-reason').value.trim();
        if (!reason) {
            showToast('Please type the reason for waiving the fee.');
            return;
        }
        event.target.disabled = true;
        event.target.textContent = 'Saving...';
        const { error } = await supabaseClient.rpc('waive_fee', { p_payment_id: fee.payment_id, p_reason: reason });
        closeModal();
        showToast(error ? error.message : 'The fee has been waived and recorded.');
        await openReview(current.recordId, true); // show what the database now says
    });
}
document.getElementById('back-btn').addEventListener('click', showList);

// Send the decision to the database. The database checks that this officer may decide on this request.
async function submitReview(decision, comment) {
    const name = current.student.name;
    const { error } = await supabaseClient.rpc('review_clearance', {
        p_record_id: current.recordId,
        p_decision: decision,
        p_comment: comment
    });
    closeModal();

    if (error) {
        showToast(error.message);
    } else if (decision === 'Cleared') {
        showToast(name + ' has been cleared.');
    } else {
        showToast(name + ' has been rejected. The reason was saved.');
    }
    await loadStaff(); // always show what the database now says
}

document.getElementById('clear-btn').addEventListener('click', () => {
    openModal(`
    <h3>Clear this student?</h3>
    <p>${escapeHtml(current.student.name)} will be marked Cleared for ${escapeHtml(displayName(myUnit))}. This cannot be undone.</p>
    <div class="modal__actions">
      <button class="btn btn--outline btn--sm" id="modal-cancel">Cancel</button>
      <button class="btn btn--success btn--sm" id="modal-confirm">Yes, clear student</button>
    </div>`);
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('modal-confirm').addEventListener('click', (event) => {
        event.target.disabled = true;
        event.target.textContent = 'Saving...';
        submitReview('Cleared', null);
    });
});

document.getElementById('reject-btn').addEventListener('click', () => {
    document.getElementById('reason-box').classList.toggle('open');
});
document.getElementById('reason-cancel').addEventListener('click', () => {
    document.getElementById('reason-box').classList.remove('open');
});
document.getElementById('reason-submit').addEventListener('click', (event) => {
    const reason = document.getElementById('reason-text').value.trim();
    if (!reason) {
        showToast('Please type the reason for rejection first.');
        return;
    }
    event.target.disabled = true;
    event.target.textContent = 'Saving...';
    submitReview('Rejected', reason).then(() => {
        event.target.disabled = false;
        event.target.textContent = 'Submit Rejection';
    });
});

document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.href = 'index.html';
});

async function loadStaff() {
    try {
        const { data: sessionData } = await supabaseClient.auth.getSession();
        const session = sessionData.session;
        if (!session) {
            window.location.href = 'index.html';
            return;
        }
        const userId = session.user.id;

        const staffRes = await supabaseClient
            .from('staff').select('id, name, staff_code, unit_id, email').eq('id', userId).maybeSingle();
        if (staffRes.error) throw staffRes.error;
        if (!staffRes.data) {
            showPageError('This page is for staff accounts. Please log out and sign in with a staff account.');
            return;
        }
        officer = staffRes.data;

        const unitsRes = await supabaseClient
            .from('clearance_units').select('unit_id, unit_name, code, stage').order('unit_id');
        if (unitsRes.error) throw unitsRes.error;
        allUnits = unitsRes.data;
        myUnit = allUnits.find(u => u.unit_id === officer.unit_id);
        if (!myUnit) throw new Error('Your account is not linked to a clearance office.');

        const recordsRes = await supabaseClient
            .from('clearance_records')
            .select('record_id, student_id, status, comment, date_actioned')
            .eq('unit_id', officer.unit_id);
        if (recordsRes.error) throw recordsRes.error;
        const records = recordsRes.data;

        const pending = records.filter(r => r.status === 'Pending');
        const rejected = records.filter(r => r.status === 'Rejected').length;
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const clearedToday = records.filter(r =>
            r.status === 'Cleared' && r.date_actioned && new Date(r.date_actioned) >= startOfToday).length;

        let students = [];
        if (pending.length > 0) {
            const studentsRes = await supabaseClient
                .from('students').select('*').in('id', pending.map(r => r.student_id));
            if (studentsRes.error) throw studentsRes.error;
            students = studentsRes.data;
        }

        queue = pending
            .map(r => ({
                recordId: r.record_id,
                student: students.find(s => s.id === r.student_id),
                comment: r.comment,
                date: r.date_actioned
            }))
            .filter(item => item.student)
            .sort((a, b) => a.student.name.localeCompare(b.student.name));

        showHeader(clearedToday, rejected);
        showQueue();
        showList();
    } catch (err) {
        showPageError('Could not load your requests: ' + err.message);
    }
}

loadStaff();