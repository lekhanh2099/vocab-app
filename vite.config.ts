import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    tailwindcss(),
    solidPlugin(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.svg", "icons/favicon-64.png", "icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "Vocab Universe",
        short_name: "Vocab",
        description: "Ôn từ vựng tiếng Trung từ 4 giáo trình, offline-first.",
        theme_color: "#f7f7f5",
        background_color: "#f7f7f5",
        display: "standalone",
        orientation: "any",
        lang: "vi",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,json,png,svg,woff2,mp3,m4a,ogg}"],
        cleanupOutdatedCaches: true
      }
    })
  ],
  build: { target: "es2022", sourcemap: true }
});
