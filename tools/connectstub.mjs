/* connectstub.mjs: the stub host of the Connect screens on its own, for looking at them by hand. Start a Vite with
   CREWHUB_WORLD_PORT=<stub port> and open it; switch the state with
     curl -X POST http://127.0.0.1:<stub port>/__stub/state -d '{"state":"rejected"}'
   States: no-loops, pair, connect, checking, rejected, connected, older. Pasting a key that starts with chl_bad is
   rejected; any other key of the right shape connects after a moment. Ctrl+C stops it. */
import { createConnectStub, STUB_STATES } from "./lib/connectStub.mjs";

const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 && argv[at + 1] !== undefined ? argv[at + 1] : fallback;
};
if (argv.includes("--help")) {
  console.log(`usage: node tools/connectstub.mjs --port <port> [--state ${STUB_STATES.join("|")}] [--origin http://127.0.0.1:<vite port>]`);
  process.exit(0);
}
const port = Number(option("port", "0"));
const stub = await createConnectStub({ port, state: option("state", "no-loops"), origin: option("origin", undefined), log: (line) => console.error(`[stub] ${line}`) });
console.log(`connect stub on ${stub.url} in state ${stub.state}; POST /__stub/state {"state": ...} switches it`);
process.on("SIGINT", () => void stub.close().then(() => process.exit(0)));
