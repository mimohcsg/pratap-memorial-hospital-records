const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PHOTOS_DIR = path.join(DATA_DIR, 'photos');
const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'patients.db');
const DEFAULT_TREATMENT_FEE = Number(process.env.DEFAULT_TREATMENT_FEE) || 100;

let db;

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });
}

function getMeta(key, fallback = null) {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setMeta(key, value) {
  db.prepare(`
    INSERT INTO meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(value));
}

function formatPatientId(seq) {
  return `PAT-${String(seq).padStart(5, '0')}`;
}

function parsePatientSeq(patientId) {
  const match = String(patientId || '').match(/^PAT-(\d+)$/i);
  return match ? parseInt(match[1], 10) : null;
}

function getNextPatientSeq() {
  const next = parseInt(getMeta('next_patient_seq', '1'), 10);
  setMeta('next_patient_seq', next + 1);
  return next;
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-10);
}

function rowToPatient(row) {
  if (!row) return null;
  return {
    id: row.id,
    patientId: row.patient_id,
    name: row.name,
    age: row.age,
    gender: row.gender,
    phone: row.phone,
    address: row.address,
    bloodGroup: row.blood_group,
    allergies: row.allergies,
    emergencyContact: row.emergency_contact,
    weightKg: row.weight_kg,
    photoUrl: row.photo_path ? `/photos/${path.basename(row.photo_path)}` : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastVisitAt: row.last_visit_at,
    visitCount: row.visit_count,
  };
}

function initDatabase() {
  ensureDirs();
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      age INTEGER,
      gender TEXT,
      phone TEXT NOT NULL,
      address TEXT,
      blood_group TEXT,
      allergies TEXT,
      emergency_contact TEXT,
      photo_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      last_visit_at TEXT,
      visit_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS visits (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      visit_date TEXT NOT NULL,
      reason TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
    );

    CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone);
    CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(name);
    CREATE INDEX IF NOT EXISTS idx_visits_patient ON visits(patient_id);

    CREATE TABLE IF NOT EXISTS visit_medicines (
      id TEXT PRIMARY KEY,
      visit_id TEXT NOT NULL,
      medicine_name TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (visit_id) REFERENCES visits(id)
    );

    CREATE INDEX IF NOT EXISTS idx_visit_medicines_visit ON visit_medicines(visit_id);
  `);

  migrateSchema();
  return db;
}

function migrateSchema() {
  const patientCols = db.prepare('PRAGMA table_info(patients)').all();
  if (!patientCols.some((c) => c.name === 'weight_kg')) {
    db.exec('ALTER TABLE patients ADD COLUMN weight_kg REAL');
  }
  const visitCols = db.prepare('PRAGMA table_info(visits)').all();
  if (!visitCols.some((c) => c.name === 'treatment_fee')) {
    db.exec(`ALTER TABLE visits ADD COLUMN treatment_fee REAL DEFAULT ${DEFAULT_TREATMENT_FEE}`);
    db.exec(`UPDATE visits SET treatment_fee = ${DEFAULT_TREATMENT_FEE} WHERE treatment_fee IS NULL`);
  }
  if (!getMeta('next_patient_seq')) setMeta('next_patient_seq', '1');
}

function resolveTreatmentFee(fee) {
  if (fee == null || fee === '') return DEFAULT_TREATMENT_FEE;
  const n = Number(fee);
  return Number.isNaN(n) ? DEFAULT_TREATMENT_FEE : Math.max(0, n);
}

function mapVisitRow(row) {
  const medicines = getVisitMedicines(row.id);
  const medicineTotalVal = medicineTotal(medicines);
  const treatmentFee = row.treatment_fee != null ? Number(row.treatment_fee) : DEFAULT_TREATMENT_FEE;
  return {
    id: row.id,
    patientId: row.patient_id,
    visitDate: row.visit_date,
    reason: row.reason,
    notes: row.notes,
    medicines,
    treatmentFee,
    medicineTotal: medicineTotalVal,
    visitTotal: treatmentFee + medicineTotalVal,
    createdAt: row.created_at,
  };
}

function normalizeMedicines(medicines) {
  if (!Array.isArray(medicines)) return [];
  return medicines
    .map((m) => ({
      name: String(m.name || m.medicineName || '').trim(),
      amount: Math.max(0, Number(m.amount) || 0),
    }))
    .filter((m) => m.name);
}

function saveVisitMedicines(visitId, medicines) {
  const normalized = normalizeMedicines(medicines);
  db.prepare('DELETE FROM visit_medicines WHERE visit_id = ?').run(visitId);
  const insert = db.prepare(`
    INSERT INTO visit_medicines (id, visit_id, medicine_name, amount, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const now = new Date().toISOString();
  normalized.forEach((m) => {
    insert.run(uuidv4(), visitId, m.name, m.amount, now);
  });
}

function getVisitMedicines(visitId) {
  return db.prepare(`
    SELECT medicine_name, amount FROM visit_medicines
    WHERE visit_id = ? ORDER BY created_at ASC
  `).all(visitId).map((row) => ({
    name: row.medicine_name,
    amount: row.amount,
  }));
}

function medicineTotal(medicines) {
  return (medicines || []).reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
}

function getVisitDayKey(iso) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function findTodayVisit(patientId) {
  const today = getVisitDayKey(new Date().toISOString());
  const rows = db.prepare(`
    SELECT * FROM visits WHERE patient_id = ? ORDER BY visit_date DESC
  `).all(patientId);
  const row = rows.find((r) => getVisitDayKey(r.visit_date) === today);
  return row ? mapVisitRow(row) : null;
}

function updateVisit(visitId, { reason, notes, medicines, treatmentFee }) {
  const row = db.prepare('SELECT * FROM visits WHERE id = ?').get(visitId);
  if (!row) return null;

  const fee = treatmentFee != null && treatmentFee !== ''
    ? resolveTreatmentFee(treatmentFee)
    : (row.treatment_fee != null ? Number(row.treatment_fee) : DEFAULT_TREATMENT_FEE);

  db.prepare(`
    UPDATE visits SET reason = ?, notes = ?, treatment_fee = ?
    WHERE id = ?
  `).run(
    reason !== undefined ? String(reason || '').trim() : row.reason,
    notes !== undefined ? String(notes || '').trim() : row.notes,
    fee,
    visitId
  );

  if (medicines !== undefined) {
    saveVisitMedicines(visitId, medicines);
  }

  db.prepare(`
    UPDATE patients SET updated_at = ? WHERE patient_id = ?
  `).run(new Date().toISOString(), row.patient_id);

  return getVisit(visitId);
}

function upsertTodayVisit(patientId, data) {
  const existing = findTodayVisit(patientId);
  if (existing) {
    const mergedMeds = normalizeMedicines(data.medicines);
    const currentMeds = getVisitMedicines(existing.id);
    const allMeds = [...currentMeds, ...mergedMeds];
    const deduped = [];
    const seen = new Set();
    allMeds.forEach((m) => {
      const key = `${m.name.toLowerCase()}|${m.amount}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(m);
      }
    });
    return updateVisit(existing.id, {
      reason: data.reason?.trim() ? data.reason : existing.reason,
      notes: data.notes?.trim() ? data.notes : existing.notes,
      treatmentFee: data.treatmentFee != null ? data.treatmentFee : existing.treatmentFee,
      medicines: deduped.length ? deduped : currentMeds,
    });
  }
  return addVisit(patientId, data);
}

