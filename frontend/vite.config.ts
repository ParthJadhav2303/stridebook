import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "StrideBook",
        short_name: "StrideBook",
        description: "Fee tracking for the athletics club",
        theme_color: "#0F2A4A",
        background_color: "#F7F8FA",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Never serve API responses from the offline cache.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: {
    // Local dev: forward /api to the FastAPI server so the app uses one origin, like production.
    proxy: { "/api": "http://localhost:8000" },
  },
});
