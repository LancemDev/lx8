// web/src/gitpanel.js
// Sidebar git panel: stage/commit/push/pull, shown while the sidebar is in
// Git-changes mode. File mode is the editing surface and keeps the panel out
// of the way; one click on the Git toggle brings it back. In a PR review
// session (S.meta.pr set), Push/Pull target the PR's actual head branch
// instead of the checkout's own remote -- see pr.go's Push/Pull.
import { $, esc, S, api, apiPostJson } from './state.js';
import { showToast, copyToClipboard, flashActionSuccess } from './ui.js';
import { reindexWorkspace } from './panels.js';
import { refreshPRMeta, nudgeForgeToken, forgeInfo } from './pr.js';
import { reloadOpenTabs } from './tabs.js';
import { layout, render } from './renderer.js';
import { refreshUnpushed } from './unpushed.js';
import { openFile } from './tabs.js';
import { on, emit } from './bus.js';
import { commitFileRows, COMMIT_FILES_PAGE, loadCommitFiles, cachedCommitFiles } from './commitfiles.js';
import { triggerRefresh } from './gitstream.js';
import { inGitMode } from './tree.js';

const panel = () => $('#git-panel');

export function initGitPanel() {
  if (!panel()) return;

  $('#git-panel-collapse')?.addEventListener('click', () => {
    panel()?.classList.toggle('collapsed');
    layout(); render();
  });

  const rz = $('#git-panel-resizer');
  if (rz && panel()) {
    let dragging = false;
    rz.addEventListener('mousedown', e => {
      dragging = true;
      rz.classList.add('drag');
      panel().classList.remove('collapsed');
      e.preventDefault();
    });
    addEventListener('mousemove', e => {
      if (!dragging) return;
      const bottom = panel().getBoundingClientRect().bottom;
      const h = Math.max(60, Math.min(window.innerHeight * 0.8, bottom - e.clientY));
      panel().style.height = h + 'px';
      layout(); render();
    });
    addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      rz.classList.remove('drag');
      layout(); render();
    });
  }

  $('#git-stage-all')?.addEventListener('click', doStageAll);
  $('#git-commit')?.addEventListener('click', doCommit);
  $('#git-commit-msg')?.addEventListener('input', () => $('#git-commit-msg')?.classList.remove('warn-border'));
  $('#git-push')?.addEventListener('click', () => (rewritten ? confirmForcePush() : doPush()));
  $('#git-pull')?.addEventListener('click', doPull);
  $('#git-token-nudge')?.addEventListener('click', nudgeForgeToken);
  $('#git-see-all-commits')?.addEventListener('click', handleSeeAllCommits);
  initCommitList();
  initNotice();

  updateGitPanelVisibility();
  if (S.meta?.git) {
    fetchRecentCommits();
    checkUnfinishedSync();
  }
}

function updateGitPanelVisibility() {
  const p = panel();
  if (!p) return;
  p.hidden = !S.meta?.git || !inGitMode();
  const nudge = $('#git-token-nudge');
  if (nudge) {
    // Only for a remote on a forge lx8 knows. The PR bar already carries its
    // own "no token" note, so skip this one in PR review mode to avoid
    // nudging twice.
    const forge = S.meta?.forge;
    nudge.hidden = !S.meta?.git || !forge || forge.hasToken || !!S.meta?.pr;
    const label = nudge.querySelector('span');
    if (forge && label) label.textContent = `No ${forgeInfo().label} token configured — add one`;
  }
}

