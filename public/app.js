let adminKey = sessionStorage.getItem('hospitalAdminKey') || '';
let medicineRowCounter = 0;
let defaultTreatmentFee = 100;
let hospitalConfig = { name: '', city: '' };

function updateHospitalDisplay() {
  const nameEl = document.getElementById('hospital-name');
  const cityEl = document.getElementById('hospital-city');
  if (!nameEl) return;
  const name = currentLang === 'en' && hospitalConfig.name
    ? hospitalConfig.name
    : t('hospitalName');
  nameEl.textContent = name;
  const city = currentLang === 'hi' ? t('hospitalCity') : (hospitalConfig.city || t('hospitalCity'));
  if (cityEl) cityEl.textContent = city;
  const suffix = currentLang === 'hi' ? 'मरीज़ रिकॉर्ड' : 'Patient Records';
  document.title = `${name}, ${city} — ${suffix}`;
}

function headers() {
  return { 'Content-Type': 'application/json', 'x-admin-key': adminKey };
}

function fmtDate(iso) {
  if (!iso) return '—';
  const locale = typeof currentLang !== 'undefined' && currentLang === 'hi' ? 'hi-IN' : 'en-IN';
  return new Date(iso).toLocaleString(locale, { timeZone: 'Asia/Kolkata' });
}

function fmtMoney(amount) {
  return `₹${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function genderLabel(value) {
  if (!value) return '—';
  const map = { Male: 'genderMale', Female: 'genderFemale', Other: 'genderOther' };
  return typeof t === 'function' && map[value] ? t(map[value]) : value;
}

function escHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getTodayVisit(visits) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  return (visits || []).find(
    (v) => new Date(v.visitDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === today
  );
}

function populateMedicineList(listEl, addBtnId, prefix, medicines = []) {
  if (!listEl) return;
  listEl.innerHTML = '';
  const items = medicines.length ? medicines : [{ name: '', amount: '' }];
  items.forEach((m) => {
    const row = addMedicineRow(listEl, prefix);
    row.querySelector('.med-name').value = m.name || '';
    row.querySelector('.med-amount').value = m.amount ?? '';
  });
  const addBtn = document.getElementById(addBtnId);
  if (addBtn) addBtn.onclick = () => addMedicineRow(listEl, prefix);
  const feeInput = listEl.closest('.medicines-section')?.querySelector('.treatment-fee-input');
  bindTreatmentFeeInput(feeInput, listEl);
  updateMedicineTotal(listEl);
}

function renderTodayVisitEditor(patientId, visit) {
  return `
    <div class="today-visit-card card">
      <h3>${t('todayVisit')} <span class="today-badge">${t('todayBadge')}</span></h3>
      <p class="meta">${t('todayVisitHint')}</p>
      <div class="row">
        <div class="form-group">
          <label for="today-visit-reason">${t('reason')}</label>
          <div class="input-with-voice">
            <input type="text" id="today-visit-reason" value="${escHtml(visit.reason || '')}" placeholder="${escHtml(t('reasonPlaceholder'))}" />
            <button type="button" class="voice-btn" data-field="today-visit-reason" aria-label="Speak">🎤</button>
          </div>
        </div>
        <div class="form-group">
          <label for="today-visit-fee">${t('treatmentFee')}</label>
          <input type="number" class="treatment-fee-input" id="today-visit-fee" value="${visit.treatmentFee ?? defaultTreatmentFee}" min="0" step="1" />
        </div>
      </div>
      <div class="form-group">
        <label for="today-visit-notes">${t('treatmentNotes')}</label>
        <div class="input-with-voice">
          <textarea id="today-visit-notes" rows="3" placeholder="${escHtml(t('treatmentNotesPlaceholder'))}">${escHtml(visit.notes || '')}</textarea>
          <button type="button" class="voice-btn voice-btn-textarea" data-field="today-visit-notes" aria-label="Speak">🎤</button>
        </div>
      </div>
      ${renderMedicineFormHtml('today-medicines-list', 'today-add-medicine', 'today', null, 'today-visit-fee')}
      <p class="meta">${t('sendBillHint')}</p>
      <div class="today-visit-actions visit-actions">
        <button type="button" class="btn btn-primary btn-sm" onclick="saveTodayVisit('${patientId}', '${visit.id}')">${t('saveTodayVisit')}</button>
        <button type="button" class="btn btn-sm btn-whatsapp" onclick="sendVisitWhatsApp('${patientId}', '${visit.id}')">${t('sendBill')}</button>
        <button type="button" class="btn btn-sm btn-pdf" onclick="downloadPrescriptionPdf('${patientId}', '${visit.id}')">${t('downloadPrescriptionPdf')}</button>
      </div>
      <p class="success-msg hidden" id="today-visit-msg"></p>
    </div>
  `;
}

function initTodayVisitEditor(patientId, visit) {
  populateMedicineList(
    document.getElementById('today-medicines-list'),
    'today-add-medicine',
    'today',
    visit.medicines || []
  );
  const feeInput = document.getElementById('today-visit-fee');
  const list = document.getElementById('today-medicines-list');
  if (feeInput && list) {
    feeInput.addEventListener('input', () => updateMedicineTotal(list));
    updateMedicineTotal(list);
  }
  initVoiceButtons(document.querySelector('.today-visit-card'));
}

async function saveTodayVisit(patientId, visitId, options = {}) {
  const msgEl = document.getElementById('today-visit-msg');
  try {
    const payload = {
      reason: document.getElementById('today-visit-reason')?.value || '',
      notes: document.getElementById('today-visit-notes')?.value || '',
      treatmentFee: Number(document.getElementById('today-visit-fee')?.value) || defaultTreatmentFee,
      medicines: getMedicinesFromList(document.getElementById('today-medicines-list')),
    };
    const res = await fetch(`/api/patients/${patientId}/visits/${visitId}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save');
    if (!options.silent && msgEl) {
      msgEl.textContent = t('visitSaved');
      msgEl.classList.remove('hidden');
      msgEl.style.color = 'var(--success)';
      setTimeout(() => msgEl.classList.add('hidden'), 3000);
    }
    loadRecentPatients();
    return data.visit;
  } catch (err) {
    if (!options.silent) alert(err.message);
    throw err;
  }
}

