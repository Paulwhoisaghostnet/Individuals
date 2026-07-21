import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const webHost = process.env.INDIVIDUALS_DEV_HOST ?? "127.0.0.1";
const apiTarget =
  process.env.INDIVIDUALS_DEV_API_TARGET ?? "http://127.0.0.1:4175";

const apiProxy = {
  "/api": {
    target: apiTarget,
    changeOrigin: false,
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: webHost,
    port: 4174,
    strictPort: true,
    proxy: apiProxy,
  },
  preview: {
    host: webHost,
    port: 4174,
    strictPort: true,
    proxy: apiProxy,
  },
});
