import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApiRequest } from './server/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5173;
const DIST_DIR = path.resolve(__dirname, 'dist');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  // 1. API routes
  if (req.url.startsWith('/api/')) {
    return handleApiRequest(req, res);
  }

  // 2. Static file serving from dist/
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = parsedUrl.pathname;

  // Clean route rewrites
  if (pathname === '/' || pathname === '') pathname = '/index.html';
  else if (pathname === '/login') pathname = '/login.html';
  else if (pathname === '/register') pathname = '/register.html';
  else if (pathname === '/account') pathname = '/account.html';
  else if (pathname === '/checkout') pathname = '/checkout.html';

  let filePath = path.join(DIST_DIR, pathname);

  // If path doesn't have an extension, try .html
  if (!path.extname(filePath) && fs.existsSync(filePath + '.html')) {
    filePath += '.html';
  }

  // Check if file exists in dist
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // Check public folder fallback (for assets/videos)
  const publicPath = path.join(__dirname, 'public', parsedUrl.pathname);
  if (fs.existsSync(publicPath) && fs.statSync(publicPath).isFile()) {
    const ext = path.extname(publicPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    fs.createReadStream(publicPath).pipe(res);
    return;
  }

  // 404
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/html');
  res.end('<h1>404 Not Found</h1>');
});

server.listen(PORT, () => {
  console.log(`[Modish7 Production Server] Running at http://localhost:${PORT}/`);
});
