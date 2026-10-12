"use strict";
(() => {
  // src/api.ts
  var API_BASE = "/api";
  async function getWorkspaceTree(folder) {
    const url = folder ? `${API_BASE}/files/tree?folder=${encodeURIComponent(folder)}` : `${API_BASE}/files/tree`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to load file tree");
    return res.json();
  }
  async function getWorkspaceInfo(folder) {
    const url = folder ? `${API_BASE}/files/info?folder=${encodeURIComponent(folder)}` : `${API_BASE}/files/info`;
    const res = await fetch(url);
    if (!res.ok) return { workspace_root: "user_files", name: folder ? folder.toUpperCase() : "USER_FILES", git_branch: "main", python_version: "3.12" };
    return res.json();
  }
  async function createItem(path, is_dir = false, folder) {
    const folderParam = folder ? `?folder=${encodeURIComponent(folder)}` : "";
    const res = await fetch(`${API_BASE}/files/create${folderParam}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, is_dir })
    });
    if (!res.ok) throw new Error(`Failed to create ${path}`);
    return res.json();
  }
  async function deleteItem(path, folder) {
    const folderParam = folder ? `&folder=${encodeURIComponent(folder)}` : "";
    const res = await fetch(`${API_BASE}/files/delete?path=${encodeURIComponent(path)}${folderParam}`, {
      method: "DELETE"
    });
    if (!res.ok) throw new Error(`Failed to delete ${path}`);
    return res.json();
  }
  async function getChats() {
    const res = await fetch(`${API_BASE}/chats`);
    if (!res.ok) throw new Error("Failed to load chat sessions");
    return res.json();
  }
  async function createChat(title, folder) {
    const res = await fetch(`${API_BASE}/chats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, folder })
    });
    if (!res.ok) throw new Error("Failed to create new chat session");
    return res.json();
  }
  async function getChatDetails(chatId) {
    const res = await fetch(`${API_BASE}/chats/${encodeURIComponent(chatId)}`);
    if (!res.ok) throw new Error("Failed to load chat session details");
    return res.json();
  }
  async function saveChatHistory(chatId, messages) {
    const res = await fetch(`${API_BASE}/chats/${encodeURIComponent(chatId)}/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages })
    });
    if (!res.ok) throw new Error("Failed to save chat history");
    return res.json();
  }
  async function deleteChat(chatId) {
    const res = await fetch(`${API_BASE}/chats/${encodeURIComponent(chatId)}`, {
      method: "DELETE"
    });
    if (!res.ok) throw new Error("Failed to delete chat session");
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
  async function streamChat(message, model, history, callbacks, workspace, sessionId) {
    try {
      const res = await fetch(`${API_BASE}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          model,
          history,
          workspace,
          session_id: sessionId || "default"
        })
      });
      if (!res.ok || !res.body) {
        callbacks.onError(`Request failed with status: ${res.status}`);
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
              if (data.type === "thinking") {
                callbacks.onThinking?.(data.content || "Analyzing...");
              } else if (data.type === "activity") {
                callbacks.onActivity?.(data);
              } else if (data.type === "file_action") {
                callbacks.onFileAction?.(data);
              } else if (data.type === "chunk") {
                callbacks.onChunk(data.content);
              } else if (data.type === "error") {
                callbacks.onError(data.content);
              } else if (data.type === "done") {
                callbacks.onDone(data);
                return;
              }
            } catch (e) {
              callbacks.onChunk(line.slice(6));
            }
          }
        }
      }
      callbacks.onDone();
    } catch (err) {
      callbacks.onError(err.message || String(err));
    }
  }

  // src/explorer.ts
  var FileExplorer = class {
    container;
    chatsContainer;
    headerTitle;
    onFileSelect;
    onFileDeleted;
    onChatSelect;
    activePath = null;
    activeChat = null;
    chatsList = [];
    constructor(containerId, onFileSelect, onChatSelect) {
      this.container = document.getElementById(containerId);
      this.chatsContainer = document.getElementById("chat-sessions-list");
      this.headerTitle = document.getElementById("workspace-folder-name");
      this.onFileSelect = onFileSelect;
      this.onChatSelect = onChatSelect;
      this.setupHeaderActions();
    }
    setOnFileDeleted(cb) {
      this.onFileDeleted = cb;
    }
    setOnChatSelect(cb) {
      this.onChatSelect = cb;
    }
    getActiveChat() {
      return this.activeChat;
    }
    getActiveFolder() {
      return this.activeChat?.folder;
    }
    async init() {
      await this.loadChats();
    }
    async loadChats() {
      try {
        this.chatsList = await getChats();
        if (!this.chatsList || this.chatsList.length === 0) {
          const def = await createChat("Main Project", "project_1");
          this.chatsList = [def];
        }
        if (!this.activeChat || !this.chatsList.find((c) => c.id === this.activeChat?.id)) {
          this.activeChat = this.chatsList[0];
        }
        this.renderChatsList();
        await this.refreshTree();
        if (this.activeChat && this.onChatSelect) {
          this.onChatSelect(this.activeChat);
        }
      } catch (err) {
        console.error("Failed to load chats:", err);
      }
    }
    renderChatsList() {
      if (!this.chatsContainer) return;
      this.chatsContainer.innerHTML = "";
      for (const chat of this.chatsList) {
        const li = document.createElement("li");
        li.className = "chat-session-item";
        if (this.activeChat && this.activeChat.id === chat.id) {
          li.classList.add("active");
        }
        li.innerHTML = `
        <div class="chat-session-main">
          <svg class="chat-session-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          <div class="chat-session-info">
            <span class="chat-session-title">${this.escapeHtml(chat.title)}</span>
            <span class="chat-session-folder">user_files/${this.escapeHtml(chat.folder)}/</span>
          </div>
        </div>
        ${this.chatsList.length > 1 ? `<button class="chat-session-delete-btn" title="Delete chat & folder">
                 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
               </button>` : ""}
      `;
        li.addEventListener("click", async (e) => {
          if (e.target.closest(".chat-session-delete-btn")) return;
          if (this.activeChat?.id === chat.id) return;
          this.activeChat = chat;
          this.renderChatsList();
          await this.refreshTree();
          this.onChatSelect?.(chat);
        });
        const delBtn = li.querySelector(".chat-session-delete-btn");
        delBtn?.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (confirm(`Delete chat "${chat.title}" and its directory user_files/${chat.folder}/?`)) {
            try {
              await deleteChat(chat.id);
              if (this.activeChat?.id === chat.id) {
                this.activeChat = null;
              }
              await this.loadChats();
            } catch (err) {
              alert("Failed to delete chat: " + (err.message || String(err)));
            }
          }
        });
        this.chatsContainer.appendChild(li);
      }
    }
    async selectChatById(chatId) {
      const found = this.chatsList.find((c) => c.id === chatId);
      if (found) {
        this.activeChat = found;
        this.renderChatsList();
        await this.refreshTree();
        this.onChatSelect?.(found);
      }
    }
    async refreshTree() {
      const folder = this.activeChat?.folder;
      try {
        const info = await getWorkspaceInfo(folder);
        if (this.headerTitle) {
          this.headerTitle.textContent = folder ? folder.toUpperCase() : info.name || "WORKSPACE";
        }
        const titleProject = document.getElementById("window-title-project");
        if (titleProject) {
          titleProject.textContent = folder || "workspace";
        }
        const agentWorkspace = document.querySelector(".agent-workspace-title");
        if (agentWorkspace) {
          agentWorkspace.textContent = folder || "workspace";
        }
        const tree = await getWorkspaceTree(folder);
        this.renderTree(tree);
      } catch (err) {
        console.warn("API tree load failed, using starter workspace", err);
        this.renderFallbackTree();
      }
    }
    setupHeaderActions() {
      const btnNewChat = document.getElementById("btn-new-chat-session");
      btnNewChat?.addEventListener("click", async (e) => {
        e.stopPropagation();
        const title = prompt("Enter project/chat name (e.g. Todo App, Calculator, Weather API):");
        if (title && title.trim()) {
          try {
            const newSession = await createChat(title.trim());
            this.activeChat = newSession;
            await this.loadChats();
          } catch (err) {
            alert("Error creating chat session: " + err.message);
          }
        }
      });
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
            await createItem(filename, false, this.getActiveFolder());
            await this.refreshTree();
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
            await createItem(foldername, true, this.getActiveFolder());
            await this.refreshTree();
          } catch (err) {
            alert("Error creating folder: " + err.message);
          }
        }
      });
      const btnRefresh = document.getElementById("btn-explorer-refresh");
      btnRefresh?.addEventListener("click", (e) => {
        e.stopPropagation();
        this.refreshTree();
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
        <div style="color:#777777;">No files in this project folder yet.</div>
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
          await deleteItem(item.path, this.getActiveFolder());
          if (this.onFileDeleted) {
            this.onFileDeleted(item.path);
          }
          await this.refreshTree();
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
    escapeHtml(str) {
      return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
    activeChat = null;
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
      if (this.explorer) {
        this.explorer.setOnChatSelect((chat) => this.switchChat(chat));
      }
    }
    async switchChat(chat) {
      this.activeChat = chat;
      this.history = [];
      this.messagesContainer.innerHTML = "";
      const agentWorkspace = document.querySelector(".agent-workspace-title");
      if (agentWorkspace) {
        agentWorkspace.textContent = chat.folder;
      }
      try {
        const details = await getChatDetails(chat.id);
        if (details.history && details.history.length > 0) {
          this.history = details.history;
          this.renderLoadedHistory();
          return;
        }
      } catch (err) {
        console.warn("Failed to fetch history for chat:", chat.id, err);
      }
      this.renderWelcomeMessage();
    }
    renderWelcomeMessage() {
      const welcomeBubble = document.createElement("div");
      welcomeBubble.className = "chat-bubble assistant";
      welcomeBubble.innerHTML = `
      <div class="assistant-header">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
        <span>DEVs Agent</span>
        <span class="active-folder-badge">user_files/${this.activeChat?.folder || "project_1"}/</span>
      </div>
      <div class="assistant-markdown-content">
        <p>Session started for <strong>${this.escapeHtml(this.activeChat?.title || "Project")}</strong>.</p>
        <p style="color:var(--text-muted); font-size:12px;">Files created will be placed directly in <code>user_files/${this.escapeHtml(this.activeChat?.folder || "project_1")}/</code>. What would you like to build?</p>
      </div>
    `;
      this.messagesContainer.appendChild(welcomeBubble);
      this.scrollToBottom();
    }
    renderLoadedHistory() {
      for (const msg of this.history) {
        if (msg.role === "user") {
          const userBubble = document.createElement("div");
          userBubble.className = "chat-bubble user";
          userBubble.textContent = msg.content;
          this.messagesContainer.appendChild(userBubble);
        } else {
          const assistantBubble = document.createElement("div");
          assistantBubble.className = "chat-bubble assistant";
          const header = document.createElement("div");
          header.className = "assistant-header";
          header.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          <span>DEVs Agent</span>
          ${msg.thought_time ? `<span class="thought-time-tag">${msg.thought_time}</span>` : ""}
        `;
          assistantBubble.appendChild(header);
          if (msg.file_actions && msg.file_actions.length > 0) {
            const cardsContainer = document.createElement("div");
            cardsContainer.className = "file-action-cards-container";
            for (const fa of msg.file_actions) {
              cardsContainer.appendChild(this.createFileActionCard(fa));
            }
            assistantBubble.appendChild(cardsContainer);
          }
          const mdDiv = document.createElement("div");
          mdDiv.className = "assistant-markdown-content";
          mdDiv.innerHTML = this.renderMarkdown(msg.content);
          assistantBubble.appendChild(mdDiv);
          this.messagesContainer.appendChild(assistantBubble);
        }
      }
      this.scrollToBottom();
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
      this.newChatBtn.addEventListener("click", async () => {
        const title = prompt("Enter new project name:");
        if (title && title.trim()) {
          try {
            const created = await createChat(title.trim());
            if (this.explorer) {
              await this.explorer.loadChats();
              await this.explorer.selectChatById(created.id);
            }
          } catch (err) {
            alert("Failed to create new chat: " + (err.message || String(err)));
          }
        }
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
      const activeFolder = this.explorer?.getActiveFolder() || this.activeChat?.folder || "project_1";
      const activeChatId = this.activeChat?.id || "chat_default";
      const userBubble = document.createElement("div");
      userBubble.className = "chat-bubble user";
      userBubble.textContent = text;
      this.messagesContainer.appendChild(userBubble);
      const priorHistory = this.history.map((m) => ({ role: m.role, content: m.content }));
      this.history.push({ role: "user", content: text });
      const assistantBubble = document.createElement("div");
      assistantBubble.className = "chat-bubble assistant";
      const header = document.createElement("div");
      header.className = "assistant-header";
      header.innerHTML = `
      <div style="display:flex; align-items:center; gap:6px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
        <span>DEVs Agent</span>
      </div>
      <span class="active-folder-badge">user_files/${this.escapeHtml(activeFolder)}/</span>
    `;
      assistantBubble.appendChild(header);
      const thinkingCard = document.createElement("div");
      thinkingCard.className = "thinking-card";
      const thinkingHeader = document.createElement("div");
      thinkingHeader.className = "thinking-header";
      thinkingHeader.innerHTML = `
      <div class="thinking-title">
        <span class="thinking-pulse-dot"></span>
        <span class="thinking-label">Thinking...</span>
        <span class="thinking-timer">0.0s</span>
      </div>
      <span class="thinking-toggle-arrow">\u25BE</span>
    `;
      const thinkingBody = document.createElement("div");
      thinkingBody.className = "thinking-body";
      thinkingCard.appendChild(thinkingHeader);
      thinkingCard.appendChild(thinkingBody);
      assistantBubble.appendChild(thinkingCard);
      thinkingHeader.addEventListener("click", () => {
        const isCollapsed = thinkingBody.style.display === "none";
        thinkingBody.style.display = isCollapsed ? "flex" : "none";
        const arrow = thinkingHeader.querySelector(".thinking-toggle-arrow");
        if (arrow) arrow.textContent = isCollapsed ? "\u25BE" : "\u25B8";
      });
      const actionCardsContainer = document.createElement("div");
      actionCardsContainer.className = "file-action-cards-container";
      assistantBubble.appendChild(actionCardsContainer);
      const contentDiv = document.createElement("div");
      contentDiv.className = "assistant-markdown-content";
      assistantBubble.appendChild(contentDiv);
      this.messagesContainer.appendChild(assistantBubble);
      this.scrollToBottom();
      const startTime = performance.now();
      const timerSpan = thinkingHeader.querySelector(".thinking-timer");
      const labelSpan = thinkingHeader.querySelector(".thinking-label");
      const pulseDot = thinkingHeader.querySelector(".thinking-pulse-dot");
      const timerInterval = setInterval(() => {
        const elapsed = ((performance.now() - startTime) / 1e3).toFixed(1);
        if (timerSpan) timerSpan.textContent = `${elapsed}s`;
      }, 100);
      let fullResponse = "";
      const collectedActivities = [];
      const collectedFileActions = [];
      const appendThinkingStep = (text2) => {
        const step = document.createElement("div");
        step.className = "thinking-step";
        step.innerHTML = `
        <span class="step-bullet">\u203A</span>
        <span class="step-text">${this.escapeHtml(text2)}</span>
      `;
        thinkingBody.appendChild(step);
        this.scrollToBottom();
      };
      appendThinkingStep("Analyzing request and workspace...");
      await streamChat(
        text,
        this.currentModel,
        priorHistory,
        {
          onThinking: (thought) => {
            appendThinkingStep(thought);
          },
          onActivity: (activity) => {
            collectedActivities.push(activity);
            if (activity.detail) {
              appendThinkingStep(activity.detail);
            } else if (activity.action === "analyze") {
              appendThinkingStep(`Analyzing directory '${activity.file || "."}'...`);
            } else if (activity.action === "read") {
              appendThinkingStep(`Inspecting file '${activity.file}'...`);
            }
          },
          onFileAction: (fa) => {
            const isDuplicate = collectedFileActions.some(
              (existing) => existing.file === fa.file && existing.action === fa.action && existing.lines === fa.lines
            );
            if (!isDuplicate) {
              collectedFileActions.push(fa);
              const card = this.createFileActionCard(fa);
              actionCardsContainer.appendChild(card);
              this.scrollToBottom();
            }
            if (this.explorer) {
              this.explorer.refreshTree();
            }
          },
          onChunk: (chunk) => {
            fullResponse += chunk;
            contentDiv.innerHTML = this.renderMarkdown(fullResponse);
            this.scrollToBottom();
          },
          onDone: async (data) => {
            clearInterval(timerInterval);
            this.isGenerating = false;
            const totalTime = ((performance.now() - startTime) / 1e3).toFixed(1);
            if (timerSpan) timerSpan.textContent = `${totalTime}s`;
            if (labelSpan) labelSpan.textContent = `Thought for ${totalTime}s`;
            if (pulseDot) pulseDot.style.background = "#10b981";
            this.history.push({
              role: "assistant",
              content: fullResponse,
              thought_time: `Thought for ${totalTime}s`,
              activities: collectedActivities,
              file_actions: collectedFileActions
            });
            try {
              await saveChatHistory(activeChatId, this.history);
            } catch (e) {
              console.warn("Failed to save chat history:", e);
            }
            if (this.explorer) {
              await this.explorer.refreshTree();
            }
          },
          onError: (err) => {
            clearInterval(timerInterval);
            this.isGenerating = false;
            if (this.history.length > 0 && this.history[this.history.length - 1].role === "user") {
              this.history.pop();
            }
            if (labelSpan) labelSpan.textContent = "Failed";
            if (pulseDot) pulseDot.style.background = "#ef4444";
            contentDiv.innerHTML += `<div style="color:#f48771; margin-top:8px; font-size:12px; font-weight:500;">\u26A0\uFE0F Error: ${this.escapeHtml(err)}</div>`;
            this.scrollToBottom();
          }
        },
        activeFolder,
        activeChatId
      );
    }
    createFileActionCard(fa) {
      const card = document.createElement("div");
      card.className = "file-action-card";
      const isEdit = fa.action === "edit";
      const linesBadge = isEdit ? `<span class="line-badge edit">\xB1${fa.lines ?? 0} lines</span>` : `<span class="line-badge write">+${fa.lines ?? 0} lines</span>`;
      const iconSvg = isEdit ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>` : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>`;
      card.innerHTML = `
      <div class="file-action-left">
        <span class="file-action-icon">${iconSvg}</span>
        <div class="file-action-meta">
          <span class="file-action-name">${this.escapeHtml(fa.file || "file")}</span>
          <span class="file-action-status">${isEdit ? "Modified file" : "Created new file"}</span>
        </div>
      </div>
      <div class="file-action-right">
        ${linesBadge}
      </div>
    `;
      return card;
    }
    highlightCode(rawCode) {
      const tokenRegex = /(#[^\n]*|\/\/[^\n]*)|("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\b(def|class|return|if|else|elif|import|from|as|while|for|in|try|except|finally|with|async|await|const|let|var|function)\b|\b(RunContext|AgentDeps|Agent|Tool|str|int|bool|list|dict|bytes|float|tuple|set|Any|Optional)\b|\b([a-zA-Z_]\w*)(?=\s*\()/g;
      let lastIndex = 0;
      let result = "";
      let match;
      while ((match = tokenRegex.exec(rawCode)) !== null) {
        if (match.index > lastIndex) {
          result += this.escapeHtml(rawCode.slice(lastIndex, match.index));
        }
        const [fullMatch, comment, str, kw, type, fn] = match;
        if (comment) {
          result += `<span class="syn-comment">${this.escapeHtml(comment)}</span>`;
        } else if (str) {
          result += `<span class="syn-str">${this.escapeHtml(str)}</span>`;
        } else if (kw) {
          result += `<span class="syn-kw">${this.escapeHtml(kw)}</span>`;
        } else if (type) {
          result += `<span class="syn-type">${this.escapeHtml(type)}</span>`;
        } else if (fn) {
          result += `<span class="syn-fn">${this.escapeHtml(fn)}</span>`;
        } else {
          result += this.escapeHtml(fullMatch);
        }
        lastIndex = match.index + fullMatch.length;
      }
      if (lastIndex < rawCode.length) {
        result += this.escapeHtml(rawCode.slice(lastIndex));
      }
      return result;
    }
    renderMarkdown(md) {
      if (!md) return "";
      const codeBlocks = [];
      let processed = md.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)(?:```|$)/g, (_match, lang, code) => {
        const language = (lang || "code").trim();
        const cleanCode = code.replace(/\n$/, "");
        const highlighted = this.highlightCode(cleanCode);
        const index = codeBlocks.length;
        codeBlocks.push(`
        <div class="chat-code-block">
          <div class="chat-code-header">
            <span class="code-lang-label">${this.escapeHtml(language)}</span>
            <button class="btn-copy-code">Copy</button>
          </div>
          <pre><code>${highlighted}</code></pre>
        </div>
      `);
        return `
%%CODE_BLOCK_${index}%%
`;
      });
      processed = this.escapeHtml(processed);
      processed = processed.replace(/`([^`\n]+)`/g, '<code class="chat-inline-code">$1</code>');
      processed = processed.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      processed = processed.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
      processed = processed.replace(/\n\n+/g, "<br><br>").replace(/\n/g, "<br>");
      processed = processed.replace(/(?:<br>)*%%CODE_BLOCK_(\d+)%%(?:<br>)*/g, (_match, id) => {
        const idx = parseInt(id, 10);
        return codeBlocks[idx] || "";
      });
      return processed;
    }
    escapeHtml(str) {
      return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
    const agent = new AgentChat(explorer);
    explorer.init();
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
//# sourceMappingURL=main.js.map
