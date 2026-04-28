import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '');
  const apiPort = env.PORT || 3001;
  
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': `http://127.0.0.1:${apiPort}`,
        '/images': `http://127.0.0.1:${apiPort}`,
        '/renders': `http://127.0.0.1:${apiPort}`,
        '/uploads': `http://127.0.0.1:${apiPort}`,
      },
    },
  };
});
