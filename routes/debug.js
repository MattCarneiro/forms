// routes/debug.js
const express = require('express');
const router = express.Router();
const redisClient = require('../services/redisService');

router.get('/debug/form/:type/:id2/:id/:code', async (req, res) => {
  const { type, id2, id, code } = req.params;
  const formKey = `form:${type}:${id2}:${id}:${code}`;
  const formData = await redisClient.get(formKey);
  if (formData) {
    res.json({ formKey, formData: JSON.parse(formData) });
  } else {
    res.status(404).json({ message: 'Formulário não encontrado.' });
  }
});

module.exports = router;