// Called from gitstream.js's handleGitStatus with each SSE/refresh payload,
// so the branch name and staged/changed counts stay live without a manual
// reload.
export function updateGitPanel(payload) {
  updateGitPanelVisibility();
  const branchEl = $('#git-branch');
  if (branchEl) {
    const branch = S.meta?.pr ? S.meta.pr.head + ' (PR review)' : (payload?.branch || '');
    branchEl.textContent = branch;
    branchEl.title = branch;
  }
  const staged = payload?.staged ? Object.keys(payload.staged).length : 0;
  const changed = payload?.gitChanges ?? (payload?.statuses ? Object.keys(payload.statuses).length : (S.meta?.gitChanges || 0));
  const countsEl = $('#git-counts');
  if (countsEl) {
    countsEl.textContent = changed ? staged + ' / ' + changed + ' staged' : '';
  }

  // Lifecycle state management:
  // Show commit section when there are uncommitted changes or staged files.
  // When clean, hide commit section and show clean state message.
  const hasChanges = changed > 0 || staged > 0;
  const commitSection = $('#git-commit-section');
  if (commitSection) {
    commitSection.hidden = !hasChanges;
  }
  const cleanState = $('#git-clean-state');
  if (cleanState) {
    cleanState.hidden = hasChanges;
  }

  // Commit button is only enabled when something is staged
  const commitBtn = $('#git-commit');
  if (commitBtn) {
    commitBtn.disabled = staged === 0;
    commitBtn.title = staged === 0 ? 'Stage changes to commit' : 'Commit staged changes';
  }

  // Push button is enabled only when there are unpushed commits (ahead > 0)
  const pushBtn = $('#git-push');
  if (payload && !!payload.rewritten !== rewritten) {
    rewritten = !!payload.rewritten;
    emitSync();
  }
  if (pushBtn) {
    const ahead = payload?.ahead ?? 0;
    pushBtn.disabled = ahead === 0;
    if (ahead > 0 && rewritten) {
      // A rebased PR branch only reaches the PR by replacing its commits.
      pushBtn.textContent = 'Force-push';
      pushBtn.title = `This checkout was rebased: replace the commits on ${S.meta?.pr?.head || 'the PR branch'} with it (asks first)`;
    } else if (ahead > 0) {
      pushBtn.textContent = `Push (${ahead})`;
      pushBtn.title = S.meta?.pr
        ? `Push ${ahead} of your commit${ahead > 1 ? 's' : ''} to PR #${S.meta.pr.number} (${S.meta.pr.head})`
        : `Push ${ahead} unpushed commit${ahead > 1 ? 's' : ''} to remote`;
    } else {
      pushBtn.textContent = 'Push';
      pushBtn.title = S.meta?.pr ? 'Commit your changes to push them to this PR' : 'No unpushed commits to push';
    }
  }

  // Pull button: show incoming badge if behind > 0
  const pullBtn = $('#git-pull');
  if (pullBtn) {
    const behind = payload?.behind ?? 0;
    if (behind > 0) {
      pullBtn.textContent = `Pull (${behind})`;
      pullBtn.title = `Pull ${behind} incoming commit${behind > 1 ? 's' : ''} from remote`;
    } else {
      pullBtn.textContent = 'Pull';
      pullBtn.title = 'Pull changes from remote';
    }
  }

  // Render recent commits if provided in payload
  if (payload?.recentCommits) {
    renderRecentCommits(payload.recentCommits);
  }
  updateSeeAllCommits(payload?.commitsUrl, payload?.recentCommits ? payload.recentCommits.length : undefined);
}

export async function stagePath(path) {
  try {
    await apiPostJson('/api/git/stage', { path });
  } catch (e) {
    showGitError('Could not stage', e.message);
  }
}

