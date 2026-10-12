"use strict";
(() => {
  // src/api.ts
  var API_BASE = "/api";
  async function getWorkspaceTree() {
    const res = await fetch(`${API_BASE}/files/tree`);
    if (!res.ok) throw new Error("Failed to load file tree");
    return res.json();
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
            this.onFileSelect?.(filename, filename);
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
          this.onFileSelect?.(item.path, item.name);
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

  // src/agent.ts
  var AgentChat = class {
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
    constructor(explorer) {
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
          if (data?.modified_files && data.modified_files.length > 0 && this.explorer) {
            await this.explorer.init();
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
  }

  // src/main.ts
  document.addEventListener("DOMContentLoaded", () => {
    setupResizers();
    const explorer = new FileExplorer("file-tree-root");
    explorer.init();
    const agent = new AgentChat(explorer);
    const sidebar = document.getElementById("sidebar-explorer");
    const btnToggleSidebar = document.getElementById("btn-toggle-sidebar");
    const toggleSidebar = () => {
      const isHidden = sidebar.style.display === "none";
      sidebar.style.display = isHidden ? "flex" : "none";
    };
    btnToggleSidebar?.addEventListener("click", toggleSidebar);
    console.log("DEVs Agent Workspace Frontend initialized successfully.");
  });
})();
