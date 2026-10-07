import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** The host's port: CREWHUB_WORLD_PORT, default 5180 (the host's own default). */
function worldApiProxy() {
  const port = Number(process.env["CREWHUB_WORLD_PORT"] ?? 5180);
  return {
    target: `http://127.0.0.1:${port}`,
    changeOrigin: true,
    // Proxy errors (no host) are answered as 204 with no body: the probe reads an empty answer as "no host", and the
    // browser logs nothing (a 502 would be a console error on every start without a host).
    configure(proxy: { on(event: "error", handler: (err: Error, req: unknown, res: { headersSent?: boolean; writeHead(status: number): void; end(): void } | undefined) => void): void; on(event: "proxyReq", handler: (proxyReq: { setHeader(name: string, value: string): void }) => void): void }) {
      proxy.on("error", (_err, _req, res) => {
        if (res && !res.headersSent && typeof res.writeHead === "function") {
          res.writeHead(204, { "x-world-host": "unreachable" });
          res.end();
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
    proxy: { "/world-api": worldApiProxy() },
  },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
});
