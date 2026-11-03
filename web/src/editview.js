// web/src/editview.js
import { $, S, doc_, apiPostJson, LH } from './state.js';
import { vp, showToast, flashActionSuccess } from './ui.js';
import { drawTabs, loadGutter, reloadOpenTabs } from './tabs.js';
import { syncPreview, previewing, previewTopLine, previewKind } from './markdown.js';
import { syncDiffView } from './diff.js';
import { triggerRefresh } from './gitstream.js';
import { updateStatus } from './status.js';
import { emit, on } from './bus.js';
import { highlightText, escapeHTML, languageFamily } from './highlight.js';

export const editViewEl = $('#editview');
export const editGutterEl = $('#editview-gutter');
export const editTextarea = $('#editview-textarea');
const editHighlightInner = $('#editview-highlight-inner');
export const editSwitch = $('#edit-switch');
export const btnEditMode = $('#btn-edit-mode');
export const btnSaveFile = $('#btn-save-file');
export const btnCancelEdit = $('#btn-cancel-edit');

let mirror = null;

/* Live highlighting is a bonus, not a reason to stall typing. Above this
   many characters the textarea shows its own text; every supported language
   below it gets a colour pass on idle, after the keystroke has landed. */
const HL_MAX = 400000;
let hlTimer = 0;
let hlText = '';
let hlLang = '';

export function updateGutter() {
  if (!editTextarea || !editGutterEl) return;
  const text = editTextarea.value;
  const lines = text.split('\n');
  const lineCount = lines.length;
  const digits = String(lineCount).length;
  editGutterEl.style.width = Math.max(45, digits * (S.chW || 7.8) + 26) + 'px';
  if (!S.wrap) {
    let s = '';
    for (let i = 1; i <= lineCount; i++) s += i + '\n';
    editGutterEl.textContent = s;
    return;
  }
  // Wrapped lines span several visual rows: measure each in a hidden mirror
  // laid out like the textarea and size the matching gutter number to it.
  if (!mirror) {
    mirror = document.createElement('div');
    mirror.id = 'editview-mirror';
    mirror.setAttribute('aria-hidden', 'true');
    editTextarea.parentElement.appendChild(mirror);
  }
  mirror.style.width = editTextarea.clientWidth + 'px';
  mirror.textContent = '';
  const frag = document.createDocumentFragment();
  for (const l of lines) {
    const row = document.createElement('div');
    row.textContent = l || ' ';
    frag.appendChild(row);
  }
  mirror.appendChild(frag);
  const rows = mirror.children;
  const heights = new Array(lineCount);
  for (let i = 0; i < lineCount; i++) heights[i] = rows[i].offsetHeight;
  mirror.textContent = '';
  const out = document.createDocumentFragment();
  for (let i = 0; i < lineCount; i++) {
    const n = document.createElement('div');
    n.textContent = i + 1;
    n.style.height = heights[i] + 'px';
    out.appendChild(n);
  }
  editGutterEl.textContent = '';
  editGutterEl.appendChild(out);
}

// The doc whose text is currently in the textarea; lets any tab switch path
// (openFile, switchTab, closeTab) swap the content without each repeating it.
let loadedDoc = null;

function syncHighlightScroll() {
  if (!editTextarea || !editHighlightInner) return;
  const w = editTextarea.clientWidth;
  if (w > 0) editHighlightInner.style.width = w + 'px';
  const x = S.wrap ? 0 : -editTextarea.scrollLeft;
  editHighlightInner.style.transform = 'translate(' + x + 'px,' + (-editTextarea.scrollTop) + 'px)';
}

function renderEditHighlight(force = false) {
  const d = doc_();
  if (!d || !d.isEditing || !editTextarea || !editHighlightInner) return;
  const text = editTextarea.value;
  if (text.length > HL_MAX) {
    document.body.classList.add('edit-plain');
    editHighlightInner.textContent = '';
    hlText = '';
    hlLang = '';
    return;
  }
  document.body.classList.remove('edit-plain');
  const lang = d.lang || '';
  if (!force && text === hlText && lang === hlLang) {
    syncHighlightScroll();
    return;
  }
  let html;
  try {
    html = highlightText(text, lang);
  } catch {
    // A highlighting bug must never make the file invisible.
    html = escapeHTML(text);
  }
  hlText = text;
  hlLang = lang;
  editHighlightInner.innerHTML = html;
  syncHighlightScroll();
}

