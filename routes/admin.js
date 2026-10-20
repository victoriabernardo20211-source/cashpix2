const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { getDb, getConfig, setConfig } = require('../database');
const { signToken, setCookieOptions, requireAuth, COOKIE_NAME } = require('../auth');
const fs = require('fs');
const path = require('path');

function makeAdminRouter(adminPath) {
  const router = express.Router();

  // Security headers for all admin routes
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

    html = html.replace('{{total}}', total);
    html = html.replace('{{novos}}', novos);
    html = html.replace('{{em_atendimento}}', atendimento);
    html = html.replace('{{pagos}}', pagos);
    html = html.replace('{{filtro_ativo}}', filtro || 'todos');

    const rows = leads.map(l => {
      const data = new Date(l.created_at).toLocaleDateString('pt-BR');
      const hora = new Date(l.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const statusBadge = {
        novo: '<span class="badge badge-novo">Novo</span>',
        em_atendimento: '<span class="badge badge-atendimento">Em atendimento</span>',
        pago: '<span class="badge badge-pago">Pago</span>',
      }[l.status] || l.status;

      const acoes = l.status === 'novo'
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

      return `<tr>
        <td>${escHtml(l.nome)}</td>
        <td>${fmtCpf(l.cpf)}</td>
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
    const { verifyToken } = require('../auth');
    if (token && verifyToken(token)) return res.redirect(`/${adminPath}/leads`);
    return res.redirect(`/${adminPath}/login`);
  });

  // Login GET
  router.get('/login', (req, res) => {
    res.send(renderLogin(adminPath, ''));
  });

  // Login POST
  router.post('/login', loginLimiter, express.urlencoded({ extended: false }), (req, res) => {
    const { email, senha } = req.body || {};
    const db = getDb();
    const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(String(email || '').toLowerCase().trim());

    // Always compare to prevent timing attacks revealing whether email exists
    const hash = admin ? admin.senha_hash : '$2a$12$invalidhashinvalidhashinvalidhash00';
    const ok = bcrypt.compareSync(String(senha || ''), hash);

    if (!admin || !ok) {
      return res.status(401).send(renderLogin(adminPath, 'Credenciais inválidas.'));
    }

    const token = signToken({ id: admin.id, nome: admin.nome, email: admin.email, role: admin.role });
    res.cookie(COOKIE_NAME, token, setCookieOptions(req));
    res.redirect(`/${adminPath}/leads`);
  });

  // Logout
  router.post('/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.redirect(`/${adminPath}/login`);
  });

  // Leads list
  router.get('/leads', auth, (req, res) => {
    const db = getDb();
    const filtro = req.query.status || 'todos';
    let leads;
    if (filtro === 'todos') {
      leads = db.prepare('SELECT * FROM leads ORDER BY created_at DESC').all();
    } else {
      leads = db.prepare('SELECT * FROM leads WHERE status = ? ORDER BY created_at DESC').all(filtro);
    }
    const config = getConfig();
    res.send(renderLeads(adminPath, req.admin, leads, config, filtro));
  });

  // Update lead status
  router.post('/leads/:id/status', auth, express.urlencoded({ extended: false }), (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { status } = req.body || {};
    const valid = ['novo', 'em_atendimento', 'pago'];
    if (!valid.includes(status)) return res.redirect(`/${adminPath}/leads`);
    const db = getDb();
    db.prepare('UPDATE leads SET status = ?, consultor = ? WHERE id = ?').run(status, req.admin.nome, id);
    res.redirect(`/${adminPath}/leads`);
  });

  // Export CSV
  router.get('/leads/export.csv', auth, (req, res) => {
    const db = getDb();
    const leads = db.prepare('SELECT * FROM leads ORDER BY created_at DESC').all();

    const header = 'ID,Nome,CPF,Telefone,Chave Pix,Tipo Chave,Fatura (R$),Cashback (R$),Status,Consultor,Data\n';
    const rows = leads.map(l =>
      [l.id, l.nome, l.cpf, l.telefone, l.chave_pix, l.tipo_chave, l.fatura, l.cashback, l.status, l.consultor || '', l.created_at]
        .map(v => `"${String(v || '').replace(/"/g, '""')}"`)
        .join(',')
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="leads-cashpix.csv"');
    res.send('﻿' + header + rows); // BOM for Excel
  });

  // Customize GET
  router.get('/personalizar', auth, (req, res) => {
    const config = getConfig();
    res.send(renderCustomize(adminPath, req.admin, config, ''));
  });

  // Customize POST
  router.post('/personalizar', auth, express.urlencoded({ extended: false }), (req, res) => {
    const allowed = [
      'marca_nome', 'marca_slogan', 'cor_principal', 'cashback_percent', 'prazo_pagamento',
      'mensagem_final', 'whatsapp_consultor', 'botao_topo_texto', 'titulo_principal', 'subtitulo',
      'passo1_pergunta', 'passo2_pergunta', 'passo3_titulo', 'passo3_pergunta',
      'passo4_pergunta', 'passo5_pergunta', 'rodape_legal',
    ];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        setConfig(key, String(req.body[key]).slice(0, 500));
      }
    }
    const config = getConfig();
    res.send(renderCustomize(adminPath, req.admin, config, 'Configurações salvas com sucesso!'));
  });

  return router;
}

module.exports = makeAdminRouter;
