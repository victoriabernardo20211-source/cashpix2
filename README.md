# CashPix

Sistema completo de captação de leads com cashback + painel administrativo seguro.

## Stack
- Node.js + Express
- SQLite (better-sqlite3)
- JWT para autenticação
- bcryptjs para senhas
- Helmet para segurança de headers

## Instalação

```bash
npm install
cp .env.example .env
# Edite o .env com seus valores
node server.js
```

## Configuração (.env)

```env
PORT=3000
NODE_ENV=production
JWT_SECRET=sua-chave-secreta-longa-aqui
ADMIN_SECRET_PATH=sua-url-secreta-aqui
DB_PATH=./cashpix.db
```

## Segurança

- **O painel admin NÃO fica em /admin** — fica em uma URL secreta que só você sabe, definida em `ADMIN_SECRET_PATH`
- Rate limiting: máx 5 tentativas de login por IP por 15 minutos
- Senhas com bcrypt (12 rounds)
- Cookies httpOnly + sameSite strict
- Headers de segurança via Helmet
- Queries parametrizadas (sem SQL injection)
- X-Robots-Tag: noindex em todas as rotas admin

## Login padrão

Email: `admin@cashpix.com`  
Senha: `Admin@2024!`

**Mude a senha após o primeiro login!**

## Deploy (Railway / Heroku / VPS)

1. Configure as variáveis de ambiente
2. `npm install && node server.js`
3. Para produção, use PM2 ou similar: `pm2 start server.js --name cashpix`
