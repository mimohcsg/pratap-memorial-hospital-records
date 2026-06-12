const PRESCRIPTION_FOOTER_LINE1 = process.env.PRESCRIPTION_FOOTER_LINE1
  || 'Apka Apna Deepak Chouhan - Purv Nagar Panchayat Adhyaksh - Jobat District Alirajpur Madhya Pradesh';
const PRESCRIPTION_FOOTER_LINE2 = process.env.PRESCRIPTION_FOOTER_LINE2 || 'Jai Hind!!';

function fmtMoney(amount) {
  return `₹${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtVisitDate(iso) {
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getPrescriptionFooterLines() {
  return [PRESCRIPTION_FOOTER_LINE1, PRESCRIPTION_FOOTER_LINE2];
}

function buildPrescriptionText({ hospitalName, hospitalCity, patient, visit }) {
  const [footer1, footer2] = getPrescriptionFooterLines();
  const lines = [
    `🏥*${hospitalName}*🏥`,
    ...(hospitalCity ? [`City: ${hospitalCity}`] : []),
    '*Prescription / दवा विवरण*',
    '',
    `Patient / मरीज़: *${patient.name}*`,
    `ID: ${patient.patientId}`,
    `Date / तारीख: ${fmtVisitDate(visit.visitDate)}`,
  ];

  if (visit.reason?.trim()) {
    lines.push(`Reason / कारण: ${visit.reason.trim()}`);
  }

  if (visit.notes?.trim()) {
    lines.push(`Treatment Notes / इलाज नोट्स: ${visit.notes.trim()}`);
  }

  lines.push('', '*Medicines / दवाइयाँ:*');
  if (visit.medicines?.length) {
    visit.medicines.forEach((m) => {
      lines.push(`• ${m.name} — ${fmtMoney(m.amount)}`);
    });
  } else {
    lines.push('• —');
  }

  lines.push('');
  lines.push(`Treatment Fee / इलाज शुल्क: ${fmtMoney(visit.treatmentFee)}`);
  lines.push(`Medicine Total / दवा कुल: ${fmtMoney(visit.medicineTotal)}`);
  lines.push(`*Grand Total / कुल राशि: ${fmtMoney(visit.visitTotal)}*`);

  if (patient.phone) {
    lines.push('', `Mobile: ${patient.phone}`);
  }

  lines.push('', 'Thank you for visiting us. / हमसे संपर्क करने के लिए धन्यवाद।');
  lines.push('', `*${footer1}*`, `*${footer2}*`);

  return lines.join('\n');
}

module.exports = {
  buildPrescriptionText,
  fmtMoney,
  fmtVisitDate,
  getPrescriptionFooterLines,
  PRESCRIPTION_FOOTER_LINE1,
  PRESCRIPTION_FOOTER_LINE2,
};
