import db from '../../../lib/db';

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === 'GET') {
    try {
      const userRes = await db.execute({
        sql: 'SELECT id, name FROM users WHERE id = ?',
        args: [id]
      });

      if (userRes.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const user = userRes.rows[0];

      const descriptorsRes = await db.execute({
        sql: 'SELECT descriptor FROM face_descriptors WHERE user_id = ?',
        args: [id]
      });

      return res.status(200).json({
        ...user,
        descriptors: descriptorsRes.rows.map(d => JSON.parse(d.descriptor)),
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  res.setHeader('Allow', ['GET']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
