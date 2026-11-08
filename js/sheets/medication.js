/* sheets/medication.js — moved from app.js (F-RESTRUCTURE-01). */

import * as S from '../store.js';
import { t } from '../i18n.js';
import { $, esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { closeSheet, openSheet } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';

export function sheetMedication(medId) {
  const list = S.getMedications();
  const cur = medId ? list.find(m => m.id === medId) : null;

  openSheet({
    title: cur ? t('meds.sheetTitle') : t('meds.addBtn'),
    body: `
      <div class="form-group">
        <label for="mName">${esc(t('meds.name'))} <span class="req">*</span></label>
        <input class="input" id="mName" type="text" value="${esc(cur ? cur.name : '')}" placeholder="e.g. Calcium Carbonate">
      </div>
      <div class="form-group">
        <label for="mDose">${esc(t('meds.dose'))} <span class="req">*</span></label>
        <input class="input" id="mDose" type="text" value="${esc(cur ? cur.dose : '')}" placeholder="e.g. 500mg (1 tablet)">
      </div>
      <div class="form-group">
        <label for="mTiming">${esc(t('meds.timing'))}</label>
        <select class="input" id="mTiming">
          <option value="meals" ${cur?.timing === 'meals' ? 'selected' : ''}>${esc(t('meds.meals'))}</option>
          <option value="morning" ${cur?.timing === 'morning' ? 'selected' : ''}>${esc(t('meds.morning'))}</option>
          <option value="afternoon" ${cur?.timing === 'afternoon' ? 'selected' : ''}>${esc(t('meds.afternoon'))}</option>
          <option value="evening" ${cur?.timing === 'evening' ? 'selected' : ''}>${esc(t('meds.evening'))}</option>
          <option value="bedtime" ${cur?.timing === 'bedtime' ? 'selected' : ''}>${esc(t('meds.bedtime'))}</option>
          <option value="dialysis_days" ${cur?.timing === 'dialysis_days' ? 'selected' : ''}>${esc(t('meds.dialysisDays'))}</option>
        </select>
      </div>
      <div class="form-group">
        <label for="mNotes">${esc(t('meds.notes'))}</label>
        <input class="input" id="mNotes" type="text" value="${esc(cur ? cur.notes : '')}" placeholder="e.g. Take with first bite of food">
      </div>
      <div class="form-group" style="display:flex;align-items:center;gap:var(--s-2)">
        <input type="checkbox" id="mHold" ${cur?.holdOnDialysis ? 'checked' : ''}>
        <label for="mHold" style="margin:0">${esc(t('meds.holdAlert'))}</label>
      </div>
      <div style="display:flex;gap:var(--s-3)">
        ${cur ? `<button type="button" class="btn btn--danger" id="mDel" style="flex:1">${icon('trash')}<span>${esc(t('common.delete'))}</span></button>` : ''}
        <button type="button" class="btn btn--primary" id="mSave" style="flex:2">${icon('check')}<span>${esc(t('common.save'))}</span></button>
      </div>`,
    onMount(sheet) {
      $('#mSave', sheet).addEventListener('click', () => {
        const name = $('#mName', sheet).value.trim();
        const dose = $('#mDose', sheet).value.trim();
        if (!name || !dose) { toast('Please enter name and dose.'); return; }
        S.saveMedication({
          id: cur ? cur.id : null,
          name,
          dose,
          timing: $('#mTiming', sheet).value,
          notes: $('#mNotes', sheet).value.trim(),
          holdOnDialysis: $('#mHold', sheet).checked,
          active: true
        });
        closeSheet();
        toast(t('settings.saved'));
      });
      if (cur) {
        $('#mDel', sheet)?.addEventListener('click', () => {
          S.deleteMedication(cur.id);
          closeSheet();
          toast(t('common.delete'));
        });
      }
    }
  });
}
