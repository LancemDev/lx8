# Selection Toolbar & Context Actions

lx8 features a dedicated footer selection toolbar and contextual right-click menu designed for code reading and review. When code is selected, lx8 replaces standard footer clutter with purposeful actions: Copy Reference (`Alt+C`), Copy with Context (`Alt+A`), and Find Usages (`Alt+U`).

---

## Overview & Core Purpose

In typical developer workflows, sharing code snippets with teammates or pasting them into issues and chats involves repetitive manual labor: selecting lines, copying them, manually writing down the file path and line numbers, and formatting markdown code fences.

lx8 turns code selection into a high-ergonomics launchpad. Instead of popping up obstructive floating tooltips that obscure adjacent lines of code, lx8 smoothly transitions the left section of the fixed bottom status bar into an action bar the moment text is highlighted. The same actions are simultaneously accessible via a clean right-click context menu and direct keyboard shortcuts.

---

## Key Actions & Capabilities

### 1. Copy Source (`Mod+C` / `Ctrl+C`)
Copies the highlighted code directly as is:
- Completely excludes line numbers and gutter buttons.
- Preserves full leading indentation, whitespace, and exact newlines.
- Seamlessly resolves unrendered lines across virtualized editor bounds.

### 2. Copy Raw Markdown (`Alt+M` / Context Action)
When viewing Markdown files or previewing Markdown documentation, copies the raw Markdown source code corresponding to the selection (or entire document).

### 3. Copy Formatted / Rich Text (`Mod+C` in Preview)
When text is highlighted in Markdown Preview, copies both formatted rich text (`text/html`) and clean plain text (`text/plain`), retaining styles when pasting into Google Docs, Slack, Notion, or email.

### 4. Copy Reference (`Alt+C`)
Copies a concise, standardized pointer to the selected code, formatted as:
`path/to/file.go#L42-L68` (or `path/to/file.go:42` for a single line).
- **Practical Use**: Paste directly into pull request review comments, Slack messages, or GitHub issues so teammates can immediately open the exact lines.

### 5. Copy with Context (`Alt+A`)
Copies a self-contained Markdown block:
- A header line with the repository-relative file path and the selected line range.
- The snippet in a language-tagged fenced code block.

### 6. Find Usages (`Alt+U`)
Immediately searches the workspace for all occurrences and references of the selected symbol, opening the results cleanly in the right-hand Inspector pane.

---

## Split Diff Selection Intelligence

When reviewing changes in the split (side-by-side) git diff viewer, selecting code on either the left (original `HEAD`) or right (working tree) side requires special care. Traditional editors sweep up line numbers, diff markers (`+`/`-`), and column gutters into the clipboard.

lx8 automatically normalizes diff selections:
- Gutter line numbers and diff signs are cleanly excluded.
- The selected text is accurately mapped to working-tree coordinates.
- Copy Reference and Copy with Context from a diff point at the underlying file on disk.

---

## Keyboard Shortcuts & Interaction Matrix

| Action | Shortcut | Context Menu | Status Bar Button | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Copy Source** | `Mod+C` | Right-Click | `[Copy Source]` | Copies clean code as is without line numbers |
| **Copy Text (Preview)** | `Mod+C` | Right-Click | `[Copy Text]` | Copies clean plain text + formatted rich HTML |
| **Copy Raw Markdown** | `Alt+M` | Right-Click | `[Copy Raw Markdown]` | Copies raw Markdown syntax of selection |
| **Copy Reference** | `Alt+C` | Right-Click | `[Copy Ref]` | Copies `path#L10-L25` pointer |
| **Copy with Context** | `Alt+A` | Right-Click | `[Copy with Context]` | Copies a fenced snippet headed by its path and lines |
| **Find Usages** | `Alt+U` | Right-Click | `[Find Usages]` | Finds references across workspace |

### Line Actions

Hovering a line number shows a line button. Clicking it opens the same menu as a right click, aimed at that line: Copy Source, Copy Ref and Copy with Context (plus Add Review Comment on a pull request diff line).

---

## Non-Intrusive Ergonomics

- **No Code Occlusion**: Floating toolbars often pop up directly over the line above or below your selection, hiding the very code you are trying to read. lx8 mounts action buttons in the bottom status bar, leaving the editor viewport 100% unobstructed.
- **Automatic State Restoration**: As soon as you click elsewhere or collapse the selection, the status bar smoothly restores normal file coordinates, line/column counters, and Git branch details.
