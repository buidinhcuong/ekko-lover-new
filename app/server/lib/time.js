/**
 * All streak maths runs on calendar days in the user's timezone (Vietnam by
 * default), never on UTC timestamps. A user finishing a lesson at 23:50 and
 * another at 00:10 must be two different streak days.
 */
export const APP_TZ = process.env.EKKO_TZ || 'Asia/Ho_Chi_Minh';

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** `YYYY-MM-DD` for the given instant in app timezone. */
export function dayKey(date = new Date()) {
  return formatter.format(date);
}

export function monthKey(date = new Date()) {
  return dayKey(date).slice(0, 7);
}

/** Whole days between two `YYYY-MM-DD` keys (b - a). */
export function daysBetween(a, b) {
  const toUtc = (k) => {
    const [y, m, d] = k.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86400000);
}

export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday. Vietnamese weeks start on Monday. */
export function weekdayIndex(key) {
  const [y, m, d] = key.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export const startOfWeek = (key) => addDays(key, -weekdayIndex(key));
export const endOfWeek = (key) => addDays(startOfWeek(key), 6);
export const startOfMonth = (key) => `${key.slice(0, 7)}-01`;

/** Shifts a `YYYY-MM` month key by `delta` calendar months. */
export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

export function endOfMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export const nowIso = () => new Date().toISOString();

/** Vietnamese dong formatting, e.g. 12.000.000d */
export function formatVnd(amount, lang = 'vi') {
  // Tiền vẫn là VNĐ ở cả hai ngôn ngữ; chỉ dấu phân cách nghìn đổi theo tiếng.
  const locale = lang === 'en' ? 'en-US' : 'vi-VN';
  return `${Math.round(Number(amount) || 0).toLocaleString(locale)}đ`;
}

/** "2026-09" → "Tháng 9/2026" hoặc "September 2026". */
export function formatMonth(month, lang = 'vi') {
  const [y, m] = String(month || '').split('-');
  if (!y || !m) return String(month || '');
  if (lang === 'en') {
    return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(Number(y), Number(m) - 1, 1)));
  }
  return `Tháng ${Number(m)}/${y}`;
}
