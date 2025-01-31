// services/formsService.js

const crypto = require('crypto');
const redisClient = require('./redisService');
const amqp = require('amqplib');
const path = require('path');
const deburr = require('lodash.deburr');
const s3Service = require('./s3Service');
const dotenv = require('dotenv');
dotenv.config();

// Função para normalizar nomes de campo usando lodash.deburr
const normalizeFieldName = (str) => {
  return deburr(str).replace(/\s+/g, '_').toLowerCase();
};

// Função para criar ou atualizar um formulário
exports.createForm = async ({ fields, id, id2, type, url }) => {
  if (!fields || !id || !id2 || !type) {
    throw new Error('Parâmetros obrigatórios faltando.');
  }

  const formIdKey = `formid:${type}:${id}:${id2}`;
  let code = await redisClient.get(formIdKey);
  console.log(`Código recuperado da chave formid: ${code}`);

  if (!code) {
    // Se não existir código, gera um novo
    code = crypto.randomBytes(8).toString('hex');
    console.log(`Novo código gerado: ${code}`);
    await redisClient.set(formIdKey, code);
  }

  const formKey = `form:${type}:${id}:${id2}:${code}`;
  let formData = await redisClient.get(formKey);

  if (formData) {
    // Se o formulário já existir, atualiza os campos
    formData = JSON.parse(formData);

    // Verifica se os campos realmente mudaram
    const newFields = fields.map((field) => normalizeFieldName(field.trim()));
    const fieldsChanged = JSON.stringify(formData.fields) !== JSON.stringify(newFields);

    if (fieldsChanged) {
      formData.fields = newFields;

      // Resetar os uploads existentes se os campos foram alterados
      formData.uploaded = {};

      // Redefinir 'webhookSent' para 'false' para permitir o envio do webhook novamente
      formData.webhookSent = false;

      console.log('Campos do formulário atualizados e uploads resetados.', { formKey, formData });
    }

    // Atualiza o redirectUrl se fornecido
    if (url && formData.redirectUrl !== url) {
      formData.redirectUrl = url;
      console.log('URL de redirecionamento atualizada.', { redirectUrl: formData.redirectUrl });
    }

    await redisClient.set(formKey, JSON.stringify(formData));
  } else {
    // Se o formulário não existir, cria um novo
    formData = {
      fields: fields.map((field) => normalizeFieldName(field.trim())),
      uploaded: {},
      code,
      type,
      id,
      id2,
      redirectUrl: url || process.env.REDIRECT_URL || '',
      createdAt: Date.now(), // Adiciona a data de criação
      webhookSent: false,    // Inicializa webhookSent como false
    };
    await redisClient.set(formKey, JSON.stringify(formData));

    console.log('Formulário criado com sucesso.', { formKey, formData });
  }

  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const host = process.env.HOST || 'localhost';
  const formURL = `${protocol}://${host}/forms/${type}/${id}/${id2}/${code}`;
  console.log(`URL do formulário gerada: ${formURL}`);
  return { url: formURL };
};

// Função para resetar um formulário (modificado para tratar fields como array)
exports.resetForm = async ({ link, fields, id, id2 }) => {
  if (!link || !fields || !id || !id2) {
    throw new Error('Parâmetros obrigatórios faltando.');
  }

  const urlParts = link.split('/');
  const code = urlParts.pop();
  const type = urlParts[urlParts.length - 4];
  const idParam = urlParts[urlParts.length - 3];
  const id2Param = urlParts[urlParts.length - 2];

  const formKey = `form:${type}:${idParam}:${id2Param}:${code}`;
  const formIdKey = `formid:${type}:${idParam}:${id2Param}`;
  const formData = {
    fields: fields.map((field) => normalizeFieldName(field.trim())),
    uploaded: {},
    code,
    type,
    id: idParam,
    id2: id2Param,
    redirectUrl: '',
    createdAt: Date.now(), // Atualiza a data de criação ao resetar
    webhookSent: false,    // Inicializa webhookSent como false
  };

  await redisClient.set(formKey, JSON.stringify(formData));
  await redisClient.set(formIdKey, code);
  console.log('Formulário resetado com sucesso.', { formKey, formData });

  return { url: link };
};

// Função para obter a URL de redirecionamento (mantida conforme original)
exports.getRedirectUrl = async ({ type, id, id2 }) => {
  const pattern = `form:${type}:${id}:${id2}:*`;
  const keys = await redisClient.keys(pattern);

  if (keys.length === 0) {
    return process.env.REDIRECT_URL || 'https://defaulturl.com';
  }

  const forms = await Promise.all(
    keys.map(async (key) => {
      const formData = await redisClient.get(key);
      return formData ? JSON.parse(formData) : null;
    })
  );

  const formsWithRedirect = forms.filter((form) => form && form.redirectUrl);

  if (formsWithRedirect.length > 0) {
    const randomForm = formsWithRedirect[Math.floor(Math.random() * formsWithRedirect.length)];
    return randomForm.redirectUrl;
  }

  return process.env.REDIRECT_URL || 'https://defaulturl.com';
};

// Função para obter um formulário
exports.getForm = async ({ type, id, id2, code }) => {
  const formKey = `form:${type}:${id}:${id2}:${code}`;
  const formData = await redisClient.get(formKey);

  if (!formData) {
    return null;
  }

  return JSON.parse(formData);
};

