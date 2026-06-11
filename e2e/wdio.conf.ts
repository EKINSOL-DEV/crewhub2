import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

let tauriDriver: ChildProcess | undefined;

export const config: WebdriverIO.Config = {
  // One grouped session, order matters: smoke asserts the shell exists under
  // the wizard overlay; onboarding then walks the wizard on the same fresh
  // profile (M6 T9 AC, EKI-86/88).
  specs: [["./smoke.spec.ts", "./onboarding.spec.ts"]],
  maxInstances: 1,
  hostname: "127.0.0.1",
  port: 4444,
  capabilities: [
    {
      maxInstances: 1,
      // @ts-expect-error tauri-specific capability
      "tauri:options": {
        application: path.resolve(dirname, "../target/debug/crewhub2"),
      },
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
