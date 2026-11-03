// web/src/find.js
import { $, S, doc_, api, debounce, LH } from './state.js';
import { on } from './bus.js';
import { vp, showToast } from './ui.js';
import { render, paint } from './renderer.js';
import { centerLine } from './tabs.js';
import { revealEditRange } from './editview.js';
import { updateStatus } from './status.js';
import { mdview, previewing, findInPreview, showPreviewHit, clearPreviewMarks, previewHitOffsets, scrollPreviewTo } from './markdown.js';

export const findbar = $('#findbar');
export const findInput = $('#find-input');
const findCase = $('#find-case');
const replaceInput = $('#replace-input');
const replaceToggle = $('#find-replace-toggle');
const replaceOne = $('#replace-one');
const replaceAll = $('#replace-all');
const editArea = $('#editview-textarea');

const isEditing = () => !!doc_()?.isEditing && !!editArea;

/* Text currently selected inside the editor viewport or edit textarea,
   reduced to its first non-empty line since find matches within a line. */
function editorSelection() {
  if (isEditing()) {
    const value = editArea.value.slice(editArea.selectionStart, editArea.selectionEnd);
    const line = value.split(/\r?\n/).find(l => l.trim());
    return line ? line.trim() : '';
  }
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return '';
  const at = sel.getRangeAt(0).commonAncestorContainer;
  if (!vp.contains(at) && !mdview.contains(at)) return '';
  const line = sel.toString().split(/\r?\n/).find(l => l.trim());
  return line ? line.trim() : '';
}

function setReplaceVisible(on) {
  const editing = isEditing();
  const show = !!(on && editing);
  if (replaceToggle) {
    replaceToggle.hidden = !editing;
    replaceToggle.classList.toggle('on', show);
  }
  for (const el of [replaceInput, replaceOne, replaceAll]) {
    if (el) el.hidden = !show;
  }
}

function syncFindMode() {
  if (!isEditing()) setReplaceVisible(false);
  else if (replaceToggle) replaceToggle.hidden = false;
}

function focusEditor() {
  if (isEditing()) editArea.focus();
  else vp.focus();
}

/* Seed priority: live editor selection, then the query already in an open
   findbar, then the caller's fallback (the last double-clicked word). */
export function openFind(seed, opts = {}) {
  if (!doc_()) return;
  const sel = editorSelection();
  if (sel) findInput.value = sel;
  else if (findbar.hidden && seed) findInput.value = seed;
  const keepReplace = !findbar.hidden && replaceInput && !replaceInput.hidden;
  findbar.hidden = false;
  syncFindMode();
  setReplaceVisible(!!opts.replace || keepReplace);
  findInput.focus(); findInput.select();
  if (findInput.value) runFind();
}

export function clearFind() {
  findbar.hidden = true;
  S.find = null;
  $('#find-count').textContent = '0';
  $('#minimap-hits').innerHTML = '';
  setReplaceVisible(false);
  clearPreviewMarks();
  paint();
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function editRe(q, cs) {
  return new RegExp(escapeRegExp(q), 'g' + (cs ? '' : 'i'));
}

function editHits(text, q, cs) {
  const re = editRe(q, cs);
  const hits = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    hits.push(m.index);
    if (m[0] === '') re.lastIndex++;
  }
  return hits;
}

function sameMatch(value, q, cs) {
  return cs ? value === q : value.toLowerCase() === q.toLowerCase();
}

function editCount(q, hits, active) {
  if (!q) return '0';
  if (!hits.length) return 'no results';
  return (Math.max(0, active) + 1) + ' / ' + hits.length;
}

function runEditFind(q, cs, jump = true) {
  if (!q) {
    S.find = null;
    $('#find-count').textContent = '0';
    $('#minimap-hits').innerHTML = '';
    return;
  }
  const hits = editHits(editArea.value, q, cs);
  S.find = { q, cs, hits, byLine: new Set(), active: hits.length ? 0 : -1, edit: true };
  $('#find-count').textContent = editCount(q, hits, 0);
  $('#minimap-hits').innerHTML = '';
  if (hits.length && jump) jumpToHit(0);
}

/* Keep the hit list and count current while typing in the editor, without
   stealing the selection back to the first match. */
const refreshEditFind = debounce(() => {
  if (!isEditing() || findbar.hidden) return;
  const q = findInput.value;
  const cs = findCase.classList.contains('on');
  if (!q) { S.find = null; $('#find-count').textContent = '0'; return; }
  const hits = editHits(editArea.value, q, cs);
  let active = hits.findIndex(h => h >= editArea.selectionStart);
  if (active < 0) active = 0;
  S.find = { q, cs, hits, byLine: new Set(), active: hits.length ? active : -1, edit: true };
  $('#find-count').textContent = editCount(q, hits, active);
}, 140);

export const runFind = debounce(async () => {
  const d = doc_(); if (!d) return;
  const q = findInput.value;
  const cs = findCase.classList.contains('on');

  if (isEditing()) {
    runEditFind(q, cs);
    return;
  }

  // The Markdown preview is searched as rendered text, in the page itself.
  if (previewing(d)) {
    const n = findInPreview(q, cs);
    S.find = q ? { q, cs, hits: new Array(n).fill(null), byLine: new Set(), active: n ? 0 : -1, preview: true } : null;
    $('#find-count').textContent = !q ? '0' : n ? '1 / ' + n : 'no results';
    $('#minimap-hits').innerHTML = previewHitOffsets().map(p => '<i style="top:' + p + '%"></i>').join('');
    if (n) jumpToHit(0);
    return;
  }
  if (!q) { S.find = null; $('#find-count').textContent = '0'; $('#minimap-hits').innerHTML = ''; paint(); return; }
  let j;
  try { j = await api('/api/search', { q, glob: d.path, case: cs ? 1 : '' }); } catch { return; }
  const f = (j.results || []).find(r => r.path === d.path);
  const hits = [];
  if (f) {
    let prevLine = -1, n = 0;
    for (const m of f.matches) {
      n = m.line === prevLine ? n + 1 : 0;
      prevLine = m.line;
      hits.push({ line: m.line, n });
    }
  }
  S.find = { q, cs, hits, byLine: new Set(hits.map(h => h.line)), active: hits.length ? 0 : -1 };
  $('#find-count').textContent = hits.length ? '1 / ' + hits.length : 'no results';
  drawMinimap(hits, d.total);
  if (hits.length) jumpToHit(0); else paint();
}, 140);

