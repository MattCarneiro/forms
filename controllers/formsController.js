// controllers/formsController.js

const formsService = require('../services/formsService');
const deburr = require('lodash.deburr');
const dotenv = require('dotenv');
const amqp = require('amqplib'); // Certifique-se de que amqplib está instalado
const path = require('path');

// Carregar variáveis do .env
dotenv.config();

// Limite de tamanho do arquivo (em bytes)
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024; // 5MB
const ALLOWED_FILE_FORMATS = process.env.ALLOWED_FILE_FORMATS || 'pdf,doc,docx,csv,xls,xlsx,png,jpeg,jpg,webp';

// Função para normalizar nomes de campo
const normalizeFieldName = (str) => {
  return deburr(str).replace(/\s+/g, '_').toLowerCase(); // Remove acentos, espaços e converte para minúsculas
};

// Função auxiliar para enfileirar mensagens no RabbitMQ
const enqueueToRabbitMQ = async (message) => {
  try {
    const connection = await amqp.connect(process.env.RABBITMQ_URL);
    const channel = await connection.createChannel();
    await channel.assertQueue(process.env.RABBITMQ_QUEUE_NAME, { durable: true, arguments: { 'x-queue-type': 'quorum' } });
    channel.sendToQueue(process.env.RABBITMQ_QUEUE_NAME, Buffer.from(JSON.stringify(message)), { persistent: true });
    console.log('Mensagem enviada para RabbitMQ.', { message });
    await channel.close();
    await connection.close();
    console.log('Conexão RabbitMQ fechada após envio.');
  } catch (error) {
    console.error('Erro ao enviar mensagem para o RabbitMQ:', error);
    throw new Error('Erro ao enviar arquivo para processamento.');
  }
};

// Função para criar um formulário
exports.createForm = async (req, res) => {
  try {
    const { fields, id, id2, type, url } = req.query;

    if (!fields || !id || !id2 || !type) {
      return res.status(400).json({ error: 'Parâmetros faltando: fields, id, id2, type são obrigatórios.' });
    }

    // Processar campos: dividir por vírgula, normalizar e deduplicar
    const fieldList = fields.split(',').map(field => field.trim()).filter(field => field.length > 0);
    const normalizedFieldsSet = new Set();

    fieldList.forEach(field => {
      const normalized = normalizeFieldName(field);
      if (!normalizedFieldsSet.has(normalized)) {
        normalizedFieldsSet.add(normalized);
      }
    });

    const normalizedFields = Array.from(normalizedFieldsSet);

    // Criar formulário
    const result = await formsService.createForm({ fields: normalizedFields, id, id2, type, url });
    res.json(result);
  } catch (error) {
    console.error('Erro ao criar formulário:', error);
    res.status(500).json({ error: error.message });
  }
};

// controllers/formsController.js

exports.resetForm = async (req, res) => {
  try {
    const { link, fields, id, id2 } = req.body;

    if (!link || !fields || !id || !id2) {
      return res.status(400).json({ error: 'Parâmetros faltando: link, fields, id, id2 são obrigatórios.' });
    }

    // Extrair 'type' e 'code' do link
    const type = extractTypeFromLink(link);
    const code = extractCodeFromLink(link);

    if (!type || !code) {
      return res.status(400).json({ error: 'Link inválido.' });
    }

    // Resetar formulário
    await formsService.resetForm({ link, fields: fields.split(','), id, id2 });

    // Deletar arquivos do S3
    await formsService.deleteForm({ type, id, id2, code });

    // Gerar a URL do formulário resetado usando req.protocol e req.get('host')
    const protocol = req.protocol;
    const host = req.get('host'); // Isso retornará 'forms.neuralbroker.com.br'
    const formURL = `${protocol}://${host}/forms/${type}/${id}/${id2}/${code}`;

    // Renderizar a página com a mensagem e redirecionamento
    res.render('resetForm', { url: formURL });
  } catch (error) {
    console.error('Erro ao resetar formulário:', error);
    res.status(500).json({ error: error.message });
  }
};

// Funções auxiliares para extrair 'type' e 'code' do link
const extractTypeFromLink = (link) => {
  const parts = link.split('/');
  const typeIndex = parts.findIndex(part => part === 'forms') + 1;
  return parts[typeIndex];
};

const extractCodeFromLink = (link) => {
  const parts = link.split('/');
  return parts.pop(); // Assume que o código está no final da URL
};


