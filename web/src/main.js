// web/src/main.js
import { $, S, api, applyKeyLabels } from './state.js';
import { measure, layout, render, initRenderer, updateEditorOptionControls } from './renderer.js';
import { initTabs, openFile, switchTab } from './tabs.js';
import { initCursor } from './cursor.js';
import { initHover } from './hover.js';
import { initSelectionBar } from './selbar.js';
import { initTree, revealFile, refreshTree, collapseAllDirs, expandDirtyDirs, inGitMode, setAutoRevealSuppressed, setSidebarMode, updateSidebarToggleState } from './tree.js';
import { initSearch } from './search.js';
import { initOutline } from './outline.js';
import { initPanels } from './panels.js';
import { initInspector } from './inspector.js';
import { initCalls } from './calls.js';
import { initFind } from './find.js';
import { initPalette } from './palette.js';
import { initShortcuts } from './shortcuts.js';
import { initTheme } from './theme.js';
import { initMarkdown } from './markdown.js';
import { initDiff } from './diff.js';
import { initAgent, applyAgentMeta, loadAgentAsync } from './agent.js';
import { initThreads } from './thread.js';
import { initMetrics, initLspMenu, refreshLspMenu, initStatusFit, updateMetricsDisplay, updateStatus } from './status.js';
import { initSettings } from './settings.js';
import { initVim } from './vim.js';
import { initImageViewer } from './imageview.js';
import { initGitStream } from './gitstream.js';
import { initGitPanel } from './gitpanel.js';
import { initPR } from './pr.js';
import { initLineComment } from './linecomment.js';
import { initUnpushed, refreshUnpushed } from './unpushed.js';
import { initPRScope } from './prscope.js';
import { initEditView } from './editview.js';
import { initEnvView, syncEnvView } from './envview.js';
import { initEnvPanel } from './envpanel.js';
import { initNewItem } from './newitem.js';
import { initTips, startTipsAsync } from './tips.js';

// Initialize all subsystems
initRenderer();
initTabs();
initEditView();
initEnvView();
initEnvPanel();
initNewItem();
initTips();
initCursor();
initHover();
initSelectionBar();
initTree();
initGitPanel();
initSearch();
initOutline();
initPanels();
initInspector();
initCalls();
initFind();
initPalette();
initShortcuts();
initMarkdown();
initDiff();
initAgent();
initThreads();
initMetrics();
initLspMenu();
initStatusFit();
initSettings();
initVim();
initImageViewer();
initLineComment();
initUnpushed();
initPRScope();