function scheduleHighlight() {
  clearTimeout(hlTimer);
  hlTimer = setTimeout(() => renderEditHighlight(true), 70);
}

function loadEditContent(d) {
  if (loadedDoc === d) return;
  if (loadedDoc && loadedDoc.isEditing) loadedDoc.editContent = editTextarea.value;
  loadedDoc = d;
  editTextarea.value = d.editContent || '';
  editTextarea.scrollTop = d.editScrollTop || 0;
  updateGutter();
  renderEditHighlight(true);
  syncHighlightScroll();
  if (editGutterEl) editGutterEl.scrollTop = editTextarea.scrollTop;
}

// The textarea's line height follows the --lh setting, not LH.
function editLH() {
  return parseFloat(getComputedStyle(editTextarea).lineHeight) || LH;
}

// Top of line n in the textarea. Wrapped lines are taller than one line;
// their gutter rows were sized to match, so read the offset from there.
function editLineTop(n) {
  const row = S.wrap && editGutterEl?.children[n - 1];
  return row ? row.offsetTop : (n - 1) * editLH();
}

/* Select [start, end) in the editor and scroll it to the middle of the view.
   Browsers do not reliably scroll a textarea to a selection set from script,
   so the scroll position is computed from the line instead. Focus is left
   where it was unless focus is true (the find bar keeps its own). */
export function revealEditRange(start, end = start, { focus = false } = {}) {
  if (!editTextarea) return;
  if (focus) editTextarea.focus({ preventScroll: true });
  editTextarea.setSelectionRange(start, end);
  const line = editTextarea.value.slice(0, start).split('\n').length;
  const y = editLineTop(line) - Math.max(0, (editTextarea.clientHeight - editLH()) / 2);
  editTextarea.scrollTop = Math.max(0, y);
  syncHighlightScroll();
  if (editGutterEl) editGutterEl.scrollTop = editTextarea.scrollTop;
}

/* Put the caret at the start of line n (1-based) and center it. */
export function revealEditLine(n) {
  if (!editTextarea) return;
  const lines = editTextarea.value.split('\n');
  const target = Math.max(1, Math.min(n, lines.length));
  let offset = 0;
  for (let i = 0; i < target - 1; i++) offset += lines[i].length + 1;
  revealEditRange(offset, offset, { focus: true });
}

// The first line visible at the top of the textarea.
function editTopLine() {
  const top = editTextarea.scrollTop;
  const rows = S.wrap && editGutterEl ? editGutterEl.children : null;
  if (rows && rows.length) {
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].offsetTop + rows[i].offsetHeight > top + 1) return i + 1;
    }
    return rows.length;
  }
  return Math.floor(top / editLH()) + 1;
}

export function syncEditUI() {
  const d = doc_();
  if (!editSwitch) return;
  if (!d || d.isImage || d.deleted || d.diffRef) {
    editSwitch.hidden = true;
    if (btnEditMode) btnEditMode.hidden = true;
    if (btnSaveFile) btnSaveFile.hidden = true;
    if (btnCancelEdit) btnCancelEdit.hidden = true;
    if (editViewEl) editViewEl.hidden = true;
    document.body.classList.remove('editing-file', 'edit-plain');
    if (!d) {
      if (editTextarea) editTextarea.value = '';
      if (editGutterEl) editGutterEl.textContent = '';
    }
    vp.hidden = false;
    return;
  }
  // A .env file is edited in the environment editor, not as text. The raw
  // text stays reachable through the .env view's "Raw" toggle.
  if (d.isEnv && !d.envRaw) {
    editSwitch.hidden = true;
    if (btnEditMode) btnEditMode.hidden = true;
    if (btnSaveFile) btnSaveFile.hidden = true;
    if (btnCancelEdit) btnCancelEdit.hidden = true;
    if (editViewEl) editViewEl.hidden = true;
    document.body.classList.remove('editing-file', 'edit-plain');
    vp.hidden = true;
    return;
  }
  editSwitch.hidden = false;
  if (d.isEditing) {
    if (btnEditMode) btnEditMode.hidden = true;
    if (btnSaveFile) btnSaveFile.hidden = false;
    if (btnCancelEdit) btnCancelEdit.hidden = false;
    if (editViewEl) editViewEl.hidden = false;
    if (editTextarea) loadEditContent(d);
    vp.hidden = true;
    const mv = $('#mdview');
    if (mv) mv.hidden = true;
    const dv = $('#diffview');
    if (dv) dv.hidden = true;
    const iv = $('#imgview');
    if (iv) iv.hidden = true;
  } else {
    if (btnEditMode) btnEditMode.hidden = false;
    if (btnSaveFile) btnSaveFile.hidden = true;
    if (btnCancelEdit) btnCancelEdit.hidden = true;
    if (editViewEl) editViewEl.hidden = true;
    document.body.classList.remove('editing-file', 'edit-plain');
    vp.hidden = false;
  }
}