window.saveTodayVisit = saveTodayVisit;

function fmtWeight(kg) {
  if (kg == null || kg === '') return '—';
  return `${kg} kg`;
}

function getWhatsAppResult(notifications) {
  if (!notifications) return null;
  if (notifications.whatsapp) return notifications.whatsapp;
  if (notifications.waLink || notifications.waAppLink || notifications.sent) return notifications;
  return null;
}

function switchToRegisterTab() {
  document.getElementById('patient-modal')?.classList.add('hidden');
  document.querySelectorAll('.tab').forEach((el) => el.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('hidden'));
  document.querySelector('.tab[data-tab="register"]')?.classList.add('active');
  document.getElementById('tab-register')?.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetRegisterFormForNewPatient() {
  document.getElementById('register-form')?.reset();
  resetMedicineList('register-medicines-list', 'reg');
  if (typeof resetPhotoUI === 'function') resetPhotoUI();
  const feeInput = document.getElementById('treatmentFee');
  if (feeInput) {
    feeInput.value = defaultTreatmentFee;
    delete feeInput.dataset.userEdited;
  }
  document.getElementById('register-error')?.classList.add('hidden');
  document.getElementById('register-success')?.classList.add('hidden');
}

function prepareForNewPatientAfterWhatsApp() {
  switchToRegisterTab();
  resetRegisterFormForNewPatient();
  const okEl = document.getElementById('register-success');
  if (okEl) {
    okEl.textContent = t('whatsappReturnHint');
    okEl.classList.remove('hidden');
    okEl.style.color = 'var(--success)';
    setTimeout(() => okEl.classList.add('hidden'), 5000);
  }
}

function openWhatsAppApp(wa) {
  const link = wa.waAppLink || wa.waLink;
  if (!link) return false;
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  sessionStorage.setItem('hospitalPendingWaReturn', '1');
  if (isMobile) {
    window.location.href = link;
  } else {
    window.open(link, '_blank', 'noopener,noreferrer');
  }
  return true;
}

function handleReturnFromWhatsApp() {
  if (sessionStorage.getItem('hospitalPendingWaReturn') !== '1') return;
  sessionStorage.removeItem('hospitalPendingWaReturn');
  prepareForNewPatientAfterWhatsApp();
}

function openWhatsAppLink(waLink, waWindow = null) {
  if (!waLink) return false;
  if (waWindow && !waWindow.closed) {
    waWindow.location.href = waLink;
    return true;
  }
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if (isMobile) {
    window.location.href = waLink;
    return true;
  }
  const link = document.createElement('a');
  link.href = waLink;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
}

function handleWhatsAppNotification(notifications, successEl = null) {
  const wa = getWhatsAppResult(notifications);
  if (!wa) {
    if (successEl) {
      successEl.textContent = t('whatsappFailed');
      successEl.classList.remove('hidden');
      successEl.style.color = 'var(--error)';
    }
    return false;
  }
  if (wa.sent) {
    const msg = t('whatsappSent');
    if (successEl) {
      successEl.textContent = msg;
      successEl.classList.remove('hidden');
      successEl.style.color = 'var(--success)';
    }
    return true;
  }
  if (wa.waLink || wa.waAppLink) {
    openWhatsAppApp(wa);
    const msg = t('whatsappOpening');
    if (successEl) {
      successEl.textContent = msg;
      successEl.classList.remove('hidden');
      successEl.style.color = 'var(--success)';
    }
    return true;
  }
  return false;
}

function whatsAppButton(waLink) {
  if (!waLink) return '';
  return `<a href="${escHtml(waLink)}" class="btn btn-sm btn-whatsapp" target="_blank" rel="noopener">${t('openWhatsapp')}</a>`;
}

function getMedicinesFromList(listEl) {
  if (!listEl) return [];
  return [...listEl.querySelectorAll('.medicine-row')]
    .map((row) => ({
      name: row.querySelector('.med-name')?.value.trim() || '',
      amount: Number(row.querySelector('.med-amount')?.value) || 0,
    }))
    .filter((m) => m.name);
}

function updateMedicineTotal(listEl) {
  const section = listEl?.closest('.medicines-section');
  if (!section) return;
  const medTotal = getMedicinesFromList(listEl).reduce((sum, m) => sum + m.amount, 0);
  const card = section.closest('.today-visit-card');
  const feeInput = card?.querySelector('#today-visit-fee')
    || section.querySelector('.treatment-fee-input, #treatmentFee');
  const fee = feeInput?.value !== '' && feeInput != null
    ? Math.max(0, Number(feeInput.value) || 0)
    : defaultTreatmentFee;
  const totalEl = section.querySelector('.medicine-total-value, .visit-total-value');
  if (totalEl) totalEl.textContent = fmtMoney(fee + medTotal);
}

window.updateMedicineTotal = updateMedicineTotal;

function bindTreatmentFeeInput(input, listEl) {
  if (!input || input.dataset.feeBound) return;
  input.dataset.feeBound = '1';
  input.addEventListener('input', () => updateMedicineTotal(listEl));
}

function addMedicineRow(listEl, prefix = 'reg') {
  const idx = medicineRowCounter += 1;
  const row = document.createElement('div');
  row.className = 'medicine-row';
  row.innerHTML = `
    <div class="input-with-voice med-name-wrap">
      <input type="text" class="med-name" id="${prefix}-med-name-${idx}" placeholder="${escHtml(t('medicineNamePlaceholder'))}" />
      <button type="button" class="voice-btn" data-field="${prefix}-med-name-${idx}" aria-label="Speak">🎤</button>
    </div>
    <div class="input-with-voice med-amount-wrap">
      <input type="number" class="med-amount" id="${prefix}-med-amount-${idx}" min="0" step="0.01" placeholder="${escHtml(t('medicineAmountPlaceholder'))}" />
      <button type="button" class="voice-btn" data-field="${prefix}-med-amount-${idx}" aria-label="Speak">🎤</button>
    </div>
    <button type="button" class="btn-remove-med" aria-label="Remove">×</button>
  `;
  row.querySelector('.btn-remove-med').addEventListener('click', () => {
    if (listEl.querySelectorAll('.medicine-row').length > 1) {
      row.remove();
    } else {
      row.querySelector('.med-name').value = '';
      row.querySelector('.med-amount').value = '';
    }
    updateMedicineTotal(listEl);
  });
  row.querySelector('.med-amount').addEventListener('input', () => updateMedicineTotal(listEl));
  listEl.appendChild(row);
  initVoiceButtons(row);
  updateMedicineTotal(listEl);
  return row;
}

function initMedicineList(listId, addBtnId, prefix = 'reg') {
  const list = document.getElementById(listId);
  const addBtn = document.getElementById(addBtnId);
  if (!list || !addBtn) return;
  list.innerHTML = '';
  addMedicineRow(list, prefix);
  addBtn.onclick = () => addMedicineRow(list, prefix);
  const feeInput = list.closest('.medicines-section')?.querySelector('.treatment-fee-input, #treatmentFee');
  bindTreatmentFeeInput(feeInput, list);
  updateMedicineTotal(list);
}

function resetMedicineList(listId, prefix = 'reg') {
  const list = document.getElementById(listId);
  if (!list) return;
  list.innerHTML = '';
  addMedicineRow(list, prefix);
  const feeInput = document.getElementById('treatmentFee');
  if (feeInput) feeInput.value = defaultTreatmentFee;
  updateMedicineTotal(list);
}

function renderVisitMedicines(visit) {
  const medRows = visit.medicines?.length
    ? visit.medicines.map((m) => `
      <div class="medicine-sale-item">
        <span>${escHtml(m.name)}</span>
        <span>${fmtMoney(m.amount)}</span>
      </div>
    `).join('')
    : `<div class="meta">${t('noMedicines')}</div>`;

  return `
    <div class="visit-medicines">
      <div class="medicine-sale-item">
        <span>${t('treatmentFee')}</span>
        <span>${fmtMoney(visit.treatmentFee ?? defaultTreatmentFee)}</span>
      </div>
      <div class="medicine-sale-head">
        <span>${t('soldMedicines')}</span>
        <span>${fmtMoney(visit.medicineTotal)}</span>
      </div>
      ${medRows}
      <div class="visit-total-row">
        <span>${t('visitTotal')}</span>
        <span>${fmtMoney(visit.visitTotal)}</span>
      </div>
    </div>
  `;
}

function renderMedicineFormHtml(listId, addBtnId, prefix, feeInputId, externalFeeId = null) {
  const feeBlock = externalFeeId ? '' : `
      <div class="form-group treatment-fee-row">
        <label for="${feeInputId}">${t('treatmentFee')}</label>
        <input type="number" class="treatment-fee-input" id="${feeInputId}" value="${defaultTreatmentFee}" min="0" step="1" />
      </div>`;
  return `
    <div class="medicines-section form-group">
      ${feeBlock}
      <label>${t('medicines')}</label>
      <div id="${listId}" class="medicines-list"></div>
      <div class="medicines-actions">
        <button type="button" id="${addBtnId}" class="btn btn-sm btn-muted">${t('addMedicine')}</button>
        <div class="medicine-total">${t('visitTotal')}: <span class="visit-total-value medicine-total-value">${fmtMoney(defaultTreatmentFee)}</span></div>
      </div>
    </div>
  `;
}

function patientThumb(patient) {
  if (patient.photoUrl) {
    return `<img class="patient-thumb" src="${escHtml(patient.photoUrl)}" alt="" />`;
  }
  return '<div class="patient-thumb placeholder">👤</div>';
}

function renderPatientCard(patient, onClick = true) {
  const click = onClick ? `onclick="openPatient('${patient.patientId}')"` : '';
  return `
    <div class="patient-card" ${click}>
      ${patientThumb(patient)}
      <div>
        <strong>${escHtml(patient.name)}</strong>
        <span class="badge">${escHtml(patient.patientId)}</span>
        <div class="meta">${patient.phone} · ${patient.age || '?'} ${t('yrs')} · ${genderLabel(patient.gender)}</div>
        <div class="meta">${t('lastVisit')}: ${fmtDate(patient.lastVisitAt)}</div>
      </div>
    </div>
  `;
}

async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    if (data.hospitalName) hospitalConfig.name = data.hospitalName;
    if (data.hospitalCity) hospitalConfig.city = data.hospitalCity;
    updateHospitalDisplay();
    if (data.defaultTreatmentFee != null) {
      defaultTreatmentFee = Number(data.defaultTreatmentFee) || 100;
      const feeInput = document.getElementById('treatmentFee');
      if (feeInput && !feeInput.dataset.userEdited) feeInput.value = defaultTreatmentFee;
    }
  } catch {
    // ignore
  }
}

