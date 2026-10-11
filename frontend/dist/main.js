"use strict";
(() => {
  // src/api.ts
  var API_BASE = "/api";
  async function getWorkspaceTree() {
    const res = await fetch(`${API_BASE}/files/tree`);
    if (!res.ok) throw new Error("Failed to load file tree");
    return res.json();
  }
  async function getFileContent(path) {
    const res = await fetch(`${API_BASE}/files/content?path=${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error(`Failed to load file content for ${path}`);
    return res.json();
  }
  async function saveFile(path, content) {
    const res = await fetch(`${API_BASE}/files/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, content })
    });
    if (!res.ok) throw new Error(`Failed to save ${path}`);
    return res.json();
  }
  async function runFile(path) {
    const res = await fetch(`${API_BASE}/files/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path })
    });
    if (!res.ok) throw new Error(`Failed to execute ${path}`);
    return res.json();
  }
  async function runFileInTerminal(path) {
    const res = await fetch(`${API_BASE}/files/run-terminal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path })
    });
    if (!res.ok) throw new Error(`Failed to launch terminal for ${path}`);
    return res.json();
  }
  async function validateCodeBackend(path, content) {
    try {
      const res = await fetch(`${API_BASE}/files/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content })
      });
      if (!res.ok) return { valid: true, errors: 0, warnings: 0, details: [] };
      return res.json();
    } catch {
      return { valid: true, errors: 0, warnings: 0, details: [] };
    }
  }
  async function getWorkspaceInfo() {
    const res = await fetch(`${API_BASE}/files/info`);
    if (!res.ok) return { workspace_root: "user_files", name: "USER_FILES", git_branch: "main", python_version: "3.12" };
    return res.json();
  }
  async function createItem(path, is_dir = false) {
    const res = await fetch(`${API_BASE}/files/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, is_dir })
    });
    if (!res.ok) throw new Error(`Failed to create ${path}`);
    return res.json();
  }
  async function deleteItem(path) {
    const res = await fetch(`${API_BASE}/files/delete?path=${encodeURIComponent(path)}`, {
      method: "DELETE"
    });
    if (!res.ok) throw new Error(`Failed to delete ${path}`);
    return res.json();
  }
  async function getModels() {
    const res = await fetch(`${API_BASE}/chat/models`);
    if (!res.ok) {
      return {
        current: "nvidia:z-ai/glm-5.3-flash",
        models: [
          "nvidia:z-ai/glm-5.3-flash",
          "nvidia:openai/gpt-oss-20b",
          "nvidia:meta/llama-3.2-11b-vision-instruct",
          "openai:gpt-4o"
        ]
      };
    }
    return res.json();
  }
  async function streamChat(message, model, history, onChunk, onDone, onError) {
    try {
      const res = await fetch(`${API_BASE}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, model, history })
      });
      if (!res.ok || !res.body) {
        onError(`Request failed with status: ${res.status}`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "chunk") {
                onChunk(data.content);
              } else if (data.type === "error") {
                onError(data.content);
              } else if (data.type === "done") {
                onDone(data);
                return;
              }
            } catch (e) {
              onChunk(line.slice(6));
            }
          }
        }
      }
      onDone();
    } catch (err) {
      onError(err.message || String(err));
    }
  }

  // src/explorer.ts
  var FileExplorer = class {
    container;
    headerTitle;
    onFileSelect;
    onFileDeleted;
    activePath = null;
    constructor(containerId, onFileSelect) {
      this.container = document.getElementById(containerId);
      this.headerTitle = document.getElementById("workspace-folder-name");
      this.onFileSelect = onFileSelect;
      this.setupHeaderActions();
    }
    setOnFileDeleted(cb) {
      this.onFileDeleted = cb;
    }
    async init() {
      try {
        const info = await getWorkspaceInfo();
        if (this.headerTitle) {
          this.headerTitle.textContent = info.name || "WORKSPACE";
        }
        const titleProject = document.getElementById("window-title-project");
        if (titleProject) {
          titleProject.textContent = info.name || "workspace";
        }
        const agentWorkspace = document.querySelector(".agent-workspace-title");
        if (agentWorkspace) {
          agentWorkspace.textContent = (info.name || "workspace").toLowerCase();
        }
        const tree = await getWorkspaceTree();
        this.renderTree(tree);
      } catch (err) {
        console.warn("API tree load failed, using starter workspace", err);
        this.renderFallbackTree();
      }
    }
    setupHeaderActions() {
      const folderHeader = document.getElementById("workspace-folder-header");
      const folderToggleIcon = document.getElementById("workspace-folder-toggle");
      folderHeader?.addEventListener("click", (e) => {
        if (e.target.closest(".tree-action-icon")) return;
        const isHidden = this.container.style.display === "none";
        this.container.style.display = isHidden ? "block" : "none";
        if (folderToggleIcon) {
          folderToggleIcon.textContent = isHidden ? "\u02C5" : "\u203A";
        }
      });
      const btnNewFile = document.getElementById("btn-explorer-new-file");
      btnNewFile?.addEventListener("click", async (e) => {
        e.stopPropagation();
        const filename = prompt("Enter new file name (e.g. app.py, models.py):");
        if (filename) {
          try {
            await createItem(filename, false);
            await this.init();
            this.onFileSelect(filename, filename);
          } catch (err) {
            alert("Error creating file: " + err.message);
          }
        }
      });
      const btnNewFolder = document.getElementById("btn-explorer-new-folder");
      btnNewFolder?.addEventListener("click", async (e) => {
        e.stopPropagation();
        const foldername = prompt("Enter new folder name (e.g. src, components):");
        if (foldername) {
          try {
            await createItem(foldername, true);
            await this.init();
          } catch (err) {
            alert("Error creating folder: " + err.message);
          }
        }
      });
      const btnRefresh = document.getElementById("btn-explorer-refresh");
      btnRefresh?.addEventListener("click", (e) => {
        e.stopPropagation();
        this.init();
      });
    }
    setActive(path) {
      this.activePath = path;
      const allNodes = this.container.querySelectorAll(".tree-node");
      allNodes.forEach((node) => {
        const nodePath = node.dataset.path;
        if (nodePath === path) {
          node.classList.add("active");
        } else {
          node.classList.remove("active");
        }
      });
    }
    renderTree(items, indent = 0) {
      this.container.innerHTML = "";
      if (!items || items.length === 0) {
        const emptyDiv = document.createElement("div");
        emptyDiv.style.padding = "18px 14px";
        emptyDiv.style.color = "var(--text-muted)";
        emptyDiv.style.fontSize = "12px";
        emptyDiv.style.lineHeight = "1.6";
        emptyDiv.innerHTML = `
        <div style="color:#777777;">No files in workspace.</div>
        <div style="margin-top:8px;">
          <button id="btn-empty-add-file" style="background:#181818; border:1px solid rgba(255,255,255,0.18); color:#ffffff; padding:4px 12px; border-radius:12px; cursor:pointer; font-size:11px; font-weight:600;">+ New File</button>
        </div>
      `;
        this.container.appendChild(emptyDiv);
        document.getElementById("btn-empty-add-file")?.addEventListener("click", () => {
          document.getElementById("btn-explorer-new-file")?.click();
        });
        return;
      }
      const frag = document.createDocumentFragment();
      for (const item of items) {
        this.createNodeElement(item, frag, indent);
      }
      this.container.appendChild(frag);
    }
    createNodeElement(item, parent, indent) {
      const li = document.createElement("li");
      const node = document.createElement("div");
      node.className = "tree-node";
      node.dataset.path = item.path;
      for (let i = 0; i < indent; i++) {
        const ind = document.createElement("span");
        ind.className = "tree-indent";
        node.appendChild(ind);
      }
      const arrow = document.createElement("span");
      arrow.style.fontSize = "10px";
      arrow.style.width = "12px";
      arrow.style.display = "inline-block";
      arrow.style.color = "#888";
      arrow.textContent = item.is_dir ? "\u02C5 " : "  ";
      node.appendChild(arrow);
      const icon = document.createElement("span");
      icon.className = "tree-icon";
      icon.innerHTML = this.getIcon(item.name, item.is_dir);
      node.appendChild(icon);
      const label = document.createElement("span");
      label.className = "tree-label";
      label.textContent = item.name;
      label.title = item.name;
      node.appendChild(label);
      const deleteBtn = document.createElement("span");
      deleteBtn.className = "tree-delete-btn";
      deleteBtn.title = item.is_dir ? `Delete folder "${item.name}"` : `Delete file "${item.name}"`;
      deleteBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
      deleteBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const kind = item.is_dir ? `folder "${item.name}" and all its contents` : `file "${item.name}"`;
        if (!confirm(`Are you sure you want to permanently delete ${kind} from the workspace?`)) {
          return;
        }
        try {
          await deleteItem(item.path);
          if (this.onFileDeleted) {
            this.onFileDeleted(item.path);
          }
          await this.init();
        } catch (err) {
          alert("Failed to delete: " + (err.message || String(err)));
        }
      });
      node.appendChild(deleteBtn);
      li.appendChild(node);
      if (item.is_dir && item.children) {
        const childUl = document.createElement("ul");
        childUl.style.listStyle = "none";
        childUl.style.padding = "0";
        childUl.style.margin = "0";
        for (const child of item.children) {
          this.createNodeElement(child, childUl, indent + 1);
        }
        li.appendChild(childUl);
        node.addEventListener("click", (e) => {
          e.stopPropagation();
          const isOpen = childUl.style.display !== "none";
          childUl.style.display = isOpen ? "none" : "block";
          arrow.textContent = isOpen ? "\u203A " : "\u02C5 ";
        });
      } else {
        node.addEventListener("click", (e) => {
          e.stopPropagation();
          this.setActive(item.path);
          this.onFileSelect(item.path, item.name);
        });
      }
      parent.appendChild(li);
    }
    getIcon(name, isDir) {
      if (isDir) {
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#888888" stroke-width="2" style="margin-right:4px;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
      }
      if (name.endsWith(".py")) {
        return `<span style="color:#ffffff; font-size:10px; font-weight:bold; font-family:var(--font-code); margin-right:4px; border:1px solid #444; padding:0 2px; border-radius:2px;">PY</span>`;
      }
      if (name.endsWith(".json")) {
        return `<span style="color:#aaaaaa; font-size:11px; font-weight:bold; font-family:var(--font-code); margin-right:4px;">{}</span>`;
      }
      if (name.endsWith(".toml")) {
        return `<span style="color:#aaaaaa; font-size:10px; font-weight:bold; font-family:var(--font-code); margin-right:4px; border:1px solid #444; padding:0 2px; border-radius:2px;">CFG</span>`;
      }
      if (name.endsWith(".md")) {
        return `<span style="color:#ffffff; font-size:10px; font-weight:bold; font-family:var(--font-code); margin-right:4px; border:1px solid #444; padding:0 2px; border-radius:2px;">MD</span>`;
      }
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666666" stroke-width="2" style="margin-right:4px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
    }
    renderFallbackTree() {
      this.renderTree([]);
    }
  };

  // src/editor.ts
  function getCaretOffset(element) {
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
  function validateCode(code, filename) {
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    const details = [];
    let errors = 0;
    let warnings = 0;
    if (!code.trim()) {
      return { errors: 0, warnings: 0, details: [] };
    }
    if (ext === "json") {
      try {
        JSON.parse(code);
      } catch (e) {
        errors++;
        details.push(e.message || "JSON Syntax Error");
      }
      return { errors, warnings, details };
    }
    const lines = code.split("\n");
    const stack = [];
    const pairs = { ")": "(", "]": "[", "}": "{" };
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      let inStr = false;
      let strQuote = "";
      for (let colIdx = 0; colIdx < line.length; colIdx++) {
        const char = line[colIdx];
        if (char === "#" && ext === "py" && !inStr) break;
        if (char === "/" && line[colIdx + 1] === "/" && (ext === "ts" || ext === "js") && !inStr) break;
        if ((char === '"' || char === "'") && (colIdx === 0 || line[colIdx - 1] !== "\\")) {
          if (!inStr) {
            inStr = true;
            strQuote = char;
          } else if (strQuote === char) {
            inStr = false;
            strQuote = "";
          }
          continue;
        }
        if (!inStr) {
          if (char === "(" || char === "[" || char === "{") {
            stack.push({ char, line: lineIdx + 1, col: colIdx + 1 });
          } else if (char === ")" || char === "]" || char === "}") {
            const expected = pairs[char];
            if (stack.length === 0) {
              errors++;
              details.push(`Line ${lineIdx + 1}, Col ${colIdx + 1}: Unmatched closing '${char}'`);
            } else {
              const last = stack.pop();
              if (last.char !== expected) {
                errors++;
                details.push(`Line ${lineIdx + 1}, Col ${colIdx + 1}: Mismatched bracket, expected '${last.char}'`);
              }
            }
          }
        }
      }
      if (ext === "py") {
        const trimmed = line.trim();
        if (/^(def\s+\w+|class\s+\w+|if\s+|elif\s+|else\s*|while\s+|for\s+\w+\s+in\s+|try\s*|except\s*|finally\s*|with\s+)/.test(trimmed)) {
          if (!trimmed.endsWith(":") && !trimmed.endsWith("\\") && !trimmed.includes("#")) {
            warnings++;
            details.push(`Line ${lineIdx + 1}: Missing colon ':' at end of statement`);
          }
        }
      }
    }
    while (stack.length > 0) {
      const unclosed = stack.pop();
      errors++;
      details.push(`Line ${unclosed.line}: Unclosed '${unclosed.char}'`);
    }
    return { errors, warnings, details };
  }
  var CodeEditor = class {
    tabbar;
    lineNumbers;
    codeArea;
    minimap;
    breadcrumbs;
    titleFile;
    // Dynamic status bar elements
    cursorPosIndicator;
    statusErrorPill;
    statusErrorCount;
    statusWarningCount;
    statusSpaces;
    statusEncoding;
    statusLineEnding;
    statusLanguageMode;
    statusPythonVersion;
    statusGitBranch;
    // Real execution output drawer & Run button
    btnRun;
    btnRunTerminal;
    btnDelete;
    outputDrawer;
    outputHeaderTitle;
    outputContent;
    btnDrawerTerminal;
    btnCloseOutput;
    onFileDeleted;
    tabs = [];
    activeTabId = null;
    constructor() {
      this.tabbar = document.getElementById("editor-tabs");
      this.lineNumbers = document.getElementById("line-numbers");
      this.codeArea = document.getElementById("code-content");
      this.minimap = document.getElementById("editor-minimap");
      this.breadcrumbs = document.getElementById("editor-breadcrumbs");
      this.titleFile = document.getElementById("window-title-file");
      this.cursorPosIndicator = document.getElementById("cursor-pos-indicator");
      this.statusErrorPill = document.getElementById("status-error-pill");
      this.statusErrorCount = document.getElementById("status-error-count");
      this.statusWarningCount = document.getElementById("status-warning-count");
      this.statusSpaces = document.getElementById("status-spaces");
      this.statusEncoding = document.getElementById("status-encoding");
      this.statusLineEnding = document.getElementById("status-line-ending");
      this.statusLanguageMode = document.getElementById("status-language-mode");
      this.statusPythonVersion = document.getElementById("status-python-version");
      this.statusGitBranch = document.getElementById("status-git-branch");
      this.btnRun = document.getElementById("btn-run-code");
      this.btnRunTerminal = document.getElementById("btn-run-terminal");
      this.btnDelete = document.getElementById("btn-delete-file");
      this.outputDrawer = document.getElementById("execution-output-drawer");
      this.outputHeaderTitle = document.getElementById("output-header-title");
      this.outputContent = document.getElementById("output-content-text");
      this.btnDrawerTerminal = document.getElementById("btn-drawer-terminal");
      this.btnCloseOutput = document.getElementById("btn-close-output");
      this.setupListeners();
      this.initWorkspaceMeta();
      this.initDefaultTabs();
    }
    setOnFileDeleted(cb) {
      this.onFileDeleted = cb;
    }
    async initWorkspaceMeta() {
      try {
        const info = await getWorkspaceInfo();
        if (this.statusGitBranch && info.git_branch) {
          this.statusGitBranch.textContent = info.git_branch;
        }
        if (this.statusPythonVersion && info.python_version) {
          this.statusPythonVersion.textContent = `Python ${info.python_version}`;
        }
      } catch {
      }
    }
    setupListeners() {
      this.codeArea.addEventListener("input", () => {
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
      this.codeArea.addEventListener("keyup", () => this.updateCursor());
      this.codeArea.addEventListener("click", () => this.updateCursor());
      this.codeArea.addEventListener("mouseup", () => this.updateCursor());
      this.codeArea.addEventListener("scroll", () => {
        this.lineNumbers.scrollTop = this.codeArea.scrollTop;
      });
      document.addEventListener("selectionchange", () => {
        if (document.activeElement === this.codeArea) {
          this.updateCursor();
        }
      });
      this.statusErrorPill?.addEventListener("click", () => {
        if (this.statusErrorPill.title) {
          alert(`Diagnostics for active file:

${this.statusErrorPill.title}`);
        }
      });
      window.addEventListener("keydown", async (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "s") {
          e.preventDefault();
          await this.saveActive();
        }
      });
      this.btnRun?.addEventListener("click", async () => {
        if (!this.activeTabId) return;
        const tab = this.tabs.find((t) => t.id === this.activeTabId);
        if (!tab) return;
        await this.saveActive();
        if (this.outputDrawer && this.outputHeaderTitle && this.outputContent) {
          this.outputDrawer.style.display = "block";
          this.outputHeaderTitle.textContent = `RUNNING: python ${tab.path}...`;
          this.outputContent.textContent = "Executing in backend Python environment...";
          this.outputContent.style.color = "#a3a3a3";
          try {
            const res = await runFile(tab.path);
            const isSuccess = res.exit_code === 0;
            this.outputHeaderTitle.textContent = `python ${tab.path} \u2014 ${isSuccess ? "EXIT 0 (SUCCESS)" : `EXIT ${res.exit_code} (ERROR)`} [${res.duration_seconds}s]`;
            let outputText = "";
            if (res.stdout) outputText += res.stdout;
            if (res.stderr) outputText += (outputText ? "\n" : "") + res.stderr;
            if (!outputText.trim()) {
              outputText = isSuccess ? "(Process completed with exit code 0 \u2014 no output printed to console)\n\nTip: Add print(...) statements (e.g. print(multiply(5, 3))) in your code to display results here." : `(Process exited with code ${res.exit_code} and produced no output)`;
            }
            this.outputContent.textContent = outputText;
            this.outputContent.style.color = isSuccess ? "#e2e8f0" : "#f87171";
          } catch (err) {
            this.outputHeaderTitle.textContent = `python ${tab.path} \u2014 EXECUTION FAILED`;
            this.outputContent.textContent = `Failed: ${err.message || String(err)}`;
            this.outputContent.style.color = "#f87171";
          }
        }
      });
      const launchTerminal = async () => {
        if (!this.activeTabId) return;
        const tab = this.tabs.find((t) => t.id === this.activeTabId);
        if (!tab) return;
        await this.saveActive();
        try {
          await runFileInTerminal(tab.path);
          if (this.outputDrawer && this.outputHeaderTitle && this.outputContent) {
            this.outputDrawer.style.display = "block";
            this.outputHeaderTitle.textContent = `TERMINAL: ${tab.path} (Live Window Launched)`;
            this.outputContent.textContent = `Launched "${tab.path}" in native Command Prompt window!
You can now interact, type inputs (e.g. commands, data), and run the real program live directly in the terminal window.`;
            this.outputContent.style.color = "#7dd3fc";
          }
        } catch (err) {
          alert("Failed to launch terminal window: " + (err.message || String(err)));
        }
      };
      this.btnRunTerminal?.addEventListener("click", launchTerminal);
      this.btnDrawerTerminal?.addEventListener("click", launchTerminal);
      this.btnCloseOutput?.addEventListener("click", () => {
        if (this.outputDrawer) this.outputDrawer.style.display = "none";
      });
      this.btnDelete?.addEventListener("click", async () => {
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
        } catch (err) {
          alert("Failed to delete file: " + (err.message || String(err)));
        }
      });
    }
    updateCursor() {
      if (!this.cursorPosIndicator) return;
      if (!this.activeTabId) {
        this.cursorPosIndicator.style.display = "none";
        return;
      }
      this.cursorPosIndicator.style.display = "flex";
      const sel = window.getSelection();
      const offset = getCaretOffset(this.codeArea);
      const text = this.codeArea.innerText;
      const textBefore = text.slice(0, offset);
      const lines = textBefore.split("\n");
      const line = Math.max(1, lines.length);
      const col = Math.max(1, lines[lines.length - 1].length + 1);
      if (sel && !sel.isCollapsed && sel.toString().length > 0) {
        this.cursorPosIndicator.textContent = `Ln ${line}, Col ${col} (${sel.toString().length} selected)`;
      } else {
        this.cursorPosIndicator.textContent = `Ln ${line}, Col ${col}`;
      }
    }
    async updateDiagnostics() {
      if (!this.statusErrorPill) return;
      if (!this.activeTabId) {
        this.statusErrorPill.style.display = "none";
        return;
      }
      const activeTab = this.tabs.find((t) => t.id === this.activeTabId);
      if (!activeTab) {
        this.statusErrorPill.style.display = "none";
        return;
      }
      const code = this.codeArea.innerText;
      try {
        const backend = await validateCodeBackend(activeTab.path, code);
        if (!backend.valid && backend.errors > 0) {
          this.statusErrorPill.style.display = "flex";
          if (this.statusErrorCount) this.statusErrorCount.textContent = `\u2715 ${backend.errors}`;
          if (this.statusWarningCount) this.statusWarningCount.textContent = `\u26A0 ${backend.warnings}`;
          this.statusErrorPill.title = backend.details.join("\n");
          return;
        }
      } catch {
      }
      const local = validateCode(code, activeTab.title);
      if (local.errors > 0 || local.warnings > 0) {
        this.statusErrorPill.style.display = "flex";
        if (this.statusErrorCount) this.statusErrorCount.textContent = `\u2715 ${local.errors}`;
        if (this.statusWarningCount) this.statusWarningCount.textContent = `\u26A0 ${local.warnings}`;
        this.statusErrorPill.title = local.details.join("\n");
      } else {
        this.statusErrorPill.style.display = "none";
      }
    }
    updateStatusDetails() {
      if (!this.activeTabId) {
        if (this.statusLanguageMode) this.statusLanguageMode.style.display = "none";
        if (this.statusSpaces) this.statusSpaces.style.display = "none";
        if (this.statusEncoding) this.statusEncoding.style.display = "none";
        if (this.statusLineEnding) this.statusLineEnding.style.display = "none";
        return;
      }
      if (this.statusLanguageMode) this.statusLanguageMode.style.display = "flex";
      if (this.statusSpaces) this.statusSpaces.style.display = "flex";
      if (this.statusEncoding) this.statusEncoding.style.display = "flex";
      if (this.statusLineEnding) this.statusLineEnding.style.display = "flex";
      const tab = this.tabs.find((t) => t.id === this.activeTabId);
      if (!tab) return;
      const ext = tab.title.split(".").pop()?.toLowerCase() || "";
      const langMap = {
        py: "{ } Python",
        ts: "{ } TypeScript",
        js: "{ } JavaScript",
        json: "{ } JSON",
        html: "</> HTML",
        css: "{ } CSS",
        md: "M\u2193 Markdown",
        sql: "SQL",
        sh: "$ Shell",
        bash: "$ Shell",
        txt: "Plain Text"
      };
      if (this.statusLanguageMode) {
        this.statusLanguageMode.textContent = langMap[ext] || (ext ? `${ext.toUpperCase()}` : "Plain Text");
      }
      const code = this.codeArea.innerText;
      if (this.statusLineEnding) {
        this.statusLineEnding.textContent = code.includes("\r\n") ? "CRLF" : "LF";
      }
      if (this.statusSpaces) {
        if (code.includes("	")) {
          this.statusSpaces.textContent = "Tabs";
        } else if (/^\s{2}\S/m.test(code)) {
          this.statusSpaces.textContent = "Spaces: 2";
        } else {
          this.statusSpaces.textContent = "Spaces: 4";
        }
      }
    }
    async openFile(path, name) {
      let content = "";
      try {
        const res = await getFileContent(path);
        content = res.content;
      } catch {
        content = `# Content for ${name}
`;
      }
      const existing = this.tabs.find((t) => t.path === path);
      if (existing) {
        existing.content = content;
        existing.modified = false;
        this.activateTab(existing.id);
        return;
      }
      const newTab = {
        id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: name,
        path,
        content,
        modified: false
      };
      this.tabs.push(newTab);
      this.renderTabs();
      this.activateTab(newTab.id);
    }
    async openSnippet(title, code, path) {
      const filePath = path || title;
      const existing = this.tabs.find((t) => t.path === filePath || t.title === title);
      if (existing) {
        existing.content = code;
        this.activateTab(existing.id);
        return;
      }
      const newTab = {
        id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        path: filePath,
        content: code,
        modified: true
      };
      this.tabs.push(newTab);
      this.renderTabs();
      this.activateTab(newTab.id);
    }
    activateTab(tabId) {
      const tab = this.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      this.activeTabId = tabId;
      this.renderTabs();
      this.lineNumbers.style.display = "block";
      this.minimap.style.display = "block";
      this.codeArea.style.display = "block";
      this.renderSyntaxHighlight(tab.content);
      this.updateLineNumbers();
      this.updateMinimap();
      this.titleFile.textContent = `DEVs IDE - ${tab.title}`;
      this.updateBreadcrumbs(tab.path);
      this.updateDiagnostics();
      this.updateStatusDetails();
      this.updateCursor();
      const isRunnable = tab.title.endsWith(".py") || tab.title.endsWith(".sh") || tab.title.endsWith(".js");
      if (this.btnRun) {
        this.btnRun.style.display = isRunnable ? "inline-flex" : "none";
      }
      if (this.btnRunTerminal) {
        this.btnRunTerminal.style.display = isRunnable ? "inline-flex" : "none";
      }
      if (this.btnDelete) {
        this.btnDelete.style.display = "inline-flex";
      }
    }
    closeFileByPath(path) {
      const tabsToClose = this.tabs.filter((t) => t.path === path || t.path.startsWith(path + "/"));
      for (const tab of tabsToClose) {
        this.closeTab(tab.id);
      }
    }
    closeTab(tabId, event) {
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
    async saveActive() {
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
        console.error("Save failed:", err);
      }
    }
    renderTabs() {
      this.tabbar.innerHTML = "";
      for (const tab of this.tabs) {
        const el = document.createElement("div");
        el.className = `editor-tab ${tab.id === this.activeTabId ? "active" : ""}`;
        const titleSpan = document.createElement("span");
        titleSpan.textContent = tab.title;
        el.appendChild(titleSpan);
        if (tab.badge) {
          const badge = document.createElement("span");
          badge.className = "tab-badge";
          badge.textContent = tab.badge;
          el.appendChild(badge);
        }
        if (tab.modified) {
          const dot = document.createElement("span");
          dot.style.color = "#fff";
          dot.textContent = "\u25CF";
          el.appendChild(dot);
        }
        const closeBtn = document.createElement("span");
        closeBtn.className = "tab-close";
        closeBtn.textContent = "\u2715";
        closeBtn.addEventListener("click", (e) => this.closeTab(tab.id, e));
        el.appendChild(closeBtn);
        el.addEventListener("click", () => this.activateTab(tab.id));
        this.tabbar.appendChild(el);
      }
    }
    updateLineNumbers() {
      const text = this.codeArea.innerText;
      const lines = text.length === 0 ? 1 : text.split(/\r?\n/).length;
      let html = "";
      for (let i = 1; i <= Math.max(lines, 1); i++) {
        html += `<div>${i}</div>`;
      }
      this.lineNumbers.innerHTML = html;
    }
    updateMinimap() {
      const lines = this.codeArea.innerText.split("\n");
      let html = "";
      for (let i = 0; i < Math.min(lines.length, 60); i++) {
        const lineLen = Math.min(Math.max(lines[i].trim().length * 1.5, 4), 50);
        html += `<div class="minimap-bar" style="width:${lineLen}px;"></div>`;
      }
      this.minimap.innerHTML = html;
    }
    updateBreadcrumbs(filePath) {
      const parts = filePath.replace(/\\/g, "/").split("/");
      let html = "";
      parts.forEach((p, idx) => {
        const isLast = idx === parts.length - 1;
        html += `<span class="breadcrumb-item" style="${isLast ? "color:var(--text-white); font-weight:500;" : ""}">${p}</span>`;
        if (!isLast) html += "<span>\u203A</span>";
      });
      this.breadcrumbs.innerHTML = html;
    }
    renderSyntaxHighlight(code) {
      let highlighted = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const comments = [];
      highlighted = highlighted.replace(/(#.*$)/gm, (_m, c) => {
        comments.push(c);
        return `___COMMENT_${comments.length - 1}___`;
      });
      const strings = [];
      highlighted = highlighted.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"[^"\n]*"|'[^'\n]*')/g, (_m, s) => {
        strings.push(s);
        return `___STRING_${strings.length - 1}___`;
      });
      highlighted = highlighted.replace(/(@\w+(?:\.\w+)*)/g, '<span class="syn-kw" style="color:#c678dd;">$1</span>');
      highlighted = highlighted.replace(
        /\b(def|class|return|if|else|elif|import|from|as|while|for|in|try|except|finally|with|async|await|None|True|False|lambda|yield|raise|pass|break|continue|and|or|not|is)\b/g,
        '<span class="syn-kw">$1</span>'
      );
      highlighted = highlighted.replace(/\b([a-zA-Z_]\w*)\s*(?=\()/g, '<span class="syn-fn">$1</span>');
      highlighted = highlighted.replace(
        /\b(RunContext|AgentDeps|Agent|Tool|str|int|float|bool|list|dict|set|tuple|bytes|Optional|List|Dict|Any|BaseModel|Field|APIRouter|FastAPI)\b/g,
        '<span class="syn-type">$1</span>'
      );
      highlighted = highlighted.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="syn-num">$1</span>');
      highlighted = highlighted.replace(/___STRING_(\d+)___/g, (_m, idx) => {
        return `<span class="syn-str">${strings[parseInt(idx)]}</span>`;
      });
      highlighted = highlighted.replace(/___COMMENT_(\d+)___/g, (_m, idx) => {
        return `<span class="syn-comment">${comments[parseInt(idx)]}</span>`;
      });
      this.codeArea.innerHTML = highlighted;
    }
    initDefaultTabs() {
      this.tabs = [];
      this.renderTabs();
      this.showEmptyState();
    }
    showEmptyState() {
      this.activeTabId = null;
      this.titleFile.textContent = "DEVs IDE";
      this.breadcrumbs.innerHTML = '<span class="breadcrumb-item" style="color:#ffffff;">user_files</span>';
      this.lineNumbers.innerHTML = "";
      this.lineNumbers.style.display = "none";
      this.minimap.innerHTML = "";
      this.minimap.style.display = "none";
      const hint = document.querySelector(".editor-hint-bubble");
      if (hint) hint.style.display = "none";
      this.updateDiagnostics();
      this.updateStatusDetails();
      this.updateCursor();
      if (this.btnRun) this.btnRun.style.display = "none";
      if (this.btnRunTerminal) this.btnRunTerminal.style.display = "none";
      if (this.btnDelete) this.btnDelete.style.display = "none";
      if (this.outputDrawer) this.outputDrawer.style.display = "none";
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
      document.getElementById("welcome-btn-create")?.addEventListener("click", () => {
        document.getElementById("btn-explorer-new-file")?.click();
      });
    }
    getActiveTabId() {
      return this.activeTabId;
    }
  };

  // src/agent.ts
  var AgentChat = class {
    editor;
    explorer;
    messagesContainer;
    promptInput;
    sendBtn;
    modelPill;
    modelNameSpan;
    newChatBtn;
    currentModel = "nvidia:meta/llama-3.2-11b-vision-instruct";
    modelDisplayName = "NVIDIA Llama 3.2 11B";
    availableModels = [];
    history = [];
    isGenerating = false;
    constructor(editor, explorer) {
      this.editor = editor;
      this.explorer = explorer;
      this.messagesContainer = document.getElementById("chat-messages");
      this.promptInput = document.getElementById("agent-prompt-input");
      this.sendBtn = document.getElementById("btn-send-prompt");
      this.modelPill = document.getElementById("model-selector-pill");
      this.modelNameSpan = document.getElementById("active-model-name");
      this.newChatBtn = document.getElementById("btn-new-chat");
      this.setupListeners();
      this.initModels();
    }
    async initModels() {
      try {
        const data = await getModels();
        this.availableModels = data.models;
        if (data.current) {
          this.currentModel = data.current;
          if (data.current.includes("llama-3.2-11b")) {
            this.modelDisplayName = "NVIDIA Llama 3.2 11B";
          } else if (data.current.includes("llama-3.2-90b")) {
            this.modelDisplayName = "NVIDIA Llama 3.2 90B";
          } else if (data.current.includes("codellama")) {
            this.modelDisplayName = "NVIDIA CodeLlama 70B";
          } else {
            this.modelDisplayName = data.current;
          }
          if (this.modelNameSpan) {
            this.modelNameSpan.textContent = this.modelDisplayName;
          }
        }
      } catch {
        this.availableModels = [
          "nvidia:meta/llama-3.2-11b-vision-instruct",
          "nvidia:meta/llama-3.2-90b-vision-instruct",
          "nvidia:meta/codellama-70b",
          "groq:llama-3.3-70b-versatile",
          "openai:gpt-4o"
        ];
      }
    }
    setupListeners() {
      this.sendBtn.addEventListener("click", () => this.sendMessage());
      this.promptInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });
      this.promptInput.addEventListener("input", () => {
        this.promptInput.style.height = "auto";
        this.promptInput.style.height = `${Math.min(this.promptInput.scrollHeight, 120)}px`;
      });
      this.newChatBtn.addEventListener("click", () => {
        this.history = [];
        this.messagesContainer.innerHTML = `
        <div class="chat-bubble assistant">
          <div class="assistant-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
            <span>DEVs Agent</span>
          </div>
          <div>New session started. How can I help you build today?</div>
        </div>
      `;
      });
      this.messagesContainer.addEventListener("click", (e) => {
        const target = e.target;
        const openBtn = target.closest(".btn-open-in-editor");
        if (openBtn) {
          const block = openBtn.closest(".chat-code-block");
          const codeEl = block?.querySelector("pre code");
          const rawCode = codeEl?.textContent || "";
          const lang = openBtn.dataset.lang || "python";
          const ext = lang.toLowerCase() === "python" ? "py" : lang.toLowerCase() === "typescript" ? "ts" : lang.toLowerCase() === "javascript" ? "js" : "py";
          const filename = `program.${ext}`;
          if (this.editor) {
            this.editor.openSnippet(filename, rawCode);
          }
          return;
        }
        const copyBtn = target.closest(".btn-copy-code");
        if (copyBtn) {
          const block = copyBtn.closest(".chat-code-block");
          const codeEl = block?.querySelector("pre code");
          const rawCode = codeEl?.textContent || "";
          navigator.clipboard.writeText(rawCode);
          copyBtn.textContent = "Copied!";
          setTimeout(() => {
            copyBtn.textContent = "Copy";
          }, 2e3);
          return;
        }
      });
      this.modelPill.addEventListener("click", () => {
        const selection = prompt(
          `Select AI Model:
1. NVIDIA Llama 3.2 11B (Fast, Vision & Coding - Default)
2. NVIDIA Llama 3.2 90B (Large reasoning)
3. NVIDIA CodeLlama 70B (Dedicated coding)
4. Groq Llama 3.3 70B (High speed)
5. OpenAI GPT-4o`,
          "1"
        );
        if (selection === "1") {
          this.currentModel = "nvidia:meta/llama-3.2-11b-vision-instruct";
          this.modelDisplayName = "NVIDIA Llama 3.2 11B";
        } else if (selection === "2") {
          this.currentModel = "nvidia:meta/llama-3.2-90b-vision-instruct";
          this.modelDisplayName = "NVIDIA Llama 3.2 90B";
        } else if (selection === "3") {
          this.currentModel = "nvidia:meta/codellama-70b";
          this.modelDisplayName = "NVIDIA CodeLlama 70B";
        } else if (selection === "4") {
          this.currentModel = "groq:llama-3.3-70b-versatile";
          this.modelDisplayName = "Groq Llama 3.3 70B";
        } else if (selection === "5") {
          this.currentModel = "openai:gpt-4o";
          this.modelDisplayName = "OpenAI GPT-4o";
        }
        this.modelNameSpan.textContent = this.modelDisplayName;
      });
    }
    async sendMessage() {
      const text = this.promptInput.value.trim();
      if (!text || this.isGenerating) return;
      this.isGenerating = true;
      this.promptInput.value = "";
      this.promptInput.style.height = "auto";
      const userBubble = document.createElement("div");
      userBubble.className = "chat-bubble user";
      userBubble.textContent = text;
      this.messagesContainer.appendChild(userBubble);
      const priorHistory = [...this.history];
      this.history.push({ role: "user", content: text });
      const assistantBubble = document.createElement("div");
      assistantBubble.className = "chat-bubble assistant";
      const header = document.createElement("div");
      header.className = "assistant-header";
      header.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
      <span>DEVs Agent</span>
    `;
      assistantBubble.appendChild(header);
      const contentDiv = document.createElement("div");
      contentDiv.innerHTML = '<span style="color:#888;">Thinking & writing code...</span>';
      assistantBubble.appendChild(contentDiv);
      this.messagesContainer.appendChild(assistantBubble);
      this.scrollToBottom();
      let fullResponse = "";
      await streamChat(
        text,
        this.currentModel,
        priorHistory,
        (chunk) => {
          if (!fullResponse) {
            contentDiv.innerHTML = "";
          }
          fullResponse += chunk;
          contentDiv.innerHTML = this.renderMarkdown(fullResponse);
          this.scrollToBottom();
        },
        async (data) => {
          this.isGenerating = false;
          this.history.push({ role: "assistant", content: fullResponse });
          this.scrollToBottom();
          if (this.explorer) {
            await this.explorer.init();
          }
          if (data?.modified_files && data.modified_files.length > 0 && this.editor) {
            for (const filePath of data.modified_files) {
              const fileName = filePath.split("/").pop() || filePath;
              await this.editor.openFile(filePath, fileName);
            }
          } else if (this.editor) {
            const codeMatch = fullResponse.match(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/);
            if (codeMatch && !this.editor.getActiveTabId()) {
              const lang = (codeMatch[1] || "python").toLowerCase();
              const ext = lang === "python" ? "py" : lang === "typescript" ? "ts" : lang === "javascript" ? "js" : "py";
              await this.editor.openSnippet(`program.${ext}`, codeMatch[2].trim());
            }
          }
        },
        (err) => {
          this.isGenerating = false;
          if (this.history.length > 0 && this.history[this.history.length - 1].role === "user") {
            this.history.pop();
          }
          contentDiv.innerHTML += `<div style="color:#f48771; margin-top:6px;">Error: ${err}</div>`;
          this.scrollToBottom();
        }
      );
    }
    renderMarkdown(md) {
      let html = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      html = html.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_m, lang, code) => {
        const language = lang || "code";
        const coloredCode = code.replace(/\b(def|class|return|if|else|elif|import|from|as|while|for|in|try|except|finally|with|async|await|const|let|var|function)\b/g, '<span class="syn-kw">$1</span>').replace(/\b(RunContext|AgentDeps|Agent|Tool|str|int|bool|list|dict|bytes)\b/g, '<span class="syn-type">$1</span>').replace(/("[^"\n]*"|'[^'\n]*')/g, '<span class="syn-str">$1</span>').replace(/(#.*$|\/\/.*$)/gm, '<span class="syn-comment">$1</span>').replace(/\b([a-zA-Z_]\w*)\s*(?=\()/g, '<span class="syn-fn">$1</span>');
        return `
        <div class="chat-code-block" style="background:#000000; border:1px solid rgba(255,255,255,0.12); border-radius:10px; margin:10px 0; overflow:hidden;">
          <div style="display:flex; justify-content:space-between; align-items:center; background:#121212; padding:5px 12px; font-size:11px; color:#a3a3a3; border-bottom:1px solid rgba(255,255,255,0.08); font-family:var(--font-code);">
            <span style="font-weight:600; color:#e2e8f0;">${language}</span>
            <div style="display:flex; gap:6px; align-items:center;">
              <button class="btn-open-in-editor" data-lang="${language}" title="Open in Code Editor Working Area" style="background:#1e1e1e; border:1px solid rgba(255,255,255,0.22); color:#ffffff; padding:2px 8px; border-radius:10px; font-size:10px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:4px; transition:all 0.15s ease;">
                <span>\u25B6 Open in Editor</span>
              </button>
              <button class="btn-copy-code" style="background:#181818; border:1px solid rgba(255,255,255,0.15); color:#a3a3a3; padding:2px 8px; border-radius:10px; font-size:10px; cursor:pointer;">
                Copy
              </button>
            </div>
          </div>
          <pre style="padding:10px 14px; margin:0; overflow-x:auto; font-family:var(--font-code); font-size:12px; line-height:20px; color:#e2e8f0;"><code>${coloredCode}</code></pre>
        </div>
      `;
      });
      html = html.replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.08); color:#ffffff; padding:2px 6px; border-radius:4px; font-family:var(--font-code); font-size:12px; border:1px solid rgba(255,255,255,0.15);">$1</code>');
      html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      html = html.replace(/(calling \w+\([^\)]*\))/g, '<div class="tool-call-banner">\u{1F6E0} $1</div>');
      html = html.replace(/\n\n/g, "<br><br>");
      return html;
    }
    scrollToBottom() {
      const parent = this.messagesContainer.parentElement;
      if (parent) {
        parent.scrollTop = parent.scrollHeight;
      }
    }
  };

  // src/resizer.ts
  function setupResizers() {
    const sidebar = document.getElementById("sidebar-explorer");
    const resizerSidebar = document.getElementById("resizer-sidebar");
    const agentPane = document.getElementById("agent-pane");
    const resizerAgent = document.getElementById("resizer-agent");
    if (resizerSidebar && sidebar) {
      resizerSidebar.addEventListener("mousedown", (e) => {
        e.preventDefault();
        resizerSidebar.classList.add("active");
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        const onMouseMove = (moveEvent) => {
          const sidebarLeft = sidebar.getBoundingClientRect().left;
          const newWidth = Math.max(160, Math.min(550, moveEvent.clientX - sidebarLeft));
          sidebar.style.width = `${newWidth}px`;
        };
        const onMouseUp = () => {
          resizerSidebar.classList.remove("active");
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
          window.removeEventListener("mousemove", onMouseMove);
          window.removeEventListener("mouseup", onMouseUp);
        };
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
      });
    }
    if (resizerAgent && agentPane) {
      resizerAgent.addEventListener("mousedown", (e) => {
        e.preventDefault();
        resizerAgent.classList.add("active");
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        const onMouseMove = (moveEvent) => {
          const agentRight = agentPane.getBoundingClientRect().right;
          const newWidth = Math.max(260, Math.min(800, agentRight - moveEvent.clientX));
          agentPane.style.width = `${newWidth}px`;
        };
        const onMouseUp = () => {
          resizerAgent.classList.remove("active");
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
          window.removeEventListener("mousemove", onMouseMove);
          window.removeEventListener("mouseup", onMouseUp);
        };
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
      });
    }
  }

  // src/main.ts
  document.addEventListener("DOMContentLoaded", () => {
    setupResizers();
    const editor = new CodeEditor();
    const explorer = new FileExplorer("file-tree-root", (path, name) => {
      editor.openFile(path, name);
    });
    explorer.init();
    editor.setOnFileDeleted(() => {
      explorer.init();
    });
    explorer.setOnFileDeleted((deletedPath) => {
      editor.closeFileByPath(deletedPath);
    });
    const agent = new AgentChat(editor, explorer);
    const sidebar = document.getElementById("sidebar-explorer");
    const btnToggleSidebar = document.getElementById("btn-toggle-sidebar");
    const toggleSidebar = () => {
      const isHidden = sidebar.style.display === "none";
      sidebar.style.display = isHidden ? "flex" : "none";
    };
    btnToggleSidebar?.addEventListener("click", toggleSidebar);
    const agentPane = document.getElementById("agent-pane");
    const btnToggleAgent = document.getElementById("btn-toggle-agent");
    const btnCloseAgent = document.getElementById("btn-close-agent");
    const toggleAgent = () => {
      const isHidden = agentPane.style.display === "none";
      agentPane.style.display = isHidden ? "flex" : "none";
    };
    btnToggleAgent?.addEventListener("click", toggleAgent);
    btnCloseAgent?.addEventListener("click", () => {
      agentPane.style.display = "none";
    });
    console.log("DEVs IDE Frontend initialized successfully.");
  });
})();
