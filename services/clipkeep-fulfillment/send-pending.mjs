// Run once the signed build is at DOWNLOAD_FILE. Emails a download link to
// every buyer who paid while ClipKeep was on pre-order:
//   sudo -u clipkeep node --env-file=/etc/clipkeep-fulfillment.env send-pending.mjs          (dry run)
//   sudo -u clipkeep node --env-file=/etc/clipkeep-fulfillment.env send-pending.mjs --send
import { loadConfig } from "./config.mjs";
import { SentStore } from "./store.mjs";
import { sendEmail } from "./mailer.mjs";
import { downloadMessage, releaseAvailable } from "./app.mjs";

const config = loadConfig();
if (!releaseAvailable(config)) {
  console.error(`No release at ${config.downloadFile}. Copy the signed build there first.`);
  process.exit(1);
}
const store = new SentStore(config.stateDir);
const pending = store.pending();
const send = process.argv.includes("--send");
console.log(`${pending.length} pre-order${pending.length === 1 ? "" : "s"} waiting for a download link.${send ? "" : " Dry run; add --send to email them."}`);

let failures = 0;
for (const purchase of pending) {
  if (!send) { console.log(`  would email ${purchase.email} (${purchase.sessionId})`); continue; }
  try {
    await sendEmail(config, { to: purchase.email, ...downloadMessage(config, purchase) });
    store.add({ sessionId: purchase.sessionId, email: purchase.email, name: purchase.name, status: "sent" });
    console.log(`  sent ${purchase.email}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAILED ${purchase.email}: ${error.message}`);
  }
}
if (failures) { console.error(`${failures} failed; run again to retry them.`); process.exit(1); }