function showApp() {
  document.getElementById('login-card').classList.add('hidden');
  document.getElementById('app-section').classList.remove('hidden');
  document.getElementById('logout-btn').classList.remove('hidden');
  initVoiceButtons();
  initMedicineList('register-medicines-list', 'register-add-medicine', 'reg');
  loadRecentPatients();
}

function logout() {
  adminKey = '';
  sessionStorage.removeItem('hospitalAdminKey');
  document.getElementById('login-card').classList.remove('hidden');
  document.getElementById('app-section').classList.add('hidden');
  document.getElementById('logout-btn').classList.add('hidden');
}

function onLangChange() {
  updateHospitalDisplay();
  loadConfig();
  const saveBtn = document.getElementById('save-patient-btn');
  if (saveBtn && !saveBtn.disabled) saveBtn.textContent = t('savePatient');
  loadRecentPatients();
  const results = document.getElementById('search-results');
  if (results?.dataset.lastQuery) searchPatients();
  const reportsPanel = document.getElementById('tab-reports');
  if (reportsPanel && !reportsPanel.classList.contains('hidden') && typeof loadReport === 'function') {
    loadReport();
  }
}

document.getElementById('login-btn').addEventListener('click', async () => {
  adminKey = document.getElementById('admin-key').value.trim();
  const err = document.getElementById('login-error');
  const res = await fetch('/api/patients/recent', { headers: { 'x-admin-key': adminKey } });
  if (res.status === 401) {
    err.textContent = t('invalidKey');
    err.classList.remove('hidden');
    return;
  }
  sessionStorage.setItem('hospitalAdminKey', adminKey);
  err.classList.add('hidden');
  showApp();
});

