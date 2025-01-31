// services/redisService.js
const redis = require('redis');
const dotenv = require('dotenv');
dotenv.config();

const redisClient = redis.createClient({
  url: process.env.REDIS_URL,
});

redisClient.on('error', (err) => {
  console.error('Erro no Redis:', err);
});

redisClient.on('connect', () => {
  console.log('Conectado ao Redis com sucesso.');
});

(async () => {
  try {
    await redisClient.connect();
  } catch (error) {
    console.error('Falha ao conectar ao Redis:', error);
    // Implementar reconexão ou lógica de fallback se necessário
  }
})();

module.exports = redisClient;