export async function enterEditMode(line) {
  const d = doc_();
  if (!d || d.isImage || d.deleted || d.diffRef || d.isEditing || d.editPending) return;
  // Opening a file in the editor, or deliberately closing the editor, is a
  // decision for this tab. A reload must not auto-open it again.
  d.editAutoTried = true;
  // A .env table is a better editor than raw text, but Ctrl+E still reaches
  // the text editor. Remember to put the table back on the way out.
  if (d.isEnv && !d.envRaw) {
    d.envRaw = true;
    d.envRawFromTable = true;
  }

  if (d.total > 10000 || (d.size && d.size > 1024 * 1024)) {
    const sizeStr = d.size ? ` (${(d.size / 1024 / 1024).toFixed(1)} MB)` : '';
    const ok = confirm(`"${d.name}" is large: ${d.total.toLocaleString()} lines${sizeStr}.\nLoading the entire file into edit mode may take a moment.\n\nDo you want to proceed?`);
    if (!ok) return;
  }

  d.editPending = true;
  try {
    let text = '';
    if (d.editContent !== undefined && d.editContent !== null) {
      text = d.editContent;
    } else {
      try {
        const u = new URL('api/raw', document.baseURI || location.href);
        u.searchParams.set('path', d.path);
        const res = await fetch(u);
        if (!res.ok) throw new Error('Failed to fetch file content');
        text = await res.text();
      } catch (err) {
        showToast('!', 'Failed to load file for editing: ' + err.message);
        return;
      }
    }

    // The preview's own cursor is not d.cur: start editing where the preview is.
    const from = line || (previewing(d) ? previewTopLine() : d.cur) || 1;

    d.isEditing = true;
    d.editContent = text;
    if (doc_() !== d) {
      // The reader moved to another tab while the file was loading. Keep the
      // text on this doc; syncEditUI() will show it when the tab comes back.
      drawTabs();
      return;
    }

    document.body.classList.add('editing-file');
    syncEditUI();
    syncPreview(); // hides the preview through markdown.js so it redraws on exit
    updateStatus();
    emit('edit:mode', { doc: d, editing: true });

    editTextarea.value = text;
    loadedDoc = d;
    updateGutter();
    renderEditHighlight(true);

    const targetLine = from;
    const lines = text.split('\n');
    let charOffset = 0;
    for (let i = 0; i < targetLine - 1 && i < lines.length; i++) {
      charOffset += lines[i].length + 1;
    }

    editTextarea.focus();
    editTextarea.setSelectionRange(charOffset, charOffset);
    editTextarea.scrollTop = Math.max(0, editLineTop(Math.max(1, targetLine - 4)));
    syncHighlightScroll();
    if (editGutterEl) editGutterEl.scrollTop = editTextarea.scrollTop;
  } finally {
    d.editPending = false;
  }
}

export async function exitEditMode(force = false) {
  const d = doc_();
  if (!d || !d.isEditing) return;

  cancelAutosave(d);
  if (d.dirty && !force) {
    if (autosaveEnabled()) {
      // Leaving is not a reason to lose the last few keystrokes: write them,
      // and stay in the editor if the write fails.
      if (!(await saveDoc(d, editTextarea.value, { silent: true }))) return;
    } else {
      if (!confirm(`You have unsaved changes in "${d.name}". Discard changes and exit edit mode?`)) {
        return;
      }
      d.dirty = false;
      d.editContent = null;
      drawTabs();
    }
  }

  // Ctrl+E opened the raw text from the table view; go back to the table.
  if (d.isEnv && d.envRawFromTable) {
    d.envRaw = false;
    d.envRawFromTable = false;
  }

  // Come back to the line that was at the top of the editor, in source or preview.
  const top = Math.min(editTopLine(), d.total || 1);
  d.isEditing = false;
  document.body.classList.remove('editing-file', 'edit-plain');
  syncEditUI();
  emit('edit:mode', { doc: d, editing: false });

  if (d.diffMode) {
    syncDiffView();
    return;
  }
  d.cur = top;
  vp.scrollTop = (top - 1) * LH;
  if (previewKind(d)) d.mdLine = top;
  // Reloads the source and, through a fresh doc, the preview: a save made in
  // edit mode leaves both stale.
  await reloadOpenTabs({ onlyIfChanged: false });
}

