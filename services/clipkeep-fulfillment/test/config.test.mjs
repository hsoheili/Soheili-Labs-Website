import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../config.mjs";

const good = {
  STRIPE_WEBHOOK_SECRET: "whsec_abc", CLIPKEEP_PAYMENT_LINK_ID: "plink_abc", DOWNLOAD_TOKEN_SECRET: "a".repeat(64),
  DOWNLOAD_FILE: "/srv/clipkeep/ClipKeep.dmg", PUBLIC_BASE_URL: "https://downloads.example/", RESEND_API_KEY: "re_abc",
  FULFILLMENT_FROM_EMAIL: "ClipKeep <clipkeep@example.com>",
};

test("loads a complete configuration", () => {
  const config = loadConfig(good);
  assert.equal(config.publicBaseUrl, "https://downloads.example");
  assert.equal(config.port, 3202);
  assert.equal(config.host, "127.0.0.1");
});

test("refuses to start with template placeholders still in place", () => {
  assert.throws(() => loadConfig({ ...good, STRIPE_WEBHOOK_SECRET: "whsec_replace_me", RESEND_API_KEY: "re_replace_me" }), /STRIPE_WEBHOOK_SECRET, RESEND_API_KEY/);
});

test("names missing settings without printing any values", () => {
  assert.throws(() => loadConfig({ ...good, RESEND_API_KEY: "" }), (error) => /RESEND_API_KEY/.test(error.message) && !/whsec_abc/.test(error.message));
});
