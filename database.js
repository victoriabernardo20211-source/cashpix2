const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || './cashpix.db';

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initDb() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      cpf TEXT NOT NULL,
      telefone TEXT NOT NULL,
      chave_pix TEXT NOT NULL,
      tipo_chave TEXT NOT NULL,
      fatura REAL NOT NULL,
      cashback REAL NOT NULL,
      status TEXT DEFAULT 'novo',
      consultor TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      senha_hash TEXT NOT NULL,
      role TEXT DEFAULT 'consultor',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS site_config (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed super admin if not exists
  const existing = db.prepare('SELECT id FROM admins WHERE email = ?').get('admin@cashpix.com');
  if (!existing) {
    const hash = bcrypt.hashSync('Admin@2024!', 12);
    db.prepare('INSERT INTO admins (nome, email, senha_hash, role) VALUES (?, ?, ?, ?)').run(
      'Administrador', 'admin@cashpix.com', hash, 'super_admin'
    );
    console.log('[DB] Super admin criado: admin@cashpix.com / Admin@2024!');
  }

  // Seed default site config if not exists
  const defaults = {
    marca_nome: 'CashPix',
    marca_slogan: 'Resgate seu cashback em 5 passos',
    cor_principal: '#22c55e',
    cashback_percent: '15',
    prazo_pagamento: '24h',
    mensagem_final: 'Tudo certo, {nome}! Seu cashback de R$ {valor} foi aprovado. Um consultor vai entrar em contato em breve.',
    whatsapp_consultor: '',
    botao_topo_texto: 'Resgatar cashback agora',
    titulo_principal: 'Você tem cashback acumulado esperando por você!',
    subtitulo: 'Resgate agora direto no Pix, sem complicação.',
    passo1_pergunta: 'Você possui cartão de crédito?',
    passo2_pergunta: 'Qual o valor da sua última fatura?',
    passo3_titulo: 'Seu cashback está pronto!',
    passo3_pergunta: 'Escolha o tipo de chave Pix para receber:',
    passo4_pergunta: 'Qual é o seu número de telefone?',
    passo5_pergunta: 'Confirme seus dados para liberar o cashback:',
    rodape_legal: 'CashPix é um serviço de cashback. Consulte nossos termos de uso.',
  };

  const upsert = db.prepare(`INSERT OR IGNORE INTO site_config (chave, valor) VALUES (?, ?)`);
  for (const [k, v] of Object.entries(defaults)) {
    upsert.run(k, v);
  }

  console.log('[DB] Banco de dados inicializado.');
  return db;
}

function getConfig() {
  const db = getDb();
  const rows = db.prepare('SELECT chave, valor FROM site_config').all();
  const config = {};
  for (const row of rows) config[row.chave] = row.valor;
  return config;
}

function setConfig(chave, valor) {
  const db = getDb();
  db.prepare(`INSERT INTO site_config (chave, valor, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, updated_at = excluded.updated_at`).run(chave, valor);
}

module.exports = { getDb, initDb, getConfig, setConfig };
