// controllers/listFormsController.js

const formsService = require('../services/formsService');

exports.listForms = async (req, res) => {
  try {
    const forms = await formsService.getAllForms();

    // Organizar os formulários por type e id
    const organizedForms = {};

    forms.forEach(form => {
      const { type, id, id2, code } = form;
      if (!organizedForms[type]) {
        organizedForms[type] = {};
      }
      if (!organizedForms[type][id]) {
        organizedForms[type][id] = [];
      }
      organizedForms[type][id].push({ id2, code });
    });

    res.render('listForms', { organizedForms });
  } catch (error) {
    console.error('Erro ao listar formulários:', error);
    res.status(500).send('Erro interno do servidor.');
  }
};
