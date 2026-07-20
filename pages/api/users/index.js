import db from '../../../lib/db';
import { v4 as uuidv4 } from 'uuid';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const result = await db.execute('SELECT id, name, created_at FROM users');
      return res.status(200).json(result.rows);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Failed to fetch users' });
    }
  }

  if (req.method === 'POST') {
    const { name, descriptors } = req.body;

    if (!name || !descriptors || !descriptors.length) {
      return res.status(400).json({ error: 'Name and descriptors are required.' });
    }

    const userId = uuidv4();

    try {
      // Use a transaction
      const transaction = await db.transaction();
      await transaction.execute({
        sql: 'INSERT INTO users (id, name) VALUES (?, ?)',
        args: [userId, name]
      });

      for (const desc of descriptors) {
        await transaction.execute({
          sql: 'INSERT INTO face_descriptors (user_id, descriptor) VALUES (?, ?)',
          args: [userId, JSON.stringify(desc)]
        });
      }
      
      await transaction.commit();

      return res.status(201).json({ id: userId, name });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
