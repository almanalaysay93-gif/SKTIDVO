/* ui/theme.js — moved from app.js (F-RESTRUCTURE-01). */

// Light-only theme: any stored profile.theme value is ignored (kept in the
// profile so old backups still validate).
export function applyTheme() {
  document.documentElement.removeAttribute('data-theme');
}
