// services/deleteFormService.js
const redisClient = require('./redisService');
const AWS = require('aws-sdk');
const s3Service = require('./s3Service'); // Certifique-se de que este serviço está corretamente importado

// Configuração do AWS S3
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});
const s3 = new AWS.S3();

exports.deleteForm = async (link) => {
  if (!link) {
    throw new Error('Link do formulário é necessário.');
  }

  // Extrair os parâmetros do link
  const url = new URL(link);
  const pathSegments = url.pathname.split('/').filter(segment => segment.length > 0);

  if (pathSegments.length !== 5 || pathSegments[0] !== 'forms') {
    throw new Error('Formato de link inválido.');
  }

  const [_, type, id, id2, code] = pathSegments;

  const formKey = `form:${type}:${id}:${id2}:${code}`;
  const formIdKey = `formid:${type}:${id}:${id2}`;
  let formData = await redisClient.get(formKey);

  if (!formData) {
    throw new Error('Formulário não encontrado.');
  }
  formData = JSON.parse(formData);

  // Definir o prefixo para deletar apenas a pasta 'id2' dentro de 'type/id'
  const prefix = `${type}/${id}/${id2}/`; // Inclui 'id' no prefixo

  try {
    await s3Service.deleteFolder(type, id, id2); // Passa 'type', 'id' e 'id2'
    console.log(`Pasta deletada no S3: ${prefix}`);

    await redisClient.del(formKey);
    console.log(`Formulário deletado do Redis: ${formKey}`);

    await redisClient.del(formIdKey);
    console.log(`Chave formid deletada do Redis: ${formIdKey}`);
  } catch (error) {
    console.error('Erro ao deletar formulário:', error);
    throw new Error('Erro ao deletar formulário.');
  }

  return { message: 'Formulário e arquivos deletados com sucesso.' };
};
