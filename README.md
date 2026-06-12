# Hospital Patient Records

Web app for storing patient details, capturing photos in real time, and retrieving records on repeat visits.

## Features

- Register new patients with full details
- **Live camera photo capture** (webcam / phone camera)
- Auto-generated Patient ID (`PAT-00001`)
- Search by **name**, **phone**, or **patient ID**
- Visit history on each revisit
- SQLite database with local photo storage

## Quick Start

```bash
cd hospital-patient-records
npm install
copy .env.example .env
npm start
```

Open **http://localhost:3457**

Default access key: `admin123` (change in `.env`)

## Environment

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default 3457) |
| `ADMIN_KEY` | Staff login key |
| `HOSPITAL_NAME` | Display name in header |
| `DATABASE_PATH` | SQLite database path |

## Usage

1. **Login** with staff access key
2. **New Patient** — fill details, open camera, capture photo, save
3. **Find Patient** — search by phone (fastest), name, or PAT-ID
4. On revisit — open patient, view history, **Add Visit**

## Camera

Works on Chrome/Edge (desktop & Android). Requires HTTPS or localhost. Allow camera permission when prompted.

## Data

- Database: `data/patients.db`
- Photos: `data/photos/PAT-00001.jpg`

Backup the `data/` folder regularly.
