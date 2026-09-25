import fs from "node:fs";
import { verifyStripeSignature, purchaseFromEvent, makeDownloadToken, readDownloadToken, downloadEmail, preorderEmail } from "./lib.mjs";

const MAX_BODY = 1024 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error("Body too large"), { status: 413 })); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
}

function linkProblemPage(supportEmail) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Download link expired</title>
<body style="font-family:-apple-system,system-ui,sans-serif;max-width:560px;margin:15vh auto;padding:0 16px;line-height:1.6">
<h1>This download link has expired or isn't valid.</h1>
<p>Email <a href="mailto:${supportEmail}?subject=ClipKeep%20download%20link">${supportEmail}</a> with the address you used at checkout and we'll send you a new one.</p></body>`;
}

// deps: { config, store, mailer, log }. Kept injectable so tests run without
// the network or a real file system layout.
export function downloadMessage(config, purchase) {
  const token = makeDownloadToken(purchase.sessionId, config.tokenSecret, { days: config.linkDays });
  const downloadUrl = `${config.publicBaseUrl}/download?token=${token}`;
  return downloadEmail({ name: purchase.name, downloadUrl, days: config.linkDays, supportEmail: config.supportEmail });
}

export function releaseAvailable(config) {
  try { return fs.statSync(config.downloadFile).isFile(); } catch { return false; }
}

// deps: { config, store, mailer, log }. Kept injectable so tests run without
// the network or a real file system layout.
export function createHandler({ config, store, mailer, log = console }) {
  // While no build is on the server, ClipKeep is on pre-order: the buyer gets a
  // confirmation now and the download email later, from send-pending.mjs.
  async function fulfil(purchase) {
    const released = releaseAvailable(config);
    const message = released ? downloadMessage(config, purchase) : preorderEmail({ name: purchase.name, supportEmail: config.supportEmail });
    await mailer({ to: purchase.email, ...message });
    store.add({ sessionId: purchase.sessionId, email: purchase.email, name: purchase.name, status: released ? "sent" : "pending" });
    log.info(`${released ? "fulfilled" : "pre-order recorded"} ${purchase.sessionId}`);
    if (config.notifyEmail) {
      const what = released ? "The download email was sent." : "It is a pre-order; the download email is owed when the release is on the server.";
      mailer({ to: config.notifyEmail, subject: "New ClipKeep founding license", text: `${purchase.email} bought a ClipKeep Founding License (${purchase.sessionId}). ${what}` })
        .catch((error) => log.error(`owner notification failed: ${error.message}`));
    }
  }

  async function webhook(req, res) {
    let raw;
    try { raw = await readBody(req); } catch (error) { return send(res, error.status || 400, { error: "Unreadable body." }); }
    if (!verifyStripeSignature(raw, req.headers["stripe-signature"], config.webhookSecret)) {
      return send(res, 400, { error: "Invalid signature." });
    }
    let event;
    try { event = JSON.parse(raw); } catch { return send(res, 400, { error: "Invalid JSON." }); }
    const purchase = purchaseFromEvent(event, config.paymentLinkId);
    if (!purchase) return send(res, 200, { received: true, ignored: true });
    if (store.has(purchase.sessionId)) return send(res, 200, { received: true, duplicate: true });
    try {
      await fulfil(purchase);
    } catch (error) {
      // A non-2xx makes Stripe retry the event, which is what we want when the
      // email provider is briefly unavailable.
      log.error(`fulfilment failed for ${purchase.sessionId}: ${error.message}`);
      return send(res, 500, { error: "Fulfilment failed; Stripe will retry." });
    }
    return send(res, 200, { received: true, fulfilled: true });
  }

  function download(req, res, url) {
    const grant = readDownloadToken(url.searchParams.get("token"), config.tokenSecret);
    if (!grant) return send(res, 410, linkProblemPage(config.supportEmail), "text/html; charset=utf-8");
    let stat;
    try { stat = fs.statSync(config.downloadFile); } catch {
      log.error(`download file missing: ${config.downloadFile}`);
      return send(res, 503, { error: "Download temporarily unavailable." });
    }
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Length": stat.size,
      "Content-Disposition": `attachment; filename="${config.downloadFilename.replace(/["\\\r\n]/g, "")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (req.method === "HEAD") return res.end();
    log.info(`download ${grant.sessionId}`);
    fs.createReadStream(config.downloadFile).pipe(res);
  }

  return (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/stripe/webhook" && req.method === "POST") return void webhook(req, res);
    if (url.pathname === "/download" && (req.method === "GET" || req.method === "HEAD")) return download(req, res, url);
    if (url.pathname === "/health" && req.method === "GET") return send(res, 200, { ok: true });
    return send(res, 404, { error: "Not found." });
  };
}