const saveChains = new WeakMap();

async function writeDoc(d, content, { active = false, silent = false } = {}) {
  if (active && btnSaveFile) btnSaveFile.disabled = true;
  try {
    await apiPostJson('/api/file/save', { path: d.path, content });
    // Text typed while this request was in flight is newer than its response.
    // Leave the tab dirty and let the queued save write the newer text.
    const current = d === doc_() ? editTextarea.value : (d.editContent ?? '');
    const stillCurrent = current === content;
    if (stillCurrent) {
      d.dirty = false;
      d.editContent = content;
      d.size = new Blob([content]).size;
      d.total = (content.match(/\n/g) || []).length + 1;
      drawTabs();
      loadGutter(d);
      triggerRefresh();
      // Anything that caches the file's contents has to hear about the change.
      emit('file:saved', d);
    }
    if (active && !silent) flashActionSuccess(btnSaveFile, 'Saved');
    return true;
  } catch (err) {
    showToast('!', 'Failed to save ' + d.name + ': ' + (err.message || 'unknown error'));
    return false;
  } finally {
    if (active && btnSaveFile) btnSaveFile.disabled = false;
  }
}

// Saves for one doc run in order, so a quick autosave cannot land before an
// older keystroke's write and leave the file on stale text.
async function saveDoc(d, content, opts = {}) {
  if (!d || !d.isEditing) return false;
  const previous = saveChains.get(d) || Promise.resolve();
  const job = previous.catch(() => false).then(() => writeDoc(d, content, opts));
  saveChains.set(d, job);
  try {
    return await job;
  } finally {
    if (saveChains.get(d) === job) saveChains.delete(d);
  }
}

const AUTOSAVE_DELAY = 800;
const autosaveTimers = new WeakMap();

function autosaveEnabled() {
  const value = S.settings && S.settings['editor.autosave'];
  return value !== false && value !== 'false';
}

function cancelAutosave(d) {
  const timer = autosaveTimers.get(d);
  if (timer) {
    clearTimeout(timer);
    autosaveTimers.delete(d);
  }
}

function currentContent(d) {
  return d === doc_() ? editTextarea.value : (d.editContent ?? '');
}

function scheduleAutosave(d) {
  if (!d || d.autosaveSuspended || !autosaveEnabled()) return;
  cancelAutosave(d);
  const timer = setTimeout(() => {
    autosaveTimers.delete(d);
    if (!autosaveEnabled() || d.autosaveSuspended || !d.isEditing || !d.dirty) return;
    void saveDoc(d, currentContent(d), { silent: true });
  }, AUTOSAVE_DELAY);
  autosaveTimers.set(d, timer);
}

function flushAutosave(d) {
  if (!d) return;
  cancelAutosave(d);
  if (d.autosaveSuspended || !d.isEditing || !d.dirty || !autosaveEnabled()) return;
  void saveDoc(d, currentContent(d), { silent: true });
}

/* Rename and delete need the disk to stay still while they run. Suspend the
   timers for the affected tabs and wait for any write already in flight, so a
   late autosave cannot recreate the old path after it has moved or gone. */
export async function suspendAutosaveForPath(path, isDir = false) {
  const waits = [];
  for (const d of S.tabs) {
    if (d.path !== path && !(isDir && d.path.startsWith(path + '/'))) continue;
    d.autosaveSuspended = true;
    cancelAutosave(d);
    const chain = saveChains.get(d);
    if (chain) waits.push(chain.catch(() => false));
  }
  await Promise.all(waits);
}

export function resumeAutosaveForPath(path, isDir = false) {
  for (const d of S.tabs) {
    if (d.path !== path && !(isDir && d.path.startsWith(path + '/'))) continue;
    delete d.autosaveSuspended;
    if (d.dirty) scheduleAutosave(d);
  }
}

