import { ChatMessage, ChatSession, ActivityEvent } from './types';
import { streamChat, getModels, getChatDetails, saveChatHistory, createChat } from './api';
import { FileExplorer } from './explorer';

interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
  thought_time?: string;
  activities?: ActivityEvent[];
  file_actions?: ActivityEvent[];
}

export class AgentChat {
  private explorer?: FileExplorer;
  private messagesContainer: HTMLElement;
  private promptInput: HTMLTextAreaElement;
  private sendBtn: HTMLButtonElement;
  private modelPill: HTMLElement;
  private modelNameSpan: HTMLElement;
  private newChatBtn: HTMLElement;

  private currentModel = 'nvidia:meta/llama-3.2-11b-vision-instruct';
  private modelDisplayName = 'NVIDIA Llama 3.2 11B';
  private availableModels: string[] = [];
  private activeChat: ChatSession | null = null;
  private history: StoredMessage[] = [];
  private isGenerating = false;

  constructor(explorer?: FileExplorer) {
    this.explorer = explorer;
    this.messagesContainer = document.getElementById('chat-messages') as HTMLElement;
    this.promptInput = document.getElementById('agent-prompt-input') as HTMLTextAreaElement;
    this.sendBtn = document.getElementById('btn-send-prompt') as HTMLButtonElement;
    this.modelPill = document.getElementById('model-selector-pill') as HTMLElement;
    this.modelNameSpan = document.getElementById('active-model-name') as HTMLElement;
    this.newChatBtn = document.getElementById('btn-new-chat') as HTMLElement;

    this.setupListeners();
    this.initModels();

    if (this.explorer) {
      this.explorer.setOnChatSelect((chat) => this.switchChat(chat));
    }
  }

  async switchChat(chat: ChatSession): Promise<void> {
    this.activeChat = chat;
    this.history = [];
    this.messagesContainer.innerHTML = '';

    // Update title banner if applicable
    const agentWorkspace = document.querySelector('.agent-workspace-title');
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
      console.warn('Failed to fetch history for chat:', chat.id, err);
    }

