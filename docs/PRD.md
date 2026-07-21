# Product Requirements Document (PRD)

## 1. Project Overview
The AI Attendance Kiosk is a modern, standalone system designed to automate employee/student check-ins and check-outs using edge-based facial recognition and QR authentication. It aims to eliminate manual attendance registers and prevent buddy-punching while ensuring a smooth, touchless experience.

## 2. Target Audience
- **Primary Users:** Employees/Students scanning their ID to mark attendance.
- **Secondary Users:** System Administrators managing attendance records and system uptime.

## 3. Core Features

### 3.1 QR-to-Face Authentication Pipeline
- **Requirement:** The system must scan a user's QR code to fetch their identity, then verify their physical presence using facial recognition.
- **Acceptance Criteria:**
  - The webcam must read a QR code.
  - The system must query the database to find the user.
  - The system must capture the user's face and compare it to stored baseline descriptors using Euclidean distance (threshold $\leq 0.55$).

### 3.2 Attendance Policies & Time Restrictions
- **Requirement:** The system must enforce organizational time policies.
- **Acceptance Criteria:**
  - `IN` punches are strictly rejected after 11:00 AM.
  - `OUT` punches are strictly rejected before 5:00 PM.
  - Users cannot punch `IN` or `OUT` more than once per day.

### 3.3 Demo/Test Mode
- **Requirement:** Allow administrators to bypass time constraints for presentation or testing purposes.
- **Acceptance Criteria:** A UI toggle must exist that, when enabled, bypasses the 11 AM and 5 PM strict checks while still logging the attendance accurately.

### 3.4 Secure Admin Panel
- **Requirement:** Provide a secure interface for administrators to register new users and generate QR codes.
- **Acceptance Criteria:**
  - An `/admin` dashboard must allow capturing user faces and generating downloadable/emailable QR codes.
  - The dashboard and its underlying APIs must be protected by HTTP Basic Authentication.

### 3.5 Robustness & Offline Support
- **Requirement:** The system must run entirely locally without requiring internet-based AI APIs, and it must withstand concurrent request anomalies.
- **Acceptance Criteria:**
  - Facial recognition must execute in the browser using Web Workers to avoid freezing the UI.
  - The backend must utilize mutex locks to completely eliminate Time-of-Check-to-Time-of-Use (TOCTOU) race conditions for double-punches.

## 4. Non-Functional Requirements (NFRs)
- **Performance:** The UI must run at 60 FPS during scanning. Web Workers handle the heavy lifting.
- **Security:** Face descriptors are stored as mathematical arrays, not images, preserving privacy.
- **Reliability:** Data must persist across system restarts via Docker volumes.