// Função para visualizar um formulário (para upload de arquivos)
exports.viewForm = async (req, res) => {
  try {
    const { type, id, id2, code } = req.params;
    const formData = await formsService.getForm({ type, id, id2, code });

    if (formData) {
      // Redirecionar para a primeira etapa
      return res.redirect(`/forms/${type}/${id}/${id2}/${code}/step/1`);
    } else {
      // Formulário não encontrado, implementar lógica de redirecionamento

      const existingId2s = await formsService.getAllId2({ type, id });

      if (existingId2s.length > 0) {
        // Buscar URLs de redirecionamento das formas existentes
        const redirectUrls = await formsService.getRedirectUrlsForId({ type, id });

        if (redirectUrls.length > 0) {
          // Redirecionar para uma URL aleatória das existentes
          const randomIndex = Math.floor(Math.random() * redirectUrls.length);
          const randomUrl = redirectUrls[randomIndex];
          console.log(`Redirecionando para uma URL existente: ${randomUrl}`);
          return res.redirect(randomUrl);
        }
      }

      // Se não houver 'redirectUrl' nas formas existentes ou 'id' não existe, redirecionar para URL do env
      const defaultRedirectUrl = process.env.REDIRECT_URL || 'https://defaulturl.com';
      console.log(`Redirecionando para a URL padrão: ${defaultRedirectUrl}`);
      return res.redirect(defaultRedirectUrl);
    }
  } catch (error) {
    console.error('Erro ao visualizar formulário:', error);
    res.status(500).send('Erro interno do servidor.');
  }
};

// Função para visualizar uploads do formulário
exports.viewUploads = async (req, res) => {
  try {
    const { type, id, id2, code } = req.params;
    const formData = await formsService.getForm({ type, id, id2, code });

    if (formData) {
      const processedFormData = {
        ...formData,
        fields: formData.fields.map(field => ({
          name: field,
          fieldId: normalizeFieldName(field),
          upload: formData.uploaded[field] || {},
        }))
      };

      return res.render('view', { form: processedFormData });
    } else {
      // Formulário não encontrado, implementar lógica de redirecionamento

      const existingId2s = await formsService.getAllId2({ type, id });

      if (existingId2s.length > 0) {
        // Buscar URLs de redirecionamento das formas existentes
        const redirectUrls = await formsService.getRedirectUrlsForId({ type, id });

        if (redirectUrls.length > 0) {
          // Redirecionar para uma URL aleatória das existentes
          const randomIndex = Math.floor(Math.random() * redirectUrls.length);
          const randomUrl = redirectUrls[randomIndex];
          console.log(`Redirecionando para uma URL existente: ${randomUrl}`);
          return res.redirect(randomUrl);
        }
      }

      // Se não houver 'redirectUrl' nas formas existentes ou 'id' não existe, redirecionar para URL do env
      const defaultRedirectUrl = process.env.REDIRECT_URL || 'https://defaulturl.com';
      console.log(`Redirecionando para a URL padrão: ${defaultRedirectUrl}`);
      return res.redirect(defaultRedirectUrl);
    }
  } catch (error) {
    console.error('Erro ao visualizar uploads do formulário:', error);
    res.status(500).send('Erro interno do servidor.');
  }
};

// Função para upload de arquivo (suporte a múltiplos campos e reuploads)
exports.uploadFile = async (req, res) => {
  try {
    const { type, id, id2, code, stepNumber } = req.params;

    // Obter o formulário
    const formData = await formsService.getForm({ type, id, id2, code });
    if (!formData) {
      return res.status(404).send('Formulário não encontrado.');
    }

    const totalSteps = formData.fields.length + 1; // +1 para a página inicial
    const currentStep = parseInt(stepNumber, 10);

    if (isNaN(currentStep) || currentStep < 2 || currentStep > totalSteps) {
      return res.status(400).send('Etapa inválida.');
    }

    const fieldIndex = currentStep - 2;
    const fieldName = formData.fields[fieldIndex];

    // Verificar se já existe um arquivo enviado para este campo
    if (formData.uploaded[fieldName] && formData.uploaded[fieldName].status === 'uploaded') {
      // Não permitir reupload nesta etapa
      return res.redirect(`/forms/${type}/${id}/${id2}/${code}/step/${currentStep +1}`);
    }

    // Obter o arquivo enviado
    const file = req.files[`file_${fieldName}`] && req.files[`file_${fieldName}`][0];
    if (!file) {
      // Nenhum arquivo enviado nesta etapa
      return res.redirect(`/forms/${type}/${id}/${id2}/${code}/step/${currentStep +1}`);
    }

    try {
      await formsService.uploadFile(
        { type, id, id2, code },
        file,
        {
          field: fieldName,
        }
      );
    } catch (uploadError) {
      // Redirecionar de volta para a mesma etapa com erros
      return res.status(400).render('formStep', { 
        form: formData,
        currentStep,
        totalSteps,
        fields: currentStep === 1 ? formData.fields.join(', ') : [{ name: fieldName, fieldId: normalizeFieldName(fieldName) }],
        errors: { [fieldName]: uploadError.message },
        allowedFormats: ALLOWED_FILE_FORMATS
      });
    }

    // Verificar se esta era a última etapa
    if (currentStep === totalSteps) {
      // Redirecionar para a página de agradecimento
      return res.redirect('/thank-you');
    }

    // Redirecionar para a próxima etapa
    res.redirect(`/forms/${type}/${id}/${id2}/${code}/step/${currentStep +1}`);
  } catch (error) {
    console.error('Erro no controlador de upload de arquivo:', error);

    try {
      const { type, id, id2, code, stepNumber } = req.params;
      const formData = await formsService.getForm({ type, id, id2, code });

      const totalSteps = formData.fields.length +1;
      const currentStep = parseInt(stepNumber, 10);

      return res.status(500).render('formStep', { 
        form: formData, 
        currentStep,
        totalSteps,
        fields: currentStep === 1 ? formData.fields.join(', ') : [{ name: formData.fields[currentStep -2], fieldId: normalizeFieldName(formData.fields[currentStep -2]) }],
        errors: { file: error.message },
        allowedFormats: ALLOWED_FILE_FORMATS
      });
    } catch (parseError) {
      console.error('Erro ao obter dados do formulário para renderizar com erro:', parseError);
      return res.status(500).send('Erro interno do servidor.');
    }
  }
};

