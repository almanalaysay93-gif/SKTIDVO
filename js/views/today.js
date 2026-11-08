/* views/today.js — moved from app.js (F-RESTRUCTURE-01). */

import * as S from '../store.js';
import { glassWord, t } from '../i18n.js';
import { fluidWeekChart, medsTodayChart, sessionUfChart, weightTrendChart } from '../ui/charts.js';
import { esc, localeTag, nf } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { Diet } from './diet.js';
import { isIos, isStandalone, shouldShowA2hs, shouldShowBackupReminder } from '../features/install.js';

/* T033 banners. signedIn stays false until T059 wires the sync state. */
export function reminderBanners(now = Date.now()) {
  let out = '';
  if (shouldShowA2hs({ ios: isIos(), standalone: isStandalone(), dismissed: S.isA2hsDismissed() })) {
    out += `<p class="banner" id="a2hsBanner">${icon('download')}<span>${esc(t('a2hs.ios'))}</span>
      <button type="button" class="row__btn" id="btnA2hsDismiss" aria-label="${esc(t('a2hs.dismiss'))}">${icon('x')}</button></p>`;
  }
  const hasData = S.getWeights().length + S.getSessions().length + S.getIntake().length > 0;
  if (shouldShowBackupReminder({ lastBackupAt: S.getLastBackupAt(), now, hasData })) {
    out += `<p class="banner" id="backupBanner">${icon('alert')}<span>${esc(t('backup.reminder'))}</span>
      <button type="button" class="row__btn" id="btnExport" aria-label="${esc(t('backup.now'))}">${icon('download')}</button></p>`;
  }
  return out;
}

export let calCursor = new Date();   // month currently shown on Today's calendar
export function setCalCursor(d) { calCursor = d; }

export function statusCard() {
  const w = S.todayWeight();
  const last = S.lastSession();

  if (!last) return emptyStatus('today.noBaseline', 'today.noBaselineMsg', 'session');
  if (!w)    return emptyStatus('today.noWeight',   'today.noWeightMsg',   'weigh');

  const gain  = S.idwgKg();
  const limit = S.effectiveLimitKg();
  const b     = S.band();
  const gap   = S.gapDays();
  const pct   = Math.min(100, Math.max(0, (gain / limit) * 100));
  const badge = { ok: 'check-circle', warn: 'alert', danger: 'alert-octagon' }[b];

  const advice = b === 'danger' ? t('band.dangerAdvice')
               : b === 'warn'   ? t('band.warnAdvice')
               : null;

  return `
  <section class="status status--${b}" aria-labelledby="statusMsg">
    <p class="status__badge">${icon(badge)}<span>${esc(t('band.' + b))}</span></p>

    <p class="status__num tnum">
      ${gain > 0 ? '+' : ''}${nf(gain, 1)}<span class="status__unit"> ${esc(t('common.kg'))}</span>
    </p>
    <p class="status__label">${esc(t('today.gainLabel'))}${gap ? ` · ${gap}d` : ''}</p>

    <div class="meter meter--${b}">
      <div class="meter__track">
        <div class="meter__fill" style="width:${pct}%"
             role="progressbar" aria-valuenow="${nf(gain, 1)}" aria-valuemin="0"
             aria-valuemax="${nf(limit, 1)}"
             aria-label="${esc(t('today.gainLabel'))}"></div>
      </div>
      <p class="meter__scale">
        <span>0 kg</span>
        <span class="tnum">${esc(t('today.limitLabel'))}: ${nf(limit, 1)} kg</span>
      </p>
    </div>

    <p class="status__msg" id="statusMsg">${esc(t('band.' + b + 'Msg'))}</p>
    ${advice ? `<p class="status__advice">${icon('info')}<span>${esc(advice)}</span></p>` : ''}
  </section>`;
}

/** action is 'session' or 'weigh' — resolved by the delegated click handler. */
export function emptyStatus(titleKey, msgKey, action) {
  const label = action === 'session' ? t('session.addBtn') : t('today.weighBtn');
  return `
  <section class="status status--empty">
    <p class="status__badge">${icon('info')}<span>${esc(t(titleKey))}</span></p>
    <p class="status__msg">${esc(t(msgKey))}</p>
    <div style="margin-top:var(--s-4)">
      <button type="button" class="btn btn--primary" data-empty-action="${action}">
        ${icon('plus')}<span>${esc(label)}</span>
      </button>
    </div>
  </section>`;
}