    // Default welcome message for fresh chat
    this.renderWelcomeMessage();
  }

  private renderWelcomeMessage(): void {
    const welcomeBubble = document.createElement('div');
    welcomeBubble.className = 'chat-bubble assistant';
    welcomeBubble.innerHTML = `
      <div class="assistant-header">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
        <span>DEVs Agent</span>
        <span class="active-folder-badge">user_files/${this.activeChat?.folder || 'project_1'}/</span>
      </div>
      <div class="assistant-markdown-content">
        <p>Session started for <strong>${this.escapeHtml(this.activeChat?.title || 'Project')}</strong>.</p>
        <p style="color:var(--text-muted); font-size:12px;">Files created will be placed directly in <code>user_files/${this.escapeHtml(this.activeChat?.folder || 'project_1')}/</code>. What would you like to build?</p>
      </div>
    `;
    this.messagesContainer.appendChild(welcomeBubble);
    this.scrollToBottom();
  }

  private renderLoadedHistory(): void {
    for (const msg of this.history) {
      if (msg.role === 'user') {
        const userBubble = document.createElement('div');
        userBubble.className = 'chat-bubble user';
        userBubble.textContent = msg.content;
        this.messagesContainer.appendChild(userBubble);
      } else {
        const assistantBubble = document.createElement('div');
        assistantBubble.className = 'chat-bubble assistant';

        const header = document.createElement('div');
        header.className = 'assistant-header';
        header.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          <span>DEVs Agent</span>
          ${msg.thought_time ? `<span class="thought-time-tag">${msg.thought_time}</span>` : ''}
        `;
        assistantBubble.appendChild(header);

        // Render file actions if any
        if (msg.file_actions && msg.file_actions.length > 0) {
          const cardsContainer = document.createElement('div');
          cardsContainer.className = 'file-action-cards-container';
          for (const fa of msg.file_actions) {
            cardsContainer.appendChild(this.createFileActionCard(fa));
          }
          assistantBubble.appendChild(cardsContainer);
        }

        const mdDiv = document.createElement('div');
        mdDiv.className = 'assistant-markdown-content';
        mdDiv.innerHTML = this.renderMarkdown(msg.content);
        assistantBubble.appendChild(mdDiv);

        this.messagesContainer.appendChild(assistantBubble);
      }
    }
    this.scrollToBottom();
  }

  private async initModels(): Promise<void> {
    try {
      const data = await getModels();
      this.availableModels = data.models;
      if (data.current) {
        this.currentModel = data.current;
        if (data.current.includes('llama-3.2-11b')) {
          this.modelDisplayName = 'NVIDIA Llama 3.2 11B';
        } else if (data.current.includes('llama-3.2-90b')) {
          this.modelDisplayName = 'NVIDIA Llama 3.2 90B';
        } else if (data.current.includes('codellama')) {
          this.modelDisplayName = 'NVIDIA CodeLlama 70B';
        } else {
          this.modelDisplayName = data.current;
        }
        if (this.modelNameSpan) {
          this.modelNameSpan.textContent = this.modelDisplayName;
        }
      }
    } catch {
      this.availableModels = [
        'nvidia:meta/llama-3.2-11b-vision-instruct',
        'nvidia:meta/llama-3.2-90b-vision-instruct',
        'nvidia:meta/codellama-70b',
        'groq:llama-3.3-70b-versatile',
        'openai:gpt-4o',
      ];
    }
  }

  private setupListeners(): void {
    this.sendBtn.addEventListener('click', () => this.sendMessage());

    this.promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    this.promptInput.addEventListener('input', () => {
      this.promptInput.style.height = 'auto';
      this.promptInput.style.height = `${Math.min(this.promptInput.scrollHeight, 120)}px`;
    });

    // Top "+" New Chat button in agent pane
    this.newChatBtn.addEventListener('click', async () => {
      const title = prompt('Enter new project name:');
      if (title && title.trim()) {
        try {
          const created = await createChat(title.trim());
          if (this.explorer) {
            await this.explorer.loadChats();
            await this.explorer.selectChatById(created.id);
          }
        } catch (err: any) {
          alert('Failed to create new chat: ' + (err.message || String(err)));
        }
      }
    });

    // Copy code button handler
    this.messagesContainer.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const copyBtn = target.closest('.btn-copy-code') as HTMLElement;
      if (copyBtn) {
        const block = copyBtn.closest('.chat-code-block');
        const codeEl = block?.querySelector('pre code');
        const rawCode = codeEl?.textContent || '';
        navigator.clipboard.writeText(rawCode);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
        return;
      }
    });

    // Model selection pill
    this.modelPill.addEventListener('click', () => {
      const selection = prompt(
        `Select AI Model:\n1. NVIDIA Llama 3.2 11B (Fast, Vision & Coding - Default)\n2. NVIDIA Llama 3.2 90B (Large reasoning)\n3. NVIDIA CodeLlama 70B (Dedicated coding)\n4. Groq Llama 3.3 70B (High speed)\n5. OpenAI GPT-4o`,
        '1'
      );
      if (selection === '1') {
        this.currentModel = 'nvidia:meta/llama-3.2-11b-vision-instruct';
        this.modelDisplayName = 'NVIDIA Llama 3.2 11B';
      } else if (selection === '2') {
        this.currentModel = 'nvidia:meta/llama-3.2-90b-vision-instruct';
        this.modelDisplayName = 'NVIDIA Llama 3.2 90B';
      } else if (selection === '3') {
        this.currentModel = 'nvidia:meta/codellama-70b';
        this.modelDisplayName = 'NVIDIA CodeLlama 70B';
      } else if (selection === '4') {
        this.currentModel = 'groq:llama-3.3-70b-versatile';
        this.modelDisplayName = 'Groq Llama 3.3 70B';
      } else if (selection === '5') {
        this.currentModel = 'openai:gpt-4o';
        this.modelDisplayName = 'OpenAI GPT-4o';
      }
      this.modelNameSpan.textContent = this.modelDisplayName;
    });
  }

  async sendMessage(): Promise<void> {
    const text = this.promptInput.value.trim();
    if (!text || this.isGenerating) return;

    this.isGenerating = true;
    this.promptInput.value = '';
    this.promptInput.style.height = 'auto';

    const activeFolder = this.explorer?.getActiveFolder() || this.activeChat?.folder || 'project_1';
    const activeChatId = this.activeChat?.id || 'chat_default';

    // 1. Render User Bubble
    const userBubble = document.createElement('div');
    userBubble.className = 'chat-bubble user';
    userBubble.textContent = text;
    this.messagesContainer.appendChild(userBubble);

    const priorHistory = this.history.map((m) => ({ role: m.role, content: m.content }));
    this.history.push({ role: 'user', content: text });

    // 2. Render Assistant Bubble with Antigravity components
    const assistantBubble = document.createElement('div');
    assistantBubble.className = 'chat-bubble assistant';

    const header = document.createElement('div');
    header.className = 'assistant-header';
    header.innerHTML = `
      <div style="display:flex; align-items:center; gap:6px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
        <span>DEVs Agent</span>
      </div>
      <span class="active-folder-badge">user_files/${this.escapeHtml(activeFolder)}/</span>
    `;
    assistantBubble.appendChild(header);

    // 3. Antigravity Thinking Container
    const thinkingCard = document.createElement('div');
    thinkingCard.className = 'thinking-card';

    const thinkingHeader = document.createElement('div');
    thinkingHeader.className = 'thinking-header';
    thinkingHeader.innerHTML = `
      <div class="thinking-title">
        <span class="thinking-pulse-dot"></span>
        <span class="thinking-label">Thinking...</span>
        <span class="thinking-timer">0.0s</span>
      </div>
      <span class="thinking-toggle-arrow">▾</span>
    `;

    const thinkingBody = document.createElement('div');
    thinkingBody.className = 'thinking-body';

    thinkingCard.appendChild(thinkingHeader);
    thinkingCard.appendChild(thinkingBody);
    assistantBubble.appendChild(thinkingCard);

    // Toggle collapse on thinking header click
    thinkingHeader.addEventListener('click', () => {
      const isCollapsed = thinkingBody.style.display === 'none';
      thinkingBody.style.display = isCollapsed ? 'flex' : 'none';
      const arrow = thinkingHeader.querySelector('.thinking-toggle-arrow');
      if (arrow) arrow.textContent = isCollapsed ? '▾' : '▸';
    });

    // 4. File action cards container
    const actionCardsContainer = document.createElement('div');
    actionCardsContainer.className = 'file-action-cards-container';
    assistantBubble.appendChild(actionCardsContainer);

    // 5. Final markdown content container
    const contentDiv = document.createElement('div');
    contentDiv.className = 'assistant-markdown-content';
    assistantBubble.appendChild(contentDiv);

    this.messagesContainer.appendChild(assistantBubble);
    this.scrollToBottom();

    // Timer logic
    const startTime = performance.now();
    const timerSpan = thinkingHeader.querySelector('.thinking-timer') as HTMLElement;
    const labelSpan = thinkingHeader.querySelector('.thinking-label') as HTMLElement;
    const pulseDot = thinkingHeader.querySelector('.thinking-pulse-dot') as HTMLElement;

    const timerInterval = setInterval(() => {
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
      if (timerSpan) timerSpan.textContent = `${elapsed}s`;
    }, 100);

    let fullResponse = '';
    const collectedActivities: ActivityEvent[] = [];
    const collectedFileActions: ActivityEvent[] = [];

    const appendThinkingStep = (text: string) => {
      const step = document.createElement('div');
      step.className = 'thinking-step';
      step.innerHTML = `
        <span class="step-bullet">›</span>
        <span class="step-text">${this.escapeHtml(text)}</span>
      `;
      thinkingBody.appendChild(step);
      this.scrollToBottom();
    };

    // First default step
    appendThinkingStep('Analyzing request and workspace...');

    await streamChat(
      text,
      this.currentModel,
      priorHistory,
      {
        onThinking: (thought: string) => {
          appendThinkingStep(thought);
        },
        onActivity: (activity: ActivityEvent) => {
          collectedActivities.push(activity);
          if (activity.detail) {
            appendThinkingStep(activity.detail);
          } else if (activity.action === 'analyze') {
            appendThinkingStep(`Analyzing directory '${activity.file || '.'}'...`);
          } else if (activity.action === 'read') {
            appendThinkingStep(`Inspecting file '${activity.file}'...`);
          }
        },
        onFileAction: (fa: ActivityEvent) => {
          const isDuplicate = collectedFileActions.some(
            (existing) => existing.file === fa.file && existing.action === fa.action && existing.lines === fa.lines
          );
          if (!isDuplicate) {
            collectedFileActions.push(fa);
            const card = this.createFileActionCard(fa);
            actionCardsContainer.appendChild(card);
            this.scrollToBottom();
          }

          // Refresh file tree immediately as files are created/edited!
          if (this.explorer) {
            this.explorer.refreshTree();
          }
        },
        onChunk: (chunk: string) => {
          fullResponse += chunk;
          contentDiv.innerHTML = this.renderMarkdown(fullResponse);
          this.scrollToBottom();
        },
        onDone: async (data) => {
          clearInterval(timerInterval);
          this.isGenerating = false;

          const totalTime = ((performance.now() - startTime) / 1000).toFixed(1);
          if (timerSpan) timerSpan.textContent = `${totalTime}s`;
          if (labelSpan) labelSpan.textContent = `Thought for ${totalTime}s`;
          if (pulseDot) pulseDot.style.background = '#10b981'; // Green completed dot

          // Add to history and persist
          this.history.push({
            role: 'assistant',
            content: fullResponse,
            thought_time: `Thought for ${totalTime}s`,
            activities: collectedActivities,
            file_actions: collectedFileActions,
          });

          // Save chat history to backend
          try {
            await saveChatHistory(activeChatId, this.history);
          } catch (e) {
            console.warn('Failed to save chat history:', e);
          }

          // Final tree refresh
          if (this.explorer) {
            await this.explorer.refreshTree();
          }
        },
        onError: (err: string) => {
          clearInterval(timerInterval);
          this.isGenerating = false;
          if (this.history.length > 0 && this.history[this.history.length - 1].role === 'user') {
            this.history.pop();
          }
          if (labelSpan) labelSpan.textContent = 'Failed';
          if (pulseDot) pulseDot.style.background = '#ef4444';
          contentDiv.innerHTML += `<div style="color:#f48771; margin-top:8px; font-size:12px; font-weight:500;">⚠️ Error: ${this.escapeHtml(err)}</div>`;
          this.scrollToBottom();
        },
      },
      activeFolder,
      activeChatId
    );
  }

  private createFileActionCard(fa: ActivityEvent): HTMLElement {
    const card = document.createElement('div');
    card.className = 'file-action-card';

    const isEdit = fa.action === 'edit';
    const linesBadge = isEdit
      ? `<span class="line-badge edit">±${fa.lines ?? 0} lines</span>`
      : `<span class="line-badge write">+${fa.lines ?? 0} lines</span>`;

    const iconSvg = isEdit
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>`;

    card.innerHTML = `
      <div class="file-action-left">
        <span class="file-action-icon">${iconSvg}</span>
        <div class="file-action-meta">
          <span class="file-action-name">${this.escapeHtml(fa.file || 'file')}</span>
          <span class="file-action-status">${isEdit ? 'Modified file' : 'Created new file'}</span>
        </div>
      </div>
      <div class="file-action-right">
        ${linesBadge}
      </div>
    `;

    return card;
  }

  private renderMarkdown(md: string): string {
    if (!md) return '';

    // 1. Remove code blocks (backtick content ```...```) from chat responses
    let processed = md.replace(/```[a-zA-Z0-9_-]*\n[\s\S]*?(?:```|$)/g, '').trim();

    // 2. Escape HTML for the rest of markdown text
    processed = this.escapeHtml(processed);

    // 3. Inline code `...`
    processed = processed.replace(/`([^`\n]+)`/g, '<code class="chat-inline-code">$1</code>');

    // 4. Bold **...**
    processed = processed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // 5. Italic *...*
    processed = processed.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');

    // 6. Convert newlines in regular text to <br>
    processed = processed.replace(/\n\s*\n+/g, '<br><br>').replace(/\n/g, '<br>');

    // 7. Strip leading or trailing <br>
    processed = processed.replace(/^(?:<br>)+|(?:<br>)+$/g, '');

    return processed;
  }

  private escapeHtml(str: string): string {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private scrollToBottom(): void {
    const parent = this.messagesContainer.parentElement;
    if (parent) {
      parent.scrollTop = parent.scrollHeight;
    }
  }
}
