import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyStripeSignature, purchaseFromEvent, makeDownloadToken, readDownloadToken, downloadEmail } from "../lib.mjs";

const secret = "whsec_test_secret";
const sign = (body, t, key = secret) => `t=${t},v1=${crypto.createHmac("sha256", key).update(`${t}.${body}`).digest("hex")}`;

test("accepts a correctly signed, fresh webhook", () => {
  const now = Date.now();
  const t = Math.floor(now / 1000);
  assert.equal(verifyStripeSignature('{"a":1}', sign('{"a":1}', t), secret, { now }), true);
});

test("rejects a tampered body, a wrong secret, and a stale timestamp", () => {
  const now = Date.now();
  const t = Math.floor(now / 1000);
  assert.equal(verifyStripeSignature('{"a":2}', sign('{"a":1}', t), secret, { now }), false);
  assert.equal(verifyStripeSignature('{"a":1}', sign('{"a":1}', t, "whsec_other"), secret, { now }), false);
  assert.equal(verifyStripeSignature('{"a":1}', sign('{"a":1}', t - 3600), secret, { now }), false);
  assert.equal(verifyStripeSignature('{"a":1}', undefined, secret, { now }), false);
  assert.equal(verifyStripeSignature('{"a":1}', "t=abc,v1=zz", secret, { now }), false);
});

function session(overrides = {}) {
  return {
    type: "checkout.session.completed",
    data: { object: { object: "checkout.session", id: "cs_1", mode: "payment", payment_status: "paid", payment_link: "plink_clip", customer_details: { email: "buyer@example.com", name: "Ada Lovelace" }, ...overrides } },
  };
}

test("fulfils only a paid ClipKeep payment-link checkout", () => {
  assert.deepEqual(purchaseFromEvent(session(), "plink_clip"), { sessionId: "cs_1", email: "buyer@example.com", name: "Ada Lovelace" });
  assert.equal(purchaseFromEvent(session({ payment_link: "plink_other" }), "plink_clip"), null);
  assert.equal(purchaseFromEvent(session({ payment_status: "unpaid" }), "plink_clip"), null);
  assert.equal(purchaseFromEvent(session({ mode: "subscription" }), "plink_clip"), null);
  assert.equal(purchaseFromEvent({ ...session(), type: "invoice.paid" }, "plink_clip"), null);
  assert.equal(purchaseFromEvent(session({ customer_details: {} }), "plink_clip"), null);
  assert.equal(purchaseFromEvent(session(), ""), null);
});

test("delayed payment methods are fulfilled when the payment succeeds", () => {
  assert.ok(purchaseFromEvent({ ...session(), type: "checkout.session.async_payment_succeeded" }, "plink_clip"));
});

test("download tokens round-trip, expire, and cannot be forged", () => {
  const key = "k".repeat(40);
  const now = Date.now();
  const token = makeDownloadToken("cs_1", key, { days: 14, now });
  assert.deepEqual(readDownloadToken(token, key, { now }), { sessionId: "cs_1" });
  assert.equal(readDownloadToken(token, key, { now: now + 15 * 86400 * 1000 }), null);
  assert.equal(readDownloadToken(token, "x".repeat(40), { now }), null);
  const [payload, signature] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ s: "cs_other", e: 9e9 })).toString("base64url");
  assert.equal(readDownloadToken(`${forged}.${signature}`, key, { now }), null);
  assert.equal(readDownloadToken(`${payload}.${signature}.x`, key, { now }), null);
  assert.equal(readDownloadToken("", key, { now }), null);
});

test("the email carries the link and escapes the buyer's name in HTML", () => {
  const message = downloadEmail({ name: "<b>Eve</b> X", downloadUrl: "https://d.example/download?token=a.b", days: 14, supportEmail: "support@example.com" });
  assert.match(message.text, /https:\/\/d\.example\/download\?token=a\.b/);
  assert.match(message.text, /14 days/);
  assert.doesNotMatch(message.html, /<b>Eve<\/b>/);
});