export async function saveActiveFile() {
  const d = doc_();
  if (!d || !d.isEditing) return;
  cancelAutosave(d);
  const content = editTextarea.value;
  if (await saveDoc(d, content, { active: true })) {
    showToast('✓', 'Saved ' + d.name);
  }
}

/**
 * Save every tab that is currently in edit mode and has unsaved text.
 * Documents are saved one at a time so a failing file does not hide the
 * success of the others.
 */
export async function saveAllFiles() {
  const dirty = S.tabs.filter(t => t.isEditing && t.dirty);
  if (!dirty.length) {
    showToast('✓', 'No unsaved changes');
    return;
  }
  let saved = 0;
  for (const d of dirty) {
    cancelAutosave(d);
    const content = d === doc_() ? editTextarea.value : (d.editContent || '');
    if (await saveDoc(d, content)) saved++;
  }
  if (saved === dirty.length) showToast('✓', saved === 1 ? 'Saved 1 file' : 'Saved ' + saved + ' files');
  else showToast('!', 'Saved ' + saved + ' of ' + dirty.length + ' files');
}

const INDENT = '    ';

/* The full lines touched by the current selection. A selection ending at the
   start of a line does not take that next line with it. */
function selectedLines() {
  const val = editTextarea.value;
  const start = editTextarea.selectionStart;
  const end = editTextarea.selectionEnd;
  const lineStart = val.lastIndexOf('\n', start - 1) + 1;
  let lineEnd = val.indexOf('\n', end);
  if (lineEnd < 0) lineEnd = val.length;
  if (end > start && end > 0 && val[end - 1] === '\n') lineEnd = end - 1;
  return { val, start, end, lineStart, lineEnd, block: val.slice(lineStart, lineEnd) };
}

function replaceLines(transform) {
  const r = selectedLines();
  const next = transform(r.block);
  if (next === r.block) return;
  editTextarea.focus();
  editTextarea.setSelectionRange(r.lineStart, r.lineEnd);
  document.execCommand('insertText', false, next);
  editTextarea.setSelectionRange(r.lineStart, r.lineStart + next.length);
}

function indentSelection() {
  if (editTextarea.selectionStart === editTextarea.selectionEnd) {
    editTextarea.focus();
    document.execCommand('insertText', false, INDENT);
    return;
  }
  replaceLines(block => block.split('\n').map(line => INDENT + line).join('\n'));
}

function outdentSelection() {
  replaceLines(block => block.split('\n').map(line => {
    if (line.startsWith('\t')) return line.slice(1);
    return line.replace(/^ {1,4}/, '');
  }).join('\n'));
}

function lineCommentToken(lang) {
  const fam = languageFamily(lang);
  if (['py', 'rb', 'shell', 'make', 'docker', 'hcl', 'yaml', 'toml', 'ini'].includes(fam)) return '#';
  if (fam === 'sql' || fam === 'lua') return '--';
  if (fam === 'plain' || fam === 'json' || fam === 'html' || fam === 'css' || fam === 'markdown') return '';
  return '//';
}

function toggleLineComment() {
  const d = doc_();
  const token = lineCommentToken(d?.lang);
  if (!token) {
    showToast('!', 'Line comments are not available for this file type');
    return;
  }
  const r = selectedLines();
  const lines = r.block.split('\n');
  const nonEmpty = lines.filter(line => line.trim());
  if (!nonEmpty.length) return;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const commentStart = new RegExp('^[ \\t]*' + escaped);
  const allCommented = nonEmpty.every(line => commentStart.test(line));
  replaceLines(block => block.split('\n').map(line => {
    if (!line.trim()) return line;
    const indent = /^[ \t]*/.exec(line)[0];
    if (allCommented) {
      let rest = line.slice(indent.length + token.length);
      if (rest.startsWith(' ')) rest = rest.slice(1);
      return indent + rest;
    }
    return indent + token + ' ' + line.slice(indent.length);
  }).join('\n'));
}

function duplicateLines() {
  const r = selectedLines();
  const at = r.lineEnd;
  editTextarea.focus();
  editTextarea.setSelectionRange(at, at);
  document.execCommand('insertText', false, '\n' + r.block);
  const pos = at + 1 + r.block.length;
  editTextarea.setSelectionRange(pos, pos);
}

