```js
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 4173;

const root = path.join(__dirname, '..', 'frontend');
const dataDir = path.join(__dirname, 'data');
const accountsFile = path.join(dataDir, 'accounts.json');

const users = new Map();
const sessions = new Map();

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json'
};

/* =========================
   DATABASE
========================= */

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(accountsFile)) {
  fs.writeFileSync(accountsFile, '{}');
}

function loadAccounts() {
  try {
    return JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
  } catch {
    return {};
  }
}

function saveAccounts(accounts) {
  fs.writeFileSync(
    accountsFile,
    JSON.stringify(accounts, null, 2)
  );
}

/* =========================
   PASSWORD SECURITY
========================= */

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');

    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

function verifyPassword(password, storedHash) {
  return new Promise((resolve, reject) => {
    const [salt, key] = storedHash.split(':');

    if (!salt || !key) {
      resolve(false);
      return;
    }

    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      const storedBuffer = Buffer.from(key, 'hex');
      const suppliedBuffer = Buffer.from(derivedKey.toString('hex'), 'hex');

      if (storedBuffer.length !== suppliedBuffer.length) {
        resolve(false);
        return;
      }

      resolve(crypto.timingSafeEqual(storedBuffer, suppliedBuffer));
    });
  });
}

/* =========================
   HELPERS
========================= */

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });

  response.end(JSON.stringify(data));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';

    request.on('data', chunk => {
      body += chunk;

      if (body.length > 1024 * 1024) {
        reject(new Error('Request too large'));
        request.destroy();
      }
    });

    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });

    request.on('error', reject);
  });
}

function createSession(email) {
  const token = crypto.randomBytes(32).toString('hex');

  sessions.set(token, {
    email,
    createdAt: Date.now()
  });

  return token;
}

function getSession(request) {
  const authorization = request.headers.authorization || '';

  if (!authorization.startsWith('Bearer ')) {
    return null;
  }

  const token = authorization.slice(7);
  return sessions.get(token) || null;
}

/* =========================
   HTTP SERVER
========================= */

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    });

    response.end();
    return;
  }

  const requestedPath = request.url.split('?')[0];

  /* ---------- SIGNUP ---------- */

  if (request.method === 'POST' && requestedPath === '/api/signup') {
    try {
      const body = await readBody(request);

      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');

      if (!email.endsWith('@gmail.com')) {
        sendJson(response, 400, {
          error: 'A Gmail address is required.'
        });
        return;
      }

      if (password.length < 8) {
        sendJson(response, 400, {
          error: 'Relay passwords must be at least 8 characters.'
        });
        return;
      }

      const accounts = loadAccounts();

      if (accounts[email]) {
        sendJson(response, 409, {
          error: 'An account with this Gmail already exists.'
        });
        return;
      }

      const passwordHash = await hashPassword(password);

      accounts[email] = {
        email,
        passwordHash,
        createdAt: Date.now()
      };

      saveAccounts(accounts);

      const token = createSession(email);

      sendJson(response, 201, {
        success: true,
        token,
        user: {
          email
        }
      });

      console.log(`New Relay account: ${email}`);
      return;

    } catch (error) {
      console.error(error);

      sendJson(response, 500, {
        error: 'Could not create account.'
      });

      return;
    }
  }

  /* ---------- LOGIN ---------- */

  if (request.method === 'POST' && requestedPath === '/api/login') {
    try {
      const body = await readBody(request);

      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');

      const accounts = loadAccounts();
      const account = accounts[email];

      if (!account) {
        sendJson(response, 401, {
          error: 'Gmail or password is incorrect.'
        });
        return;
      }

      const validPassword = await verifyPassword(
        password,
        account.passwordHash
      );

      if (!validPassword) {
        sendJson(response, 401, {
          error: 'Gmail or password is incorrect.'
        });
        return;
      }

      const token = createSession(email);

      sendJson(response, 200, {
        success: true,
        token,
        user: {
          email
        }
      });

      console.log(`Relay login: ${email}`);
      return;

    } catch (error) {
      console.error(error);

      sendJson(response, 500, {
        error: 'Could not log in.'
      });

      return;
    }
  }

  /* ---------- CURRENT USER ---------- */

  if (request.method === 'GET' && requestedPath === '/api/me') {
    const session = getSession(request);

    if (!session) {
      sendJson(response, 401, {
        authenticated: false
      });
      return;
    }

    sendJson(response, 200, {
      authenticated: true,
      user: {
        email: session.email
      }
    });

    return;
  }

  /* ---------- LOGOUT ---------- */

  if (request.method === 'POST' && requestedPath === '/api/logout') {
    const authorization = request.headers.authorization || '';

    if (authorization.startsWith('Bearer ')) {
      const token = authorization.slice(7);
      sessions.delete(token);
    }

    sendJson(response, 200, {
      success: true
    });

    return;
  }

  /* =========================
     FRONTEND FILE SERVER
  ========================= */

  const filePath = path.join(
    root,
    requestedPath === '/' ? 'index.html' : requestedPath
  );

  if (
    !filePath.startsWith(root) ||
    !fs.existsSync(filePath)
  ) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  response.writeHead(200, {
    'Content-Type':
      mimeTypes[path.extname(filePath)] ||
      'application/octet-stream'
  });

  fs.createReadStream(filePath).pipe(response);
});

/* =========================
   WEBSOCKET CALLING
========================= */

const socketServer = new WebSocketServer({
  server
});

socketServer.on('connection', socket => {
  let email;

  socket.on('message', rawMessage => {
    let message;

    try {
      message = JSON.parse(rawMessage.toString());
    } catch {
      return;
    }

    /* ---------- REGISTER ---------- */

    if (
      message.type === 'register' &&
      typeof message.email === 'string'
    ) {
      email = message.email.trim().toLowerCase();

      users.set(email, socket);

      socket.send(
        JSON.stringify({
          type: 'registered',
          email
        })
      );

      console.log(`Online: ${email}`);

      return;
    }

    /* ---------- SEND MESSAGE ---------- */

    const recipientEmail = String(
      message.to || ''
    ).trim().toLowerCase();

    const recipient = users.get(recipientEmail);

    if (
      recipient &&
      recipient.readyState === 1
    ) {
      recipient.send(
        JSON.stringify({
          ...message,
          from: email
        })
      );

      return;
    }

    /* ---------- CALL UNAVAILABLE ---------- */

    if (message.type === 'call') {
      socket.send(
        JSON.stringify({
          type: 'unavailable',
          to: message.to
        })
      );
    }
  });

  socket.on('close', () => {
    if (
      email &&
      users.get(email) === socket
    ) {
      users.delete(email);
      console.log(`Offline: ${email}`);
    }
  });
});

/* =========================
   START SERVER
========================= */

server.listen(PORT, () => {
  console.log(`Relay server running on port ${PORT}`);
});
```
