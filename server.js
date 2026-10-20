require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { initDb } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PATH = process.env.ADMIN_SECRET_PATH || 'gx9k2m7p';

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      frameSrc: ["'self'"],
    },
  },
}));

app.use(cookieParser());

// Trust proxy if behind nginx/heroku
app.set('trust proxy', 1);

// Routes
const publicRouter = require('./routes/public');
const makeAdminRouter = require('./routes/admin');

app.use('/', publicRouter);
app.use(`/${ADMIN_PATH}`, makeAdminRouter(ADMIN_PATH));

// 404 handler - returns generic response, doesn't reveal admin path
app.use((req, res) => {
  res.status(404).send(`<!DOCTYPE html><html><head><title>Página não encontrada</title>
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#faf9f5}
.box{text-align:center;padding:2rem}.code{font-size:5rem;font-weight:700;color:#e5e7eb}.msg{color:#6b7280;margin-top:.5rem}</style></head>
<body><div class="box"><div class="code">404</div><div class="msg">Página não encontrada.</div>
<a href="/" style="display:inline-block;margin-top:1.5rem;color:#22c55e;text-decoration:none">← Voltar ao início</a></div></body></html>`);
});

// Init DB then start
initDb();
app.listen(PORT, () => {
  console.log(`\n🚀 CashPix rodando em http://localhost:${PORT}`);
  console.log(`🔒 Painel admin em: http://localhost:${PORT}/${ADMIN_PATH}`);
  console.log(`   Login: admin@cashpix.com / Admin@2024!\n`);
});
