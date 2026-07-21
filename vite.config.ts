import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function societySnapshotsPlugin(): Plugin {
  return {
    name: "society-snapshots-api",
    configureServer(server) {
      server.middlewares.use("/api/society/snapshots", (_req, res) => {
        const dir = join(process.cwd(), ".data/demo-individuals/snapshots");
        if (!existsSync(dir)) {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify([]));
          return;
        }
        try {
          const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
          const snapshots = files.map((file) =>
            JSON.parse(readFileSync(join(dir, file), "utf-8")),
          );
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(snapshots));
        } catch {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify([]));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), societySnapshotsPlugin()],
  server: {
    host: "0.0.0.0",
    port: 4174,
  },
  preview: {
    host: "0.0.0.0",
    port: 4174,
  },
});