function autoEditOnOpen() {
  const value = S.settings && S.settings['editor.editOnOpen'];
  return value === undefined || value === true || value === 'true';
}

function maybeAutoEdit(d) {
  if (!d || d.editAutoTried) return;
  d.editAutoTried = true;
  if (!autoEditOnOpen() || S.meta?.pr) return;
  if (!d.path || d.isImage || d.deleted || d.diffRef || d.diffMode) return;
  // The .env table is a better editor than its raw text; previewable files
  // keep their rendered view. Both remain one Ctrl+E away.
  if (d.isEnv || previewing(d)) return;
  // Large files stay in the read-only viewer unless the reader asks for them.
  if ((d.total || 0) > 10000 || (d.size || 0) > 1024 * 1024) return;
  void enterEditMode(d.cur || 1);
}

export function initEditView() {
  if (!editTextarea) return;

  let lastW = 0;
  new ResizeObserver(() => {
    const w = editTextarea.clientWidth;
    if (w && w !== lastW && !editViewEl.hidden) {
      if (S.wrap) updateGutter();
      syncHighlightScroll();
    }
    lastW = w;
  }).observe(editTextarea);
  new MutationObserver(() => {
    if (!editViewEl.hidden) {
      updateGutter();
      syncHighlightScroll();
    }
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  editTextarea.addEventListener('scroll', () => {
    if (loadedDoc) loadedDoc.editScrollTop = editTextarea.scrollTop;
    if (editGutterEl) editGutterEl.scrollTop = editTextarea.scrollTop;
    syncHighlightScroll();
  }, { passive: true });

  editTextarea.addEventListener('input', () => {
    const d = doc_();
    if (d) {
      d.editContent = editTextarea.value;
      if (!d.dirty) {
        d.dirty = true;
        drawTabs();
      }
      scheduleAutosave(d);
      emit('edit:input', { doc: d });
    }
    updateGutter();
    scheduleHighlight();
  });

  editTextarea.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      e.stopPropagation();
      saveActiveFile();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      exitEditMode();
      return;
    }
    if (mod && !e.altKey && (e.key === '/' || e.code === 'Slash')) {
      e.preventDefault();
      e.stopPropagation();
      toggleLineComment();
      return;
    }
    if (e.altKey && e.shiftKey && (e.key === 'ArrowDown' || e.code === 'ArrowDown')) {
      e.preventDefault();
      e.stopPropagation();
      duplicateLines();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) outdentSelection();
      else indentSelection();
      updateGutter();
      return;
    }
    if (e.key === 'Enter') {
      const pos = editTextarea.selectionStart;
      const val = editTextarea.value;
      const lineStart = val.lastIndexOf('\n', pos - 1) + 1;
      const currentLine = val.substring(lineStart, pos);
      const match = currentLine.match(/^[ \t]+/);
      if (match) {
        e.preventDefault();
        const indent = match[0];
        document.execCommand('insertText', false, '\n' + indent);
        updateGutter();
      }
    }
  });

  on('tab:activated', ({ doc, prevDoc }) => {
    if (prevDoc && prevDoc !== doc) flushAutosave(prevDoc);
    if (!doc) return;
    // reloadOpenTabs() replaces doc objects without going through the tab
    // switch path, so re-sync here rather than assuming the view is current.
    syncEditUI();
    if (doc.isEditing) {
      loadEditContent(doc);
      renderEditHighlight();
      syncHighlightScroll();
      return;
    }
    maybeAutoEdit(doc);
  });

  // A pending autosave must not write a file after its tab was closed,
  // renamed, or deleted. Closing means the text is no longer wanted.
  on('tab:closed', ({ doc }) => {
    if (!doc) return;
    cancelAutosave(doc);
    doc.isEditing = false;
    if (loadedDoc === doc) loadedDoc = null;
  });

  btnEditMode?.addEventListener('click', () => enterEditMode());
  btnSaveFile?.addEventListener('click', () => saveActiveFile());
  btnCancelEdit?.addEventListener('click', () => exitEditMode());

  // The debounce is short, but a reload or window close during it would still
  // lose the last edit. Ask the browser to confirm instead of doing it silently.
  addEventListener('beforeunload', e => {
    if (!S.tabs.some(t => t.isEditing && t.dirty)) return;
    e.preventDefault();
    e.returnValue = '';
  });
}