document.getElementById('logout-btn').addEventListener('click', logout);

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((el) => el.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('hidden'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.remove('hidden');
    if (tab.dataset.tab === 'find') loadRecentPatients();
    if (tab.dataset.tab === 'reports' && typeof loadReport === 'function') loadReport();
  });
});

document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('register-error');
  const okEl = document.getElementById('register-success');
  errEl.classList.add('hidden');
  okEl.classList.add('hidden');

  const weightVal = document.getElementById('weight').value;
  const payload = {
    name: document.getElementById('name').value,
    phone: document.getElementById('phone').value,
    age: document.getElementById('age').value ? Number(document.getElementById('age').value) : null,
    weight: weightVal ? Number(weightVal) : null,
    gender: document.getElementById('gender').value,
    bloodGroup: document.getElementById('bloodGroup').value,
    address: document.getElementById('address').value,
    allergies: document.getElementById('allergies').value,
    emergencyContact: document.getElementById('emergencyContact').value,
    visitReason: document.getElementById('visitReason').value,
    visitNotes: document.getElementById('visitNotes').value,
    medicines: getMedicinesFromList(document.getElementById('register-medicines-list')),
    treatmentFee: Number(document.getElementById('treatmentFee').value) || defaultTreatmentFee,
    photoData: getCapturedPhotoData(),
  };

  const btn = document.getElementById('save-patient-btn');
  btn.disabled = true;
  btn.textContent = t('saving');

  try {
    const res = await fetch('/api/patients', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.status === 401) { logout(); throw new Error(t('sessionExpired')); }
    if (!res.ok) throw new Error(data.error || 'Failed to save');

    const savedId = data.patient?.patient?.patientId;
    okEl.textContent = `${t('patientSaved')} ${savedId}. ${t('todayVisitHint')}`;
    okEl.classList.remove('hidden');
    e.target.reset();
    resetMedicineList('register-medicines-list', 'reg');
    if (typeof resetPhotoUI === 'function') resetPhotoUI();
    if (savedId) setTimeout(() => openPatient(savedId), 500);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = t('savePatient');
  }
});

