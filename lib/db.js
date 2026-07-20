import { createClient } from '@libsql/client';
import path from 'path';

/**
 * Resolves the path for the SQLite database.
 * Prefers the DB_PATH environment variable for Docker volume mounting,
 * falling back to a local `attendance.db` file for local development.
 * @type {string}
 */
const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'attendance.db');

/**
 * The initialized LibSQL (SQLite) client instance.
 * @type {import('@libsql/client').Client}
 */
export const db = createClient({
  url: 'file:' + dbPath,
});

/**
 * Initializes the database schema.
 * Creates necessary tables (`users`, `face_descriptors`, `attendance_logs`) if they do not exist.
 * @returns {Promise<void>}
 */
export async function initDB() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS face_descriptors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      descriptor TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS attendance_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('IN', 'OUT')),
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
}

// Initialize db when imported (fire and forget for now, or could block API routes until initialized)
initDB().catch(console.error);

export default db;
