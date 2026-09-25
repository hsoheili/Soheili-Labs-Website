import http from "node:http";
import { loadConfig } from "./config.mjs";
import { SentStore } from "./store.mjs";
import { sendEmail } from "./mailer.mjs";
import { createHandler } from "./app.mjs";

const config = loadConfig();
const store = new SentStore(config.stateDir);
const handler = createHandler({ config, store, mailer: (message) => sendEmail(config, message) });

http.createServer(handler).listen(config.port, config.host, () => {
  console.info(`clipkeep-fulfillment listening on ${config.host}:${config.port}`);
});
