import db from '../../../lib/db';
import { formatInTimeZone } from 'date-fns-tz';

const TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';

/**
 * In-memory mutex to prevent concurrent requests for the same user.
 * This completely eliminates Time-of-Check-to-Time-of-Use (TOCTOU) race conditions.
 * @type {Map<string, boolean>}
 */
const activeLocks = new Map();

/**
 * Validates the time constraints for IN and OUT attendance punches.
 * @param {string} type - The attendance type ('IN' or 'OUT').
 * @param {number} hours - The current hour in 24-hour format.
 * @returns {string | null} Error message if invalid, or null if valid.
 */
const validateTimeConstraints = (type, hours) => {
  if (type === 'IN' && hours >= 11) {
    return 'Too late for In-Time. Must be before 11:00 AM.';
  }
  if (type === 'OUT' && hours < 17) {
    return 'Too early for Out-Time. Must be after 5:00 PM.';
  }
  return null;
};

/**
 * Handles the attendance API requests.
 * @param {import('next').NextApiRequest} req - The Next.js API request object.
 * @param {import('next').NextApiResponse} res - The Next.js API response object.
 */
export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { userId, type, isTest } = req.body;

    if (!userId || !type || (type !== 'IN' && type !== 'OUT')) {
      return res.status(400).json({ error: 'Valid userId and type (IN/OUT) are required.' });
    }

    if (activeLocks.has(userId)) {
      return res.status(409).json({ error: 'Please wait, processing your previous request.' });
    }
    activeLocks.set(userId, true);

    try {
      const now = new Date();
      const timeStr = formatInTimeZone(now, TIMEZONE, 'HH:mm');
      const [hours] = timeStr.split(':').map(Number);
      const todayStr = formatInTimeZone(now, TIMEZONE, 'yyyy-MM-dd');

      // Enforce time policy unless we are in Demo mode
      if (!isTest) {
        const timeError = validateTimeConstraints(type, hours);
        if (timeError) {
          return res.status(400).json({ error: timeError });
        }
      }

      // Check if user has already punched this type today
      const logsToday = await db.execute({
        sql: "SELECT timestamp FROM attendance_logs WHERE user_id = ? AND type = ?",
        args: [userId, type]
      });

      const alreadyPunched = logsToday.rows.some(log => {
        const standardIso = log.timestamp.replace(' ', 'T') + 'Z';
        const logDateStr = formatInTimeZone(new Date(standardIso), TIMEZONE, 'yyyy-MM-dd');
        return logDateStr === todayStr;
      });

      if (alreadyPunched) {
        return res.status(400).json({ error: `Already marked ${type}-Time for today.` });
      }

      await db.execute({
        sql: 'INSERT INTO attendance_logs (user_id, type) VALUES (?, ?)',
        args: [userId, type]
      });

      return res.status(200).json({ success: true, message: `Successfully marked ${type}` });
    } catch (error) {
      console.error('[API_ATTENDANCE_ERROR]', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    } finally {
      // Always release the lock so the user is not permanently stuck if an error occurs
      activeLocks.delete(userId);
    }
  }

  if (req.method === 'GET') {
    try {
      const logs = await db.execute(`
        SELECT a.id, a.type, a.timestamp, u.name 
        FROM attendance_logs a 
        JOIN users u ON a.user_id = u.id 
        ORDER BY a.timestamp DESC
      `);
      return res.status(200).json(logs.rows);
    } catch (error) {
      console.error('[API_ATTENDANCE_ERROR]', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
