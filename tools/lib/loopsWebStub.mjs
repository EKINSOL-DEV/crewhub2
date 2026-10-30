/* A stub of the crewhub-loops web app, for the Chat panel's checks: a small page at every path that looks like loops'
   sign-in (a heading, an id and a password field; nothing behind them). It records every request with the browser's
   Sec-Fetch-Dest and Sec-Fetch-Site headers, so a check can prove the page was loaded inside a frame of the world's
   page, and lets a test switch to "refusing" (a `Content-Security-Policy: frame-ancestors 'none'` header, the day loops
   might add one) to see the panel's fallback. No password is ever typed into it, and it keeps nothing.

   Tooling only, like everything in tools/: it listens on 127.0.0.1 and reaches nothing. */
import { createServer } from "node:http";

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>crewhub-loops (stub)</title>
<style>body{font-family:system-ui,sans-serif;margin:2rem;color:#1f2937}form{display:grid;gap:.5rem;max-width:18rem}</style></head>
<body data-stub="loops-web"><h1>crewhub-loops</h1><p data-stub-line>Sign in (stub page: nothing behind this form).</p>
<form onsubmit="return false"><label>Name <input name="id" autocomplete="username"></label><label>Password <input name="password" type="password" autocomplete="current-password"></label><button type="submit">Sign in</button></form>
</body></html>`;

/** Starts the stub on `port` (0 picks one). Returns { url, port, requests, setRefusing, close }. */
export async function createLoopsWebStub({ port = 0 } = {}) {
  const requests = [];
  let refusing = false;
  const server = createServer((req, res) => {
    requests.push({ path: req.url ?? "/", dest: req.headers["sec-fetch-dest"] ?? null, site: req.headers["sec-fetch-site"] ?? null, at: Date.now() });
    const headers = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" };
    if (refusing) headers["content-security-policy"] = "frame-ancestors 'none'";
    res.writeHead(200, headers);
    res.end(PAGE);
  });
  await new Promise((resolve, reject) => server.once("error", reject).listen(port, "127.0.0.1", resolve));
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}`;
  return {
    url,
    port: address.port,
    requests,
    setRefusing: (value) => (refusing = !!value),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