async function searchPatients() {
  const q = document.getElementById('search-input').value.trim();
  const el = document.getElementById('search-results');
  el.dataset.lastQuery = q;
  if (!q) {
    el.innerHTML = `<p class="meta">${t('searchPrompt')}</p>`;
    return;
  }

  el.innerHTML = `<p class="meta">${t('searching')}</p>`;
  const res = await fetch(`/api/patients/search?q=${encodeURIComponent(q)}`, {
    headers: { 'x-admin-key': adminKey },
  });
  if (res.status === 401) { logout(); return; }
  const patients = await res.json();
  if (!patients.length) {
    el.innerHTML = `<p class="meta">${t('noPatientsFound')}</p>`;
    return;
  }
  el.innerHTML = patients.map((p) => renderPatientCard(p)).join('');
}

document.getElementById('search-btn').addEventListener('click', searchPatients);
document.getElementById('search-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') searchPatients();
});

async function loadRecentPatients() {
  const el = document.getElementById('recent-list');
  if (!el || !adminKey) return;
  const res = await fetch('/api/patients/recent', { headers: { 'x-admin-key': adminKey } });
  if (res.status === 401) return;
  const patients = await res.json();
  el.innerHTML = patients.length
    ? patients.map((p) => renderPatientCard(p)).join('')
    : `<p class="meta">${t('noPatientsYet')}</p>`;
}

