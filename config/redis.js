// config/redis.js
const { createClient } = require('redis');
require('dotenv').config();

const client = createClient({
  url: process.env.REDIS_URL,
});

client.on('error', (err) => {
  console.error('Redis error:', err);
});

(async () => {
  await client.connect();
})();

module.exports = client;
