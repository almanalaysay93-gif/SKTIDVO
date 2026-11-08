/* router.js — moved from app.js (F-RESTRUCTURE-01). */

import { syncInstallUi, syncPersistUi } from './features/install.js';
import { t } from './i18n.js';
import { $, $$ } from './ui/format.js';
import { Diet } from './views/diet.js';
import { viewFluid } from './views/fluid.js';
import { viewMeds } from './views/meds.js';
import { viewSession } from './views/session.js';
import { viewSettings } from './views/settings.js';
import { viewToday } from './views/today.js';
import { viewWeight } from './views/weight.js';
import { viewWelcome } from './views/welcome.js';

export let view = 'today';

export function setView(v) { view = v; }

export const VIEWS = {
  today:    { render: viewToday,    title: 'today.title'    },
  fluid:    { render: viewFluid,    title: 'fluid.title'    },
  weight:   { render: viewWeight,   title: 'weight.title'   },
  meds:     { render: viewMeds,     title: 'meds.title'     },
  session:  { render: viewSession,  title: 'session.title'  },
  diet:     { render: () => Diet.viewDiet(), title: 'diet.title' },
  settings: { render: viewSettings, title: 'settings.title' },
  welcome:  { render: viewWelcome,  title: 'welcome.title'  }
};

export function go(name) {
  view = VIEWS[name] ? name : 'today';
  location.hash = '#' + view;
  render();
  // Move SR focus to content on route change, but don't let the browser's
  // default focus-scroll shove the new view under the sticky gear button —
  // main always starts the view at the top already.
  $('#main').focus({ preventScroll: true });
  scrollTo(0, 0);
}

export function render() {
  const v = VIEWS[view];
  $('#main').innerHTML = v.render();
  // No app bar to retitle — the document title carries the view name for
  // tab labels and screen-reader announcements instead.
  document.title = `${t(v.title)} — ${t('app.name')}`;

  $$('.nav__item').forEach(b => {
    const active = b.dataset.go === view;
    b.setAttribute('aria-current', active ? 'page' : 'false');
    b.querySelector('span').textContent = t('nav.' + b.dataset.go);
  });
  $('#btnSettings').setAttribute('aria-label', t('settings.title'));

  // Settings-only widgets; both no-op on other views.
  syncInstallUi();
  syncPersistUi();
}