function savePhoto(patientId, photoData) {
  if (!photoData?.trim()) return null;
  const match = photoData.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!match) throw new Error('Invalid photo data');
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 5 * 1024 * 1024) throw new Error('Photo is too large (max 5MB)');
  const filePath = path.join(PHOTOS_DIR, `${patientId}.${ext}`);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

function createPatient(data) {
  const phone = normalizePhone(data.phone);
  if (phone.length !== 10) throw new Error('Enter a valid 10-digit mobile number');

  const existing = db.prepare('SELECT patient_id FROM patients WHERE phone = ?').get(phone);
  if (existing) {
    throw new Error(`Patient already exists with this phone (${existing.patient_id}). Use Find Patient to update.`);
  }

  const seq = getNextPatientSeq();
  const patientId = formatPatientId(seq);
  const id = data.id;
  const now = data.createdAt || new Date().toISOString();
  let photoPath = null;

  if (data.photoData) {
    photoPath = savePhoto(patientId, data.photoData);
  }

  db.prepare(`
    INSERT INTO patients (
      id, patient_id, name, age, gender, phone, address, blood_group,
      allergies, emergency_contact, photo_path, weight_kg,
      created_at, updated_at, last_visit_at, visit_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    id,
    patientId,
    data.name.trim(),
    data.age != null ? Number(data.age) : null,
    data.gender || null,
    phone,
    data.address?.trim() || '',
    data.bloodGroup?.trim() || '',
    data.allergies?.trim() || '',
    data.emergencyContact?.trim() || '',
    photoPath,
    data.weight != null && data.weight !== '' ? Number(data.weight) : null,
    now,
    now,
    null
  );

  addVisit(patientId, {
    id: uuidv4(),
    visitDate: data.visitDate || now,
    reason: data.visitReason || 'Registration',
    notes: data.visitNotes || '',
    medicines: data.medicines,
    treatmentFee: data.treatmentFee,
  });

  return findPatientByPatientId(patientId);
}

function updatePatient(patientId, data) {
  const existing = findPatientByPatientId(patientId);
  if (!existing) return null;

  const phone = data.phone != null ? normalizePhone(data.phone) : existing.phone;
  if (phone.length !== 10) throw new Error('Enter a valid 10-digit mobile number');

  const phoneConflict = db.prepare(
    'SELECT patient_id FROM patients WHERE phone = ? AND patient_id != ?'
  ).get(phone, patientId);
  if (phoneConflict) throw new Error('Another patient already uses this phone number');

  let photoPath = existing.photoUrl
    ? path.join(PHOTOS_DIR, path.basename(existing.photoUrl))
    : null;

  if (data.photoData) {
    photoPath = savePhoto(patientId, data.photoData);
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE patients SET
      name = ?, age = ?, gender = ?, phone = ?, address = ?,
      blood_group = ?, allergies = ?, emergency_contact = ?,
      weight_kg = COALESCE(?, weight_kg),
      photo_path = COALESCE(?, photo_path),
      updated_at = ?
    WHERE patient_id = ?
  `).run(
    data.name?.trim() || existing.name,
    data.age != null ? Number(data.age) : existing.age,
    data.gender || existing.gender,
    phone,
    data.address?.trim() ?? existing.address,
    data.bloodGroup?.trim() ?? existing.bloodGroup,
    data.allergies?.trim() ?? existing.allergies,
    data.emergencyContact?.trim() ?? existing.emergencyContact,
    data.weight != null && data.weight !== '' ? Number(data.weight) : existing.weightKg,
    photoPath,
    now,
    patientId
  );

  return findPatientByPatientId(patientId);
}

