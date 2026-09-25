import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createHandler } from "../app.mjs";
import { SentStore } from "../store.mjs";
import { readDownloadToken } from "../lib.mjs";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clipkeep-"));
const file = path.join(dir, "ClipKeep.dmg");
fs.writeFileSync(file, "fake-dmg-bytes");

const config = {
  webhookSecret: "whsec_test", paymentLinkId: "plink_clip", tokenSecret: "t".repeat(40),
  downloadFile: file, downloadFilename: "ClipKeep.dmg", publicBaseUrl: "https://downloads.example",
  linkDays: 14, supportEmail: "support@example.com", notifyEmail: "",
};
const quiet = { info() {}, error() {} };

async function withServer(deps, fn) {
  const server = http.createServer(createHandler({ config, log: quiet, ...deps }));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { server.close(); }
}

function signedPost(base, body) {
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", config.webhookSecret).update(`${t}.${body}`).digest("hex");
  return fetch(`${base}/stripe/webhook`, { method: "POST", headers: { "Stripe-Signature": `t=${t},v1=${sig}`, "Content-Type": "application/json" }, body });
}

const paidEvent = (id = "cs_paid") => JSON.stringify({
  type: "checkout.session.completed",
  data: { object: { object: "checkout.session", id, mode: "payment", payment_status: "paid", payment_link: "plink_clip", customer_details: { email: "buyer@example.com", name: "Ada" } } },
});

test("a paid checkout emails one working download link, once", async () => {
  const sent = [];
  const store = new SentStore(path.join(dir, "state1"));
  await withServer({ store, mailer: async (m) => { sent.push(m); } }, async (base) => {
    const first = await signedPost(base, paidEvent());
    assert.equal(first.status, 200);
    assert.equal((await first.json()).fulfilled, true);
    const again = await signedPost(base, paidEvent());
    assert.equal((await again.json()).duplicate, true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "buyer@example.com");

    const link = sent[0].text.match(/https:\/\/downloads\.example(\/download\?token=\S+)/)[1];
    assert.deepEqual(readDownloadToken(new URL(link, base).searchParams.get("token"), config.tokenSecret), { sessionId: "cs_paid" });
    const download = await fetch(base + link);
    assert.equal(download.status, 200);
    assert.match(download.headers.get("content-disposition"), /ClipKeep\.dmg/);
    assert.equal(await download.text(), "fake-dmg-bytes");
  });
  // A restart must still remember the sale.
  assert.equal(new SentStore(path.join(dir, "state1")).has("cs_paid"), true);
});

test("an unsigned request never sends email", async () => {
  const sent = [];
  await withServer({ store: new SentStore(path.join(dir, "state2")), mailer: async (m) => { sent.push(m); } }, async (base) => {
    const res = await fetch(`${base}/stripe/webhook`, { method: "POST", body: paidEvent(), headers: { "Stripe-Signature": "t=1,v1=00" } });
    assert.equal(res.status, 400);
    assert.equal(sent.length, 0);
  });
});

test("an email failure returns 500 so Stripe retries, and the retry succeeds", async () => {
  let fail = true;
  const sent = [];
  await withServer({ store: new SentStore(path.join(dir, "state3")), mailer: async (m) => { if (fail) throw new Error("down"); sent.push(m); } }, async (base) => {
    assert.equal((await signedPost(base, paidEvent("cs_retry"))).status, 500);
    fail = false;
    assert.equal((await signedPost(base, paidEvent("cs_retry"))).status, 200);
    assert.equal(sent.length, 1);
  });
});

test("a bad or expired download token gets the help page, not the file", async () => {
  await withServer({ store: new SentStore(path.join(dir, "state4")), mailer: async () => {} }, async (base) => {
    const res = await fetch(`${base}/download?token=nope`);
    assert.equal(res.status, 410);
    assert.match(await res.text(), /support@example\.com/);
    assert.equal((await fetch(`${base}/anything`)).status, 404);
  });
});
