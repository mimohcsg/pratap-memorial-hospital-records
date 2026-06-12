let reportPeriod = 'day';
let reportDate = '';

function reportHeaders() {
  return { 'x-admin-key': sessionStorage.getItem('hospitalAdminKey') || '' };
}

function reportFmtMoney(amount) {
  return `₹${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function reportFmtDate(iso) {
  if (!iso) return '—';
  const locale = typeof currentLang !== 'undefined' && currentLang === 'hi' ? 'hi-IN' : 'en-IN';
  return new Date(iso).toLocaleString(locale, { timeZone: 'Asia/Kolkata' });
}

function reportEscHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getDefaultReportDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function initReportsTab() {
  const dateInput = document.getElementById('report-date');
  if (dateInput && !reportDate) {
    reportDate = getDefaultReportDate();
    dateInput.value = reportDate;
  }

  document.querySelectorAll('.report-period-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.report-period-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      reportPeriod = btn.dataset.period;
      loadReport();
    });
  });

  document.getElementById('report-load-btn')?.addEventListener('click', loadReport);
  document.getElementById('report-date')?.addEventListener('change', (e) => {
    reportDate = e.target.value;
    loadReport();
  });

  document.getElementById('export-revenue-btn')?.addEventListener('click', () => downloadExcel('report'));
  document.getElementById('export-patients-btn')?.addEventListener('click', () => downloadExcel('patients'));
  document.getElementById('export-full-btn')?.addEventListener('click', () => downloadExcel('full'));
}

async function downloadExcel(type) {
  const dateInput = document.getElementById('report-date');
  reportDate = dateInput?.value || getDefaultReportDate();
  const btn = document.getElementById(
    type === 'patients' ? 'export-patients-btn' : type === 'full' ? 'export-full-btn' : 'export-revenue-btn'
  );
  const prevText = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    btn.textContent = typeof t === 'function' ? t('exporting') : 'Downloading...';
  }
  try {
    const url = `/api/reports/export?period=${encodeURIComponent(reportPeriod)}&date=${encodeURIComponent(reportDate)}&type=${encodeURIComponent(type)}`;
    const res = await fetch(url, { headers: reportHeaders() });
    if (res.status === 401) {
      if (typeof logout === 'function') logout();
      return;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Download failed');
    }
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match?.[1] || `hospital-export-${reportDate}.xlsx`;
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
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prevText;
    }
  }
}

window.downloadExcel = downloadExcel;

async function loadReport() {
  const el = document.getElementById('report-content');
  if (!el) return;

  const dateInput = document.getElementById('report-date');
  reportDate = dateInput?.value || getDefaultReportDate();

  el.innerHTML = `<p class="meta">${typeof t === 'function' ? t('loadingReport') : 'Loading...'}</p>`;

  try {
    const res = await fetch(
      `/api/reports?period=${encodeURIComponent(reportPeriod)}&date=${encodeURIComponent(reportDate)}`,
      { headers: reportHeaders() }
    );
    const data = await res.json();
    if (res.status === 401) {
      if (typeof logout === 'function') logout();
      return;
    }
    if (!res.ok) throw new Error(data.error || 'Failed to load report');

    renderReport(data);
  } catch (err) {
    el.innerHTML = `<p class="error">${reportEscHtml(err.message)}</p>`;
  }
}

function renderReport(data) {
  const el = document.getElementById('report-content');
  const s = data.summary;
  const periodLabel = t(`reportPeriod_${data.period}`);
  const rangeText = data.start === data.end
    ? data.start
    : `${data.start} → ${data.end}`;

  const rows = data.visits.length
    ? data.visits.map((v) => {
      const meds = v.medicines?.length
        ? v.medicines.map((m) => `${reportEscHtml(m.name)} (${reportFmtMoney(m.amount)})`).join(', ')
        : '—';
      return `
        <tr>
          <td>${reportFmtDate(v.visitDate)}</td>
          <td><strong>${reportEscHtml(v.patientName)}</strong><br><span class="meta">${reportEscHtml(v.patientId)} · ${v.patientPhone}</span></td>
          <td>${reportEscHtml(v.reason || '—')}</td>
          <td class="med-list-cell">${meds}</td>
          <td>${reportFmtMoney(v.treatmentFee)}</td>
          <td>${reportFmtMoney(v.medicineTotal)}</td>
          <td><strong>${reportFmtMoney(v.visitTotal)}</strong></td>
          <td><button type="button" class="btn btn-sm btn-muted" onclick="openPatient('${v.patientId}')">${t('viewRecord')}</button></td>
        </tr>`;
    }).join('')
    : `<tr><td colspan="8" class="meta">${t('noReportData')}</td></tr>`;

  el.innerHTML = `
    <p class="meta">${periodLabel}: <strong>${rangeText}</strong></p>
    <div class="report-summary">
      <div class="report-stat"><span>${t('reportVisits')}</span><strong>${s.visitCount}</strong></div>
      <div class="report-stat"><span>${t('reportPatients')}</span><strong>${s.patientCount}</strong></div>
      <div class="report-stat"><span>${t('reportTreatmentRev')}</span><strong>${reportFmtMoney(s.treatmentRevenue)}</strong></div>
      <div class="report-stat"><span>${t('reportMedicineRev')}</span><strong>${reportFmtMoney(s.medicineRevenue)}</strong></div>
      <div class="report-stat highlight"><span>${t('reportTotalRev')}</span><strong>${reportFmtMoney(s.totalRevenue)}</strong></div>
    </div>
    <div class="report-table-wrap">
      <table class="report-table">
        <thead>
          <tr>
            <th>${t('reportColDate')}</th>
            <th>${t('reportColPatient')}</th>
            <th>${t('reason')}</th>
            <th>${t('soldMedicines')}</th>
            <th>${t('treatmentFee')}</th>
            <th>${t('reportMedicineRev')}</th>
            <th>${t('visitTotal')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

window.loadReport = loadReport;

document.addEventListener('DOMContentLoaded', initReportsTab);
