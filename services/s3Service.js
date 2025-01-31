// services/s3Service.js

const AWS = require('aws-sdk');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID, // Defina no seu .env
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY, // Defina no seu .env
  region: process.env.AWS_REGION || 'ap-south-1' // Defina no seu .env
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'form.neuralbroker.com.br';

// Função para fazer upload para o S3
exports.uploadToS3 = async (type, id, id2, fieldName, originalname, buffer, mimetype) => {
  const fileExtension = path.extname(originalname);
  const uniqueFilename = `${uuidv4()}${fileExtension}`;
  const key = `${type}/${id}/${id2}/${fieldName}/${uniqueFilename}`;

  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: mimetype
    // Remova ou comente a linha abaixo
    // ACL: 'public-read' // Removido porque o bucket não permite ACLs
  };

  try {
    const data = await s3.upload(params).promise();
    return data.Location; // URL do arquivo no S3
  } catch (error) {
    console.error('Erro ao fazer upload para o S3:', error);
    throw error;
  }
};

// Função para deletar uma pasta específica no S3
exports.deleteFolder = async (type, id, id2) => {
  const prefix = `${type}/${id}/${id2}/`; // Prefixo correto incluindo 'id'

  try {
    // Lista todos os objetos dentro do prefixo
    const listedObjects = await s3.listObjectsV2({
      Bucket: BUCKET_NAME,
      Prefix: prefix
    }).promise();

    if (listedObjects.Contents.length === 0) {
      console.log('Nenhum objeto encontrado para deletar no S3.');
      return;
    }

    // Prepara a deleção dos objetos
    const deleteParams = {
      Bucket: BUCKET_NAME,
      Delete: { Objects: [] }
    };

    listedObjects.Contents.forEach(({ Key }) => {
      deleteParams.Delete.Objects.push({ Key });
    });

    console.log(`Tentando deletar ${deleteParams.Delete.Objects.length} objetos do S3...`);

    const deleteResult = await s3.deleteObjects(deleteParams).promise();

    if (deleteResult.Errors && deleteResult.Errors.length > 0) {
      console.error('Erros ao deletar objetos no S3:', deleteResult.Errors);
      throw new Error('Erro ao deletar arquivos no S3.');
    }

    console.log(`Deletados ${deleteResult.Deleted.length} arquivos do S3.`);

    // Verificar se os arquivos foram realmente deletados
    const verifyParams = {
      Bucket: BUCKET_NAME,
      Prefix: prefix
    };
    const verifyList = await s3.listObjectsV2(verifyParams).promise();

    if (verifyList.Contents.length === 0) {
      console.log('Confirmação: Todos os arquivos foram deletados do S3.');
    } else {
      console.warn('Atenção: Alguns arquivos ainda existem no S3 após a tentativa de deleção.');
      verifyList.Contents.forEach(({ Key }) => {
        console.warn(`Arquivo ainda presente: ${Key}`);
      });
    }

    // Se a lista estiver truncada, continua deletando
    if (listedObjects.IsTruncated) {
      await exports.deleteFolder(type, id, id2);
    }
  } catch (error) {
    console.error('Erro ao deletar pasta no S3:', error);
    throw error;
  }
};
