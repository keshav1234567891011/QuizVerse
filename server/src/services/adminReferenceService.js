import { fail } from "./groupService.js";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const types = ["quiz", "attempt"];
const key = () => {
  if (!/^[a-f0-9]{64}$/i.test(process.env.ADMIN_REFERENCE_SECRET || "")) throw new Error("Admin reference configuration unavailable.");
  return Buffer.from(process.env.ADMIN_REFERENCE_SECRET, "hex");
};
// UUIDs stay stable; legacy references use authenticated encryption, without
// writing historical records. References never confer authorization.
export function resourceReference(row, type = "quiz") {
  if (!types.includes(type)) throw new Error("Invalid resource type.");
  if (row.publicId) return row.publicId;
  const id = String(row._id);
  if (!/^[a-f0-9]{24}$/i.test(id)) throw new Error("Invalid internal resource reference.");
  const prefix = `v1.${type}`, iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(prefix));
  const ciphertext = Buffer.concat([cipher.update(id, "utf8"), cipher.final()]);
  return `${prefix}.${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url")}`;
}
export function referenceFilter(value, type = "quiz") {
  if (typeof value !== "string") fail(400, "Invalid resource reference.");
  if (uuid.test(value)) return { publicId: value.toLowerCase() };
  if (!types.includes(type)) fail(400, "Invalid resource reference.");
  const prefix = `v1.${type}.`;
  if (!value.startsWith(prefix) || !/^[A-Za-z0-9_-]{70}$/.test(value.slice(prefix.length))) fail(400, "Invalid resource reference.");
  const secret = key();
  try {
    const bytes = Buffer.from(value.slice(prefix.length), "base64url");
    if (bytes.length !== 52 || bytes.toString("base64url") !== value.slice(prefix.length)) fail(400, "Invalid resource reference.");
    const cipher = createDecipheriv("aes-256-gcm", secret, bytes.subarray(0, 12));
    cipher.setAAD(Buffer.from(`v1.${type}`)); cipher.setAuthTag(bytes.subarray(12, 28));
    const id = Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString("utf8");
    if (!/^[a-f0-9]{24}$/i.test(id)) fail(400, "Invalid resource reference.");
    return { _id: id };
  } catch { fail(400, "Invalid resource reference."); }
}
