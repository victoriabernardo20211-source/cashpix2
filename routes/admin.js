const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { getPool, initDb, getConfig, setConfig } = require('../database');
const { signToken, setCookieOptions, requireAuth, verifyToken, COOKIE_NAME } = require('../auth');
const fs = require('fs');
const path = require('path');

function makeAdminRouter(adminPath) {
  const router = express.Router();

  router.use((req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    next();
  });

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).send(renderLogin(adminPath, 'Muitas tentativas. Tente novamente em 15 minutos.'));
    },
  });

  function readView(name) {
    return fs.readFileSync(path.join(__dirname, '../views', name), 'utf8');
  }

  function renderLogin(adminPath, erro) {
    let html = readView('admin-login.html');
    html = html.replace('{{admin_path}}', adminPath);
    html = html.replace('{{erro}}', erro ? `<div class="alert">${erro}</div>` : '');
    return html;
  }

  function renderLeads(adminPath, admin, leads, config, filtro) {
    let html = readView('admin-leads.html');
    html = html.replace(/{{admin_path}}/g, adminPath);
    html = html.replace(/{{admin_nome}}/g, admin.nome || 'Admin');

    const total = leads.length;
    const novos = leads.filter(l => l.status === 'novo').length;
    const atendimento = leads.filter(l => l.status === 'em_atendimento').length;
    const pagos = leads.filter(l => l.status === 'pago').length;
    const incompletos = leads.filter(l => l.status === 'incompleto').length;

    html = html.replace('{{total}}', total);
    html = html.replace('{{novos}}', novos);
    html = html.replace('{{em_atendimento}}', atendimento);
    html = html.replace('{{pagos}}', pagos);
    html = html.replace('{{incompletos}}', incompletos);
    html = html.replace('{{filtro_ativo}}', filtro || 'todos');

    const rows = leads.map(l => {
      const d = new Date(l.created_at);
      const data = d.toLocaleDateString('pt-BR');
      const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const statusBadge = {
        novo: '<span class="badge badge-novo">Novo</span>',
        em_atendimento: '<span class="badge badge-atendimento">Em atendimento</span>',
        pago: '<span class="badge badge-pago">Pago</span>',
        incompleto: '<span class="badge badge-incompleto">⚠️ Incompleto</span>',
      }[l.status] || l.status;

      const acoes = (l.status === 'novo' || l.status === 'incompleto')
        ? `<form method="POST" action="/${adminPath}/leads/${l.id}/status" style="display:inline">
             <input type="hidden" name="status" value="em_atendimento">
             <button class="btn btn-sm btn-yellow" type="submit">Em atendimento</button>
           </form>`
        : l.status === 'em_atendimento'
        ? `<form method="POST" action="/${adminPath}/leads/${l.id}/status" style="display:inline">
             <input type="hidden" name="status" value="pago">
             <button class="btn btn-sm btn-green" type="submit">Marcar pago</button>
           </form>`
        : '<span class="text-muted">—</span>';

      const nomeDisplay = l.status === 'incompleto' ? '<em style="color:#9ca3af">— aguardando</em>' : escHtml(l.nome);
      const cpfDisplay = l.status === 'incompleto' ? '<span class="text-muted">—</span>' : fmtCpf(l.cpf);

      return `<tr>
        <td>${nomeDisplay}</td>
        <td>${cpfDisplay}</td>
        <td>${fmtTel(l.telefone)}</td>
        <td>${escHtml(l.chave_pix)}<br><small class="text-muted">${escHtml(l.tipo_chave)}</small></td>
        <td>R$ ${Number(l.fatura).toFixed(2).replace('.', ',')}</td>
        <td><strong>R$ ${Number(l.cashback).toFixed(2).replace('.', ',')}</strong></td>
        <td>${data}<br><small class="text-muted">${hora}</small></td>
        <td>${statusBadge}</td>
        <td>${acoes}</td>
      </tr>`;
    }).join('');

    html = html.replace('{{leads_rows}}', rows || '<tr><td colspan="9" style="text-align:center;padding:2rem;color:#999">Nenhum lead encontrado.</td></tr>');
    return html;
  }

  function renderCustomize(adminPath, admin, config, msg) {
    let html = readView('admin-customize.html');
    html = html.replace(/{{admin_path}}/g, adminPath);
    html = html.replace(/{{admin_nome}}/g, admin.nome || 'Admin');
    html = html.replace('{{msg}}', msg ? `<div class="alert alert-success">${msg}</div>` : '');
    for (const [k, v] of Object.entries(config)) {
      html = html.replace(new RegExp(`{{${k}}}`, 'g'), escHtml(v || ''));
    }
    return html;
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtCpf(s) {
    const c = String(s || '').replace(/\D/g, '');
    if (c.length === 11) return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    return s;
  }
  function fmtTel(s) {
    const t = String(s || '').replace(/\D/g, '');
    if (t.length === 11) return t.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    if (t.length === 10) return t.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    return s;
  }

  const auth = requireAuth(adminPath);

  // Root redirect
  router.get('/', (req, res) => {
    const token = req.cookies && req.cookies[COOKIE_NAME];
    if (token && verifyToken(token)) return res.redirect(`/${adminPath}/leads`);
    return res.redirect(`/${adminPath}/login`);
  });

  // Login GET
  router.get('/login', (req, res) => {
    res.send(renderLogin(adminPath, ''));
  });

  // Login POST
  router.post('/login', loginLimiter, express.urlencoded({ extended: false }), async (req, res) => {
    try {
      await initDb();
      const { email, senha } = req.body || {};
      const { rows } = await getPool().query(
        'SELECT * FROM admins WHERE email = $1',
        [String(email || '').toLowerCase().trim()]
      );
      const admin = rows[0];

      // Always compare to prevent timing attacks
      const hash = admin ? admin.senha_hash : '$2a$12$invalidhashinvalidhashinvalidhash00';
      const ok = await bcrypt.compare(String(senha || ''), hash);

      if (!admin || !ok) {
        return res.status(401).send(renderLogin(adminPath, 'Credenciais inválidas.'));
      }

      const token = signToken({ id: admin.id, nome: admin.nome, email: admin.email, role: admin.role });
      res.cookie(COOKIE_NAME, token, setCookieOptions(req));
      res.redirect(`/${adminPath}/leads`);
    } catch (err) {
      console.error('[POST /login]', err);
      res.status(500).send(renderLogin(adminPath, 'Erro interno. Tente novamente.'));
    }
  });

  // Logout
  router.post('/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.redirect(`/${adminPath}/login`);
  });

  // Leads list
  router.get('/leads', auth, async (req, res) => {
    try {
      await initDb();
      const filtro = req.query.status || 'todos';
      let result;
      if (filtro === 'todos') {
        result = await getPool().query('SELECT * FROM leads ORDER BY created_at DESC');
      } else {
        result = await getPool().query(
          'SELECT * FROM leads WHERE status = $1 ORDER BY created_at DESC',
          [filtro]
        );
      }
      const config = await getConfig();
      res.send(renderLeads(adminPath, req.admin, result.rows, config, filtro));
    } catch (err) {
      console.error('[GET /leads]', err);
      res.status(500).send('Erro ao carregar leads.');
    }
  });

  // Update lead status
  router.post('/leads/:id/status', auth, express.urlencoded({ extended: false }), async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { status } = req.body || {};
      const valid = ['novo', 'em_atendimento', 'pago'];
      if (!valid.includes(status)) return res.redirect(`/${adminPath}/leads`);
      await getPool().query(
        'UPDATE leads SET status = $1, consultor = $2 WHERE id = $3',
        [status, req.admin.nome, id]
      );
      res.redirect(`/${adminPath}/leads`);
    } catch (err) {
      console.error('[POST /leads/:id/status]', err);
      res.redirect(`/${adminPath}/leads`);
    }
  });

  // Export CSV
  router.get('/leads/export.csv', auth, async (req, res) => {
    try {
      const { rows: leads } = await getPool().query('SELECT * FROM leads ORDER BY created_at DESC');
      const header = 'ID,Nome,CPF,Telefone,Chave Pix,Tipo Chave,Fatura (R$),Cashback (R$),Status,Consultor,Data\n';
      const rows = leads.map(l =>
        [l.id, l.nome, l.cpf, l.telefone, l.chave_pix, l.tipo_chave, l.fatura, l.cashback, l.status, l.consultor || '', l.created_at]
          .map(v => `"${String(v || '').replace(/"/g, '""')}"`)
          .join(',')
      ).join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="leads-cashpix.csv"');
      res.send('﻿' + header + rows);
    } catch (err) {
      console.error('[GET /leads/export.csv]', err);
      res.status(500).send('Erro ao exportar.');
    }
  });

  // Customize GET
  router.get('/personalizar', auth, async (req, res) => {
    try {
      await initDb();
      const config = await getConfig();
      res.send(renderCustomize(adminPath, req.admin, config, ''));
    } catch (err) {
      console.error('[GET /personalizar]', err);
      res.status(500).send('Erro ao carregar configurações.');
    }
  });

  // Customize POST
  router.post('/personalizar', auth, express.urlencoded({ extended: false }), async (req, res) => {
    try {
      const allowed = [
        'marca_nome', 'marca_slogan', 'cor_principal', 'cor_botao', 'cor_fundo', 'cor_texto',
        'cashback_percent', 'prazo_pagamento',
        'mensagem_final', 'whatsapp_consultor', 'botao_topo_texto', 'titulo_principal', 'subtitulo',
        'passo1_pergunta', 'passo2_pergunta', 'passo3_titulo', 'passo3_pergunta',
        'passo4_pergunta', 'passo5_pergunta', 'rodape_legal',
      ];
      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          await setConfig(key, String(req.body[key]).slice(0, 500));
        }
      }
      const config = await getConfig();
      res.send(renderCustomize(adminPath, req.admin, config, 'Configurações salvas com sucesso!'));
    } catch (err) {
      console.error('[POST /personalizar]', err);
      res.status(500).send('Erro ao salvar configurações.');
    }
  });

  return router;
}

module.exports = makeAdminRouter;