export function fluidLine() {
  const left = S.fluidLeftMl();
  if (left == null) return '';
  const glasses = S.glassesLeft();
  const over = left < 0;
  return `
  <div class="card">
    <div class="card__head">${icon('droplet')}<h2>${esc(t('fluid.title'))}</h2></div>
    <div class="stats">
      <div class="stat">
        <span class="stat__val tnum" style="color:${over ? 'var(--danger)' : 'inherit'}">
          ${Math.abs(left)}<small> ${esc(t('common.ml'))}</small>
        </span>
        <p class="stat__key">${over ? icon('alert', 'stat__alert') + ' ' : ''}${esc(over ? t('fluid.over') : t('fluid.left'))}</p>
      </div>
      <div class="stat">
        <span class="stat__val tnum">${S.todayIntakeMl()}<small> ${esc(t('common.ml'))}</small></span>
        <p class="stat__key">${esc(t('fluid.logTitle'))}</p>
      </div>
    </div>
    <p class="status__msg" style="margin-top:var(--s-4);font-size:var(--t-lg)">
      ${over || glasses === 0
        ? esc(t('fluid.noneLeft'))
        : `<strong class="tnum">${glasses}</strong> ${esc(glassWord(glasses))}`}
    </p>
  </div>`;
}

/** "Today" / "Tomorrow" / "N days from now" — the forward-looking twin
    of relDay(), which only handles dates already in the past. */
export function nextHdLabel() {
  const next = S.nextSessionDate();
  if (!next) return '—';
  const days = S.daysBetween(S.dayKey(), S.dayKey(next));
  if (days === 0) return t('session.today');
  if (days === 1) return t('reminder.tomorrow');
  return `${days} ${t('reminder.daysFromNow')}`;
}

/** A tappable summary card. `go` is a view name — clicking it hands off
    to the tab that owns the actual feature, via the router's existing
    [data-go] handling. `big` may carry pre-built markup (tnum spans),
    so it is not escaped here; callers are responsible for esc()ing any
    raw text before interpolating it in. */
export function reminderCard({ go, iconName, tone, title, big, sub, tile = false }) {
  if (tile) {
    return `
    <button type="button" class="reminder reminder--tile" data-go="${go}">
      <span class="reminder__icon${tone ? ` reminder__icon--${tone}` : ''}">${icon(iconName)}</span>
      <span class="reminder__title">${esc(title)}</span>
      <span class="reminder__big">${big}</span>
      ${sub ? `<span class="reminder__sub">${esc(sub)}</span>` : ''}
    </button>`;
  }
  return `
  <button type="button" class="reminder" data-go="${go}">
    <span class="reminder__icon${tone ? ` reminder__icon--${tone}` : ''}">${icon(iconName)}</span>
    <span class="reminder__body">
      <span class="reminder__title">${esc(title)}</span>
      <span class="reminder__big">${big}</span>
      ${sub ? `<span class="reminder__sub">${esc(sub)}</span>` : ''}
    </span>
    ${icon('chevron-right', 'reminder__chev')}
  </button>`;
}

export function fluidReminder() {
  const left = S.fluidLeftMl();
  const consumed = S.todayIntakeMl();
  if (left == null) {
    return reminderCard({
      go: 'fluid', iconName: 'droplet', title: t('fluid.title'),
      big: `${consumed}<small style="font-size:var(--t-sm);font-weight:600;color:var(--fg-muted)"> ${esc(t('common.ml'))}</small>`,
      sub: t('fluid.logTitle'), tile: true
    });
  }
  const over = left < 0;
  const glasses = S.glassesLeft();
  return reminderCard({
    // FR006 / theme rule 5: over-limit = alert icon + text label, never colour alone.
    go: 'fluid', iconName: over ? 'alert' : 'droplet', tone: over ? 'danger' : undefined,
    title: t('fluid.title'),
    big: `${consumed}<small style="font-size:var(--t-sm);font-weight:600;color:var(--fg-muted)"> / ${S.getProfile().allowanceMl} ${esc(t('common.ml'))}</small>`,
    sub: over ? `${Math.abs(left)} ${t('common.ml')} ${t('fluid.over')} · ${t('fluid.noneLeft')}`
              : `${glasses} ${esc(glassWord(glasses))}`,
    tile: true
  });
}

export function weightReminder() {
  const w = S.todayWeight();
  return reminderCard({
    go: 'weight', iconName: 'scale',
    title: t('weight.entryTitle'),
    big: w
      ? `${nf(w.kg, 1)}<small style="font-size:var(--t-sm);font-weight:600;color:var(--fg-muted)"> ${esc(t('common.kg'))}</small>`
      : `<span style="font-size:var(--t-md);color:var(--fg-muted)">—</span>`,
    sub: w ? undefined : t('reminder.notWeighedYet'),
    tile: true
  });
}

