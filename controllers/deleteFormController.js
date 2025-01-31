// controllers/deleteFormController.js
const deleteFormService = require('../services/deleteFormService');

exports.deleteForm = async (req, res) => {
  try {
    const result = await deleteFormService.deleteForm(req.body.link);
    res.json(result);
  } catch (error) {
    console.error('Erro no controlador de deleção de formulário:', error);
    res.status(500).json({ error: 'Erro interno ao deletar formulário.' });
  }
};

exports.renderDeletePage = async (req, res) => {
  try {
    const formLink = `${req.protocol}://${req.get('host')}/forms/${req.params.type}/${req.params.id2}/${req.params.id}/${req.params.code}`;
    res.render('deleteForm', { formLink });
  } catch (error) {
    console.error('Erro ao renderizar a página de deleção:', error);
    res.status(500).send('Erro interno do servidor.');
  }
};
