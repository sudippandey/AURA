// Zod-style schemas (dependency-free): each returns an errors object ({} = valid).
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const v = {
  required: (s) => String(s ?? "").trim().length > 0,
  email: (s) => emailRe.test(String(s || "").trim()),
  min: (s, n) => String(s || "").length >= n,
};
export function validateLogin({ email, password }) {
  const e = {};
  if (!v.email(email)) e.email = "Enter a valid email address.";
  if (!v.min(password, 6)) e.password = "Password must be at least 6 characters.";
  return e;
}
export function validateRegister({ name, email, password }) {
  const e = validateLogin({ email, password });
  if (!v.required(name)) e.name = "Please enter your name.";
  if (!v.min(password, 8)) e.password = "Use at least 8 characters.";
  return e;
}
export function validateCheckout(d) {
  const e = {};
  if (!v.required(d.firstName)) e.firstName = "Required.";
  if (!v.required(d.lastName)) e.lastName = "Required.";
  if (!v.email(d.email)) e.email = "Enter a valid email.";
  if (!v.required(d.address)) e.address = "Enter your street address.";
  if (!v.required(d.city)) e.city = "Required.";
  if (!v.required(d.zip)) e.zip = "Required.";
  if (!v.required(d.country)) e.country = "Required.";
  if (d.payMethod === "card") {
    if (String(d.cardNum || "").replace(/\D/g, "").length < 15) e.cardNum = "Enter a valid card number.";
    if (!v.required(d.cardName)) e.cardName = "Name on card required.";
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(String(d.exp || ""))) e.exp = "Use MM/YY.";
    if (!/^\d{3,4}$/.test(String(d.cvc || ""))) e.cvc = "3–4 digits.";
  }
  return e;
}
export function validateContact({ name, email, message }) {
  const e = {};
  if (!v.required(name)) e.name = "Please enter your name.";
  if (!v.email(email)) e.email = "Enter a valid email.";
  if (!v.min(message, 10)) e.message = "Tell us a little more (10+ characters).";
  return e;
}
export function validateAddress(a) {
  const e = {};
  if (!v.required(a.label)) e.label = "Label required (e.g. Home).";
  if (!v.required(a.address)) e.address = "Street address required.";
  if (!v.required(a.city)) e.city = "City required.";
  if (!v.required(a.zip)) e.zip = "ZIP required.";
  return e;
}
