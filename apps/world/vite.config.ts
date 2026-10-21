import { fileURLToPath } from "node:url";
import { defineConfig, type HtmlTagDescriptor, type Plugin, type ProxyOptions, type Rollup } from "vite";
import react from "@vitejs/plugin-react";

/** The host's port: CREWHUB_WORLD_PORT, default 5180 (the host's own default). */
function worldApiProxy(): ProxyOptions {
  const port = Number(process.env["CREWHUB_WORLD_PORT"] ?? 5180);
  return {
    target: `http://127.0.0.1:${port}`,
    changeOrigin: true,
    configure(proxy) {
      // Proxy errors (no host) are answered as 204 with no body: the probe reads an empty answer as "no host", and the
      // browser logs nothing (a 502 would be a console error on every start without a host).
      proxy.on("error", (_err, _req, res) => {
        const out = res as { headersSent?: boolean; writeHead?: (status: number, headers: Record<string, string>) => void; end?: () => void };
        if (out && !out.headersSent && typeof out.writeHead === "function") {
          out.writeHead(204, { "x-world-host": "unreachable" });
          out.end?.();
        }
      });
      // The stream must not be compressed or buffered on its way through: ask the host for plain bytes.
      proxy.on("proxyReq", (proxyReq) => proxyReq.setHeader("accept-encoding", "identity"));
    },
  };
}

/**
 * The production index.html preloads the world's module graph (App and what it imports: three.js, the Greenhouse style,
 * the casts), which main.tsx imports only once the source is decided: the browser fetches and compiles those 1.6 MB
 * while the entry runs and the host is probed, instead of after. A preload runs nothing, so the order the decision needs
 * holds. The side pages and the build panels stay out of it.
 */
function preloadWorld(): Plugin {
  return {
    name: "crewhub:preload-world",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return html;
        const chunks = Object.values(bundle).filter((c): c is Rollup.OutputChunk => c.type === "chunk");
        const app = chunks.find((c) => c.facadeModuleId?.endsWith("/src/App.tsx"));
        if (!app) return html;
        const graph = new Set<string>();
        const walk = (fileName: string) => {
          if (graph.has(fileName)) return;
          graph.add(fileName);
          chunks.find((c) => c.fileName === fileName)?.imports.forEach(walk);
        };
        walk(app.fileName);
        const already = new Set([...html.matchAll(/(?:href|src)="\/([^"]+\.js)"/g)].map((m) => m[1]));
        const tags: HtmlTagDescriptor[] = [...graph].filter((f) => !already.has(f)).map((f) => ({ tag: "link", attrs: { rel: "modulepreload", crossorigin: true, href: `/${f}` }, injectTo: "head" }));
        return { html, tags };
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), preloadWorld()],
  resolve: {
    alias: {
      // The copied loops chat imports `useNavigate`; the world has no router (see src/shims/react-router-dom.ts).
      "react-router-dom": fileURLToPath(new URL("./src/shims/react-router-dom.ts", import.meta.url)),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    // The world's host (apps/host) answers /world-api; in dev Vite forwards it there, the SSE stream included. The host
    // checks the Host header against its own port, so the origin is changed. Without a host the proxy answers an error
    // the app treats as "no host" (the source decision falls back to the demo).
    // `/pair/<token>` too, so a link minted for this origin (`npm run host -- open --origin http://127.0.0.1:5173`) pairs here.
    proxy: { "/world-api": worldApiProxy(), "/pair": worldApiProxy() },
  },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
  build: {
    // three.js in a chunk of its own: it changes with a dependency bump only, so a browser keeps it across rebuilds of
    // the world (the host serves hashed assets as immutable), and its compile runs beside the style's. The Greenhouse
    // style chunk is still about 300 kB by design (models as data); three.js itself is about 650 kB, over Vite's 500 kB
    // warning, which was the one line of noise in a first `npm run world`.
    chunkSizeWarningLimit: 1024,
    rollupOptions: { output: { codeSplitting: { groups: [{ name: "three", test: /node_modules[\\/]three[\\/]/ }] } } },
  },
});