// Função para obter o status atual dos uploads
exports.getUploadStatus = async (req, res) => {
  try {
    const { type, id, id2, code } = req.params;
    const formData = await formsService.getForm({ type, id, id2, code });

    if (!formData) {
      return res.status(404).json({ error: 'Formulário não encontrado.' });
    }

    res.json({ uploaded: formData.uploaded });
  } catch (error) {
    console.error('Erro ao obter status de upload:', error);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

// Função para deletar um formulário
exports.deleteForm = async (req, res) => {
  const { type, id, id2, code } = req.params;
  const formKey = `form:${type}:${id}:${id2}:${code}`;
  const formIdKey = `formid:${type}:${id}:${id2}`;

  try {
    await formsService.deleteForm({ type, id, id2, code }); // Assumindo que formsService.deleteForm lida com exclusão no S3 e Redis
    console.log(`Formulário e arquivos deletados: ${formKey}`);
    res.json({ message: 'Formulário e arquivos deletados com sucesso.' });
  } catch (error) {
    console.error('Erro ao deletar formulário:', error);
    res.status(500).json({ error: 'Erro ao deletar formulário.' });
  }
};

// Função para obter todos os formulários
exports.getAllForms = async (req, res) => {
  try {
    const forms = await formsService.getAllForms();
    res.json(forms);
  } catch (error) {
    console.error('Erro ao obter todos os formulários:', error);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

exports.viewFormStep = async (req, res) => {
  try {
    const { type, id, id2, code, stepNumber } = req.params;
    const formData = await formsService.getForm({ type, id, id2, code });

    if (!formData) {
      return res.status(404).send('Formulário não encontrado.');
    }

    const totalSteps = formData.fields.length + 1; // +1 para a página inicial
    let currentStep = parseInt(stepNumber, 10);

    if (isNaN(currentStep) || currentStep < 1 || currentStep > totalSteps) {
      return res.status(400).send('Etapa inválida.');
    }

    // Pular etapas já concluídas
    while (currentStep > 1 && currentStep <= totalSteps) {
      const fieldName = formData.fields[currentStep - 2];
      if (formData.uploaded[fieldName] && formData.uploaded[fieldName].status === 'uploaded') {
        currentStep++;
      } else {
        break;
      }
    }

    if (currentStep > totalSteps) {
      // Todas as etapas concluídas
      return res.render('allStepsCompleted', { form: formData });
    }

    let title, subtitle, fields;

    if (currentStep === 1) {
      // Página inicial
      title = 'Envio de Documentos';
      subtitle = 'Por favor, anexe nas etapas seguintes os seguintes documentos abaixo:';
      fields = formData.fields.map(fieldName => ({
        name: fieldName,
        fieldId: normalizeFieldName(fieldName)
      }));
    } else {
      // Etapas de upload
      const fieldIndex = currentStep - 2; // Etapa 2 corresponde ao primeiro campo
      if (fieldIndex >= formData.fields.length) {
        return res.status(400).send('Etapa inválida.');
      }
      const fieldName = formData.fields[fieldIndex];
      fields = [{
        name: fieldName,
        fieldId: normalizeFieldName(fieldName)
      }];
    }

    const processedFormData = {
      ...formData,
      title,
      subtitle,
      fields,
      url: `/forms/${type}/${id}/${id2}/${code}`
    };

    return res.render('formStep', { 
      form: processedFormData, 
      currentStep, 
      totalSteps,
      errors: {}, // Garantir que 'errors' sempre exista
      allowedFormats: ALLOWED_FILE_FORMATS
    });
  } catch (error) {
    console.error('Erro ao visualizar etapa do formulário:', error);
    res.status(500).send('Erro interno do servidor.');
  }
};
