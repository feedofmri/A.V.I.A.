import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
function key() {
  return createHash("sha256")
    .update(
      process.env.JOURNAL_KEY ??
        "avia-local-demo-journal-key-change-before-sharing",
    )
    .digest();
}
export function seal(value: unknown): string {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    iv.toString("base64"),
    data.toString("base64"),
    cipher.getAuthTag().toString("base64"),
  ].join(".");
}
export function unseal<T = any>(value: string): T {
  const [iv, data, tag] = value.split("."),
    cipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  cipher.setAuthTag(Buffer.from(tag, "base64"));
  return JSON.parse(
    Buffer.concat([
      cipher.update(Buffer.from(data, "base64")),
      cipher.final(),
    ]).toString("utf8"),
  ) as T;
}
export function journalPlaintext(value: string): string {
  const [iv, data, tag] = value.split("."),
    cipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  cipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    cipher.update(Buffer.from(data, "base64")),
    cipher.final(),
  ]).toString("utf8");
}
