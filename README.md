# AI Attendance Kiosk

An enterprise-grade, edge-based AI Attendance Kiosk designed to automate check-ins and check-outs using a two-step authentication pipeline: QR Identity scanning followed by Facial Recognition verification.

Built for the **DITEC** presentation, this system prevents buddy-punching, enforces strict time constraints (11 AM IN / 5 PM OUT), prevents TOCTOU race conditions via an in-memory Mutex lock, and runs entirely statelessly inside Docker while persisting data to an embedded SQLite database.

## Features
- **Strict State Machine**: Sequential user flow (`QR` $\rightarrow$ `FACE` $\rightarrow$ `API` $\rightarrow$ `SUCCESS`).
- **Edge AI Face Recognition**: Uses `face-api.js` inside a Web Worker thread for 60fps inference without blocking the UI.
- **Race Condition Protection**: A backend Mutex lock rejects duplicate concurrent API requests per user with an HTTP 409 Conflict.
- **Stateless Containerization**: Completely containerized via Docker.
- **Persistent Data**: Maps the internal SQLite database to the host machine via Docker Volumes.
- **Time Constraints**: Strictly enforces 11 AM IN and 5 PM OUT cutoffs using `date-fns-tz` for timezone accuracy (Asia/Kolkata). Includes a bypassable `Demo Mode`.

## Prerequisites
- Docker & Docker Compose
- Node.js 20+ (if running locally without Docker)
- A webcam connected to the host machine.

## Getting Started

The easiest way to deploy this system is via Docker.

```bash
# 1. Clone the repository
git clone https://github.com/biswajyoti-nath/attendance-system.git
cd attendance-system

# 2. Build and start the container in detached mode
docker compose up -d --build
```

The system will now be running at `http://localhost:3000`.

### Viewing Attendance Data
To view the generated SQLite records, simply navigate to:
```text
http://localhost:3000/api/attendance
```

## Local Development (Without Docker)

```bash
npm install
npm run dev
```

## Architecture Notes
For a deeper dive into the system, see the generated documentation in the `/docs` folder:
- `docs/PRD.md`
- `docs/System_Architecture.md`
- `docs/API_Reference.md`
- `docs/code_explainer.pdf` (Presentation Script)
- `docs/report.pdf` (Industrial Report)

## License
MIT License.
