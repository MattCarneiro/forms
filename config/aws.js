// config/aws.js
const AWS = require('aws-sdk');
const dotenv = require('dotenv');
dotenv.config();

const s3 = new AWS.S3();

s3.listBuckets((err, data) => {
  if (err) {
    console.error('Erro ao conectar com o AWS S3:', err);
  } else {
    console.log('Conexão com o AWS S3 estabelecida com sucesso.');
    console.log('Buckets disponíveis:', data.Buckets.map(bucket => bucket.Name));
  }
});

module.exports = s3;
