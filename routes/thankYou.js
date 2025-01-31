// routes/thankYou.js
const express = require('express');
const router = express.Router();

router.get('/thank-you', (req, res) => {
  const { fields } = req.query;
  const fieldList = fields ? fields.split(',') : [];

  res.render('thankYou', { fields: fieldList });
});

module.exports = router;
