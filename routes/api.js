// routes/api.js
const express = require('express');
const router = express.Router();
const redisClient = require('../config/redis');
const crypto = require('crypto');

router.post('/createForm', async (req, res) => {
  const { fields, id, id2, type } = req.query;

  if (!fields || !id || !id2 || !type) {
    console.log('Falha ao criar formulário: parâmetros faltando.', { fields, id, id2, type });
    return res.status(400).send('Missing required parameters.');
  }

  const formKey = `formid:${type}:${id2}:${id}`;
  let code = await redisClient.get(formKey);

  if (!code) {
    code = crypto.randomBytes(8).toString('hex');
    await redisClient.set(formKey, code);

    const formData = {
      fields: fields.split(',').map((field) => field.trim()),
      uploaded: {},
      code,
    };
    await redisClient.set(`form:${type}:${id2}:${id}:${code}`, JSON.stringify(formData));

    console.log('Formulário criado com sucesso.', { formKey, code, formData });
  } else {
    console.log('Formulário existente encontrado.', { formKey, code });
  }

  const formURL = `${req.protocol}://${req.get('host')}/forms/${type}/${id2}/${id}/${code}`;
  res.send({ url: formURL });
});

router.post('/resetForm', async (req, res) => {
  const { link, fields, id, id2 } = req.query;

  if (!link || !fields || !id || !id2) {
    console.log('Falha ao resetar formulário: parâmetros faltando.', { link, fields, id, id2 });
    return res.status(400).send('Missing required parameters.');
  }

  const urlParts = link.split('/');
  const code = urlParts.pop();
  const type = urlParts[urlParts.length - 3];

  const formData = {
    fields: fields.split(',').map((field) => field.trim()),
    uploaded: {},
    code,
  };
  await redisClient.set(`form:${type}:${id2}:${id}:${code}`, JSON.stringify(formData));

  console.log('Formulário resetado com sucesso.', { formKey: `form:${type}:${id2}:${id}:${code}`, formData });

  res.send({ url: link });
});

module.exports = router;