// Função para obter todos os id2 sob um dado type e id
exports.getAllId2 = async ({ type, id }) => {
  const pattern = `form:${type}:${id}:*:*`;
  const keys = await redisClient.keys(pattern);

  const id2Set = new Set();
  keys.forEach((key) => {
    const parts = key.split(':');
    if (parts.length === 5) {
      const currentId2 = parts[3];
      id2Set.add(currentId2);
    }
  });

  return Array.from(id2Set);
};

// Função para obter todas as URLs de redirecionamento de id2s existentes
exports.getRedirectUrlsForId = async ({ type, id }) => {
  const id2List = await this.getAllId2({ type, id });
  const redirectUrls = [];

  for (const id2 of id2List) {
    const pattern = `form:${type}:${id}:${id2}:*`;
    const keys = await redisClient.keys(pattern);
    for (const key of keys) {
      const formData = await redisClient.get(key);
      if (formData) {
        const parsedForm = JSON.parse(formData);
        if (parsedForm.redirectUrl) {
          redirectUrls.push(parsedForm.redirectUrl);
        }
      }
    }
  }

  return redirectUrls;
};

// Função para upload de arquivo (modificado para impedir reuploads)
exports.uploadFile = async (params, file, body) => {
  const { type, id, id2, code } = params;
  const fieldId = normalizeFieldName(body.field);

  const formKey = `form:${type}:${id}:${id2}:${code}`;
  let formData = await redisClient.get(formKey);

  if (!formData) {
    throw new Error('Formulário não encontrado.');
  }

  formData = JSON.parse(formData);

  const fieldName = formData.fields.find((f) => f === fieldId);
  if (!fieldName) {
    throw new Error('Campo inválido.');
  }

  if (formData.uploaded[fieldName] && formData.uploaded[fieldName].status === 'uploaded') {
    throw new Error('Campo já possui um arquivo enviado.');
  }

  const fileExtension = path.extname(file.originalname).substring(1).toLowerCase();
  const allowedFormats = process.env.ALLOWED_FILE_FORMATS.split(',').map((fmt) => fmt.trim().toLowerCase());
  const maxSize = parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024;

  if (!allowedFormats.includes(fileExtension)) {
    throw new Error(
      `Formato inválido para ${fieldName}. Permitidos: ${allowedFormats.join(', ')}.`
    );
  }

  if (file.size > maxSize) {
    throw new Error(
      `Arquivo muito grande para ${fieldName}. Máximo permitido: ${(maxSize / (1024 * 1024)).toFixed(2)} MB.`
    );
  }

  try {
    const connection = await amqp.connect(process.env.RABBITMQ_URL);
    const channel = await connection.createChannel();
    await channel.assertQueue(process.env.RABBITMQ_QUEUE_NAME, {
      durable: true,
      arguments: { 'x-queue-type': 'quorum' },
    });

    const message = {
      type,
      id,
      id2,
      code,
      fieldName,
      originalname: file.originalname,
      buffer: file.buffer.toString('base64'),
      mimetype: file.mimetype,
    };

    channel.sendToQueue(process.env.RABBITMQ_QUEUE_NAME, Buffer.from(JSON.stringify(message)), {
      persistent: true,
    });
    console.log('Mensagem enviada para RabbitMQ.', { message });

    await channel.close();
    await connection.close();
    console.log('Conexão RabbitMQ fechada após envio.');

    formData.uploaded[fieldName] = {
      status: 'pending',
      originalname: file.originalname,
      url: '',
      timestamp: Date.now(),
    };
    await redisClient.set(formKey, JSON.stringify(formData));
    console.log('Status de upload atualizado para pendente.', { formKey, fieldName });
  } catch (error) {
    console.error('Erro ao enviar mensagem para o RabbitMQ:', error);
    throw new Error('Erro ao enviar arquivo para processamento.');
  }
};

// Função para deletar um formulário
exports.deleteForm = async ({ type, id, id2, code }) => {
  const formKey = `form:${type}:${id}:${id2}:${code}`;
  const formIdKey = `formid:${type}:${id}:${id2}`;

  try {
    await s3Service.deleteFolder(type, id, id2); // Passa 'type', 'id' e 'id2'
    console.log(`Pasta deletada no S3: ${type}/${id}/${id2}`);

    await redisClient.del(formKey);
    console.log(`Formulário deletado: ${formKey}`);

    await redisClient.del(formIdKey);
    console.log(`Chave formid deletada: ${formIdKey}`);
  } catch (error) {
    console.error('Erro ao deletar formulário:', error);
    throw error;
  }

  return { message: 'Formulário e arquivos deletados com sucesso.' };
};

// Função para obter todos os formulários
exports.getAllForms = async () => {
  try {
    const pattern = 'form:*:*:*:*'; // Ajuste conforme a estrutura das chaves
    const keys = await redisClient.keys(pattern);

    const forms = [];
    for (const key of keys) {
      const formData = await redisClient.get(key);
      if (formData) {
        const parsedForm = JSON.parse(formData);
        const keyParts = key.split(':'); // form:type:id:id2:code
        if (keyParts.length === 5) {
          const [, type, id, id2, code] = keyParts;
          forms.push({
            type,
            id,
            id2,
            code,
            fields: parsedForm.fields,
            uploaded: parsedForm.uploaded,
            redirectUrl: parsedForm.redirectUrl,
            createdAt: parsedForm.createdAt,
          });
        }
      }
    }

    return forms;
  } catch (error) {
    console.error('Erro ao obter todos os formulários:', error);
    throw error;
  }
};
