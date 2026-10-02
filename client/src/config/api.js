import { resolveApiBase } from "./apiBase.js";
export const API_URL = resolveApiBase(import.meta.env.VITE_API_URL, import.meta.env.PROD);
