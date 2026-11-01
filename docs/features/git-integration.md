# Git Awareness, Diff Viewer & Stage/Commit/Push/Pull

lx8 includes built-in Git awareness, an interactive visual diff viewer, and a sidebar panel for the rest of the everyday git loop. It highlights working-tree modifications across your file tree and editor gutters, lets you toggle between source code and an interactive side-by-side or unified diff against `HEAD` with `Cmd/Ctrl+D`, and stages, commits, pushes, and pulls without leaving the browser.

---

## Overview & Core Purpose

In modern software engineering, editors, background formatters, code generators, and compilers continuously generate or modify files on disk. Developers spend a significant portion of their time verifying what changed, ensuring unintended edits were not introduced, and auditing modifications prior to staging or committing.

lx8's git status and diffing are read-only and zero-latency by default: querying `git status` asynchronously in the background never stages files, mutates index locks, or slows down viewer startup. With visual badges, ancestor dirty propagation, gutter indicators, and full split/unified diffs, you can review changes with complete confidence without leaving the browser.

The sidebar's git panel is the one part of this feature that *does* write to the repository — but only in direct response to a click: staging, committing, pushing, and pulling all happen exactly when you ask for them, never automatically. Pull is deliberately conservative (fast-forward only) so it can never leave the working tree mid-conflict on its own; when branches have diverged, it says so and leaves the rebase or merge to you.

---

## Key Capabilities

- **Real-Time Live Status Synchronization**: lx8 establishes a lightweight Server-Sent Events (SSE) connection (`/api/stream`, aliased by `/api/git/stream`) to push working-tree status changes directly to the browser. You do not need to refresh the browser or click manual reindex buttons when files change on disk.
- **Sub-Millisecond CLI Change Awareness**: When you execute Git operations in your terminal (`git checkout`, `git reset`, `git add`, `git commit`, `git restore`, `git stash`), lx8 detects the operation in sub-milliseconds by checking metadata timestamps on Git control files (`.git/index`, `.git/HEAD`, `.git/packed-refs`), instantly updating your view without scanning files on disk.
- **File Tree Status Badges**: The file explorer decorates changed files with colored badges indicating their Git working-tree status:
  - `M` (Modified): Working tree file differs from `HEAD`.
  - `A` (Added / Staged): Newly added file staged in the index.
  - `D` (Deleted): File removed from the working tree.
  - `U` (Untracked): New file not yet tracked by Git.
  - `R` (Renamed): File renamed or moved.
- **Dirty Ancestor Folder Propagation**: When a nested file is modified (e.g., `src/core/auth/token.go`), all parent directories in the tree (`auth/`, `core/`, `src/`) display a subtle dirty indicator badge. This allows you to spot modifications even when folder branches are collapsed.
- **File Explorer vs. Git Changes Toggle**: A dedicated segmented toggle in the sidebar header allows you to switch between the full project directory tree and the Git changes view. In Git changes mode, lx8 collapses untouched folders and presents only files with uncommitted additions, modifications, or deletions, and shows the Git panel underneath. The default Files view hides the panel so the editing surface stays uncluttered. A project always opens on the file tree: reviewing changes is a view you ask for, not the first thing standing between you and the code.
- **Follows the Checkout**: A pull, a branch switch made in a terminal (`git switch`, `git checkout`), a reset or a rebase moves `HEAD` without changing any file's status. lx8 watches the branch and commit, then re-indexes the tree and re-reads every open tab, so the editor never keeps showing a file from the branch that is no longer checked out. The branch name in the git panel updates at the same time.
- **Automatic Explorer Fallback**: If all uncommitted changes are discarded or committed while you are in Git changes mode, lx8 automatically switches back to standard file explorer mode so you are never left viewing an empty tree.
- **Auto-Closing Discarded Diff Tabs**: When you discard changes to a file from the terminal (`git checkout -- file` or `git reset`), any tab opened in diff view for that file automatically closes in reverse index order, keeping the active tab index stable and preventing stale diff errors.
- **Visual Gutter Diff Indicators**: The code viewer gutter places colored indicator bars alongside line numbers to mark edits in real time:
  - Green bar for added lines.
  - Blue bar for modified lines.
  - Red triangle or marker for deleted lines.
- **Interactive Diff Viewer (`Cmd/Ctrl+D`)**: A changed file opens as source in a normal project so it is immediately editable; `Cmd/Ctrl+D` swaps to the full Git diff and back. PR review sessions stay diff-first.
- **Side-by-Side & Unified Diff Modes**:
  - **Side-by-Side (Split)**: View original `HEAD` code on the left and active working-tree code on the right with synchronized scrolling.
  - **Unified**: View changes inline with consecutive additions and deletions.
