const XLSX = require('xlsx');

function fmtIST(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

function fmtDateIST(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
}

function medicinesText(medicines) {
  if (!medicines?.length) return '';
  return medicines.map((m) => `${m.name} (₹${Number(m.amount || 0).toFixed(2)})`).join('; ');
}

function hospitalLabel(hospital) {
  return hospital.city ? `${hospital.name}, ${hospital.city}` : hospital.name;
}

function hospitalMetaRows(hospital) {
  return [
    ['Hospital', hospital.name],
    ...(hospital.city ? [['City', hospital.city]] : []),
  ];
}

function buildRevenueWorkbook(report, hospital) {
  const wb = XLSX.utils.book_new();
  const label = hospitalLabel(hospital);

  const summaryRows = [
    [`${label} — Revenue Report`],
    ...hospitalMetaRows(hospital),
    ['Report Type', report.period],
    ['Period From', report.start],
    ['Period To', report.end],
    ['Generated At', fmtIST(new Date().toISOString())],
    [],
    ['Metric', 'Value'],
    ['Total Visits', report.summary.visitCount],
    ['Unique Patients', report.summary.patientCount],
    ['Treatment Revenue (₹)', report.summary.treatmentRevenue],
    ['Medicine Revenue (₹)', report.summary.medicineRevenue],
    ['Total Revenue (₹)', report.summary.totalRevenue],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Summary');

  const visitRows = report.visits.map((v) => ({
    'Visit Date & Time': fmtIST(v.visitDate),
    'Patient ID': v.patientId,
    'Patient Name': v.patientName,
    'Mobile': v.patientPhone,
    'Visit Reason': v.reason || '',
    'Treatment Notes': v.notes || '',
    'Medicines': medicinesText(v.medicines),
    'Treatment Fee (₹)': v.treatmentFee,
    'Medicine Total (₹)': v.medicineTotal,
    'Visit Total (₹)': v.visitTotal,
  }));
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(visitRows.length ? visitRows : [{ Note: 'No visits in this period' }]),
    'Visits'
  );

  const medicineRows = [];
  report.visits.forEach((v) => {
    (v.medicines || []).forEach((m) => {
      medicineRows.push({
        'Visit Date': fmtIST(v.visitDate),
        'Patient ID': v.patientId,
        'Patient Name': v.patientName,
        'Mobile': v.patientPhone,
        'Medicine Name': m.name,
        'Amount (₹)': m.amount,
      });
    });
  });
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(medicineRows.length ? medicineRows : [{ Note: 'No medicines in this period' }]),
    'Medicines'
  );

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function buildPatientsWorkbook(patients, hospital) {
  const wb = XLSX.utils.book_new();
  const label = hospitalLabel(hospital);

  const infoRows = [
    [`${label} — All Patient Records`],
    ...hospitalMetaRows(hospital),
    ['Total Patients', patients.length],
    ['Generated At', fmtIST(new Date().toISOString())],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(infoRows), 'Info');

  const patientRows = patients.map((p) => ({
    'Patient ID': p.patientId,
    'Full Name': p.name,
    'Mobile': p.phone,
    'Age': p.age ?? '',
    'Gender': p.gender || '',
    'Weight (kg)': p.weightKg ?? '',
    'Blood Group': p.bloodGroup || '',
    'Address': p.address || '',
    'Allergies': p.allergies || '',
    'Emergency Contact': p.emergencyContact || '',
    'Total Visits': p.visitCount ?? 0,
    'Registered On': fmtIST(p.createdAt),
    'Last Visit': p.lastVisitAt ? fmtIST(p.lastVisitAt) : '',
  }));
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(patientRows.length ? patientRows : [{ Note: 'No patients registered' }]),
    'Patients'
  );

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function buildFullWorkbook(report, patients, hospital) {
  const wb = XLSX.utils.book_new();
  const label = hospitalLabel(hospital);

  const summaryRows = [
    [`${label} — Full Export`],
    ...hospitalMetaRows(hospital),
    ['Report Type', report.period],
    ['Period From', report.start],
    ['Period To', report.end],
    ['Generated At', fmtIST(new Date().toISOString())],
    [],
    ['Revenue Summary', ''],
    ['Total Visits', report.summary.visitCount],
    ['Unique Patients (period)', report.summary.patientCount],
    ['Treatment Revenue (₹)', report.summary.treatmentRevenue],
    ['Medicine Revenue (₹)', report.summary.medicineRevenue],
    ['Total Revenue (₹)', report.summary.totalRevenue],
    [],
    ['All Patients Count', patients.length],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Summary');

  const visitRows = report.visits.map((v) => ({
    'Visit Date & Time': fmtIST(v.visitDate),
    'Patient ID': v.patientId,
    'Patient Name': v.patientName,
    'Mobile': v.patientPhone,
    'Visit Reason': v.reason || '',
    'Treatment Notes': v.notes || '',
    'Medicines': medicinesText(v.medicines),
    'Treatment Fee (₹)': v.treatmentFee,
    'Medicine Total (₹)': v.medicineTotal,
    'Visit Total (₹)': v.visitTotal,
  }));
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(visitRows.length ? visitRows : [{ Note: 'No visits in this period' }]),
    'Revenue Visits'
  );

  const patientRows = patients.map((p) => ({
    'Patient ID': p.patientId,
    'Full Name': p.name,
    'Mobile': p.phone,
    'Age': p.age ?? '',
    'Gender': p.gender || '',
    'Weight (kg)': p.weightKg ?? '',
    'Blood Group': p.bloodGroup || '',
    'Address': p.address || '',
    'Allergies': p.allergies || '',
    'Emergency Contact': p.emergencyContact || '',
    'Total Visits': p.visitCount ?? 0,
    'Registered On': fmtIST(p.createdAt),
    'Last Visit': p.lastVisitAt ? fmtIST(p.lastVisitAt) : '',
  }));
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(patientRows.length ? patientRows : [{ Note: 'No patients' }]),
    'All Patients'
  );

  const medicineRows = [];
  report.visits.forEach((v) => {
    (v.medicines || []).forEach((m) => {
      medicineRows.push({
        'Visit Date': fmtIST(v.visitDate),
        'Patient ID': v.patientId,
        'Patient Name': v.patientName,
        'Medicine Name': m.name,
        'Amount (₹)': m.amount,
      });
    });
  });
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(medicineRows.length ? medicineRows : [{ Note: 'No medicines' }]),
    'Medicines'
  );

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  buildRevenueWorkbook,
  buildPatientsWorkbook,
  buildFullWorkbook,
};
