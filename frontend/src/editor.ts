import { EditorTab } from './types';
import { getFileContent, saveFile, getWorkspaceInfo, runFile, runFileInTerminal, deleteItem, validateCodeBackend } from './api';

function getCaretOffset(element: HTMLElement): number {
  let caretOffset = 0;
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    try {
      const range = sel.getRangeAt(0);
      const preCaretRange = range.cloneRange();
      preCaretRange.selectNodeContents(element);
      preCaretRange.setEnd(range.endContainer, range.endOffset);
      caretOffset = preCaretRange.toString().length;
    } catch {
      caretOffset = 0;
    }
  }
  return caretOffset;
}

interface DiagnosticResult {
  errors: number;
  warnings: number;
  details: string[];
}

function validateCode(code: string, filename: string): DiagnosticResult {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const details: string[] = [];
  let errors = 0;
  let warnings = 0;

  if (!code.trim()) {
    return { errors: 0, warnings: 0, details: [] };
  }

  // 1. JSON parsing check
  if (ext === 'json') {
    try {
      JSON.parse(code);
    } catch (e: any) {
      errors++;
      details.push(e.message || 'JSON Syntax Error');
    }
    return { errors, warnings, details };
  }

  // 2. Bracket and parenthesis balancing check
  const lines = code.split('\n');
  const stack: { char: string; line: number; col: number }[] = [];
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    let inStr = false;
    let strQuote = '';

    for (let colIdx = 0; colIdx < line.length; colIdx++) {
      const char = line[colIdx];
      // Skip comments
      if (char === '#' && ext === 'py' && !inStr) break;
      if (char === '/' && line[colIdx + 1] === '/' && (ext === 'ts' || ext === 'js') && !inStr) break;

      // Handle strings
      if ((char === '"' || char === "'") && (colIdx === 0 || line[colIdx - 1] !== '\\')) {
        if (!inStr) {
          inStr = true;
          strQuote = char;
        } else if (strQuote === char) {
          inStr = false;
          strQuote = '';
        }
        continue;
      }

      if (!inStr) {
        if (char === '(' || char === '[' || char === '{') {
          stack.push({ char, line: lineIdx + 1, col: colIdx + 1 });
        } else if (char === ')' || char === ']' || char === '}') {
          const expected = pairs[char];
          if (stack.length === 0) {
            errors++;
            details.push(`Line ${lineIdx + 1}, Col ${colIdx + 1}: Unmatched closing '${char}'`);
          } else {
            const last = stack.pop()!;
            if (last.char !== expected) {
              errors++;
              details.push(`Line ${lineIdx + 1}, Col ${colIdx + 1}: Mismatched bracket, expected '${last.char}'`);
            }
          }
        }
      }
    }

    // Python syntax helpers: check for missing colon
    if (ext === 'py') {
      const trimmed = line.trim();
      if (/^(def\s+\w+|class\s+\w+|if\s+|elif\s+|else\s*|while\s+|for\s+\w+\s+in\s+|try\s*|except\s*|finally\s*|with\s+)/.test(trimmed)) {
        if (!trimmed.endsWith(':') && !trimmed.endsWith('\\') && !trimmed.includes('#')) {
          warnings++;
          details.push(`Line ${lineIdx + 1}: Missing colon ':' at end of statement`);
        }
      }
    }
  }

  while (stack.length > 0) {
    const unclosed = stack.pop()!;
    errors++;
    details.push(`Line ${unclosed.line}: Unclosed '${unclosed.char}'`);
  }

  return { errors, warnings, details };
}

export class CodeEditor {
  private tabbar: HTMLElement;
  private lineNumbers: HTMLElement;
  private codeArea: HTMLElement;
  private minimap: HTMLElement;
  private breadcrumbs: HTMLElement;
  private titleFile: HTMLElement;
  
