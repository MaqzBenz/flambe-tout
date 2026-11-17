import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Chemins relatifs : le site fonctionne tel quel sous https://<user>.github.io/<dépôt>/
  base: './',
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
});
