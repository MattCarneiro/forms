// config/rabbitmq.js
const amqp = require('amqplib');
const dotenv = require('dotenv');
dotenv.config();

const rabbitmqUrl = process.env.RABBITMQ_URL;

async function createChannel() {
  try {
    console.log('Tentando conectar ao RabbitMQ...');
    const connection = await amqp.connect(rabbitmqUrl);
    console.log('Conexão com RabbitMQ estabelecida com sucesso.');

    const channel = await connection.createChannel();
    console.log('Canal RabbitMQ criado.');

    return channel;
  } catch (error) {
    console.error('Falha ao criar canal RabbitMQ:', error);
    throw error;
  }
}

module.exports = { createChannel };
