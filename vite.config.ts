import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/ideas-board/',
  plugins: [react()],
  test: { environment: 'node' },
} as Parameters<typeof defineConfig>[0]);