export function nextHdReminder() {
  const p = S.getProfile();
  return reminderCard({
    go: 'session', iconName: 'calendar',
    title: t('session.nextDue'),
    big: esc(nextHdLabel()),
    sub: `${p.schedule} · ${p.sessionTime}${p.stationNo ? ` · Station ${p.stationNo}` : ''}`
  });
}

/* ---------- Today: trend charts ----------
   One small chart per other tab (Fluid, Weight, Meds, Dialysis) so Today
   is a dashboard of the whole app, not just the gain number. Every chart
   is a plain SVG built by hand — same offline-first rule as sparkline()
   below — and every card is tappable straight through to the tab that
   owns the real data (data-go, handled by the existing router). */

/** Month calendar: dialysis days tinted, today ringed, logged sessions
    dotted. Read-only overview — only the month-nav arrows are tappable,
    so there's no ambiguity about what tapping a past/future day would
    do. calCursor is module state so prev/next survives re-render. */
export function calendarCard() {
  const schedDays = S.scheduleDays();
  const sessionDays = new Set(S.getSessions().map(s => s.day));
  const todayKey = S.dayKey();

  const year = calCursor.getFullYear();
  const month = calCursor.getMonth();
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthLabel = new Intl.DateTimeFormat(localeTag(), { month: 'long', year: 'numeric' }).format(first);
  // 2023-01-01 is a Sunday — just a stable anchor to read Sun..Sat labels off of.
  const weekdayFmt = new Intl.DateTimeFormat(localeTag(), { weekday: 'narrow' });
  const heads = [...Array(7)].map((_, i) =>
    `<span>${esc(weekdayFmt.format(new Date(2023, 0, 1 + i)))}</span>`).join('');

  const cells = [];
  for (let i = 0; i < first.getDay(); i++) cells.push('<span class="cal__cell cal__cell--pad"></span>');
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const key = S.dayKey(date);
    const cls = ['cal__cell',
      schedDays.includes(date.getDay()) ? 'cal__cell--sched' : '',
      key === todayKey ? 'cal__cell--today' : ''
    ].filter(Boolean).join(' ');
    cells.push(`<span class="${cls}">${d}${sessionDays.has(key) ? '<i class="cal__dot"></i>' : ''}</span>`);
  }

  return `
  <div class="card">
    <div class="cal__head">
      <h2>${esc(monthLabel)}</h2>
      <div class="cal__nav">
        <button type="button" class="cal__navbtn" data-cal-nav="-1" aria-label="${esc(t('common.prevMonth'))}">
          ${icon('chevron-right', 'cal__navicon--prev')}
        </button>
        <button type="button" class="cal__navbtn" data-cal-nav="1" aria-label="${esc(t('common.nextMonth'))}">
          ${icon('chevron-right')}
        </button>
      </div>
    </div>
    <div class="cal__grid cal__grid--head">${heads}</div>
    <div class="cal__grid">${cells.join('')}</div>
    <div class="chart-legend">
      <span><i style="background:var(--brand-tint-2)"></i>${esc(t('today.calSchedDay'))}</span>
      <span><i class="chart-legend__dot" style="background:var(--brand-dark)"></i>${esc(t('today.calLogged'))}</span>
    </div>
  </div>`;
}

export function trendsSection() {
  const cards = [fluidWeekChart(), weightTrendChart(), medsTodayChart(), sessionUfChart()]
    .filter(Boolean);
  if (!cards.length) return '';
  return `
  <h2 class="section-title">${esc(t('today.trends'))}</h2>
  ${cards.join('')}`;
}

export function viewToday() {
  // Uncalibrated scales silently bias every gain figure, so nudge once
  // there is a baseline to calibrate against.
  const nudge = (S.lastSession() && !S.isCalibrated())
    ? `<p class="banner">${icon('alert')}<span>${esc(t('scale.nudge'))}</span>
         <button type="button" class="row__btn" id="btnCalibrate"
                 aria-label="${esc(t('scale.calibrate'))}">${icon('scale')}</button></p>`
    : '';
  // No dialysis logged yet means there is no baseline to show a gain
  // against — that prompt now lives solely on the Dialysis tab (where
  // the "Record a dialysis" action actually is) so it isn't duplicated
  // here. Once a session exists, statusCard() takes over as normal,
  // including its own "weigh in today" empty state.
  const status = S.lastSession() ? statusCard() : '';
  return `
  <div class="view view--today">
    <div class="today-col today-col--main">
      ${reminderBanners()}
      ${nudge}
      ${status}
      <div class="today-grid-2">
        ${fluidReminder()}
        ${weightReminder()}
      </div>
      ${Diet.todayCard()}
    </div>
    <div class="today-col today-col--side">
      ${nextHdReminder()}
      ${calendarCard()}
      ${trendsSection()}
    </div>
  </div>`;
}
