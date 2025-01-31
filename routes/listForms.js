// routes/listForms.js
const express = require('express');
const router = express.Router();
const listFormsController = require('../controllers/listFormsController');
const basicAuth = require('express-basic-auth');
const dotenv = require('dotenv');

// Carregar variáveis de ambiente
dotenv.config();

// Extrair credenciais do .env
const { BASIC_AUTH_USER, BASIC_AUTH_PASSWORD } = process.env;

// Verificar se as variáveis estão definidas
if (!BASIC_AUTH_USER || !BASIC_AUTH_PASSWORD) {
  console.error('As variáveis de ambiente BASIC_AUTH_USER e BASIC_AUTH_PASSWORD devem estar definidas.');
  process.exit(1); // Encerra a aplicação
}

// Configurar o Middleware de Autenticação Básica
const authMiddleware = basicAuth({
  users: { [BASIC_AUTH_USER]: BASIC_AUTH_PASSWORD },
  challenge: true, // Enviar o desafio de autenticação ao cliente
  unauthorizedResponse: (req) => 'Acesso não autorizado'
});

// Rota para listar todos os formulários com proteção de Autenticação Básica
router.get('/admin/forms', authMiddleware, listFormsController.listForms);

module.exports = router;
