import { fileURLToPath } from "node:url";
import { defineConfig, type ProxyOptions } from "vite";
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

export default defineConfig({
  plugins: [react()],
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
});
