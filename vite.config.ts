import { defineConfig, loadEnv, type Plugin } from "vite";
import solidPlugin from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { fetchVocabularyCsv, isVocabularySourceConfigError } from "./server/appsScript.mjs";

function privateVocabularyDevApi(env: Record<string, string>): Plugin {
  return {
    name: "private-vocabulary-apps-script-api",
    configureServer(server) {
      server.middlewares.use("/api/vocabulary", async (request, response) => {
        if (request.method !== "GET") {
          response.statusCode = 405;
          response.setHeader("Allow", "GET");
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        try {
          const csv = await fetchVocabularyCsv({ env });
          response.statusCode = 200;
          response.setHeader("Content-Type", "text/csv; charset=utf-8");
          response.setHeader("Cache-Control", "private, no-store");
          response.setHeader("X-Content-Type-Options", "nosniff");
          response.end(csv);
        } catch (error) {
          console.error("Apps Script vocabulary fetch failed", error);
          response.statusCode = isVocabularySourceConfigError(error) ? 503 : 502;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify({
            error: isVocabularySourceConfigError(error)
              ? "Apps Script source is not configured. Check .env.local."
              : "Apps Script vocabulary fetch failed"
          }));
        }
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    plugins: [
      privateVocabularyDevApi(env),
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
  };
});
