# API Reference

The backend exposes a simple REST API to handle attendance logging and data retrieval.

---

## 1. Log Attendance

Marks the user as `IN` or `OUT` for the day.

**Endpoint:** `POST /api/attendance`

### Request Body
```json
{
  "userId": "string (required)",
  "type": "string (required) - 'IN' | 'OUT'",
  "isTest": "boolean (optional) - Bypasses time constraints if true"
}
```

### Business Logic & Constraints
- **Time Check:** If `isTest` is false, `IN` is rejected $\geq$ 11:00 AM, and `OUT` is rejected $<$ 5:00 PM.
- **Uniqueness Check:** A user cannot have multiple `IN` or `OUT` records on the same calendar day.
- **Race Condition Lock:** Subsequent requests for the same `userId` within the processing window return a `409 Conflict`.

### Responses
- **200 OK**
  ```json
  { "success": true, "message": "Successfully marked IN" }
  ```
- **400 Bad Request** (Time violation, duplicate punch, or invalid parameters)
  ```json
  { "error": "Too late for In-Time. Must be before 11:00 AM." }
  ```
- **409 Conflict** (Currently processing a request for this user)
  ```json
  { "error": "Please wait, processing your previous request." }
  ```

---

## 2. Get Attendance Logs

Retrieves a chronologically ordered list of all attendance logs.

**Endpoint:** `GET /api/attendance`

### Responses
- **200 OK**
  ```json
  [
    {
      "id": 142,
      "type": "IN",
      "timestamp": "2026-07-21 09:14:22",
      "name": "John Doe"
    }
  ]
  ```

---

## 3. Register New User

Registers a new user with face descriptors in the database. Protected by Basic Auth.

**Endpoint:** `POST /api/users`

### Request Headers
- `Authorization: Basic <base64 credentials>`

### Request Body
```json
{
  "name": "string (required)",
  "descriptors": [ [number, number, ...] ]
}
```

### Responses
- **200 OK** (Successfully registered)
- **401 Unauthorized** (Missing or invalid Basic Auth header)

