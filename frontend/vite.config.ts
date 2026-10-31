/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// The SPA and the API share one origin in production (/api). In dev, Vite proxies /api to the
// FastAPI server; set API_PROXY in frontend/.env.local to point somewhere other than :8000.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    server: {
      port: 5173,
      proxy: { "/api": { target: env.API_PROXY || "http://localhost:8000", changeOrigin: true } },
    },
    build: {
      rollupOptions: {
        output: {
          // libraries change less often than the app, so they get their own long-cached files
          manualChunks: {
            react: ["react", "react-dom", "react-router"],
            motion: ["motion"],
            ui: [
              "@radix-ui/react-dialog",
              "@radix-ui/react-dropdown-menu",
              "@radix-ui/react-popover",
              "@radix-ui/react-select",
              "@radix-ui/react-tooltip",
              "@radix-ui/react-toggle-group",
              "@radix-ui/react-switch",
              "cmdk",
              "sonner",
            ],
            query: ["@tanstack/react-query"],
          },
        },
      },
    },
    test: { environment: "jsdom" },
  };
});