  // Dynamic status bar elements
  private cursorPosIndicator: HTMLElement;
  private statusErrorPill: HTMLElement;
  private statusErrorCount: HTMLElement;
  private statusWarningCount: HTMLElement;
  private statusSpaces: HTMLElement;
  private statusEncoding: HTMLElement;
  private statusLineEnding: HTMLElement;
  private statusLanguageMode: HTMLElement;
  private statusPythonVersion: HTMLElement;
  private statusGitBranch: HTMLElement;

  // Real execution output drawer & Run button
  private btnRun: HTMLElement | null;
  private btnRunTerminal: HTMLElement | null;
  private btnDelete: HTMLElement | null;
  private outputDrawer: HTMLElement | null;
  private outputHeaderTitle: HTMLElement | null;
  private outputContent: HTMLElement | null;
  private btnDrawerTerminal: HTMLElement | null;
  private btnCloseOutput: HTMLElement | null;

  private onFileDeleted?: (path: string) => void;
  private tabs: EditorTab[] = [];
  private activeTabId: string | null = null;

  constructor() {
    this.tabbar = document.getElementById('editor-tabs') as HTMLElement;
    this.lineNumbers = document.getElementById('line-numbers') as HTMLElement;
    this.codeArea = document.getElementById('code-content') as HTMLElement;
    this.minimap = document.getElementById('editor-minimap') as HTMLElement;
    this.breadcrumbs = document.getElementById('editor-breadcrumbs') as HTMLElement;
    this.titleFile = document.getElementById('window-title-file') as HTMLElement;

    // Status bar elements
    this.cursorPosIndicator = document.getElementById('cursor-pos-indicator') as HTMLElement;
    this.statusErrorPill = document.getElementById('status-error-pill') as HTMLElement;
    this.statusErrorCount = document.getElementById('status-error-count') as HTMLElement;
    this.statusWarningCount = document.getElementById('status-warning-count') as HTMLElement;
    this.statusSpaces = document.getElementById('status-spaces') as HTMLElement;
    this.statusEncoding = document.getElementById('status-encoding') as HTMLElement;
    this.statusLineEnding = document.getElementById('status-line-ending') as HTMLElement;
    this.statusLanguageMode = document.getElementById('status-language-mode') as HTMLElement;
    this.statusPythonVersion = document.getElementById('status-python-version') as HTMLElement;
    this.statusGitBranch = document.getElementById('status-git-branch') as HTMLElement;

    // Execution & action elements
    this.btnRun = document.getElementById('btn-run-code');
    this.btnRunTerminal = document.getElementById('btn-run-terminal');
    this.btnDelete = document.getElementById('btn-delete-file');
    this.outputDrawer = document.getElementById('execution-output-drawer');
    this.outputHeaderTitle = document.getElementById('output-header-title');
    this.outputContent = document.getElementById('output-content-text');
    this.btnDrawerTerminal = document.getElementById('btn-drawer-terminal');
    this.btnCloseOutput = document.getElementById('btn-close-output');

    this.setupListeners();
    this.initWorkspaceMeta();
    this.initDefaultTabs();
  }

  setOnFileDeleted(cb: (path: string) => void): void {
    this.onFileDeleted = cb;
  }

  private async initWorkspaceMeta(): Promise<void> {
    try {
      const info = await getWorkspaceInfo();
      if (this.statusGitBranch && info.git_branch) {
        this.statusGitBranch.textContent = info.git_branch;
      }
      if (this.statusPythonVersion && info.python_version) {
        this.statusPythonVersion.textContent = `Python ${info.python_version}`;
      }
    } catch {
      // fallback
    }
  }

