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

let student = null;   // the logged-in student
let units = [];       // the eight offices
let payments = [];    // this student's fees

function officeName(unitId) {
    const unit = units.find(u => u.unit_id === unitId);
    return unit ? (DISPLAY_NAMES[unit.code] || unit.unit_name) : 'Office';
}

function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatNaira(amount) {
    return '₦' + Number(amount).toLocaleString('en-NG');
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

function showPayments() {
    const outstanding = payments.filter(p => p.status === 'Unpaid').reduce((sum, p) => sum + Number(p.amount), 0);
    const paid = payments.filter(p => p.status === 'Paid').reduce((sum, p) => sum + Number(p.amount), 0);
    document.getElementById('stat-outstanding').textContent = formatNaira(outstanding);
    document.getElementById('stat-paid').textContent = formatNaira(paid);

    const body = document.getElementById('payments-body');
    if (payments.length === 0) {
        body.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--muted);">
      You have no fees to pay. A fee appears here if an office charges you, for example for a lost card.
    </td></tr>`;
        return;
    }

    body.innerHTML = payments.map(p => {
        let action;
        if (p.status === 'Unpaid') {
            action = `<button class="btn btn--sm" data-pay="${p.payment_id}">Pay Now</button>`;
        } else if (p.status === 'Waived') {
            action = `<span class="paid-note">Waived on ${escapeHtml(formatDate(p.waived_at))}. You do not need to pay this fee.</span>
                <span class="paid-note">Reason: ${escapeHtml(p.waive_reason)}</span>`;
        } else {
            action = `<span class="rrr">RRR ${escapeHtml(p.rrr)}</span>
                <span class="paid-note">Paid on ${escapeHtml(formatDate(p.date_paid))}</span>`;
        }
        return `<tr>
      <td>${escapeHtml(officeName(p.unit_id))}</td>
      <td>${escapeHtml(p.reason)}</td>
      <td>${formatNaira(p.amount)}</td>
      <td><span class="pill pill--${escapeHtml(p.status)}">${escapeHtml(p.status)}</span></td>
      <td>${action}</td>
    </tr>`;
    }).join('');
}

document.getElementById('payments-body').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-pay]');
    if (button) openRemita(button.dataset.pay);
});

// The Remita screen. It is a clearly labelled simulation: no money moves and no bank is contacted.
function openRemita(paymentId) {
    const payment = payments.find(p => String(p.payment_id) === String(paymentId));
    if (!payment) return;

    openModal(`
    <h3>Remita payment</h3>
    <div class="sim-banner">Simulated for this project. No real money is moved and no bank is contacted.</div>
    <div class="remita-box">
      <div class="remita-box__row"><span>Pay to</span><span>Bayero University, Kano (central account)</span></div>
      <div class="remita-box__row"><span>Payer</span><span>${escapeHtml(student.matric_no)}</span></div>
      <div class="remita-box__row"><span>Description</span><span>${escapeHtml(payment.reason)}</span></div>
      <div class="remita-box__row"><span>Office</span><span>${escapeHtml(officeName(payment.unit_id))}</span></div>
      <div class="remita-box__row"><span>Amount</span><span><strong>${formatNaira(payment.amount)}</strong></span></div>
    </div>
    <button class="btn btn--block" id="remita-confirm">Complete simulated payment</button>
    <div class="modal__actions"><button class="btn btn--outline btn--sm" id="remita-cancel">Cancel</button></div>
  `);
    document.getElementById('remita-cancel').addEventListener('click', closeModal);
    document.getElementById('remita-confirm').addEventListener('click', () => payFee(payment));
}

// Ask the database to record the payment. A success message is shown only after the database confirms it.
async function payFee(payment) {
    const button = document.getElementById('remita-confirm');
    button.disabled = true;
    button.textContent = 'Processing...';

    const { data: rrr, error } = await supabaseClient.rpc('pay_fee', { p_payment_id: payment.payment_id });

    if (error) {
        closeModal();
        showToast(error.message);
        await loadPayments();
        return;
    }

    openModal(`
    <h3>Payment recorded</h3>
    <p>${formatNaira(payment.amount)} for ${escapeHtml(payment.reason)} is now marked Paid.</p>
    <div class="remita-box">
      <div class="remita-box__row"><span>Remita Retrieval Reference (RRR)</span><span><span class="rrr">${escapeHtml(rrr)}</span></span></div>
    </div>
    <div class="modal__actions"><button class="btn btn--sm" id="receipt-close">Close</button></div>
  `);
    document.getElementById('receipt-close').addEventListener('click', closeModal);
    await loadPayments();
}

document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.href = 'index.html';
});

async function loadPayments() {
    try {
        const { data: sessionData } = await supabaseClient.auth.getSession();
        const session = sessionData.session;
        if (!session) {
            window.location.href = 'index.html';
            return;
        }
        const userId = session.user.id;

        const [studentRes, unitsRes, paymentsRes] = await Promise.all([
            supabaseClient.from('students').select('id, name, matric_no').eq('id', userId).maybeSingle(),
            supabaseClient.from('clearance_units').select('unit_id, unit_name, code').order('unit_id'),
            supabaseClient.from('payments')
                .select('payment_id, unit_id, reason, amount, status, rrr, date_paid, waived_at, waive_reason')
                .eq('student_id', userId).order('payment_id')
        ]);

        const problem = studentRes.error || unitsRes.error || paymentsRes.error;
        if (problem) throw problem;

        if (!studentRes.data) {
            showPageError('This page is for student accounts. Please log out and sign in with a student account.');
            return;
        }
        student = studentRes.data;
        units = unitsRes.data;
        payments = paymentsRes.data;

        document.getElementById('side-name').textContent = student.name;
        document.getElementById('side-matric').textContent = student.matric_no;
        showPayments();
    } catch (err) {
        showPageError('Could not load your payments: ' + err.message);
    }
}

loadPayments();