async function doStageAll() {
  const btn = $('#git-stage-all');
  const prevText = btn?.textContent || 'Stage All';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Staging...';
  }
  try {
    await apiPostJson('/api/git/stage', { path: '.' });
    await triggerRefresh();
    if (btn) {
      btn.textContent = prevText;
      flashActionSuccess(btn, 'Staged');
    }
  } catch (e) {
    if (btn) btn.textContent = prevText;
    showGitError('Could not stage', e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

export async function unstagePath(path) {
  try {
    await apiPostJson('/api/git/unstage', { path });
    await triggerRefresh();
  } catch (e) {
    showGitError('Could not unstage', e.message);
  }
}

async function doCommit() {
  const ta = $('#git-commit-msg');
  const message = ta ? ta.value.trim() : '';
  if (!message) {
    if (ta) {
      ta.classList.remove('shake');
      void ta.offsetWidth;
      ta.classList.add('shake', 'warn-border');
      setTimeout(() => ta.classList.remove('shake'), 350);
      ta.focus();
    }
    showGitError('Write a commit message first');
    return;
  }
  const btn = $('#git-commit');
  const prevText = btn?.textContent || 'Commit';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Committing...';
  }
  try {
    await apiPostJson('/api/git/commit', { message });
    if (ta) {
      ta.value = '';
      ta.classList.remove('warn-border');
    }
    clearGitNotice();
    showToast('✓', 'Committed');
    if (btn) {
      btn.textContent = prevText;
      flashActionSuccess(btn, 'Committed');
    }
    await fetchRecentCommits();
    await refreshUnpushed();
    await triggerRefresh();
  } catch (e) {
    if (btn) btn.textContent = prevText;
    showGitError('Commit failed', e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function doPush(force = false) {
  const btn = $('#git-push');
  const prevText = btn?.textContent || 'Push';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Pushing...';
  }
  try {
    await apiPostJson('/api/git/push', force ? { force: true } : {});
    rewritten = false;
    emitSync();
    clearGitNotice();
    showToast('✓', S.meta?.pr ? `${force ? 'Force-pushed' : 'Pushed'} to PR #${S.meta.pr.number}` : 'Pushed');
    if (btn) {
      btn.textContent = 'Push';
      flashActionSuccess(btn, 'Pushed');
      btn.title = 'No unpushed commits to push';
      btn.disabled = true;
    }
    await refreshUnpushed(); // the section empties out with the push
    if (S.meta?.pr) {
      // Your commits are the PR's now: re-read the PR state (its file set and
      // head) and repaint open diffs so "Your changes" empties out.
      await refreshPRMeta();
      await reloadOpenTabs();
    }
  } catch (e) {
    if (btn) btn.textContent = prevText;
    showGitError('Push failed', e.message);
    if (btn) btn.disabled = false;
  }
}

async function doPull() {
  const btn = $('#git-pull');
  const prevText = btn?.textContent || 'Pull';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Pulling...';
  }
  try {
    const j = await apiPostJson('/api/git/pull', {});
    clearGitNotice();
    showToast('✓', j.message || 'Pulled');
    if (btn) {
      btn.textContent = 'Pull';
      flashActionSuccess(btn, 'Pulled');
    }
    await afterHistoryChange();
  } catch (e) {
    if (btn) btn.textContent = prevText;
    // A refused fast-forward says what diverged and how to sort it out.
    const b = e.body || {};
    if (b.code === 'diverged') offerSync(b);
    else if (b.code === 'in-progress') offerUnfinished(b);
    else showGitError('Pull failed', e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// After anything that moved HEAD (pull, abort): open
// files, diffs, the tree and the commit lists all show the new history.
async function afterHistoryChange() {
  await reindexWorkspace();
  if (S.meta?.pr) await refreshPRMeta();
  await reloadOpenTabs(); // open files and diffs show the pulled content, not what was loaded before
  await fetchRecentCommits();
  await refreshUnpushed();
  await triggerRefresh();
}

/* ---------- PR branch: up to date with the base, force-push ----------
   The PR bar asks ('pr:resolve') when the forge reports conflicts or a
   branch that is behind; the panel says where the checkout stands. A local
   rebase rewrites the PR's commits, so it only reaches the PR by a
   force-push, and that is always confirmed here first. 'git:sync' tells the PR bar what is going on, so Approve and
   Merge never act on commits the checkout has since moved past. */

let rewritten = false; // PR mode: HEAD rebased past the PR head, not yet force-pushed

function emitSync() {
  emit('git:sync', { inProgress: syncInProgress, rewritten });
}

let syncInProgress = ''; // "rebase"/"merge" left half-done, as last seen

async function resolvePRBase() {
  const base = S.meta?.pr?.base || 'the base branch';
  notice({ tone: 'busy', title: `Fetching ${base}...`, closable: false });
  let st;
  try {
    st = await api('/api/git/sync-state?fetch=1');
  } catch (e) {
    showGitError(`Could not fetch ${base}`, e.message);
    return;
  }
  syncInProgress = st.inProgress || '';
  emitSync();
  if (st.inProgress) offerUnfinished(st);
  else if (st.rewritten) confirmForcePush();
  else if (st.behind > 0) offerSync(st);
  else {
    notice({
      tone: 'ok', title: `Up to date with ${base}`,
      html: `This checkout already has everything on ${code(base)}. If the PR still shows conflicts, the forge may not have recomputed them yet.`,
    });
  }
}

function confirmForcePush() {
  const pr = S.meta?.pr || {};
  notice({
    tone: 'warn', title: `Force-push to PR #${pr.number}?`,
    html: `This checkout was rebased, so its commits replace the ones on ${code(pr.head)} rather than adding to them.` +
      `<span class="hint">Pushed with a lease: if anyone else pushed to ${esc(pr.head || 'the branch')} since this checkout, the push is refused and nothing of theirs is lost.</span>`,
    actions: [
      { label: 'Force-push', primary: true, title: `git push --force-with-lease to ${pr.head}`, run: () => doPush(true) },
      { label: 'Not now', run: clearGitNotice },
    ],
  });
}

/* ---------- notice: git outcomes, inline ----------
   Every git failure lands in this one card at the top of the panel, never in
   a global toast. A pull that can't fast-forward, or a rebase or merge left
   half-done, says so here with the next step. */

function initNotice() {
  $('#git-notice-close')?.addEventListener('click', clearGitNotice);
  // Stage ticks in the file tree report their failures here too.
  on('git:error', ({ title, message }) => showGitError(title, message));
  on('pr:resolve', resolvePRBase);
  on('pr:force-push', confirmForcePush);
  on('pr:pull', doPull);
  on('forge:connected', updateGitPanelVisibility);
  on('sidebar:mode', () => {
    updateGitPanelVisibility();
    // Hiding the panel gives the tree (and the space around it) new height.
    layout();
    render();
  });
}

/**
 * @param {{tone?: string, title: string, html?: string,
 *   actions?: {label: string, run: () => void, primary?: boolean, title?: string}[],
 *   closable?: boolean}} opts
 */
function notice({ tone = 'err', title, html = '', actions = [], closable = true }) {
  const n = $('#git-notice');
  if (!n) return;
  n.dataset.tone = tone;
  $('#git-notice-title').textContent = title;
  $('#git-notice-text').innerHTML = html;
  $('#git-notice-close').hidden = !closable;
  $('#git-notice-actions').replaceChildren(...actions.map(a => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = a.label;
    if (a.primary) b.className = 'primary';
    if (a.title) b.title = a.title;
    b.addEventListener('click', () => {
      for (const x of $('#git-notice-actions').children) x.disabled = true;
      a.run();
    });
    return b;
  }));
  n.hidden = false;
  const p = panel();
  if (p?.classList.contains('collapsed')) {
    p.classList.remove('collapsed');
    layout(); render();
  }
  n.scrollIntoView({ block: 'nearest' });
}

export function clearGitNotice() {
  const n = $('#git-notice');
  if (n) n.hidden = true;
}

// showGitError reports a failed git action in the panel. message is the
// server's own error text when there is one.
export function showGitError(title, message = '') {
  notice({ tone: 'err', title, html: esc(message) });
}

const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');
const code = s => '<code>' + esc(s || '') + '</code>';

// offerSync is the card a diverged pull leaves: what diverged, and how to
// bring the branch up to date from a terminal.
function offerSync(st) {
  const up = st.upstream || 'upstream';
  const pr = st.pr > 0;
  const title = pr ? `PR #${st.pr} is behind ${up}` : "Can't fast-forward";
  const html = (pr
    ? `${code(st.branch)} is missing ${plural(st.behind || 0, 'commit')} from ${code(up)}; the PR has ${plural(st.ahead || 0, 'commit')} of its own.`
    : `${code(st.branch)} and ${code(up)} have diverged: ${plural(st.ahead || 0, 'local commit')} not upstream, ${st.behind || 0} incoming.`) +
    `<span class="hint">Run ${code(pr ? 'git rebase ' + up : 'git pull --rebase')} (or a merge) in a terminal to bring it up to date.</span>`;
  notice({ tone: 'warn', title, html });
}

// offerUnfinished is the card for a rebase or merge left half-done, say by a
// terminal that stopped on a conflict.
function offerUnfinished(st) {
  const op = st.inProgress;
  const html = `${code(st.branch)} is in the middle of a ${op}${st.upstream ? ' onto ' + code(st.upstream) : ''}, most likely stopped on a conflict.` +
    `<span class="hint">Finish it in a terminal, or abort to put the branch back exactly as it was before the ${op}.</span>`;
  notice({ tone: 'warn', title: `${op === 'rebase' ? 'Rebase' : 'Merge'} not finished`, html, actions: [{ label: `Abort ${op}`, run: abortSync }], closable: true });
}

async function abortSync() {
  try {
    await apiPostJson('/api/git/abort', {});
  } catch (e) {
    showGitError('Abort failed', e.message);
    return;
  }
  syncInProgress = '';
  emitSync();
  await afterHistoryChange();
  notice({
    tone: 'ok', title: 'Aborted',
    html: 'The branch is back where it was.',
  });
}

// A rebase or merge left half-done (a closed tab mid-run, a terminal) is
// surfaced on load rather than discovered later as a confusing dirty tree.
async function checkUnfinishedSync() {
  try {
    const st = await api('/api/git/sync-state');
    syncInProgress = st.inProgress || '';
    rewritten = !!st.rewritten;
    emitSync();
    if (st.inProgress) offerUnfinished(st);
  } catch {}
}

export async function fetchRecentCommits() {
  if (!S.meta?.git) return;
  try {
    const res = await api('/api/git/log?limit=5');
    if (res?.commits) {
      renderRecentCommits(res.commits);
      updateSeeAllCommits(res.commitsUrl, res.commits.length);
    }
  } catch {
    // Silently ignore if git log not available
  }
}

let currentCommitsUrl = '';

function updateSeeAllCommits(commitsUrl, commitCount) {
  if (commitsUrl) currentCommitsUrl = commitsUrl;
  if (S.meta?.pr) {
    currentCommitsUrl = `https://github.com/${S.meta.pr.owner}/${S.meta.pr.repo}/pull/${S.meta.pr.number}/commits`;
  }
  const link = $('#git-see-all-commits');
  if (!link) return;
  if (commitCount === 0) {
    link.hidden = true;
    return;
  }
  link.hidden = false;
  if (currentCommitsUrl) {
    link.href = currentCommitsUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.title = 'View all repository commits in browser';
  } else {
    link.href = '#';
    link.removeAttribute('target');
    link.title = 'View commits';
  }
}

async function handleSeeAllCommits(e) {
  if (currentCommitsUrl) return; // Follow standard hyperlink
  e.preventDefault();
  try {
    const res = await api('/api/git/log?limit=50');
    if (res?.commits) {
      renderRecentCommits(res.commits, 0);
      const link = $('#git-see-all-commits');
      if (link) link.hidden = true;
    }
  } catch (err) {
    showGitError('Could not load commits', err.message);
  }
}

/* ---------- recent commits: expandable rows ----------
   The git status stream re-sends the commits on every tick, so the list is
   rebuilt only when they change, and expanded rows are restored from cache.
   A file opens as a tab pinned to the commit (openFile's ref), the same as
   the Unpushed section; the rows themselves come from commitfiles.js. */

const listedCommits = new Map(); // full SHA -> GitCommit, for the expanded meta line
const expandedCommits = new Set();
let renderedCommitsKey = '';

function renderRecentCommits(commits, max = 5) {
  const list = $('#git-commits-list');
  if (!list) return;
  if (!commits || commits.length === 0) {
    renderedCommitsKey = '';
    list.innerHTML = '<div class="git-commits-empty">No commits yet</div>';
    return;
  }
  const slice = max ? commits.slice(0, max) : commits;
  const key = slice.map(c => c.full + '\x1f' + c.subject + '\x1f' + c.date).join('\x1e');
  if (key === renderedCommitsKey) return;
  renderedCommitsKey = key;
  listedCommits.clear();
  for (const c of slice) listedCommits.set(c.full, c);
  const focused = list.contains(document.activeElement) ? document.activeElement.closest('.git-commit')?.dataset.sha : null;
  list.innerHTML = slice.map(c => `
    <div class="git-commit" data-sha="${esc(c.full)}">
      <div class="git-commit-row" tabindex="0" role="button" aria-expanded="false" title="${esc(c.subject || '')} (${esc(c.author || '')}, ${esc(c.date || '')})&#10;Click to show changed files">
        <svg class="git-commit-caret" viewBox="0 0 10 10" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 2L6.5 5L3.5 8"/></svg>
        <svg class="git-commit-icon" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="8" cy="8" r="2.8"/><line x1="8" y1="1" x2="8" y2="5.2"/><line x1="8" y1="10.8" x2="8" y2="15"/></svg>
        <span class="git-commit-msg-text">${esc(c.subject || '(no message)')}</span>
        <button type="button" class="git-commit-sha" tabindex="-1" title="Copy SHA">${esc(c.hash)}</button>
      </div>
      <div class="git-commit-files" hidden></div>
    </div>
  `).join('');
  for (const sha of [...expandedCommits]) {
    const el = commitEl(sha);
    if (el) setCommitExpanded(el, true);
    else expandedCommits.delete(sha);
  }
  if (focused) commitEl(focused)?.querySelector('.git-commit-row')?.focus();
}

function commitEl(sha) {
  return $('#git-commits-list')?.querySelector(`.git-commit[data-sha="${CSS.escape(sha)}"]`);
}

async function setCommitExpanded(el, open) {
  const sha = el.dataset.sha;
  const row = el.querySelector('.git-commit-row');
  const body = el.querySelector('.git-commit-files');
  el.classList.toggle('expanded', open);
  row.setAttribute('aria-expanded', String(open));
  body.hidden = !open;
  if (!open) {
    expandedCommits.delete(sha);
    body.replaceChildren(); // hiding would keep every row in memory
    return;
  }
  expandedCommits.add(sha);
  const cached = cachedCommitFiles(sha);
  if (cached) { drawCommitFiles(body, sha, cached); return; }
  body.innerHTML = '<div class="git-commit-note">Loading…</div>';
  try {
    const files = await loadCommitFiles(sha);
    if (el.isConnected && expandedCommits.has(sha)) drawCommitFiles(body, sha, files);
  } catch (e) {
    if (el.isConnected) body.innerHTML = `<div class="git-commit-note">${esc(e.message || 'Could not load commit')}</div>`;
  }
}

function drawCommitFiles(body, sha, files) {
  const c = listedCommits.get(sha);
  const meta = c ? `<div class="git-commit-meta">${esc(c.author)} · ${esc(c.date)}</div>` : '';
  if (!files.length) {
    body.innerHTML = meta + '<div class="git-commit-note">No file changes</div>';
    return;
  }
  body.innerHTML = meta;
  appendCommitFiles(body, sha, files);
}

// Builds the next page of rows; returns the index of the first one added.
function appendCommitFiles(body, sha, files) {
  const from = body.querySelectorAll('.up-file').length;
  body.querySelector('.up-more')?.remove();
  body.insertAdjacentHTML('beforeend', commitFileRows(files, from, from + COMMIT_FILES_PAGE, activeCommitPath(sha)));
  return from;
}

function showMoreCommitFiles(el) {
  const files = cachedCommitFiles(el.dataset.sha);
  if (!files) return -1;
  return appendCommitFiles(el.querySelector('.git-commit-files'), el.dataset.sha, files);
}

function openCommitPath(el, path) {
  // lx8 has no diff for a binary file, so say so rather than doing nothing.
  if (cachedCommitFiles(el.dataset.sha)?.find(f => f.path === path)?.binary) {
    showGitError('Binary file, no diff to show');
    return;
  }
  openFile(path, { ref: el.dataset.sha, view: 'diff' });
}

// Double-click or Enter on a commit: expand it and open its first file.
async function openFirstCommitFile(el) {
  if (!el.classList.contains('expanded')) setCommitExpanded(el, true);
  try {
    const files = await loadCommitFiles(el.dataset.sha);
    if (files.length) openCommitPath(el, files[0].path);
    else showGitError('This commit changes no files');
  } catch (e) {
    showGitError('Could not load commit', e.message);
  }
}

// The path the active tab shows if it is pinned to sha, else ''.
function activeCommitPath(sha) {
  const d = S.tabs[S.active];
  return d && d.diffRef === sha ? d.path : '';
}

function markActiveCommitFile() {
  const list = $('#git-commits-list');
  if (!list) return;
  for (const x of list.querySelectorAll('.up-file.sel')) x.classList.remove('sel');
  for (const el of list.querySelectorAll('.git-commit.expanded')) {
    const path = activeCommitPath(el.dataset.sha);
    if (path) el.querySelector(`.up-file[data-path="${CSS.escape(path)}"]`)?.classList.add('sel');
  }
}

function initCommitList() {
  const list = $('#git-commits-list');
  if (!list) return;
  list.addEventListener('click', e => {
    const sha = e.target.closest('.git-commit-sha');
    if (sha) {
      e.stopPropagation();
      copyToClipboard(sha.textContent, 'Copied ' + sha.textContent, sha);
      return;
    }
    const more = e.target.closest('.up-more');
    if (more) { showMoreCommitFiles(more.closest('.git-commit')); return; }
    const file = e.target.closest('.up-file');
    if (file) { openCommitPath(file.closest('.git-commit'), file.dataset.path); return; }
    const row = e.target.closest('.git-commit-row');
    // The second click of a double-click opens instead (dblclick below).
    if (row && e.detail < 2) {
      const el = row.closest('.git-commit');
      setCommitExpanded(el, !el.classList.contains('expanded'));
    }
  });
  list.addEventListener('dblclick', e => {
    const row = e.target.closest('.git-commit-row');
    if (!row || e.target.closest('.git-commit-sha')) return;
    openFirstCommitFile(row.closest('.git-commit'));
  });
  list.addEventListener('keydown', e => {
    const item = e.target.closest('.git-commit-row, .up-file, .up-more');
    if (!item) return;
    const el = item.closest('.git-commit');
    const isRow = item.classList.contains('git-commit-row');
    if (item.classList.contains('up-more') && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      const first = showMoreCommitFiles(el);
      el.querySelectorAll('.up-file')[first]?.focus();
      return;
    }
    const items = [...list.querySelectorAll('.git-commit-row, .git-commit.expanded .up-file, .git-commit.expanded .up-more')];
    const at = items.indexOf(item);
    switch (e.key) {
      case 'ArrowDown': items[at + 1]?.focus(); break;
      case 'ArrowUp': items[at - 1]?.focus(); break;
      case 'ArrowRight':
        if (isRow && !el.classList.contains('expanded')) setCommitExpanded(el, true);
        else if (isRow) items[at + 1]?.focus();
        break;
      case 'ArrowLeft':
        if (isRow) setCommitExpanded(el, false);
        else el.querySelector('.git-commit-row').focus();
        break;
      case 'Enter':
        if (isRow) openFirstCommitFile(el);
        else openCommitPath(el, item.dataset.path);
        break;
      case ' ':
        if (isRow) setCommitExpanded(el, !el.classList.contains('expanded'));
        else openCommitPath(el, item.dataset.path);
        break;
      default: return;
    }
    e.preventDefault();
  });
  on('tab:activated', markActiveCommitFile);
}
