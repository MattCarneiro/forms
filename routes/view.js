// routes/view.js
const express = require('express');
const router = express.Router();
const redisClient = require('../config/redis');

router.get('/:type/:id2/:id/:code', async (req, res) => {
  const { type, id2, id, code } = req.params;
  const formKey = `form:${type}:${id2}:${id}:${code}`;
  const formData = await redisClient.get(formKey);

  if (!formData) {
    return res.status(404).send('Form not found.');
  }

  const form = JSON.parse(formData);
  res.render('view', { form });
});

module.exports = router;