  private setupListeners(): void {
    this.codeArea.addEventListener('input', () => {
      this.updateLineNumbers();
      this.updateMinimap();
      this.updateDiagnostics();
      this.updateStatusDetails();
      this.updateCursor();

      if (this.activeTabId) {
        const active = this.tabs.find((t) => t.id === this.activeTabId);
        if (active) {
          active.content = this.codeArea.innerText;
          active.modified = true;
          this.renderTabs();
        }
      }
    });

    // Dynamic Caret position & selection tracking
    this.codeArea.addEventListener('keyup', () => this.updateCursor());
    this.codeArea.addEventListener('click', () => this.updateCursor());
    this.codeArea.addEventListener('mouseup', () => this.updateCursor());
    this.codeArea.addEventListener('scroll', () => {
      this.lineNumbers.scrollTop = this.codeArea.scrollTop;
    });
    document.addEventListener('selectionchange', () => {
      if (document.activeElement === this.codeArea) {
        this.updateCursor();
      }
    });

    // Show error tooltip / popup on clicking error pill
    this.statusErrorPill?.addEventListener('click', () => {
      if (this.statusErrorPill.title) {
        alert(`Diagnostics for active file:\n\n${this.statusErrorPill.title}`);
      }
    });

    // Ctrl+S saving
    window.addEventListener('keydown', async (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        await this.saveActive();
      }
    });

    // Run active file in Backend Python
    this.btnRun?.addEventListener('click', async () => {
      if (!this.activeTabId) return;
      const tab = this.tabs.find((t) => t.id === this.activeTabId);
      if (!tab) return;

      // Automatically save first
      await this.saveActive();

      if (this.outputDrawer && this.outputHeaderTitle && this.outputContent) {
        this.outputDrawer.style.display = 'block';
        this.outputHeaderTitle.textContent = `RUNNING: python ${tab.path}...`;
        this.outputContent.textContent = 'Executing in backend Python environment...';
        this.outputContent.style.color = '#a3a3a3';

        try {
          const res = await runFile(tab.path);
          const isSuccess = res.exit_code === 0;
          this.outputHeaderTitle.textContent = `python ${tab.path} — ${isSuccess ? 'EXIT 0 (SUCCESS)' : `EXIT ${res.exit_code} (ERROR)`} [${res.duration_seconds}s]`;
          
          let outputText = '';
          if (res.stdout) outputText += res.stdout;
          if (res.stderr) outputText += (outputText ? '\n' : '') + res.stderr;
          if (!outputText.trim()) {
            outputText = isSuccess
              ? '(Process completed with exit code 0 — no output printed to console)\n\nTip: Add print(...) statements (e.g. print(multiply(5, 3))) in your code to display results here.'
              : `(Process exited with code ${res.exit_code} and produced no output)`;
          }

          this.outputContent.textContent = outputText;
          this.outputContent.style.color = isSuccess ? '#e2e8f0' : '#f87171';
        } catch (err: any) {
          this.outputHeaderTitle.textContent = `python ${tab.path} — EXECUTION FAILED`;
          this.outputContent.textContent = `Failed: ${err.message || String(err)}`;
          this.outputContent.style.color = '#f87171';
        }
      }
    });

    // Run active file in native Command Prompt Terminal
    const launchTerminal = async () => {
      if (!this.activeTabId) return;
      const tab = this.tabs.find((t) => t.id === this.activeTabId);
      if (!tab) return;

      await this.saveActive();
      try {
        await runFileInTerminal(tab.path);
        if (this.outputDrawer && this.outputHeaderTitle && this.outputContent) {
          this.outputDrawer.style.display = 'block';
          this.outputHeaderTitle.textContent = `TERMINAL: ${tab.path} (Live Window Launched)`;
          this.outputContent.textContent = `Launched "${tab.path}" in native Command Prompt window!\nYou can now interact, type inputs (e.g. commands, data), and run the real program live directly in the terminal window.`;
          this.outputContent.style.color = '#7dd3fc';
        }
      } catch (err: any) {
        alert('Failed to launch terminal window: ' + (err.message || String(err)));
      }
    };

    this.btnRunTerminal?.addEventListener('click', launchTerminal);
    this.btnDrawerTerminal?.addEventListener('click', launchTerminal);

    this.btnCloseOutput?.addEventListener('click', () => {
      if (this.outputDrawer) this.outputDrawer.style.display = 'none';
    });