export function drawMinimap(hits, total) {
  const mm = $('#minimap-hits');
  if (!hits.length || !total) { mm.innerHTML = ''; return; }
  const seen = new Set();
  mm.innerHTML = hits.filter(h => !seen.has(h.line) && seen.add(h.line))
    .map(h => '<i style="top:' + ((h.line - 1) / total * 100).toFixed(3) + '%"></i>').join('');
}

function jumpToEditHit(start) {
  // The selection is only painted while the textarea is focused; the find
  // field takes focus back so typing keeps refining the query.
  revealEditRange(start, start + S.find.q.length, { focus: true });
  findInput.focus({ preventScroll: true });
}

export function jumpToHit(i) {
  const d = doc_(); if (!d || !S.find || !S.find.hits.length) return;
  const n = S.find.hits.length;
  S.find.active = ((i % n) + n) % n;
  if (S.find.preview) {
    $('#find-count').textContent = (S.find.active + 1) + ' / ' + n;
    showPreviewHit(S.find.active);
    return;
  }
  if (S.find.edit) {
    $('#find-count').textContent = (S.find.active + 1) + ' / ' + n;
    jumpToEditHit(S.find.hits[S.find.active]);
    return;
  }
  const h = S.find.hits[S.find.active];
  d.cur = h.line;
  const y = (h.line - 1) * LH;
  if (y < vp.scrollTop + LH * 2 || y > vp.scrollTop + vp.clientHeight - LH * 3) centerLine(h.line);
  $('#find-count').textContent = (S.find.active + 1) + ' / ' + n;
  render(); updateStatus();
}

export function findNextMatch(delta = 1) {
  if (!S.find || !S.find.hits || !S.find.hits.length) {
    if (findInput.value) { runFind(); return; }
    return;
  }
  jumpToHit(S.find.active + delta);
}

function replaceCurrent() {
  if (!isEditing()) return;
  const q = findInput.value;
  if (!q) return;
  const cs = findCase.classList.contains('on');
  let start = editArea.selectionStart;
  let end = editArea.selectionEnd;
  if (end - start !== q.length || !sameMatch(editArea.value.slice(start, end), q, cs)) {
    const hits = editHits(editArea.value, q, cs);
    if (!hits.length) { showToast('!', 'No matches'); return; }
    let target = hits.find(h => h >= editArea.selectionEnd);
    if (target === undefined) target = hits[0];
    start = target;
    end = target + q.length;
  }
  const replacement = replaceInput.value;
  editArea.focus({ preventScroll: true });
  editArea.setSelectionRange(start, end);
  document.execCommand('insertText', false, replacement);
  editArea.setSelectionRange(start, start + replacement.length);
  runFind();
}

function replaceAllMatches() {
  if (!isEditing()) return;
  const q = findInput.value;
  if (!q) return;
  const cs = findCase.classList.contains('on');
  const re = editRe(q, cs);
  let count = 0;
  const replacement = replaceInput.value;
  const next = editArea.value.replace(re, () => { count++; return replacement; });
  if (!count) { showToast('!', 'No matches'); return; }
  editArea.focus({ preventScroll: true });
  editArea.setSelectionRange(0, editArea.value.length);
  document.execCommand('insertText', false, next);
  editArea.setSelectionRange(0, 0);
  runFind();
  showToast('✓', 'Replaced ' + count + (count === 1 ? ' match' : ' matches'));
}

export function initFind() {
  findInput.addEventListener('input', runFind);
  findInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); jumpToHit(S.find ? S.find.active + (e.shiftKey ? -1 : 1) : 0); }
    if (e.key === 'Escape') { clearFind(); focusEditor(); }
  });
  findCase.addEventListener('click', () => { findCase.classList.toggle('on'); runFind(); });
  $('#find-next').addEventListener('click', () => jumpToHit(S.find ? S.find.active + 1 : 0));
  $('#find-prev').addEventListener('click', () => jumpToHit(S.find ? S.find.active - 1 : 0));
  $('#find-close').addEventListener('click', clearFind);

  replaceToggle?.addEventListener('click', () => {
    const show = !!replaceInput?.hidden;
    setReplaceVisible(show);
    if (show) replaceInput?.focus(); else findInput.focus();
  });
  replaceOne?.addEventListener('click', replaceCurrent);
  replaceAll?.addEventListener('click', replaceAllMatches);
  replaceInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); replaceCurrent(); }
    if (e.key === 'Escape') { clearFind(); focusEditor(); }
  });

  $('#minimap-hits').addEventListener('click', e => {
    const r = $('#minimap-hits').getBoundingClientRect();
    const d = doc_(); if (!d || !r.height || !d.total) return;
    if (previewing(d)) { scrollPreviewTo((e.clientY - r.top) / r.height); return; }
    centerLine(Math.round((e.clientY - r.top) / r.height * d.total));
    render();
  });
  on('tab:activated', clearFind);
  on('edit:mode', () => {
    syncFindMode();
    if (!findbar.hidden) runFind();
  });
  on('edit:input', () => {
    if (!findbar.hidden) refreshEditFind();
  });
}
