// web/src/newitem.js
import { $, apiPostJson, S } from './state.js';
import { showToast } from './ui.js';
import { openFile, confirmDiscardTabsUnderPath, closeTabsUnderPath } from './tabs.js';
import { enterEditMode, suspendAutosaveForPath, resumeAutosaveForPath } from './editview.js';
import { triggerRefresh } from './gitstream.js';
import { drawTree, revealDir, treeEl } from './tree.js';
import { emit } from './bus.js';

export function promptNewItem(type, targetDir = '') {
  const modal = $('#input-modal');
  const modalTitle = $('#modal-title');
  const modalDesc = $('#modal-desc');
  const modalInput = $('#modal-input');
  if (!modal || !modalTitle || !modalDesc || !modalInput) return;

  const currentType = type === 'dir' ? 'dir' : type === 'env' ? 'env' : 'file';
  modal.dataset.type = currentType;
  delete modal.dataset.oldPath;
  delete modal.dataset.isDir;
  const baseDir = targetDir ? targetDir.replace(/^\/+|\/+$/g, '') : '';
  const prefix = baseDir ? baseDir + '/' : '';

  modalTitle.textContent = currentType === 'dir' ? 'New Folder' : currentType === 'env' ? 'New Environment File' : 'New File';
  modalDesc.textContent = currentType === 'env'
    ? 'Name of the new file (.env, .env.local, .env.production):'
    : prefix
      ? `Create inside ${prefix} (or specify path):`
      : 'Enter relative path from project root:';
  const modalOk = $('#modal-btn-ok');
  if (modalOk) modalOk.textContent = 'Create';
  modalInput.value = currentType === 'env' ? '.env' : prefix;
  modal.hidden = false;
  modalInput.focus();
  modalInput.setSelectionRange(modalInput.value.length, modalInput.value.length);
}

/* Rename starts with just the item's name selected, keeping its folder in
   place. Typing a path with a slash still moves it somewhere else. */
export function promptRename(path, isDir = false) {
  const modal = $('#input-modal');
  const modalTitle = $('#modal-title');
  const modalDesc = $('#modal-desc');
  const modalInput = $('#modal-input');
  if (!modal || !modalTitle || !modalDesc || !modalInput) return;

  const name = path.split('/').pop() || path;
  modal.dataset.type = 'rename';
  modal.dataset.oldPath = path;
  modal.dataset.isDir = isDir ? '1' : '';
  modalTitle.textContent = isDir ? 'Rename Folder' : 'Rename File';
  modalDesc.textContent = `Rename ${path} to:`;
  const modalOk = $('#modal-btn-ok');
  if (modalOk) modalOk.textContent = 'Rename';
  modalInput.value = name;
  modal.hidden = false;
  modalInput.focus();
  const dot = name.lastIndexOf('.');
  const selectTo = !isDir && dot > 0 ? dot : name.length;
  modalInput.setSelectionRange(0, selectTo);
}

export function closeNewItemModal() {
  const modal = $('#input-modal');
  const modalInput = $('#modal-input');
  if (modal) modal.hidden = true;
  if (modalInput) modalInput.value = '';
}

async function submitNewItem() {
  const modal = $('#input-modal');
  const modalInput = $('#modal-input');
  const btnOk = $('#modal-btn-ok');
  if (!modal || !modalInput) return;

  const currentType = modal.dataset.type || 'file';
  const val = modalInput.value.trim().replace(/^\/+|\/+$/g, '');
  if (!val) {
    showToast('!', 'Path cannot be empty');
    return;
  }

  if (btnOk) btnOk.disabled = true;
  try {
    if (currentType === 'rename') {
      const oldPath = modal.dataset.oldPath || '';
      const isDir = modal.dataset.isDir === '1';
      if (!oldPath) return;
      let newPath = val;
      if (!val.includes('/')) {
        const slash = oldPath.lastIndexOf('/');
        newPath = (slash >= 0 ? oldPath.slice(0, slash + 1) : '') + val;
      }
      if (newPath === oldPath) {
        closeNewItemModal();
        return;
      }
      if (!confirmDiscardTabsUnderPath(oldPath, isDir)) return;
      const wasOpen = S.tabs.some(t => t.path === oldPath);
      await suspendAutosaveForPath(oldPath, isDir);
      let res;
      try {
        res = await apiPostJson('/api/fs/rename', { path: oldPath, newPath });
      } catch (err) {
        resumeAutosaveForPath(oldPath, isDir);
        throw err;
      }
      closeNewItemModal();
      closeTabsUnderPath(oldPath, isDir);
      showToast('✓', 'Renamed to ' + res.newPath);
      const renamedDir = res.newPath.includes('/') ? res.newPath.slice(0, res.newPath.lastIndexOf('/')) : '';
      await drawTree('', treeEl, 0);
      if (renamedDir) await revealDir(renamedDir);
      triggerRefresh();
      if (!isDir && wasOpen) await openFile(res.newPath);
      return;
    }

    if (currentType === 'env') {
      // An environment file is created with permissions only its owner can
      // read, and it opens in the environment editor straight away.
      const res = await apiPostJson('/api/env/create', { path: val });
      closeNewItemModal();
      showToast('✓', 'Created ' + res.path);
      emit('file:created', { path: res.path });
      await openFile(res.path);
      return;
    }

    const res = await apiPostJson('/api/fs/new', { path: val, type: currentType });
    closeNewItemModal();
    showToast('✓', (currentType === 'dir' ? 'Created folder ' : 'Created ') + res.path);

    const parentDir = val.includes('/') ? val.substring(0, val.lastIndexOf('/')) : '';
    await drawTree('', treeEl, 0);
    if (parentDir) {
      await revealDir(parentDir);
    }

    triggerRefresh();

    if (currentType === 'file') {
      await openFile(res.path);
      await enterEditMode();
    }
  } catch (err) {
    showToast('!', 'Failed to ' + (currentType === 'rename' ? 'rename: ' : 'create: ') + (err.message || 'unknown error'));
  } finally {
    if (btnOk) btnOk.disabled = false;
  }
}

export function initNewItem() {
  const modal = $('#input-modal');
  if (!modal) return;

  $('#btn-new-file')?.addEventListener('click', () => promptNewItem('file'));
  $('#btn-new-folder')?.addEventListener('click', () => promptNewItem('dir'));

  $('#modal-btn-cancel')?.addEventListener('click', closeNewItemModal);
  $('#modal-btn-ok')?.addEventListener('click', submitNewItem);
  $('#modal-btn-close')?.addEventListener('click', closeNewItemModal);

  const modalInput = $('#modal-input');
  modalInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitNewItem();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeNewItemModal();
    }
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeNewItemModal();
  });
}
