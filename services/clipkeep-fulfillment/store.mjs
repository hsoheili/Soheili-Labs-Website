import fs from "node:fs";
import path from "node:path";

// One line per state change, appended: { sessionId, email, name, status, at }.
// status is "pending" (paid while ClipKeep was on pre-order; the download
// email is still owed) or "sent" (the download email went out). Stripe retries
// a webhook until it gets a 2xx and can deliver an event twice, so any record
// for a session means that sale was already handled.
export class SentStore {
  constructor(dir) {
    this.file = path.join(dir, "fulfilled-sessions.jsonl");
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.records = new Map();
    if (fs.existsSync(this.file)) {
      for (const line of fs.readFileSync(this.file, "utf8").split("\n")) {
        if (!line.trim()) continue;
        try {
          const record = JSON.parse(line);
          this.records.set(record.sessionId, { status: "sent", ...record });
        } catch { /* skip a torn line */ }
      }
    }
  }

  has(sessionId) {
    return this.records.has(sessionId);
  }

  pending() {
    return [...this.records.values()].filter((record) => record.status === "pending");
  }

  add(record) {
    const entry = { status: "sent", ...record, at: new Date().toISOString() };
    fs.appendFileSync(this.file, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
    this.records.set(entry.sessionId, entry);
  }
}
