const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const root = path.join(__dirname, '..', 'frontend');
const users = new Map();
const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = http.createServer((request, response) => {
  const requestedPath = request.url.split('?')[0];
  const filePath = path.join(root, requestedPath === '/' ? 'index.html' : requestedPath);
  if (!filePath.startsWith(root) || !fs.existsSync(filePath)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(response);
});

const socketServer = new WebSocketServer({ server });
socketServer.on('connection', (socket) => {
  let email;
  socket.on('message', (rawMessage) => {
    let message;
    try { message = JSON.parse(rawMessage.toString()); } catch { return; }
    if (message.type === 'register' && typeof message.email === 'string') {
      email = message.email.toLowerCase();
      users.set(email, socket);
      socket.send(JSON.stringify({ type: 'registered', email }));
      return;
    }
    const recipient = users.get(String(message.to || '').toLowerCase());
    if (recipient && recipient.readyState === 1) {
      recipient.send(JSON.stringify({ ...message, from: email }));
    } else if (message.type === 'call') {
      socket.send(JSON.stringify({ type: 'unavailable', to: message.to }));
    }
  });
  socket.on('close', () => { if (email && users.get(email) === socket) users.delete(email); });
});

server.listen(4173, () => console.log('Relay server running at http://localhost:4173'));
