# Use uma imagem base oficial do Node.js
FROM node:18

# Instalar dependências do sistema e Chromium
RUN apt-get update && apt-get upgrade -y && apt install -y nano && apt-get install -y \
    chromium \
    --no-install-recommends \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Criar diretório de trabalho
WORKDIR /app

# Clonar o repositório
RUN apt-get update && apt-get install -y git \
    && git clone https://github.com/easypanel-io/express-js-sample.git . \
    && apt-get remove -y git \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Copiar package.json e package-lock.json
COPY package*.json ./

# Instalar dependências da aplicação
RUN npm install express ejs axios multer aws-sdk socket.io redis lodash.deburr dotenv bootstrap amqplib express-basic-auth express-rate-limit

# Copiar o código adicional da aplicação
COPY . .

# Expor a porta em que a aplicação vai rodar
EXPOSE 3000

# Comando para iniciar a aplicação
CMD ["node", "index.js"]
