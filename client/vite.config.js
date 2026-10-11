import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development, /api is proxied to the Express server so the auth cookie stays same-origin.
export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', globals: true, setupFiles: './src/test/setup.js' },
  server: { port: 5173, proxy: { '/api': 'http://localhost:5000' } },
});
