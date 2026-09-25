// Prints a fresh download link for a buyer whose link expired or went missing:
//   node --env-file=/etc/clipkeep-fulfillment.env issue-link.mjs cs_live_...
import { loadConfig } from "./config.mjs";
import { makeDownloadToken } from "./lib.mjs";

const sessionId = process.argv[2];
if (!sessionId) {
  console.error("Usage: node --env-file=/etc/clipkeep-fulfillment.env issue-link.mjs <checkout session id>");
  process.exit(1);
}
const config = loadConfig();
console.log(`${config.publicBaseUrl}/download?token=${makeDownloadToken(sessionId, config.tokenSecret, { days: config.linkDays })}`);
