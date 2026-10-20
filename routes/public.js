const express = require('express');
const router = express.Router();
const { getPool, initDb, getConfig } = require('../database');
const fs = require('fs');
const path = require('path');

function renderSite(config) {
  let html = fs.readFileSync(path.join(__dirname, '../views/site.html'), 'utf8');
  for (const [k, v] of Object.entries(config)) {
    html = html.replace(new RegExp(`{{${k}}}`, 'g'), v || '');
  }
  return html;
}

router.get('/', async (req, res) => {
  try {
    await initDb();
    const config = await getConfig();
    res.send(renderSite(config));
  } catch (err) {
    console.error('[GET /]', err);
    res.status(500).send('Erro interno. Tente novamente.');
  }
});

router.post('/api/lead', express.json(), async (req, res) => {
  try {
    await initDb();
    const { nome, cpf, telefone, chave_pix, tipo_chave, fatura } = req.body || {};

    if (!nome || !cpf || !telefone || !chave_pix || !tipo_chave || !fatura) {
      return res.status(400).json({ ok: false, erro: 'Dados incompletos.' });
    }

    const faturaNum = parseFloat(String(fatura).replace(',', '.'));
    if (isNaN(faturaNum) || faturaNum <= 0) {
      return res.status(400).json({ ok: false, erro: 'Fatura inválida.' });
    }

    const config = await getConfig();
    const pct = parseFloat(config.cashback_percent || '15') / 100;
    const cashback = Math.round(faturaNum * pct * 100) / 100;

    const cpfClean = String(cpf).replace(/\D/g, '').slice(0, 11);
    const telClean = String(telefone).replace(/\D/g, '').slice(0, 11);

    await getPool().query(
      `INSERT INTO leads (nome, cpf, telefone, chave_pix, tipo_chave, fatura, cashback)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        String(nome).slice(0, 120),
        cpfClean,
        telClean,
        String(chave_pix).slice(0, 100),
        String(tipo_chave).slice(0, 20),
        faturaNum,
        cashback,
      ]
    );

    res.json({ ok: true, cashback });
  } catch (err) {
    console.error('[POST /api/lead]', err);
    res.status(500).json({ ok: false, erro: 'Erro ao salvar. Tente novamente.' });
  }
});

module.exports = router;