// Bootstrap application lifecycle
(async function boot() {
  try {
    initTheme();

    // Restore word wrap (default ON)
    const wrapPref = localStorage.getItem('lx8.wrap');
    S.wrap = wrapPref !== null ? wrapPref === 'true' : true;
    document.body.classList.toggle('word-wrap', S.wrap);

    // Line numbers are always ON
    S.lineNumbers = true;
    document.body.classList.remove('hide-lines');

    // Restore Markdown preview (default ON)
    const mdPref = localStorage.getItem('lx8.mdPreview');
    S.mdPreview = mdPref !== null ? mdPref === 'true' : true;
    const tablePref = localStorage.getItem('lx8.tablePreview');
    S.tablePreview = tablePref !== null ? tablePref === 'true' : true;

    updateEditorOptionControls();
  } catch {}

  applyKeyLabels();

  measure();
  S.meta = await api('/api/meta');
  if (S.meta.metrics) updateMetricsDisplay(S.meta.metrics);
  refreshLspMenu();
  updateSidebarToggleState();
  applyAgentMeta();
  initPR();
  // The right sidebar starts closed (index.html's body carries right-hidden);
  // it is one click or Mod+J away when it is wanted, and the editor gets the
  // whole window until then.
  document.title = S.meta.name + ' - lx8';
  $('#root-name').textContent = S.meta.name;
  $('#root-name').title = S.meta.root;
  if (S.meta.workbench) {
    // Opened from the workbench (workbench.go): link back to it.
    const back = document.createElement('a');
    back.className = 'mini wb-back';
    back.href = S.meta.workbench;
    back.title = 'Back to the lx8 workbench';
    back.setAttribute('aria-label', 'Back to the lx8 workbench');
    back.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>';
    $('#root-name').before(back);
  }
  if (S.meta.version) {
    const emptyVerEl = $('#empty-ver');
    if (emptyVerEl) emptyVerEl.textContent = 'v' + S.meta.version;
    const stVerEl = $('#st-ver');
    if (stVerEl) {
      stVerEl.textContent = 'v' + S.meta.version;
      stVerEl.title = `lx8 v${S.meta.version} (Click for shortcuts & help)`;
    }
  }
  updateStatus();
  setAutoRevealSuppressed(true);
  await refreshTree();
  initGitStream();

  // A project opens on its file tree, not on the git view. The changes list
  // is for reviewing work in progress; it should not be what stands between
  // the reader and the code. The Git toggle and the git panel are still there
  // when they are wanted. PR review is the exception: the PR's changes are
  // the reason for the session.
  const applyInitialSidebarState = async () => {
    await refreshUnpushed();
    const reviewingPR = !!S.meta?.pr;
    await setSidebarMode(reviewingPR ? 'git' : 'files', { expandDirty: reviewingPR });
    return reviewingPR;
  };
  const selectChangedFileTab = async () => {
    if (S.tabs[S.active]?.diffAvailable) return;
    const changedTabIdx = S.tabs.findIndex(t => t.diffAvailable);
    if (changedTabIdx >= 0) {
      switchTab(changedTabIdx);
    } else if (S.meta.gitFiles && S.meta.gitFiles.length > 0) {
      await openFile(S.meta.gitFiles[0]);
    }
  };

  const reviewingPR = await applyInitialSidebarState();

  const params = new URLSearchParams(window.location.search);
  const initialPath = params.get('path');
  const initialLine = parseInt(params.get('line'), 10) || undefined;
  if (initialPath) {
    await openFile(initialPath, { line: initialLine });
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete('path');
      u.searchParams.delete('line');
      const cleanSearch = u.searchParams.toString();
      const cleanUrl = u.pathname + (cleanSearch ? '?' + cleanSearch : '') + u.hash;
      window.history.replaceState({}, '', cleanUrl);
    } catch {}
  } else if (reviewingPR) {
    await selectChangedFileTab();
  }

  if (inGitMode()) {
    await expandDirtyDirs();
    const activeDoc = S.tabs[S.active];
    if (activeDoc?.path) await revealFile(activeDoc.path);
  } else {
    collapseAllDirs();
  }
  setAutoRevealSuppressed(false);

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { measure(); layout(); render(); });
  }

  // If the background indexer was still running when the UI loaded, poll briefly
  // until complete to update the total file count and index time in the status bar.
  if (S.meta && !S.meta.ready) {
    const timer = setInterval(async () => {
      try {
        const m = await api('/api/meta');
        if (m.ready) {
          clearInterval(timer);
          S.meta = m;
          updateStatus();
          if (!initialPath) {
            setAutoRevealSuppressed(true);
            if (S.meta?.pr) {
              // The index now knows every changed file, so a PR session can
              // finally show its first one.
              await setSidebarMode('git', { expandDirty: true });
              await selectChangedFileTab();
            }
            // Redraw either view against the complete index. The sidebar
            // stays in whichever mode the reader chose; finishing the index
            // is not a reason to move it.
            await refreshTree();
            if (inGitMode()) {
              await expandDirtyDirs();
              const activeDoc = S.tabs[S.active];
              if (activeDoc?.path) await revealFile(activeDoc.path);
            }
            setAutoRevealSuppressed(false);
          }
        }
      } catch {
        clearInterval(timer);
      }
    }, 150);
  }

  // Load harnesses and models asynchronously after the browser is loaded.
  loadAgentAsync();

  // Load and asynchronously display tips
  startTipsAsync();
})();
