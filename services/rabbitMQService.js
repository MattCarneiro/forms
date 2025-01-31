// services/rabbitMQService.js

const amqplib = require('amqplib');
const redisClient = require('./redisService');
const s3Service = require('./s3Service');
const dotenv = require('dotenv');
const axios = require('axios'); // Adicionamos o axios para enviar requisições HTTP
dotenv.config();

// Configurações
const RABBITMQ_URL = process.env.RABBITMQ_URL;
const QUEUE_NAME = process.env.RABBITMQ_QUEUE_NAME;
const PREFETCH_COUNT = parseInt(process.env.RABBITMQ_PREFETCH) || 11;
const MAX_RETRIES = 10;
const WEBHOOK_URL2 = process.env.WEBHOOK_URL2; // Adicionar WEBHOOK_URL2

// Importar o Redis client e criar um publisher separado
const { createClient } = require('redis');
const redisPublisher = createClient({
  url: process.env.REDIS_URL,
});

redisPublisher.on('error', (err) => {
  console.error('Erro no Redis Publisher:', err);
});

(async () => {
  await redisPublisher.connect();
})();

const start = async () => {
  let connection;
  let channel;
  let retryCount = 0;

  const connect = async () => {
    try {
      console.log('Tentando conectar ao RabbitMQ...');
      connection = await amqplib.connect(RABBITMQ_URL);

      connection.on('error', (err) => {
        console.error('Erro na conexão RabbitMQ:', err);
      });

      connection.on('close', () => {
        console.error('Conexão RabbitMQ fechada.');
        if (retryCount < MAX_RETRIES) {
          const waitTime = Math.min(Math.pow(2, retryCount) * 1000, 30000);
          console.log(`Tentando reconectar em ${waitTime / 1000} segundos...`);
          setTimeout(connect, waitTime);
          retryCount++;
        } else {
          console.error('Máximo de tentativas de reconexão RabbitMQ atingido. Encerrando o worker.');
          process.exit(1);
        }
      });

      channel = await connection.createChannel();
      await channel.assertQueue(QUEUE_NAME, {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
        },
      });
      console.log(`Fila '${QUEUE_NAME}' verificada/criada com 'quorum' type.`);
      await channel.prefetch(PREFETCH_COUNT);
      console.log(`Prefetch count configurado para ${PREFETCH_COUNT}.`);
      console.log(`Worker está aguardando mensagens na fila '${QUEUE_NAME}'.`);

      channel.consume(
        QUEUE_NAME,
        async (msg) => {
          if (msg !== null) {
            console.log('Mensagem recebida da fila:', { message: msg.content.toString() });
            try {
              const message = JSON.parse(msg.content.toString());
              const { type, id, id2, code, fieldName, originalname, buffer, mimetype } = message;

              console.log('Iniciando upload para o S3...', { originalname, fieldName });

              // Realizar o upload para o S3
              const uploadedUrl = await s3Service.uploadToS3(
                type,
                id,
                id2,
                fieldName,
                originalname,
                Buffer.from(buffer, 'base64'),
                mimetype
              );
              console.log(`Upload para o S3 concluído: ${originalname}`);
              console.log(`URL do S3 para ${originalname}: ${uploadedUrl}`);

              // Atualizar o Redis para marcar o arquivo como enviado com timestamp e URL
              const formKeyRedis = `form:${type}:${id}:${id2}:${code}`;
              let formData = await redisClient.get(formKeyRedis);

              if (formData) {
                formData = JSON.parse(formData);
                formData.uploaded[fieldName] = {
                  status: 'uploaded',
                  originalname: originalname,
                  url: uploadedUrl,
                  timestamp: Date.now(),
                };
                await redisClient.set(formKeyRedis, JSON.stringify(formData));
                console.log(`Dados do Redis atualizados para o campo '${fieldName}'.`);

                // Publicar a atualização no canal de pub/sub
                const updateMessage = {
                  type,
                  id,
                  id2,
                  code,
                  fieldName,
                  status: 'uploaded',
                  url: uploadedUrl,
                };
                await redisPublisher.publish('upload-status', JSON.stringify(updateMessage));
                console.log('Mensagem publicada no canal upload-status:', updateMessage);

                // Verificar se todos os campos foram enviados
                const allFieldsUploaded = formData.fields.every((field) => {
                  return (
                    formData.uploaded[field] &&
                    formData.uploaded[field].status === 'uploaded'
                  );
                });

                if (allFieldsUploaded && !formData.webhookSent) {
                  console.log('Todos os campos foram enviados. Enviando webhook.');

                  if (WEBHOOK_URL2) {
                    // Construir a URL do formulário
                    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
                    const host = process.env.HOST || 'localhost';
                    const formURL = `${protocol}://${host}/forms/${type}/${id}/${id2}/${code}`;

                    // Enviar o webhook
                    try {
                      await axios.post(
                        WEBHOOK_URL2,
                        { formURL },
                        {
                          headers: {
                            'Content-Type': 'application/json',
                          },
                        }
                      );
                      console.log('Webhook enviado com sucesso para WEBHOOK_URL2.');

                      // Atualizar o formData para indicar que o webhook foi enviado
                      formData.webhookSent = true;
                      await redisClient.set(formKeyRedis, JSON.stringify(formData));
                    } catch (webhookError) {
                      console.error('Erro ao enviar o webhook para WEBHOOK_URL2:', webhookError);
                    }
                  } else {
                    console.warn('WEBHOOK_URL2 não está definida. Webhook não enviado.');
                  }
                }

              } else {
                console.warn(`Formulário não encontrado no Redis para a chave: ${formKeyRedis}`);
              }

              channel.ack(msg);
              console.log(`Mensagem reconhecida e removida da fila: ${originalname}`);
            } catch (error) {
              console.error('Erro ao processar a mensagem:', error);
              channel.nack(msg, false, false); // Rejeitar a mensagem sem reencaminhá-la
            }
          }
        },
        { noAck: false }
      );

    } catch (error) {
      console.error('Erro ao conectar ou configurar o RabbitMQ:', error);
      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.min(Math.pow(2, retryCount) * 1000, 30000);
        console.log(`Tentando reconectar em ${waitTime / 1000} segundos...`);
        setTimeout(connect, waitTime);
        retryCount++;
      } else {
        console.error('Máximo de tentativas de reconexão RabbitMQ atingido. Encerrando o worker.');
        process.exit(1);
      }
    }
  };

  connect();
};

module.exports = { start };
