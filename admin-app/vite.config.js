import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Split heavy vendor code so the app shell loads and caches independently.
// Charts (@ant-design/charts → plots → @antv/*) are not assigned here, so they stay in the
// lazily-loaded chunk used only by the overview page.
export default defineConfig({
  plugins: [react()],
  base: '/admin-app/',
  server: { port: 5174, proxy: { '/api': 'http://localhost:3000' } },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/@ant-design[\\/](charts|plots|graphs)|@antv|[\\/]d3-/.test(id)) return;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
          if (/[\\/]node_modules[\\/]@ant-design[\\/]pro-/.test(id)) return 'pro-components';
          if (/[\\/]node_modules[\\/](antd|@ant-design|rc-[^\\/]+|@rc-component)[\\/]/.test(id)) return 'antd';
        }
      }
    }
  }
});
