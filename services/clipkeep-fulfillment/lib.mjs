import crypto from "node:crypto";

// Stripe signs each webhook as HMAC-SHA256("<timestamp>.<raw body>") and
// sends the result in the Stripe-Signature header. Verifying it is what stops
// anyone who finds the URL from minting download links for free.
export function verifyStripeSignature(rawBody, header, secret, { toleranceSeconds = 300, now = Date.now() } = {}) {
  if (!header || !secret) return false;
  let timestamp = null;
  const signatures = [];
  for (const part of String(header).split(",")) {
    const [key, value] = part.split("=", 2);
    if (key === "t") timestamp = Number(value);
    else if (key === "v1" && value) signatures.push(value);
  }
  if (!Number.isFinite(timestamp) || signatures.length === 0) return false;
  if (Math.abs(now / 1000 - timestamp) > toleranceSeconds) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest();
  return signatures.some((candidate) => {
    const given = Buffer.from(candidate, "hex");
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}

const FULFILLING_EVENTS = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded"]);

// Returns the purchase to fulfil, or null when the event is not a paid
// ClipKeep order. Other products on the same Stripe account send events to the
// same endpoint, so the payment link is what identifies a ClipKeep sale.
export function purchaseFromEvent(event, paymentLinkId) {
  if (!event || !FULFILLING_EVENTS.has(event.type)) return null;
  const session = event.data?.object;
  if (!session || session.object !== "checkout.session") return null;
  if (!paymentLinkId || session.payment_link !== paymentLinkId) return null;
  if (session.mode !== "payment" || session.payment_status !== "paid") return null;
  const email = session.customer_details?.email || session.customer_email;
  if (!email) return null;
  return { sessionId: session.id, email, name: session.customer_details?.name || "" };
}

const b64 = (buffer) => Buffer.from(buffer).toString("base64url");

export function makeDownloadToken(sessionId, secret, { days = 14, now = Date.now() } = {}) {
  const payload = b64(JSON.stringify({ s: sessionId, e: Math.floor(now / 1000) + days * 86400 }));
  const signature = b64(crypto.createHmac("sha256", secret).update(payload).digest());
  return `${payload}.${signature}`;
}

// Returns { sessionId } for a valid, unexpired token, otherwise null.
export function readDownloadToken(token, secret, { now = Date.now() } = {}) {
  if (typeof token !== "string" || !secret) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest();
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  let data;
  try { data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { return null; }
  if (typeof data?.s !== "string" || !Number.isFinite(data?.e)) return null;
  if (data.e < now / 1000) return null;
  return { sessionId: data.s };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function downloadEmail({ name, downloadUrl, days, supportEmail }) {
  const greeting = name ? `Hi ${name.split(/\s+/)[0]},` : "Hi,";
  const text = [
    greeting,
    "",
    "Thank you for buying a ClipKeep Founding License. You're one of ClipKeep's founders.",
    "",
    "Download ClipKeep for macOS:",
    downloadUrl,
    "",
    `This link works for ${days} days. Open the downloaded file and drag ClipKeep into your Applications folder.`,
    "Your founding license includes every future ClipKeep update.",
    "",
    `Questions, a new link, or a refund request: ${supportEmail}`,
    "",
    "Soheili Labs",
  ].join("\n");
  const html = `<p>${escapeHtml(greeting)}</p>
<p>Thank you for buying a ClipKeep Founding License. You&rsquo;re one of ClipKeep&rsquo;s founders.</p>
<p><a href="${escapeHtml(downloadUrl)}" style="display:inline-block;padding:12px 20px;background:#0a6cff;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Download ClipKeep for macOS</a></p>
<p>This link works for ${days} days. Open the downloaded file and drag ClipKeep into your Applications folder. Your founding license includes every future ClipKeep update.</p>
<p>Questions, a new link, or a refund request: <a href="mailto:${escapeHtml(supportEmail)}">${escapeHtml(supportEmail)}</a></p>
<p>Soheili Labs</p>`;
  return { subject: "Your ClipKeep download", text, html };
}