    // Delete active file button
    this.btnDelete?.addEventListener('click', async () => {
      if (!this.activeTabId) return;
      const tab = this.tabs.find((t) => t.id === this.activeTabId);
      if (!tab) return;

      const confirmed = confirm(`Are you sure you want to permanently delete "${tab.title}" from the workspace?`);
      if (!confirmed) return;

      try {
        await deleteItem(tab.path);
        const deletedPath = tab.path;
        this.closeTab(tab.id);
        if (this.onFileDeleted) {
          this.onFileDeleted(deletedPath);
        }
      } catch (err: any) {
        alert('Failed to delete file: ' + (err.message || String(err)));
      }
    });
  }

  private updateCursor(): void {
    if (!this.cursorPosIndicator) return;

    if (!this.activeTabId) {
      this.cursorPosIndicator.style.display = 'none';
      return;
    }

    this.cursorPosIndicator.style.display = 'flex';
    const sel = window.getSelection();
    const offset = getCaretOffset(this.codeArea);
    const text = this.codeArea.innerText;
    const textBefore = text.slice(0, offset);
    const lines = textBefore.split('\n');
    const line = Math.max(1, lines.length);
    const col = Math.max(1, lines[lines.length - 1].length + 1);

    if (sel && !sel.isCollapsed && sel.toString().length > 0) {
      this.cursorPosIndicator.textContent = `Ln ${line}, Col ${col} (${sel.toString().length} selected)`;
    } else {
      this.cursorPosIndicator.textContent = `Ln ${line}, Col ${col}`;
    }
  }

  private async updateDiagnostics(): Promise<void> {
    if (!this.statusErrorPill) return;

    if (!this.activeTabId) {
      this.statusErrorPill.style.display = 'none';
      return;
    }

    const activeTab = this.tabs.find((t) => t.id === this.activeTabId);
    if (!activeTab) {
      this.statusErrorPill.style.display = 'none';
      return;
    }

    const code = this.codeArea.innerText;

    // 1. Check with real backend Python / AST compiler
    try {
      const backend = await validateCodeBackend(activeTab.path, code);
      if (!backend.valid && backend.errors > 0) {
        this.statusErrorPill.style.display = 'flex';
        if (this.statusErrorCount) this.statusErrorCount.textContent = `✕ ${backend.errors}`;
        if (this.statusWarningCount) this.statusWarningCount.textContent = `⚠ ${backend.warnings}`;
        this.statusErrorPill.title = backend.details.join('\n');
        return;
      }
    } catch {
      // fallback to local parser if offline
    }

    // 2. Local fallback linter
    const local = validateCode(code, activeTab.title);
    if (local.errors > 0 || local.warnings > 0) {
      this.statusErrorPill.style.display = 'flex';
      if (this.statusErrorCount) this.statusErrorCount.textContent = `✕ ${local.errors}`;
      if (this.statusWarningCount) this.statusWarningCount.textContent = `⚠ ${local.warnings}`;
      this.statusErrorPill.title = local.details.join('\n');
    } else {
      this.statusErrorPill.style.display = 'none';
    }
  }

  private updateStatusDetails(): void {
    if (!this.activeTabId) {
      if (this.statusLanguageMode) this.statusLanguageMode.style.display = 'none';
      if (this.statusSpaces) this.statusSpaces.style.display = 'none';
      if (this.statusEncoding) this.statusEncoding.style.display = 'none';
      if (this.statusLineEnding) this.statusLineEnding.style.display = 'none';
      return;
    }

    if (this.statusLanguageMode) this.statusLanguageMode.style.display = 'flex';
    if (this.statusSpaces) this.statusSpaces.style.display = 'flex';
    if (this.statusEncoding) this.statusEncoding.style.display = 'flex';
    if (this.statusLineEnding) this.statusLineEnding.style.display = 'flex';

    const tab = this.tabs.find((t) => t.id === this.activeTabId);
    if (!tab) return;

    // Language mode based on file extension
    const ext = tab.title.split('.').pop()?.toLowerCase() || '';
    const langMap: Record<string, string> = {
      py: '{ } Python',
      ts: '{ } TypeScript',
      js: '{ } JavaScript',
      json: '{ } JSON',
      html: '</> HTML',
      css: '{ } CSS',
      md: 'M↓ Markdown',
      sql: 'SQL',
      sh: '$ Shell',
      bash: '$ Shell',
      txt: 'Plain Text',
    };
    if (this.statusLanguageMode) {
      this.statusLanguageMode.textContent = langMap[ext] || (ext ? `${ext.toUpperCase()}` : 'Plain Text');
    }

    // Line endings
    const code = this.codeArea.innerText;
    if (this.statusLineEnding) {
      this.statusLineEnding.textContent = code.includes('\r\n') ? 'CRLF' : 'LF';
    }

    // Indentation
    if (this.statusSpaces) {
      if (code.includes('\t')) {
        this.statusSpaces.textContent = 'Tabs';
      } else if (/^\s{2}\S/m.test(code)) {
        this.statusSpaces.textContent = 'Spaces: 2';
      } else {
        this.statusSpaces.textContent = 'Spaces: 4';
      }
    }
  }

  async openFile(path: string, name: string): Promise<void> {
    let content = '';
    try {
      const res = await getFileContent(path);
      content = res.content;
    } catch {
      content = `# Content for ${name}\n`;
    }

    const existing = this.tabs.find((t) => t.path === path);
    if (existing) {
      existing.content = content;
      existing.modified = false;
      this.activateTab(existing.id);
      return;
    }

    const newTab: EditorTab = {
      id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: name,
      path: path,
      content: content,
      modified: false,
    };

    this.tabs.push(newTab);
    this.renderTabs();
    this.activateTab(newTab.id);
  }

  async openSnippet(title: string, code: string, path?: string): Promise<void> {
    const filePath = path || title;
    const existing = this.tabs.find((t) => t.path === filePath || t.title === title);
    if (existing) {
      existing.content = code;
      this.activateTab(existing.id);
      return;
    }

    const newTab: EditorTab = {
      id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: title,
      path: filePath,
      content: code,
      modified: true,
    };

    this.tabs.push(newTab);
    this.renderTabs();
    this.activateTab(newTab.id);
  }

  activateTab(tabId: string): void {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) return;

    this.activeTabId = tabId;
    this.renderTabs();

    // Ensure gutters and editor are visible
    this.lineNumbers.style.display = 'block';
    this.minimap.style.display = 'block';
    this.codeArea.style.display = 'block';

    // Render code
    this.renderSyntaxHighlight(tab.content);
    this.updateLineNumbers();
    this.updateMinimap();

    // Update Titlebar & Breadcrumbs
    this.titleFile.textContent = `DEVs IDE - ${tab.title}`;
    this.updateBreadcrumbs(tab.path);

    // Update dynamic status bar items
    this.updateDiagnostics();
    this.updateStatusDetails();
    this.updateCursor();

    // Show Run & Terminal buttons for runnable files
    const isRunnable = tab.title.endsWith('.py') || tab.title.endsWith('.sh') || tab.title.endsWith('.js');
    if (this.btnRun) {
      this.btnRun.style.display = isRunnable ? 'inline-flex' : 'none';
    }
    if (this.btnRunTerminal) {
      this.btnRunTerminal.style.display = isRunnable ? 'inline-flex' : 'none';
    }

    // Show Delete button for active file
    if (this.btnDelete) {
      this.btnDelete.style.display = 'inline-flex';
    }
  }

  closeFileByPath(path: string): void {
    const tabsToClose = this.tabs.filter((t) => t.path === path || t.path.startsWith(path + '/'));
    for (const tab of tabsToClose) {
      this.closeTab(tab.id);
    }
  }

  closeTab(tabId: string, event?: Event): void {
    if (event) event.stopPropagation();
    const index = this.tabs.findIndex((t) => t.id === tabId);
    if (index === -1) return;

    this.tabs.splice(index, 1);
    if (this.activeTabId === tabId) {
      if (this.tabs.length > 0) {
        const nextIndex = Math.max(0, index - 1);
        this.activateTab(this.tabs[nextIndex].id);
      } else {
        this.showEmptyState();
      }
    }
    this.renderTabs();
  }

  async saveActive(): Promise<void> {
    if (!this.activeTabId) return;
    const tab = this.tabs.find((t) => t.id === this.activeTabId);
    if (!tab) return;
    if (!tab.modified) return;

    try {
      const currentCode = this.codeArea.innerText;
      await saveFile(tab.path, currentCode);
      tab.content = currentCode;
      tab.modified = false;
      this.renderTabs();
      console.log(`Saved ${tab.path}`);
    } catch (err) {
      console.error('Save failed:', err);
    }
  }

  private renderTabs(): void {
    this.tabbar.innerHTML = '';
    for (const tab of this.tabs) {
      const el = document.createElement('div');
      el.className = `editor-tab ${tab.id === this.activeTabId ? 'active' : ''}`;

      const titleSpan = document.createElement('span');
      titleSpan.textContent = tab.title;
      el.appendChild(titleSpan);

      if (tab.badge) {
        const badge = document.createElement('span');
        badge.className = 'tab-badge';
        badge.textContent = tab.badge;
        el.appendChild(badge);
      }

      if (tab.modified) {
        const dot = document.createElement('span');
        dot.style.color = '#fff';
        dot.textContent = '●';
        el.appendChild(dot);
      }

      const closeBtn = document.createElement('span');
      closeBtn.className = 'tab-close';
      closeBtn.textContent = '✕';
      closeBtn.addEventListener('click', (e) => this.closeTab(tab.id, e));
      el.appendChild(closeBtn);

      el.addEventListener('click', () => this.activateTab(tab.id));
      this.tabbar.appendChild(el);
    }
  }

  private updateLineNumbers(): void {
    const text = this.codeArea.innerText;
    const lines = text.length === 0 ? 1 : text.split(/\r?\n/).length;
    let html = '';
    for (let i = 1; i <= Math.max(lines, 1); i++) {
      html += `<div>${i}</div>`;
    }
    this.lineNumbers.innerHTML = html;
  }

  private updateMinimap(): void {
    const lines = this.codeArea.innerText.split('\n');
    let html = '';
    for (let i = 0; i < Math.min(lines.length, 60); i++) {
      const lineLen = Math.min(Math.max(lines[i].trim().length * 1.5, 4), 50);
      html += `<div class="minimap-bar" style="width:${lineLen}px;"></div>`;
    }
    this.minimap.innerHTML = html;
  }

  private updateBreadcrumbs(filePath: string): void {
    const parts = filePath.replace(/\\/g, '/').split('/');
    let html = '';
    parts.forEach((p, idx) => {
      const isLast = idx === parts.length - 1;
      html += `<span class="breadcrumb-item" style="${isLast ? 'color:var(--text-white); font-weight:500;' : ''}">${p}</span>`;
      if (!isLast) html += '<span>›</span>';
    });
    this.breadcrumbs.innerHTML = html;
  }

  private renderSyntaxHighlight(code: string): void {
    let highlighted = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Comments first so we don't match inside them
    const comments: string[] = [];
    highlighted = highlighted.replace(/(#.*$)/gm, (_m, c) => {
      comments.push(c);
      return `___COMMENT_${comments.length - 1}___`;
    });

    // Strings
    const strings: string[] = [];
    highlighted = highlighted.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"[^"\n]*"|'[^'\n]*')/g, (_m, s) => {
      strings.push(s);
      return `___STRING_${strings.length - 1}___`;
    });

    // Decorators (@something)
    highlighted = highlighted.replace(/(@\w+(?:\.\w+)*)/g, '<span class="syn-kw" style="color:#c678dd;">$1</span>');

    // Keywords
    highlighted = highlighted.replace(
      /\b(def|class|return|if|else|elif|import|from|as|while|for|in|try|except|finally|with|async|await|None|True|False|lambda|yield|raise|pass|break|continue|and|or|not|is)\b/g,
      '<span class="syn-kw">$1</span>'
    );

    // Function definitions & calls
    highlighted = highlighted.replace(/\b([a-zA-Z_]\w*)\s*(?=\()/g, '<span class="syn-fn">$1</span>');

    // Types & Builtins
    highlighted = highlighted.replace(
      /\b(RunContext|AgentDeps|Agent|Tool|str|int|float|bool|list|dict|set|tuple|bytes|Optional|List|Dict|Any|BaseModel|Field|APIRouter|FastAPI)\b/g,
      '<span class="syn-type">$1</span>'
    );

    // Numbers
    highlighted = highlighted.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="syn-num">$1</span>');

    // Restore strings with emerald green styling
    highlighted = highlighted.replace(/___STRING_(\d+)___/g, (_m, idx) => {
      return `<span class="syn-str">${strings[parseInt(idx)]}</span>`;
    });

    // Restore comments with muted styling
    highlighted = highlighted.replace(/___COMMENT_(\d+)___/g, (_m, idx) => {
      return `<span class="syn-comment">${comments[parseInt(idx)]}</span>`;
    });

    this.codeArea.innerHTML = highlighted;
  }

  private initDefaultTabs(): void {
    this.tabs = [];
    this.renderTabs();
    this.showEmptyState();
  }

  showEmptyState(): void {
    this.activeTabId = null;
    this.titleFile.textContent = 'DEVs IDE';
    this.breadcrumbs.innerHTML = '<span class="breadcrumb-item" style="color:#ffffff;">user_files</span>';
    this.lineNumbers.innerHTML = '';
    this.lineNumbers.style.display = 'none';
    this.minimap.innerHTML = '';
    this.minimap.style.display = 'none';
    const hint = document.querySelector('.editor-hint-bubble') as HTMLElement;
    if (hint) hint.style.display = 'none';

    this.updateDiagnostics();
    this.updateStatusDetails();
    this.updateCursor();

    if (this.btnRun) this.btnRun.style.display = 'none';
    if (this.btnRunTerminal) this.btnRunTerminal.style.display = 'none';
    if (this.btnDelete) this.btnDelete.style.display = 'none';
    if (this.outputDrawer) this.outputDrawer.style.display = 'none';

    this.codeArea.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; width:100%; color:#666666; gap:14px; user-select:none; padding:40px 20px; box-sizing:border-box; white-space:normal; font-family:var(--font-ui);">
        <div style="width:48px; height:48px; border-radius:14px; background:#141414; border:1px solid rgba(255,255,255,0.12); display:flex; align-items:center; justify-content:center; color:#ffffff; font-size:20px; box-shadow:0 4px 14px rgba(0,0,0,0.5);">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
        </div>
        <div style="font-size:22px; font-weight:700; color:#ffffff; letter-spacing:0.5px;">DEVs IDE</div>
        <div style="font-size:13px; color:#888888; text-align:center; line-height:1.45; white-space:normal; font-family:var(--font-ui);">Workspace is ready.<br>Open a file from the explorer on the left<br>or create a new file.</div>
        <div style="display:flex; gap:10px; margin-top:6px;">
          <button id="welcome-btn-create" style="background:#181818; border:1px solid rgba(255,255,255,0.2); color:#ffffff; padding:7px 18px; border-radius:20px; cursor:pointer; font-size:12px; font-weight:600; box-shadow: 0 4px 12px rgba(0,0,0,0.4); display:flex; align-items:center; gap:6px;">
            <span>+</span> <span>New File</span>
          </button>
        </div>
      </div>
    `;

    document.getElementById('welcome-btn-create')?.addEventListener('click', () => {
      document.getElementById('btn-explorer-new-file')?.click();
    });
  }

  getActiveTabId(): string | null {
    return this.activeTabId;
  }
}
