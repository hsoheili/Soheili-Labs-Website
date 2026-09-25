const required = [
  "STRIPE_WEBHOOK_SECRET",
  "CLIPKEEP_PAYMENT_LINK_ID",
  "DOWNLOAD_TOKEN_SECRET",
  "DOWNLOAD_FILE",
  "PUBLIC_BASE_URL",
  "RESEND_API_KEY",
  "FULFILLMENT_FROM_EMAIL",
];

export function loadConfig(env = process.env) {
  const missing = required.filter((name) => !env[name]?.trim());
  if (missing.length) throw new Error(`Missing required settings: ${missing.join(", ")}`);
  if (env.DOWNLOAD_TOKEN_SECRET.trim().length < 32) throw new Error("DOWNLOAD_TOKEN_SECRET must be at least 32 characters.");
  const days = Number(env.DOWNLOAD_LINK_DAYS || 14);
  return {
    host: env.HOST || "127.0.0.1",
    port: Number(env.PORT || 3202),
    webhookSecret: env.STRIPE_WEBHOOK_SECRET.trim(),
    paymentLinkId: env.CLIPKEEP_PAYMENT_LINK_ID.trim(),
    tokenSecret: env.DOWNLOAD_TOKEN_SECRET.trim(),
    downloadFile: env.DOWNLOAD_FILE.trim(),
    downloadFilename: (env.DOWNLOAD_FILENAME || "ClipKeep.dmg").trim(),
    publicBaseUrl: env.PUBLIC_BASE_URL.trim().replace(/\/$/, ""),
    linkDays: Number.isFinite(days) && days > 0 ? days : 14,
    resendApiKey: env.RESEND_API_KEY.trim(),
    fromEmail: env.FULFILLMENT_FROM_EMAIL.trim(),
    supportEmail: (env.SUPPORT_EMAIL || "support@soheililabs.com").trim(),
    notifyEmail: env.NOTIFY_EMAIL?.trim() || "",
    stateDir: (env.STATE_DIR || "/var/lib/clipkeep-fulfillment").trim(),
  };
}
