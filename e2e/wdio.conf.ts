import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

let tauriDriver: ChildProcess | undefined;

export const config: WebdriverIO.Config = {
  specs: ["./smoke.spec.ts"],
  maxInstances: 1,
  hostname: "127.0.0.1",
  port: 4444,
  capabilities: [
    {
      // @ts-expect-error tauri-specific capability
      "tauri:options": {
        application: path.resolve(__dirname, "../src-tauri/target/debug/crewhub2"),
      },
      browserName: "wry",
    },
  ],
  framework: "mocha",
  reporters: ["spec"],
  waitforTimeout: 10000,
  connectionRetryCount: 3,
  onPrepare: () => {
    tauriDriver = spawn("tauri-driver", [], { stdio: "inherit" });
  },
  onComplete: () => {
    tauriDriver?.kill();
  },
};
