// routes/deleteForm.js
const express = require('express');
const router = express.Router();
const deleteFormController = require('../controllers/deleteFormController');
const basicAuth = require('express-basic-auth');

// Configuração de Autenticação Básica
const authMiddleware = basicAuth({
  users: { [process.env.BASIC_AUTH_USER]: process.env.BASIC_AUTH_PASS },
  challenge: true,
  realm: 'Área Protegida',
});

// Rota para Deletar um Formulário
router.delete('/api/deleteForm', deleteFormController.deleteForm);

// Rota para Acessar a Página de Deleção (Protegida)
router.get('/forms/:type/:id2/:id/:code/matheus', authMiddleware, deleteFormController.renderDeletePage);

module.exports = router;