async function openPatient(patientId) {
  const res = await fetch(`/api/patients/${patientId}`, { headers: { 'x-admin-key': adminKey } });
  if (res.status === 401) { logout(); return; }
  const data = await res.json();
  if (!res.ok) return alert(data.error || 'Not found');

  const p = data.patient;
  const todayVisit = getTodayVisit(data.visits);
  const photo = p.photoUrl
    ? `<img class="detail-photo" src="${escHtml(p.photoUrl)}" alt="Patient" />`
    : '<div class="detail-photo" style="display:flex;align-items:center;justify-content:center;font-size:2.5rem;">👤</div>';

  document.getElementById('patient-detail').innerHTML = `
    <div class="detail-header">
      ${photo}
      <div>
        <h2>${escHtml(p.name)} <span class="badge">${escHtml(p.patientId)}</span></h2>
        <p class="meta">${p.visitCount} ${t('visits')} · ${t('registered')} ${fmtDate(p.createdAt)}</p>
      </div>
    </div>
    <div class="detail-grid">
      <div class="detail-item"><label>${t('phone')}</label><div>${escHtml(p.phone)}</div></div>
      <div class="detail-item"><label>${t('ageGender')}</label><div>${p.age || '—'} / ${genderLabel(p.gender)}</div></div>
      <div class="detail-item"><label>${t('weightLabel')}</label><div>${fmtWeight(p.weightKg)}</div></div>
      <div class="detail-item"><label>${t('bloodGroup')}</label><div>${escHtml(p.bloodGroup || '—')}</div></div>
      <div class="detail-item"><label>${t('allergiesLabel')}</label><div>${escHtml(p.allergies || '—')}</div></div>
      <div class="detail-item"><label>${t('emergencyContact')}</label><div>${escHtml(p.emergencyContact || '—')}</div></div>
      <div class="detail-item"><label>${t('address')}</label><div>${escHtml(p.address || '—')}</div></div>
    </div>
    ${todayVisit ? renderTodayVisitEditor(p.patientId, todayVisit) : ''}
    <h3>${t('visitHistory')}</h3>
    <div class="visit-list">
      ${data.visits.length
    ? data.visits.map((v) => {
      const isToday = getTodayVisit([v]);
      return `
          <div class="visit-item${isToday ? ' visit-item-today' : ''}">
            <strong>${fmtDate(v.visitDate)}${isToday ? ` <span class="today-badge">${t('todayBadge')}</span>` : ''}</strong>
            ${v.reason ? `<div>${escHtml(v.reason)}</div>` : ''}
            ${v.notes ? `<div class="meta"><strong>${t('treatmentNotes')}:</strong> ${escHtml(v.notes)}</div>` : ''}
            ${renderVisitMedicines(v)}
            <div class="visit-actions">
              <button type="button" class="btn btn-sm btn-whatsapp" onclick="sendVisitWhatsApp('${p.patientId}', '${v.id}')">${t('sendBill')}</button>
              <button type="button" class="btn btn-sm btn-pdf" onclick="downloadPrescriptionPdf('${p.patientId}', '${v.id}')">${t('downloadPrescriptionPdf')}</button>
            </div>
          </div>`;
    }).join('')
    : `<p class="meta">${t('noVisits')}</p>`}
    </div>
    ${todayVisit ? '' : `
    <div class="visit-form">
      <h3>${t('recordVisit')}</h3>
      <div class="row">
        <div class="form-group">
          <label>${t('reason')}</label>
          <div class="input-with-voice">
            <input type="text" id="new-visit-reason" placeholder="${escHtml(t('reasonPlaceholder'))}" />
            <button type="button" class="voice-btn" data-field="new-visit-reason" aria-label="Speak">🎤</button>
          </div>
        </div>
        <div class="form-group">
          <label>${t('treatmentNotes')}</label>
          <div class="input-with-voice">
            <textarea id="new-visit-notes" rows="2" placeholder="${escHtml(t('treatmentNotesPlaceholder'))}"></textarea>
            <button type="button" class="voice-btn voice-btn-textarea" data-field="new-visit-notes" aria-label="Speak">🎤</button>
          </div>
        </div>
      </div>
      ${renderMedicineFormHtml('visit-medicines-list', 'visit-add-medicine', 'visit', 'new-visit-treatment-fee')}
      <button type="button" class="btn btn-primary btn-sm" style="margin-top:0.75rem;" onclick="addVisit('${p.patientId}')">${t('addVisit')}</button>
    </div>`}
    <div style="margin-top:1rem;">
      <a href="${escHtml(p.photoUrl || '#')}" class="btn btn-sm btn-muted" target="_blank" ${p.photoUrl ? '' : 'style="display:none"'}>${t('viewPhoto')}</a>
    </div>
  `;

  initVoiceButtons(document.getElementById('patient-detail'));
  if (todayVisit) {
    initTodayVisitEditor(p.patientId, todayVisit);
  } else {
    initMedicineList('visit-medicines-list', 'visit-add-medicine', 'visit');
  }
  document.getElementById('patient-modal').classList.remove('hidden');
}

