const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'cashpix-dev-secret-troque-em-producao';
const JWT_EXPIRES = '8h';
const COOKIE_NAME = 'cpx_session';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function setCookieOptions(req) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  };
}

function requireAuth(adminPath) {
  return function (req, res, next) {
    const token = req.cookies && req.cookies[COOKIE_NAME];
    const payload = token ? verifyToken(token) : null;

    if (!payload) {
      return res.redirect(`/${adminPath}/login`);
    }
    req.admin = payload;
    next();
  };
}

module.exports = { signToken, verifyToken, setCookieOptions, requireAuth, COOKIE_NAME };
