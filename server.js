require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const {
  initDatabase,
  PHOTOS_DIR,
  DB_PATH,
  createPatient,
  updatePatient,
  addVisit,
  findPatientByPhone,
  searchPatients,
  getPatientDetail,
  listRecentPatients,
  DEFAULT_TREATMENT_FEE,
  getVisit,
  updateVisit,
  upsertTodayVisit,
  findTodayVisit,
  getRevenueReport,
  listAllPatients,
} = require('./services/database');
const {
  buildRevenueWorkbook,
  buildPatientsWorkbook,
  buildFullWorkbook,
} = require('./services/excelExport');

const app = express();
const PORT = process.env.PORT || 3457;
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin123';
const HOSPITAL_NAME = process.env.HOSPITAL_NAME || 'Pratap Memorial Family Hospital';
const HOSPITAL_CITY = process.env.HOSPITAL_CITY || 'Jobat';
const BASE_URL = process.env.BASE_URL || 'https://pratap-memorial-hospital-records.onrender.com';

function hospitalInfo() {
  return { name: HOSPITAL_NAME, city: HOSPITAL_CITY };
}

function getPrescriptionPdfToken(patientId, visitId) {
  return crypto.createHmac('sha256', ADMIN_KEY).update(`${patientId}:${visitId}`).digest('hex').slice(0, 24);
}

function getPrescriptionPdfPublicUrl(patientId, visitId) {
  const token = getPrescriptionPdfToken(patientId, visitId);
  const pdfPath = `/api/public/prescriptions/${encodeURIComponent(patientId)}/${encodeURIComponent(visitId)}.pdf?token=${token}`;
  return `${BASE_URL.replace(/\/$/, '')}${pdfPath}`;
}

initDatabase();

app.use(cors());
app.use(express.json({ limit: '8mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/photos', express.static(PHOTOS_DIR));

function checkAdmin(req, res) {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'hospital-patient-records' });
});

app.get('/api/config', (_req, res) => {
  res.json({
    hospitalName: HOSPITAL_NAME,
    hospitalCity: HOSPITAL_CITY,
    defaultTreatmentFee: DEFAULT_TREATMENT_FEE,
  });
});

app.get('/api/reports', (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    const period = req.query.period || 'day';
    const date = req.query.date?.trim() || undefined;
    const report = getRevenueReport(period, date);
    res.json(report);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/reports/export', (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    const period = req.query.period || 'day';
    const date = req.query.date?.trim() || undefined;
    const type = req.query.type || 'report';
    const report = getRevenueReport(period, date);
    const patients = listAllPatients();
    let buffer;
    let filename;

    const hospital = hospitalInfo();
    if (type === 'patients') {
      buffer = buildPatientsWorkbook(patients, hospital);
      filename = `patients-${date || report.start}.xlsx`;
    } else if (type === 'full') {
      buffer = buildFullWorkbook(report, patients, hospital);
      filename = `hospital-full-${period}-${report.start}-to-${report.end}.xlsx`;
    } else {
      buffer = buildRevenueWorkbook(report, hospital);
      filename = `revenue-${period}-${report.start}-to-${report.end}.xlsx`;
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/patients/recent', (req, res) => {
  if (!checkAdmin(req, res)) return;
  res.json(listRecentPatients(20));
});

app.get('/api/patients/search', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const q = req.query.q?.trim();
  if (!q) return res.json([]);
  res.json(searchPatients(q));
});

app.get('/api/patients/lookup/:phone', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const patient = findPatientByPhone(req.params.phone);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });
  res.json(getPatientDetail(patient.patientId));
});

app.get('/api/patients/:patientId', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const detail = getPatientDetail(req.params.patientId);
  if (!detail) return res.status(404).json({ error: 'Patient not found' });
  res.json(detail);
});

const { buildPrescriptionText } = require('./services/prescriptionFormat');
const { generatePrescriptionPdf } = require('./services/prescriptionPdf');
const { sendPrescriptionWhatsApp } = require('./services/notifications');

async function sendPrescriptionPdfResponse(res, patient, visit, inline = false) {
  const buffer = await generatePrescriptionPdf({
    hospitalName: HOSPITAL_NAME,
    hospitalCity: HOSPITAL_CITY,
    patient,
    visit,
  });
  const filename = `prescription-${patient.patientId}-${visit.id.slice(0, 8)}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${filename}"`);
  res.send(buffer);
}