function addVisit(patientId, { visitDate, reason, notes, id, medicines, treatmentFee }) {
  const patient = findPatientByPatientId(patientId);
  if (!patient) throw new Error('Patient not found');

  const when = visitDate || new Date().toISOString();
  const visitId = id || uuidv4();
  const fee = resolveTreatmentFee(treatmentFee);

  db.prepare(`
    INSERT INTO visits (id, patient_id, visit_date, reason, notes, treatment_fee, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    visitId,
    patientId,
    when,
    reason?.trim() || '',
    notes?.trim() || '',
    fee,
    new Date().toISOString()
  );

  if (medicines?.length) {
    saveVisitMedicines(visitId, medicines);
  }

  db.prepare(`
    UPDATE patients SET visit_count = visit_count + 1, last_visit_at = ?, updated_at = ?
    WHERE patient_id = ?
  `).run(when, new Date().toISOString(), patientId);

  return getVisit(visitId);
}

function getVisit(visitId) {
  const row = db.prepare('SELECT * FROM visits WHERE id = ?').get(visitId);
  if (!row) return null;
  return mapVisitRow(row);
}

function findPatientByPatientId(patientId) {
  const row = db.prepare('SELECT * FROM patients WHERE patient_id = ?').get(patientId);
  return rowToPatient(row);
}

function findPatientByPhone(phone) {
  const normalized = normalizePhone(phone);
  if (normalized.length !== 10) return null;
  const row = db.prepare('SELECT * FROM patients WHERE phone = ?').get(normalized);
  return rowToPatient(row);
}

function searchPatients(query) {
  const q = String(query || '').trim();
  if (!q) return [];

  const digits = normalizePhone(q);
  let rows;

  if (digits.length === 10) {
    rows = db.prepare(`
      SELECT * FROM patients WHERE phone = ? OR patient_id LIKE ? OR name LIKE ?
      ORDER BY last_visit_at DESC LIMIT 25
    `).all(digits, `%${q}%`, `%${q}%`);
  } else {
    rows = db.prepare(`
      SELECT * FROM patients
      WHERE name LIKE ? OR patient_id LIKE ? OR phone LIKE ?
      ORDER BY last_visit_at DESC LIMIT 25
    `).all(`%${q}%`, `%${q.toUpperCase()}%`, `%${digits}%`);
  }

  return rows.map(rowToPatient);
}

function getPatientDetail(patientId) {
  const patient = findPatientByPatientId(patientId);
  if (!patient) return null;
  const visits = db.prepare(`
    SELECT * FROM visits WHERE patient_id = ? ORDER BY visit_date DESC
  `).all(patientId).map(mapVisitRow);
  return { patient, visits };
}

function listRecentPatients(limit = 20) {
  return db.prepare(`
    SELECT * FROM patients ORDER BY last_visit_at DESC LIMIT ?
  `).all(limit).map(rowToPatient);
}

function listAllPatients() {
  return db.prepare(`
    SELECT * FROM patients ORDER BY name ASC
  `).all().map(rowToPatient);
}

function todayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function parseDateParts(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { y, m, d };
}

function formatDateLocal(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function addDaysToDateStr(dateStr, days) {
  const { y, m, d } = parseDateParts(dateStr);
  const dt = new Date(y, m - 1, d + days);
  return formatDateLocal(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

function getReportPeriodBounds(period, referenceDate) {
  const ref = referenceDate || todayIST();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ref)) {
    throw new Error('Invalid date. Use YYYY-MM-DD');
  }
  if (period === 'day') {
    return { start: ref, end: ref, period: 'day', referenceDate: ref };
  }
  if (period === 'week') {
    const { y, m, d } = parseDateParts(ref);
    const dt = new Date(y, m - 1, d);
    const dow = dt.getDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const start = addDaysToDateStr(ref, mondayOffset);
    const end = addDaysToDateStr(start, 6);
    return { start, end, period: 'week', referenceDate: ref };
  }
  if (period === 'month') {
    const { y, m } = parseDateParts(ref);
    const lastDay = new Date(y, m, 0).getDate();
    return {
      start: formatDateLocal(y, m, 1),
      end: formatDateLocal(y, m, lastDay),
      period: 'month',
      referenceDate: ref,
    };
  }
  throw new Error('Invalid period. Use day, week, or month.');
}

function isDateInRange(dayKey, start, end) {
  return dayKey >= start && dayKey <= end;
}

function getRevenueReport(period, referenceDate) {
  const bounds = getReportPeriodBounds(period, referenceDate);
  const rows = db.prepare(`
    SELECT v.*, p.name AS patient_name, p.phone AS patient_phone
    FROM visits v
    JOIN patients p ON p.patient_id = v.patient_id
    ORDER BY v.visit_date DESC
  `).all();

  const visits = rows
    .filter((row) => isDateInRange(getVisitDayKey(row.visit_date), bounds.start, bounds.end))
    .map((row) => {
      const visit = mapVisitRow(row);
      return {
        visitId: visit.id,
        visitDate: visit.visitDate,
        patientId: visit.patientId,
        patientName: row.patient_name,
        patientPhone: row.patient_phone,
        reason: visit.reason,
        notes: visit.notes,
        medicines: visit.medicines,
        treatmentFee: visit.treatmentFee,
        medicineTotal: visit.medicineTotal,
        visitTotal: visit.visitTotal,
      };
    });

  const patientIds = new Set(visits.map((v) => v.patientId));
  const treatmentRevenue = visits.reduce((s, v) => s + v.treatmentFee, 0);
  const medicineRevenue = visits.reduce((s, v) => s + v.medicineTotal, 0);

  return {
    ...bounds,
    summary: {
      visitCount: visits.length,
      patientCount: patientIds.size,
      treatmentRevenue,
      medicineRevenue,
      totalRevenue: treatmentRevenue + medicineRevenue,
    },
    visits,
  };
}

module.exports = {
  initDatabase,
  PHOTOS_DIR,
  DB_PATH,
  DEFAULT_TREATMENT_FEE,
  normalizePhone,
  createPatient,
  updatePatient,
  addVisit,
  updateVisit,
  upsertTodayVisit,
  findTodayVisit,
  findPatientByPatientId,
  findPatientByPhone,
  searchPatients,
  getPatientDetail,
  listRecentPatients,
  listAllPatients,
  getVisit,
  getRevenueReport,
  todayIST,
};
