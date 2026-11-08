/* features/cal-export.js — moved from app.js (F-RESTRUCTURE-01). */

import * as S from '../store.js';
import * as Cal from '../calendar.js';
import { downloadFile } from './backup.js';
import { t } from '../i18n.js';
import { toast } from '../ui/toast.js';

export function calFile(name, text) {
  downloadFile(name, 'text/calendar;charset=utf-8', text);
  toast(t('cal.downloaded'));
}

export function calSchedule() {
  const p = S.getProfile();
  calFile('sktidvo-dialysis-schedule.ics', Cal.scheduleIcs({
    schedule: p.schedule,
    customDays: p.customDays,
    sessionTime: p.sessionTime,
    summary: t('cal.evDialysis'),
    alarmMinutesBefore: 120,
    alarmText: t('cal.alarmDialysis'),
    from: S.nextSessionDate() || new Date()
  }));
}

export function calWeighIn() {
  const p = S.getProfile();
  calFile('sktidvo-weigh-in.ics', Cal.weighInIcs({
    weighTime: p.weighTime,
    summary: t('cal.evWeigh'),
    description: t('cal.evWeighNote'),
    alarmMinutesBefore: 0,
    alarmText: t('cal.evWeigh')
  }));
}

export function calSessions() {
  const sessions = S.getSessions();
  if (!sessions.length) { toast(t('cal.noSessions')); return; }
  const p = S.getProfile();
  calFile('sktidvo-dialysis-log.ics', Cal.sessionsIcs({
    sessions,
    sessionTime: p.sessionTime,
    summary: t('cal.evDialysis'),
    labels: { post: t('cal.labelPost'), uf: t('cal.labelUf'), bp: t('cal.labelBp') }
  }));
}

export function calOpenGoogle() {
  const p = S.getProfile();
  const next = S.nextSessionDate();
  if (!next) return;
  // Title and time only — this query string travels to Google and lands
  // in browser history, so no weights or blood pressure go in it.
  const url = Cal.googleTemplateUrl({
    title: t('cal.evDialysis'),
    start: Cal.atTime(next, p.sessionTime),
    schedule: p.schedule,
    customDays: p.customDays
  });
  window.open(url, '_blank', 'noopener');
}