window.openPatient = openPatient;

async function addVisit(patientId) {
  const reason = document.getElementById('new-visit-reason')?.value || '';
  const notes = document.getElementById('new-visit-notes')?.value || '';
  const medicines = getMedicinesFromList(document.getElementById('visit-medicines-list'));
  const treatmentFee = Number(document.getElementById('new-visit-treatment-fee')?.value) || defaultTreatmentFee;
  const res = await fetch(`/api/patients/${patientId}/visits`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ reason, notes, medicines, treatmentFee }),
  });
  const data = await res.json();
  if (!res.ok) return alert(data.error || 'Failed');
  openPatient(patientId);
  loadRecentPatients();
}

async function sendVisitWhatsApp(patientId, visitId) {
  const msgEl = document.getElementById('today-visit-msg');
  if (msgEl) {
    msgEl.textContent = t('preparingBill');
    msgEl.classList.remove('hidden');
    msgEl.style.color = '';
  }
  try {
    if (document.getElementById('today-visit-notes')) {
      await saveTodayVisit(patientId, visitId, { silent: true });
    }
    const res = await fetch(`/api/patients/${patientId}/visits/${visitId}/whatsapp`, {
      headers: { 'x-admin-key': adminKey },
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Failed');
      return;
    }
    const wa = getWhatsAppResult(data.notifications);
    if (wa?.sent) {
      document.getElementById('patient-modal')?.classList.add('hidden');
      prepareForNewPatientAfterWhatsApp();
      handleWhatsAppNotification(data.notifications, msgEl);
      return;
    }
    if (wa?.waAppLink || wa?.waLink) {
      document.getElementById('patient-modal')?.classList.add('hidden');
      switchToRegisterTab();
      resetRegisterFormForNewPatient();
      openWhatsAppApp(wa);
      handleWhatsAppNotification(data.notifications, msgEl);
      return;
    }
    handleWhatsAppNotification(null, msgEl);
  } catch (err) {
    alert(err.message || 'Failed');
  }
}

async function downloadPrescriptionPdf(patientId, visitId) {
  try {
    const res = await fetch(`/api/patients/${patientId}/visits/${visitId}/pdf`, {
      headers: { 'x-admin-key': adminKey },
    });
    if (res.status === 401) {
      logout();
      return;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Download failed');
    }
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match?.[1] || `prescription-${patientId}.pdf`;
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (err) {
    alert(err.message || 'Download failed');
  }
}

window.sendVisitWhatsApp = sendVisitWhatsApp;
window.downloadPrescriptionPdf = downloadPrescriptionPdf;

window.addVisit = addVisit;

document.getElementById('close-modal').addEventListener('click', () => {
  document.getElementById('patient-modal').classList.add('hidden');
});

document.getElementById('patient-modal').addEventListener('click', (e) => {
  if (e.target.id === 'patient-modal') {
    document.getElementById('patient-modal').classList.add('hidden');
  }
});

document.addEventListener('DOMContentLoaded', () => {
  initVoiceButtons();
  loadConfig().then(() => {
    initMedicineList('register-medicines-list', 'register-add-medicine', 'reg');
    const feeInput = document.getElementById('treatmentFee');
    bindTreatmentFeeInput(feeInput, document.getElementById('register-medicines-list'));
    updateMedicineTotal(document.getElementById('register-medicines-list'));
  });
  if (adminKey) {
    fetch('/api/patients/recent', { headers: { 'x-admin-key': adminKey } })
      .then((res) => {
        if (res.status === 401) logout();
        else showApp();
      });
  }
});
