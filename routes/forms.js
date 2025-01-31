// routes/forms.js

const express = require('express');
const router = express.Router();
const formsController = require('../controllers/formsController');
const multer = require('multer');
const deburr = require('lodash.deburr');

// **Importe o redisClient**
const redisClient = require('../services/redisService');

// Função para normalizar nomes de campo usando lodash.deburr
const normalizeFieldName = (str) => {
  return deburr(str).replace(/\s+/g, '_');
};

// Configuração do Multer para uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) },
  fileFilter: (req, file, cb) => {
    const allowedFormats = process.env.ALLOWED_FILE_FORMATS.split(',').map(fmt => fmt.trim().toLowerCase());
    const fileExtension = file.originalname.split('.').pop().toLowerCase();
    if (allowedFormats.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
    }
  }
});

// Rotas de Criação e Reset de Formulários
router.post('/api/createForm', formsController.createForm);
router.post('/api/resetForm', formsController.resetForm);

// Rota para Visualizar um Formulário
router.get('/forms/:type/:id/:id2/:code', formsController.viewForm);

// Rota para Renderizar uma Etapa Específica do Formulário
router.get('/forms/:type/:id/:id2/:code/step/:stepNumber', formsController.viewFormStep);

// Rota para Fazer Upload de Arquivos em uma Etapa Específica do Formulário
router.post('/forms/:type/:id/:id2/:code/step/:stepNumber', async (req, res, next) => {
  try {
    const { type, id, id2, code, stepNumber } = req.params;
    const formKey = `form:${type}:${id}:${id2}:${code}`;
    let formData = await redisClient.get(formKey);
    if (!formData) {
      throw new Error('Formulário não encontrado.');
    }
    formData = JSON.parse(formData);

    const fields = formData.fields.map(field => {
      const fieldId = normalizeFieldName(field);
      return fieldId;
    });

    if (stepNumber < 1 || stepNumber > fields.length + 1) {
      throw new Error('Etapa inválida.');
    }

    if (stepNumber === 1) {
      // Página inicial, sem upload
      return res.redirect(`/forms/${type}/${id}/${id2}/${code}/step/2`);
    }

    const currentFieldIndex = stepNumber - 2;
    const currentField = fields[currentFieldIndex];

    const uploadFieldsConfig = [{ name: `file_${currentField}`, maxCount: 1 }];

    const uploadFields = upload.fields(uploadFieldsConfig);

    uploadFields(req, res, function(err) {
      if (err instanceof multer.MulterError) {
        // Erro do Multer
        console.error('Erro do Multer:', err);
        return res.status(400).render('formStep', { 
          form: formData,
          currentStep: stepNumber,
          totalSteps: fields.length +1,
          errors: { [`file_${currentField}`]: err.message },
          allowedFormats: process.env.ALLOWED_FILE_FORMATS
        });
      } else if (err) {
        // Outro erro
        console.error('Erro de upload:', err);
        return res.status(400).render('formStep', { 
          form: formData,
          currentStep: stepNumber,
          totalSteps: fields.length +1,
          errors: { [`file_${currentField}`]: err.message },
          allowedFormats: process.env.ALLOWED_FILE_FORMATS
        });
      }
      // Chama o controlador para processar os arquivos
      formsController.uploadFile(req, res);
    });
  } catch (error) {
    console.error('Erro na configuração de Multer para etapas:', error);
    res.status(400).send(error.message);
  }
});

// Rota para Visualizar Uploads de um Formulário
router.get('/view/:type/:id/:id2/:code', formsController.viewUploads);

// Rota para Obter o Status dos Uploads (para polling ou Socket.io)
router.get('/api/status/:type/:id/:id2/:code', formsController.getUploadStatus);

module.exports = router;
