import { createApp } from "./app.ts";
import { configFromEnv } from "./config.ts";

let config;
try {
  config = configFromEnv(process.env);
} catch (error) {
  console.error(`weft-cloud: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const server = createApp(config);
server.listen(config.port, config.host, () => {
  console.log(`weft-cloud listening on ${config.host}:${config.port}${config.dev ? " (DEVELOPMENT: the store 'dev' is accepted)" : ""}${config.turn ? "" : " - TURN is not configured"}`);
});

// (`docker stop` asks politely first)
process.on("SIGTERM", () => server.close(() => process.exit(0)));
