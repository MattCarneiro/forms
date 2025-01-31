// services/cleanupService.js

const formsService = require('./formsService');
const axios = require('axios'); // Para enviar o webhook
const dotenv = require('dotenv');
dotenv.config();

const CLEANUP_INTERVAL_MINUTES = parseInt(process.env.CLEANUP_INTERVAL_MINUTES) || 60; // Intervalo de checagem
const FORM_EXPIRATION_HOURS = parseInt(process.env.FORM_EXPIRATION_HOURS) || 24; // Tempo de expiração
const WEBHOOK_URL = process.env.WEBHOOK_URL; // URL do webhook

if (!WEBHOOK_URL) {
  console.warn('WEBHOOK_URL não está definida no arquivo .env. Webhooks não serão enviados.');
}

const cleanupExpiredForms = async () => {
  try {
    const forms = await formsService.getAllForms();

    const now = Date.now();
    const expirationTime = FORM_EXPIRATION_HOURS * 60 * 60 * 1000; // Convertendo horas para milissegundos

    for (const form of forms) {
      const { type, id, id2, code, createdAt, uploaded } = form;

      // Verificar se o formulário não teve nenhum upload e está expirado
      const hasUploads = Object.keys(uploaded).some(field => uploaded[field].status === 'uploaded' || uploaded[field].status === 'pending');

      if (!hasUploads && (now - createdAt) > expirationTime) {
        console.log(`Formulário expirado: type=${type}, id=${id}, id2=${id2}, code=${code}`);

        // Deletar o formulário
        await formsService.deleteForm({ type, id, id2, code });

        // Enviar o webhook se a URL estiver definida
        if (WEBHOOK_URL) {
          try {
            await axios.post(WEBHOOK_URL, { id, id2 }, {
              headers: {
                'Content-Type': 'application/json'
              }
            });
            console.log(`Webhook enviado para id=${id}, id2=${id2}`);
          } catch (webhookError) {
            console.error(`Erro ao enviar webhook para id=${id}, id2=${id2}:`, webhookError);
          }
        }
      }
    }
  } catch (error) {
    console.error('Erro durante a limpeza de formulários expirados:', error);
  }
};

const startCleanupService = () => {
  console.log(`Iniciando serviço de limpeza. Intervalo: ${CLEANUP_INTERVAL_MINUTES} minutos. Expiração: ${FORM_EXPIRATION_HOURS} horas.`);

  // Executar imediatamente ao iniciar
  cleanupExpiredForms();

  // Agendar a execução periódica
  setInterval(cleanupExpiredForms, CLEANUP_INTERVAL_MINUTES * 60 * 1000);
};

module.exports = { start: startCleanupService };
