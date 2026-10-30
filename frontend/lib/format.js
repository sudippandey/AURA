import { CONFIG } from "../config.js";
const fmt = new Intl.NumberFormat(CONFIG.LOCALE, { style: "currency", currency: CONFIG.CURRENCY });
export const money = (n) => fmt.format(Number(n || 0));
export const pctOff = (p) => (!p.originalPrice || p.originalPrice <= p.price ? 0 : Math.round((1 - p.price / p.originalPrice) * 100));
export const stars = (r) => "★★★★★".slice(0, Math.round(r)) + "☆☆☆☆☆".slice(0, 5 - Math.round(r));
export const prettyDate = (iso) => { try { return new Date(iso).toLocaleDateString(CONFIG.LOCALE, { year: "numeric", month: "short", day: "numeric" }); } catch { return iso; } };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
