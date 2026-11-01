# Direct File Editing & Creation

lx8 is editor-first: clicking a text file opens it ready to type, not just to read. This is for small, direct changes. Larger or multi-file changes still go through a coding harness (see [Agent Editing](agent-editing.md)).

---

## Opening the Editor

- Text files open directly in an editable, syntax-highlighted view by default (`editor.editOnOpen`). Changed files in a normal project open as source too; their diff is still one `Cmd/Ctrl+D` away.
- PR review sessions keep the diff-first view — the diff is the reason for the session.
- Markdown, CSV/TSV, and `.env` files keep their rendered or table view. Press **`Cmd/Ctrl+E`** to edit them as text; leaving the editor returns to the view you started from.
- Images, deleted files, and tabs pinned to a commit are read-only.
- Files over 10,000 lines or 1 MB ask for confirmation first, because the whole file is loaded into the editor.

## Saving

- **Autosave is on by default** (`editor.autosave`). Edits are written about 800 ms after you stop typing, and pending edits are flushed when you switch tabs or leave edit mode.
- **`Cmd/Ctrl+S`** (or the **Save** button) still writes immediately. The button briefly turns solid green with a check mark on success.
- **`Cmd/Ctrl+Alt+S`** saves every edited file with unsaved changes.
- Turn autosave off in Settings if you prefer manual saves. The tab then keeps its unsaved-changes dot, and closing a dirty tab or the browser window asks before discarding anything.
- Leaving edit mode with autosave on saves the latest text first; if the save fails, the editor stays open instead of losing it.

## Editor Behavior

| Key | Behavior |
| :--- | :--- |
| `Tab` | Inserts four spaces. With a multi-line selection, indents every selected line. |
| `Shift+Tab` | Outdents the current line or selected lines. |
| `Enter` | Keeps the indentation of the current line. |
| `Cmd/Ctrl+S` | Saves the file. |
| `Cmd/Ctrl+Alt+S` | Saves all edited files. |
| `Cmd/Ctrl+F` | Finds in the current file. |
| `Cmd/Ctrl+Alt+F` or `Ctrl+H` (Linux/Windows) | Opens find with the replace row. |
| `Cmd/Ctrl+/` | Toggles a line comment on the current line or selection. |
| `Shift+Alt+Down` | Duplicates the current line or selection. |
| `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z` | Undo / redo (native text editing). |
| `Esc` | Leaves edit mode. |

Find and replace operate on the live text, before autosave; Replace and Replace All update the buffer and are written by the next autosave.

- **Word wrap** follows the same setting as the code view (`editor.wordWrap`, `Alt+Z`). Long lines wrap at the editor edge and the gutter number stays aligned with the first row of each wrapped line.
- **Syntax highlighting** is generated locally and follows the same theme colours as the read-only view. Files above 400,000 characters fall back to plain text in the textarea so typing stays responsive.
- **Unsaved changes** show a dot on the tab. Switching tabs keeps each file's text and scroll position.
- Opening a diff for the file you are editing leaves edit mode and shows the diff; the unsaved text is kept for when you edit again.

## Creating, Renaming, and Deleting

- Use the **New File** and **New Folder** buttons in the sidebar header, right-click a folder in the tree, or run **File: New File...** / **File: New Folder...** from the Command Palette. A new file opens straight into the editor.
- Right-click any file or folder and choose **Rename...** to rename or move it. The current name is selected; enter a bare name to keep it in the same folder, or a path to move it. The target must not already exist.
- Right-click any file or folder and choose **Delete** to remove it. Deleting a folder removes its contents. The root and `.git` are protected.
- Both actions check open tabs first: unsaved changes in an affected tab ask before being discarded, and open tabs for the old path are closed. Renaming an open file reopens it at its new path.

## Git and the Rest of the UI

Saving, creating, renaming, or deleting refreshes the git panel, tree badges, and change counts immediately. The index, LSP documents, and syntax-highlight cache are refreshed too, so search, symbols, and diagnostics see the change.

The git panel lives in the sidebar's **Changes** view. The default **Files** view keeps the editing surface uncluttered; the segmented toggle brings the panel back.
