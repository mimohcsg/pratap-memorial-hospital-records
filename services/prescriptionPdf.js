const PDFDocument = require('pdfkit');
const { fmtMoney, fmtVisitDate, getPrescriptionFooterLines } = require('./prescriptionFormat');

function generatePrescriptionPdf({ hospitalName, hospitalCity, patient, visit }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - 96;
    let y = 48;

    doc.fontSize(16).font('Helvetica-Bold')
      .text(hospitalName, 48, y, { width: pageWidth, align: 'center' });
    y = doc.y + 4;

    if (hospitalCity) {
      doc.fontSize(11).font('Helvetica')
        .text(hospitalCity, 48, y, { width: pageWidth, align: 'center' });
      y = doc.y + 8;
    }

    doc.fontSize(13).font('Helvetica-Bold')
      .text('Prescription / दवा विवरण', 48, y, { width: pageWidth, align: 'center' });
    y = doc.y + 16;

    doc.moveTo(48, y).lineTo(48 + pageWidth, y).stroke('#cccccc');
    y += 14;

    const row = (label, value) => {
      doc.fontSize(10).font('Helvetica-Bold').text(label, 48, y, { width: 140 });
      doc.font('Helvetica').text(value || '—', 188, y, { width: pageWidth - 140 });
      y = doc.y + 8;
    };

    row('Patient / मरीज़', patient.name);
    row('Patient ID', patient.patientId);
    row('Date / तारीख', fmtVisitDate(visit.visitDate));
    if (visit.reason?.trim()) row('Reason / कारण', visit.reason.trim());
    if (visit.notes?.trim()) row('Treatment Notes / इलाज नोट्स', visit.notes.trim());
    if (patient.phone) row('Mobile', patient.phone);

    y += 6;
    doc.fontSize(11).font('Helvetica-Bold').text('Medicines / दवाइयाँ', 48, y);
    y = doc.y + 8;

    if (visit.medicines?.length) {
      visit.medicines.forEach((m) => {
        doc.fontSize(10).font('Helvetica')
          .text(`• ${m.name}`, 56, y, { width: pageWidth - 100 })
          .text(fmtMoney(m.amount), 48 + pageWidth - 80, y, { width: 80, align: 'right' });
        y = doc.y + 6;
      });
    } else {
      doc.fontSize(10).font('Helvetica').text('• —', 56, y);
      y = doc.y + 6;
    }

    y += 10;
    doc.moveTo(48, y).lineTo(48 + pageWidth, y).stroke('#cccccc');
    y += 12;

    const totalRow = (label, amount, bold = false) => {
      doc.fontSize(10).font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .text(label, 48, y, { width: pageWidth - 100 })
        .text(fmtMoney(amount), 48 + pageWidth - 100, y, { width: 100, align: 'right' });
      y = doc.y + 8;
    };

    totalRow('Treatment Fee / इलाज शुल्क', visit.treatmentFee);
    totalRow('Medicine Total / दवा कुल', visit.medicineTotal);
    totalRow('Grand Total / कुल राशि', visit.visitTotal, true);

    y += 12;
    doc.fontSize(9).font('Helvetica').fillColor('#444444')
      .text('Thank you for visiting us. / हमसे संपर्क करने के लिए धन्यवाद।', 48, y, { width: pageWidth, align: 'center' });
    y = doc.y + 16;

    const [footer1, footer2] = getPrescriptionFooterLines();
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#1a1a1a')
      .text(footer1, 48, y, { width: pageWidth, align: 'center' });
    y = doc.y + 6;
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#b71c1c')
      .text(footer2, 48, y, { width: pageWidth, align: 'center' });

    doc.end();
  });
}

module.exports = { generatePrescriptionPdf };
