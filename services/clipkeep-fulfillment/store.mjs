import fs from "node:fs";
import path from "node:path";

// Stripe retries a webhook until it gets a 2xx, and can deliver the same event
// more than once. Recording each fulfilled Checkout Session keeps a buyer from
// receiving the email twice. The file is small: one line per sale.
export class SentStore {
  constructor(dir) {
    this.file = path.join(dir, "fulfilled-sessions.jsonl");
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.ids = new Set();
    if (fs.existsSync(this.file)) {
      for (const line of fs.readFileSync(this.file, "utf8").split("\n")) {
        if (!line.trim()) continue;
        try { this.ids.add(JSON.parse(line).sessionId); } catch { /* skip a torn line */ }
      }
    }
  }

  has(sessionId) {
    return this.ids.has(sessionId);
  }

  add(record) {
    fs.appendFileSync(this.file, `${JSON.stringify({ ...record, at: new Date().toISOString() })}\n`, { mode: 0o600 });
    this.ids.add(record.sessionId);
  }
}
