// app.js
const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const axios = require('axios');
const rateLimit = require('express-rate-limit'); // Para limitar requisições
const http = require('http');
// const { Server } = require('socket.io'); // Removido
// const redis = require('redis'); // Removido, se não for mais usado

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Configuração do Trust Proxy
app.set('trust proxy', 1); // Ajuste conforme sua infraestrutura

// Middleware de Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // Limita cada IP a 100 requisições por janela
  message: 'Muitas requisições, por favor tente novamente mais tarde.',
});
app.use(limiter);

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configuração do View Engine
app.set('view engine', 'ejs');

// Importar Rotas
const formsRoutes = require('./routes/forms');
const deleteFormRoutes = require('./routes/deleteForm');
const thankYouRoutes = require('./routes/thankYou'); // Importar a nova rota
const listFormsRoutes = require('./routes/listForms'); // Importar a rota de listagem

app.use('/', formsRoutes);
app.use('/', deleteFormRoutes);
app.use('/', thankYouRoutes);
app.use('/', listFormsRoutes); // Usar a rota de listagem

// Middleware para logs de requisições
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Catch-all route para redirecionar URLs inválidas para a URL padrão
app.all('*', (req, res) => {
  const defaultRedirectUrl = process.env.REDIRECT_URL || 'https://defaulturl.com';
  console.log(`URL inválida acessada: ${req.originalUrl}. Redirecionando para ${defaultRedirectUrl}`);
  res.redirect(defaultRedirectUrl);
});

// Criar servidor HTTP com Express
const server = http.createServer(app);

// Iniciar o Servidor Express
server.listen(port, () => {
  console.log(`Servidor Express rodando em http://localhost:${port}`);
});

// Importar e iniciar o Worker RabbitMQ
const rabbitMQWorker = require('./services/rabbitMQService');
rabbitMQWorker.start();

// Importar e iniciar o Cleanup Service
const cleanupService = require('./services/cleanupService');
cleanupService.start();

// Removido socket.io
