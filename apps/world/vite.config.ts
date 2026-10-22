import { fileURLToPath } from "node:url";
import { defineConfig, type HtmlTagDescriptor, type Plugin, type ProxyOptions, type Rollup } from "vite";
import react from "@vitejs/plugin-react";
import { realpathSync } from "node:fs";
import { checkoutId, probeCheckout, tellDevOrigin } from "../host/src/checkout.ts";
import { devHostVerdict, devOriginLine, devOriginsOf, hostPortPlan } from "./hostPort.ts";

/**
 * The dev server's origin, told to the host (round 23; apps/host devOrigin.ts): once Vite listens, and again whenever
 * the proxied health shows the host no longer lists it (a host restarted after Vite, or started later). One line per
 * outcome that changes (a lost acceptance is said again when it is back). `tell` is bounded: at most once every 5 s,
 * one in flight.
 */
function devOriginTeller(port: number, checkout: string, logger: { info: (text: string) => void }) {
  let origins: string[] = [];
  let lastLine = "";
  let accepted = false;
  let busy = false;
  let lastAt = 0;
  const say = (line: string) => {
    if (line === lastLine) return;
    lastLine = line;
    logger.info(`  ${line}`);
  };
  const tell = async () => {
    if (origins.length === 0 || busy || Date.now() - lastAt < 5000) return;
    busy = true;
    lastAt = Date.now();
    try {
      for (const origin of origins) {
        const outcome = await tellDevOrigin(port, origin, checkout);
        if (outcome.kind !== "accepted") {
          accepted = false;
          say(devOriginLine(port, origins, outcome));
          return;
        }
      }
      accepted = true;
      say(devOriginLine(port, origins, { kind: "accepted", origins }));
    } finally {
      busy = false;
    }
  };
  return {
    /** Vite's local URLs are known: tell now. */
    listening(localUrls: readonly string[]) {
      origins = devOriginsOf(localUrls);
      lastAt = 0;
      void tell();
    },
    /** A proxied health answer: `x-world-dev-origins` names what the host accepts; missing ours, tell again. */
    sawHealth(header: string | string[] | undefined) {
      const listed = (Array.isArray(header) ? header.join(",") : (header ?? "")).split(",").map((o) => o.trim());
      if (origins.length > 0 && origins.some((o) => !listed.includes(o))) {
        // A host that forgot us (restarted, or started after Vite): tell again, and say so again when it accepts. A
        // host that keeps refusing (a stub, another checkout's) is told again as well, quietly: its line was printed.
        if (accepted) lastLine = "";
        lastAt = Math.min(lastAt, Date.now() - 5000);
        void tell();
      }
    },
  };
}
type DevOriginTeller = ReturnType<typeof devOriginTeller>;

/** The proxy to the world's host on `port` (hostPort.ts decides the port: CREWHUB_WORLD_PORT, or the dev default 5180). */
function worldApiProxy(port: number, teller: DevOriginTeller | null = null): ProxyOptions {
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
      // Every proxied health answer says which dev origins the host accepts; the teller tells again when ours is missing.
      if (teller !== null) {
        proxy.on("proxyRes", (proxyRes, req) => {
          if (proxyRes.statusCode === 200 && (req.url ?? "").startsWith("/world-api/health")) teller.sawHealth(proxyRes.headers["x-world-dev-origins"]);
        });
      }
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

/**
 * The preview without CREWHUB_WORLD_PORT (hostPort.ts): no proxy, and these answers in its place so the page meets what
 * it meets behind the dev proxy with nothing listening: `/world-api` a 204 ("no host": the probe runs the demo),
 * `/pair` the note as text. The note is printed once when the preview listens.
 */
function previewWithoutHost(note: string): Plugin {
  return {
    name: "crewhub:preview-without-host",
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        if (url === "/world-api" || url.startsWith("/world-api/")) {
          res.writeHead(204, { "x-world-host": "unset" });
          res.end();
        } else if (url === "/pair" || url.startsWith("/pair/")) {
          res.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
          res.end(`${note}\n`);
        } else next();
      });
      server.httpServer?.once("listening", () => server.config.logger.info(`  ${note}`));
    },
  };
}

/**
 * The dev server's one line about its host, or its refusal (hostPort.ts, `devHostVerdict`): before the server listens
 * it asks the port's `/world-api/health` once and compares the host's checkout id with this checkout's (apps/host
 * `checkout.ts`, the same hash of the repository root the host puts in health). Another checkout's host: the line, and
 * the dev server does not start (exit 1).
 */
function devHost(port: number, explicit: boolean, teller: DevOriginTeller): Plugin {
  return {
    name: "crewhub:dev-host",
    async configureServer(server) {
      const root = realpathSync(fileURLToPath(new URL("../..", import.meta.url)));
      const verdict = devHostVerdict({ port, explicit, local: { root, id: checkoutId(root) }, answer: await probeCheckout(port) });
      if (!verdict.ok) {
        // The line, plainly, and no server: a thrown error would print it under a stack trace.
        server.config.logger.error(`\n  ${verdict.line}\n`, { timestamp: false });
        process.exit(1);
      }
      server.config.logger.info(`  ${verdict.line}`);
      // Once the URLs are known, tell the host the page's origin (round 23).
      server.httpServer?.once("listening", () => setTimeout(() => teller.listening(server.resolvedUrls?.local ?? []), 0));
    },
  };
}

export default defineConfig(({ isPreview }) => {
  // The dev server defaults to the host's 5180; the preview proxies only to a port named in the environment.
  const plan = hostPortPlan(process.env, isPreview ? "preview" : "dev");
  const explicit = process.env["CREWHUB_WORLD_PORT"] !== undefined && process.env["CREWHUB_WORLD_PORT"].trim() !== "";
  // The dev server tells the host its origin (round 23); the preview never does (it proxies only to a port named, and
  // its page is a build to look at, not to write the town from).
  const teller = plan.proxy && !isPreview ? devOriginTeller(plan.port, checkoutId(realpathSync(fileURLToPath(new URL("../..", import.meta.url)))), { info: (text) => console.log(text) }) : null;
  const proxy = plan.proxy ? { "/world-api": worldApiProxy(plan.port, teller), "/pair": worldApiProxy(plan.port) } : {};
  return {
  plugins: [react(), preloadWorld(), ...(plan.proxy ? (teller === null ? [] : [devHost(plan.port, explicit, teller)]) : [previewWithoutHost(plan.note)])],
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
    proxy,
  },
  // The preview inherits `server.proxy` unless told otherwise; it is told: the same proxy, or none without the variable.
  preview: { host: "127.0.0.1", port: 4173, strictPort: true, proxy },
  build: {
    // three.js in a chunk of its own: it changes with a dependency bump only, so a browser keeps it across rebuilds of
    // the world (the host serves hashed assets as immutable), and its compile runs beside the style's. The Greenhouse
    // style chunk is still about 300 kB by design (models as data); three.js itself is about 650 kB, over Vite's 500 kB
    // warning, which was the one line of noise in a first `npm run world`.
    chunkSizeWarningLimit: 1024,
    rollupOptions: { output: { codeSplitting: { groups: [{ name: "three", test: /node_modules[\\/]three[\\/]/ }] } } },
  },
  };
});
