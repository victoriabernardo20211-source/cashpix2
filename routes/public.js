const express = require('express');
const router = express.Router();
const { getDb, getConfig } = require('../database');
const fs = require('fs');
const path = require('path');

function renderSite(config) {
  let html = fs.readFileSync(path.join(__dirname, '../views/site.html'), 'utf8');
  // Replace config placeholders
  for (const [k, v] of Object.entries(config)) {
    html = html.replace(new RegExp(`{{${k}}}`, 'g'), v || '');
  }
  return html;
}

router.get('/', (req, res) => {
  const config = getConfig();
  res.send(renderSite(config));
});

router.post('/api/lead', express.json(), (req, res) => {
  const { nome, cpf, telefone, chave_pix, tipo_chave, fatura } = req.body || {};

  if (!nome || !cpf || !telefone || !chave_pix || !tipo_chave || !fatura) {
    return res.status(400).json({ ok: false, erro: 'Dados incompletos.' });
  }

  const faturaNum = parseFloat(String(fatura).replace(',', '.'));
  if (isNaN(faturaNum) || faturaNum <= 0) {
    return res.status(400).json({ ok: false, erro: 'Fatura inválida.' });
  }

  const config = getConfig();
  const pct = parseFloat(config.cashback_percent || '15') / 100;
  const cashback = Math.round(faturaNum * pct * 100) / 100;

  const cpfClean = String(cpf).replace(/\D/g, '').slice(0, 11);
  const telClean = String(telefone).replace(/\D/g, '').slice(0, 11);

  const db = getDb();
  db.prepare(`INSERT INTO leads (nome, cpf, telefone, chave_pix, tipo_chave, fatura, cashback)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    String(nome).slice(0, 120),
    cpfClean,
    telClean,
    String(chave_pix).slice(0, 100),
    String(tipo_chave).slice(0, 20),
    faturaNum,
    cashback
  );

  res.json({ ok: true, cashback });
});

module.exports = router;