- **Intra-Line Character Diff Highlighting**: Powered by a token-level Myers diff algorithm with sub-character refinement. Exact modified characters and words are highlighted with distinct contrast within changed lines across both split and unified layouts, while insertion carets pinpoint where text was inserted relative to counterpart lines.
- **Whitespace Diff Filtering**: Toggle whitespace trimming to hide trivial indentation and trailing space differences when reviewing significant logic changes.
- **Battery and Focus Awareness**: The live stream automatically suspends when the browser tab is hidden (`document.visibilityState === 'hidden'`), conserving CPU cycles and laptop battery. When you switch back to lx8, it instantly reconnects and queries `/api/git/refresh` to catch any changes made while the window was in the background.
- **Per-File Stage Tick**: Every changed row in the file tree carries a small tick button next to its status badge. Clicking it stages or unstages that file (`git add` / `git reset`) without opening a terminal; the tick updates live as the same status stream that drives the badges reconciles it.
- **Git Panel (Stage, Commit, Push, Pull)**: A resizable panel at the bottom of the sidebar shows the current branch, a live `staged / changed` count, a monospace commit message box, and Stage All / Commit / Pull / Push buttons. It appears in the sidebar's Changes view; the Files view keeps it hidden until you switch.
- **Browse Recent Commits**: The git panel lists the latest commits. Click a commit to expand it in place: its author, when it was made, and every file it changed, each with an `A`/`M`/`D`/`R` status letter and `+`/`−` line counts. Click a file to read that commit's own diff, the same way the Unpushed list does: the tab is pinned to the commit and marked `@03beaf0`. A strip above the diff shows where the file sits in the commit (`3 / 17`); ‹ › step to the neighbouring file, swapping the tab in place rather than opening one per file. Click the short hash at the end of a row to copy it. Merge commits are shown against their first parent. In both lists, a large commit shows 100 files at a time, with a **Show 100 more** row below.
- **Fast-Forward-Only Pull**: Pull always tries a clean fast-forward onto the remote (or, in a PR review session, the pull request's current head). If history has diverged, lx8 itself never starts a merge. Instead the git panel shows what diverged and suggests the command to run in a terminal. A rebase or merge left half-done can be aborted from the panel.
- **Git Errors Stay in the Git Panel**: Every git failure (stage, commit, push, pull, abort) shows in a card at the top of the git panel, next to the buttons that caused it, never as a global toast. The card stays until you dismiss it or the next git action succeeds.
- **Push to the Right Place**: In a plain workspace, Push pushes the current branch to its configured upstream (offering to set one up on a first push). In a PR review session, Push targets the pull request's actual head branch on its actual repository — a fork included — never wherever the checkout happens to be sitting.
- **Unpushed Commits**: Under the file tree, the Git changes view lists the commits on your branch that the tracking branch doesn't have yet (`@{u}..HEAD`), labelled with the ref they're ahead of (e.g. `origin/master`) so it's clear what "unpushed" means here. Click a commit to see the files it touched, badged the same way as working-tree changes; click a file to read that commit's own diff in the normal diff viewer. Committing no longer hides your work: the toggle stays available on a clean working tree, precisely because the commits are then the only thing left to review. If the branch has no upstream configured, the section simply doesn't appear — lx8 never guesses a branch to measure against.
- **Commit Hover Card**: Hovering a commit in that list shows its author, the full commit message, and its diffstat (insertions in green, deletions in red), with a **Copy SHA** button and — on a GitHub remote — a link on the author's name.

---

## Developer Workflows & Practical Value

### Continuous Auditing of Background Edits
When another tool (a code generator, formatter, or a script) edits your code in the background:
1. Switch to the **Git Changes** view in the sidebar to isolate touched files.
2. Status badges and gutter markers update in real time as files change on disk.
3. Open any modified file and press **`Cmd/Ctrl+D`** to review side-by-side changes against `HEAD`.
4. If an edit needs refinement, fix it directly in the editor.

### Terminal Interaction Without Stale Views
When managing branches or staging files from your terminal:
1. Stage or reset files in the terminal (`git add file.go` or `git checkout -- file.go`).
2. lx8 immediately catches the `.git/index` modification and patches the file tree badges in place without resetting your scroll position or collapsing expanded folders.
3. Tabs displaying diffs for discarded files close automatically, keeping your workspace clean and focused.

### Pre-Commit Visual Review Station
Before committing code from your terminal, open lx8 to perform a visual walk-through of all pending changes. The Git changes view isolates your work, ensuring you do not commit debug logs, temporary comments, or unintended formatting tweaks.

### Stage, Write, and Commit Without Leaving the Browser
Once you've reviewed a change in the diff view, finish the commit right there:
1. Tick the files you want in this commit from the file tree (or click **Stage All**).
2. Write a message in the git panel's commit box and click **Commit**.
3. Click **Push** to send the branch to its remote. If it's the first push on a new branch, lx8 offers to set the upstream for you.

### Reviewing Local Commits Before You Push
When you've made several commits locally and want to read them over before sending them up:
1. Switch to the **Git Changes** view. The **Unpushed** section under the tree lists every commit ahead of your tracking branch, newest first.
2. Hover a commit to see who wrote it, its full message, and how much it changed.
3. Click it to expand the files it touched, then click a file to read that commit's diff — just that commit's, unaffected by anything you've edited since.
4. Fix anything that needs fixing, commit again (the list updates itself), and click **Push**. The section empties as the commits land.

### Catching Up With a Moving Remote
When a teammate (or CI) has pushed new commits to the branch you're reviewing:
1. Click **Pull** in the git panel.
2. If your local branch can fast-forward cleanly onto the new commits, lx8 updates it and the diff view refreshes automatically.
3. If your branch has diverged (you have local commits the remote doesn't), the git panel shows a **Can't fast-forward** card with the local and incoming commit counts. Rebase or merge in a terminal (e.g. `git pull --rebase`); lx8 picks up the result on its own.
4. A rebase or merge left half-done (usually stopped on a conflict) shows a **Not finished** card when lx8 loads or Pull is clicked. Finish it in a terminal, or click **Abort** to restore the branch exactly as it was.

---

## Keyboard Shortcuts & Controls

| Shortcut / Control | Context | Action |
| :--- | :--- | :--- |
| `Cmd/Ctrl+D` | Editor | Toggle Git Diff View (Split / Unified vs. `HEAD`) |
| Toggle Segment (`Files` / `Changes`) | Sidebar Header | Switch between File Explorer and Changed Files Only |
| Right-click a File or Folder | File Tree | New / Rename / Delete / Copy Path |
| Toggle Icon | Diff Header | Switch between Side-by-Side and Unified Diff |
| Space Icon | Diff Header | Toggle Ignore Leading/Trailing Whitespace |
| `Mod+Shift+R` | Global | Force Workspace and Git Status Refresh |
| Stage Tick | File Tree Row | Stage / unstage that file |
| Commit Row | Unpushed Section | Expand / collapse the files that commit touched |
| File Row | Unpushed Section | Open that file's diff for that commit |
| Hover a Commit | Unpushed Section | Show author, full message and diffstat, with Copy SHA |
| **Stage All** | Git Panel | Stage every changed file |
| **Commit** | Git Panel | Commit whatever is currently staged with the written message |
| **Pull** | Git Panel | Fast-forward onto the remote (or, in PR review, the PR's current head); on divergence, says what diverged |
| **Push** | Git Panel | Push the current branch (or, in PR review, to the PR's head branch) |
| Click a commit | Recent Commits | Expand / collapse its changed files |
| Click a changed file | Recent Commits | Open that file's diff within the commit, in a tab pinned to it |
| **Show 100 more** | Recent Commits, Unpushed | List the next 100 files of a large commit |
| Double-click a commit / `Enter` | Recent Commits | Open the commit's first changed file |
| Hash chip | Recent Commits | Copy the short SHA |
| `↑` / `↓`, `→` / `←` | Recent Commits | Move between commits and files; expand / collapse |
| ‹ › | Pinned tab's diff strip | Previous / next file in the commit |

---

## Configuration & Preferences

Git behavior can be customized in Settings (`Cmd/Ctrl+,`):

- **Git: Gutter Indicators** (`git.gutterIndicators`): Enable or disable real-time change indicator bars in the editor gutter (defaults to `true`).
- **Diff Editor: Render Side-by-Side** (`diffEditor.renderSideBySide`): Default layout for the diff view (`true` for split, `false` for unified).
- **Diff Editor: Ignore Trim Whitespace** (`diffEditor.ignoreTrimWhitespace`): Ignore leading and trailing whitespace diffs (defaults to `true`).
- **CLI Flag `-no-git`**: Launch lx8 with Git features completely disabled (`lx8 -no-git`) for environments where Git is not installed or when viewing plain directory archives.

---

## Technical Architecture Deep Dive

For an explanation of how lx8 executes read-only `git status --porcelain=v2` and `git diff` commands concurrently with directory indexing, how `.git/index` stat cache fast-paths achieve sub-millisecond CLI detection, and how Server-Sent Events stream diffs to the DOM, see [Git Awareness & Diffing Internals](../internals/git-integration.md).
