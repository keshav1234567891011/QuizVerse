import { fail } from "./groupService.js";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
// New records use stable UUIDs. Legacy fallback exists only in the admin API;
// it is an identifier, never an authorization capability or a share link.
export const resourceReference = row => row.publicId || `legacy-${row._id}`;
export function referenceFilter(value) {
  if (typeof value !== "string") fail(400, "Invalid resource reference.");
  if (uuid.test(value)) return { publicId: value.toLowerCase() };
  if (/^legacy-[a-f0-9]{24}$/.test(value)) return { _id: value.slice(7) };
  fail(400, "Invalid resource reference.");
}
