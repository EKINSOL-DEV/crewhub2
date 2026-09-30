import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // The copied loops chat imports `useNavigate`; the world has no router (see src/shims/react-router-dom.ts).
      "react-router-dom": fileURLToPath(new URL("./src/shims/react-router-dom.ts", import.meta.url)),
    },
  },
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
});
