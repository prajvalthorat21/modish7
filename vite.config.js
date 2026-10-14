import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApiRequest } from './server/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    {
      name: 'modish7-backend-api-plugin',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          // Route API requests to server/api.js
          if (req.url && req.url.startsWith('/api/')) {
            try {
              await handleApiRequest(req, res);
            } catch (err) {
              console.error('[API Middleware Error]:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: 'Internal Server Error' }));
            }
            return;
          }

          // Route clean paths to corresponding HTML files
          const parsed = new URL(req.url, 'http://localhost');
          if (parsed.pathname === '/login') {
            req.url = '/login.html' + (parsed.search || '');
          } else if (parsed.pathname === '/register') {
            req.url = '/register.html' + (parsed.search || '');
          } else if (parsed.pathname === '/account') {
            req.url = '/account.html' + (parsed.search || '');
          }

          next();
        });
      }
    }
  ],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(process.cwd(), 'index.html'),
        login: path.resolve(process.cwd(), 'login.html'),
        register: path.resolve(process.cwd(), 'register.html'),
        account: path.resolve(process.cwd(), 'account.html')
      }
    }
  }
});