async function notifyPrescriptionIfNeeded(patient, visit) {
  if (!visit || !patient?.phone) return null;
  const message = buildPrescriptionText({
    hospitalName: HOSPITAL_NAME,
    hospitalCity: HOSPITAL_CITY,
    patient,
    visit,
  });
  const pdfUrl = getPrescriptionPdfPublicUrl(patient.patientId, visit.id);
  return sendPrescriptionWhatsApp(patient.phone, message, pdfUrl);
}

app.post('/api/patients', async (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    const {
      name, age, gender, phone, address, bloodGroup, allergies,
      emergencyContact, photoData, visitReason, visitNotes, visitDate, weight, medicines,
      treatmentFee,
    } = req.body;

    if (!name?.trim()) return res.status(400).json({ error: 'Patient name is required' });
    if (!phone?.trim()) return res.status(400).json({ error: 'Phone number is required' });

    const patient = createPatient({
      id: uuidv4(),
      name,
      age,
      gender,
      phone,
      address,
      bloodGroup,
      allergies,
      emergencyContact,
      photoData,
      visitReason,
      visitNotes,
      visitDate,
      weight,
      medicines,
      treatmentFee,
    });

    const detail = getPatientDetail(patient.patientId);

    res.status(201).json({ success: true, patient: detail });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/patients/:patientId', (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    const patient = updatePatient(req.params.patientId, req.body);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    res.json({ success: true, patient: getPatientDetail(patient.patientId) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/patients/:patientId/visits/:visitId/whatsapp', async (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    const detail = getPatientDetail(req.params.patientId);
    if (!detail) return res.status(404).json({ error: 'Patient not found' });
    const visit = getVisit(req.params.visitId);
    if (!visit || visit.patientId !== req.params.patientId) {
      return res.status(404).json({ error: 'Visit not found' });
    }
    const pdfUrl = getPrescriptionPdfPublicUrl(detail.patient.patientId, visit.id);
    const notifications = await notifyPrescriptionIfNeeded(detail.patient, visit);
    res.json({ notifications: { whatsapp: { ...notifications, pdfUrl } } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/public/prescriptions/:patientId/:visitId.pdf', async (req, res) => {
  try {
    const { patientId, visitId } = req.params;
    const token = req.query.token;
    if (!token || token !== getPrescriptionPdfToken(patientId, visitId)) {
      return res.status(403).json({ error: 'Invalid or missing token' });
    }
    const detail = getPatientDetail(patientId);
    if (!detail) return res.status(404).json({ error: 'Patient not found' });
    const visit = getVisit(visitId);
    if (!visit || visit.patientId !== patientId) {
      return res.status(404).json({ error: 'Visit not found' });
    }
    await sendPrescriptionPdfResponse(res, detail.patient, visit, true);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/patients/:patientId/visits/:visitId/pdf', async (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    const detail = getPatientDetail(req.params.patientId);
    if (!detail) return res.status(404).json({ error: 'Patient not found' });
    const visit = getVisit(req.params.visitId);
    if (!visit || visit.patientId !== req.params.patientId) {
      return res.status(404).json({ error: 'Visit not found' });
    }
    await sendPrescriptionPdfResponse(res, detail.patient, visit, false);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/patients/:patientId/visits/:visitId', (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    const visit = getVisit(req.params.visitId);
    if (!visit || visit.patientId !== req.params.patientId) {
      return res.status(404).json({ error: 'Visit not found' });
    }
    const { reason, notes, medicines, treatmentFee } = req.body;
    const updated = updateVisit(req.params.visitId, {
      reason,
      notes,
      medicines,
      treatmentFee,
    });
    res.json({
      success: true,
      visit: updated,
      patient: getPatientDetail(req.params.patientId),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/patients/:patientId/visits', (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    const { visitDate, reason, notes, medicines, treatmentFee } = req.body;
    const hadToday = Boolean(findTodayVisit(req.params.patientId));
    const visit = upsertTodayVisit(req.params.patientId, {
      visitDate,
      reason,
      notes,
      medicines,
      treatmentFee,
      id: uuidv4(),
    });
    const detail = getPatientDetail(req.params.patientId);
    res.status(201).json({
      success: true,
      visit,
      patient: detail,
      mergedToday: hadToday,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🏥 ${HOSPITAL_NAME}, ${HOSPITAL_CITY} — Patient Records`);
  console.log(`   App: http://localhost:${PORT}`);
  console.log(`   Database: ${DB_PATH}`);
  console.log(`   Admin key: ${ADMIN_KEY === 'admin123' ? 'admin123 (change in .env)' : 'configured'}\n`);
});
