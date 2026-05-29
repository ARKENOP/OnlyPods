const express = require('express');
const mysql = require('mysql2/promise');
const { createClient } = require('redis');

const app = express();
app.use(express.json());

const CACHE_KEY = 'messages:latest';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);
if (Number.isNaN(PORT)) {
  throw new Error('PORT must be a valid number.');
}

const DB_HOST = requireEnv('DB_HOST');
const DB_USER = requireEnv('DB_USER');
const DB_PASSWORD = requireEnv('DB_PASSWORD');
const DB_NAME = requireEnv('DB_NAME');
const REDIS_HOST = requireEnv('REDIS_HOST');
const REDIS_PORT = Number.parseInt(process.env.REDIS_PORT ?? '6379', 10);
if (Number.isNaN(REDIS_PORT)) {
  throw new Error('REDIS_PORT must be a valid number.');
}

const pool = mysql.createPool({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
});

const redisClient = createClient({
  socket: {
    host: REDIS_HOST,
    port: REDIS_PORT,
  },
});

redisClient.on('error', (error) => {
  console.error('Redis client error:', error);
});

app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/api/messages', async (_req, res) => {
  try {
    const cached = await redisClient.get(CACHE_KEY);
    if (cached) {
      res.json(JSON.parse(cached));
      return;
    }
  } catch (error) {
    console.error('Redis read failed:', error);
  }

  try {
    const [rows] = await pool.query(
      'SELECT id, author, content, created_at FROM messages ORDER BY created_at DESC LIMIT 50'
    );
    const messages = rows.map((row) => ({
      id: row.id,
      author: row.author,
      content: row.content,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    }));

    try {
      await redisClient.set(CACHE_KEY, JSON.stringify(messages));
    } catch (error) {
      console.error('Redis write failed:', error);
    }

    res.json(messages);
  } catch (error) {
    console.error('Database query failed:', error);
    res.status(500).json({ error: 'Unable to fetch messages.' });
  }
});

app.post('/api/messages', async (req, res) => {
  const author = typeof req.body?.author === 'string' ? req.body.author.trim() : '';
  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';

  if (!author || !content) {
    res.status(400).json({ error: 'Author and content are required.' });
    return;
  }

  try {
    const [result] = await pool.query(
      'INSERT INTO messages (author, content) VALUES (?, ?)',
      [author, content]
    );
    const messageId = result.insertId;
    const [rows] = await pool.query(
      'SELECT id, author, content, created_at FROM messages WHERE id = ?',
      [messageId]
    );
    const row = rows[0];
    const message = {
      id: row.id,
      author: row.author,
      content: row.content,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    };

    try {
      await redisClient.del(CACHE_KEY);
    } catch (error) {
      console.error('Redis cache invalidation failed:', error);
    }

    res.status(201).json(message);
  } catch (error) {
    console.error('Database insert failed:', error);
    res.status(500).json({ error: 'Unable to create message.' });
  }
});

async function initDatabase() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      author VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );
}

async function startServer() {
  await redisClient.connect();
  await initDatabase();

  app.listen(PORT, () => {
    console.log(`API server listening on port ${PORT}`);
  });
}

async function shutdown(signal) {
  console.log(`Shutting down (${signal})...`);
  await Promise.allSettled([redisClient.quit(), pool.end()]);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
