/* ui/icons.js — moved from app.js (F-RESTRUCTURE-01). */

export const icon = (name, cls = '') =>
  `<svg class="icon ${cls}" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;
