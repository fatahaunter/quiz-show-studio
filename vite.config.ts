import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' + hash routing lets the built /dist folder be dropped into any sub-path of a static host.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: { environment: 'node' },
});
