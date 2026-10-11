import { ChatMessage } from './types';
import { streamChat, getModels } from './api';
import { CodeEditor } from './editor';
import { FileExplorer } from './explorer';

export class AgentChat {
  private editor?: CodeEditor;
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
  private history: Array<{ role: string; content: string }> = [];
  private isGenerating = false;

  constructor(editor?: CodeEditor, explorer?: FileExplorer) {
    this.editor = editor;
    this.explorer = explorer;
    this.messagesContainer = document.getElementById('chat-messages') as HTMLElement;
    this.promptInput = document.getElementById('agent-prompt-input') as HTMLTextAreaElement;
    this.sendBtn = document.getElementById('btn-send-prompt') as HTMLButtonElement;
    this.modelPill = document.getElementById('model-selector-pill') as HTMLElement;
    this.modelNameSpan = document.getElementById('active-model-name') as HTMLElement;
    this.newChatBtn = document.getElementById('btn-new-chat') as HTMLElement;

    this.setupListeners();
    this.initModels();
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
    // Send on click
    this.sendBtn.addEventListener('click', () => this.sendMessage());

    // Enter to submit (Shift+Enter for newline)
    this.promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Auto-expand textarea
    this.promptInput.addEventListener('input', () => {
      this.promptInput.style.height = 'auto';
      this.promptInput.style.height = `${Math.min(this.promptInput.scrollHeight, 120)}px`;
    });

    // New chat button
    this.newChatBtn.addEventListener('click', () => {
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

    // Handle code block action buttons (Open in Editor & Copy)
    this.messagesContainer.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const openBtn = target.closest('.btn-open-in-editor') as HTMLElement;
      if (openBtn) {
        const block = openBtn.closest('.chat-code-block');
        const codeEl = block?.querySelector('pre code');
        const rawCode = codeEl?.textContent || '';
        const lang = openBtn.dataset.lang || 'python';
        const ext = lang.toLowerCase() === 'python' ? 'py' : (lang.toLowerCase() === 'typescript' ? 'ts' : (lang.toLowerCase() === 'javascript' ? 'js' : 'py'));
        const filename = `program.${ext}`;
        if (this.editor) {
          this.editor.openSnippet(filename, rawCode);
        }
        return;
      }

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

    // Model selection modal / dropdown
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

    // 1. Render User Bubble
    const userBubble = document.createElement('div');
    userBubble.className = 'chat-bubble user';
    userBubble.textContent = text;
    this.messagesContainer.appendChild(userBubble);

    const priorHistory = [...this.history];
    this.history.push({ role: 'user', content: text });

    // 2. Render Assistant Placeholder Bubble
    const assistantBubble = document.createElement('div');
    assistantBubble.className = 'chat-bubble assistant';

    const header = document.createElement('div');
    header.className = 'assistant-header';
    header.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
      <span>DEVs Agent</span>
    `;
    assistantBubble.appendChild(header);

    const contentDiv = document.createElement('div');
    contentDiv.innerHTML = '<span style="color:#888;">Thinking & writing code...</span>';
    assistantBubble.appendChild(contentDiv);

    this.messagesContainer.appendChild(assistantBubble);
    this.scrollToBottom();

    let fullResponse = '';

    await streamChat(
      text,
      this.currentModel,
      priorHistory,
      (chunk: string) => {
        if (!fullResponse) {
          contentDiv.innerHTML = '';
        }
        fullResponse += chunk;
        contentDiv.innerHTML = this.renderMarkdown(fullResponse);
        this.scrollToBottom();
      },
      async (data?: { modified_files?: string[] }) => {
        this.isGenerating = false;
        this.history.push({ role: 'assistant', content: fullResponse });
        this.scrollToBottom();

        // Refresh file tree explorer so created/updated files immediately show
        if (this.explorer) {
          await this.explorer.init();
        }

        // Auto-open created or modified files in working area editor!
        if (data?.modified_files && data.modified_files.length > 0 && this.editor) {
          for (const filePath of data.modified_files) {
            const fileName = filePath.split('/').pop() || filePath;
            await this.editor.openFile(filePath, fileName);
          }
        } else if (this.editor) {
          // If no file was created on disk, but a code block was generated,
          // and the working area is currently empty, automatically open it!
          const codeMatch = fullResponse.match(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/);
          if (codeMatch && !this.editor.getActiveTabId()) {
            const lang = (codeMatch[1] || 'python').toLowerCase();
            const ext = lang === 'python' ? 'py' : (lang === 'typescript' ? 'ts' : (lang === 'javascript' ? 'js' : 'py'));
            await this.editor.openSnippet(`program.${ext}`, codeMatch[2].trim());
          }
        }
      },
      (err: string) => {
        this.isGenerating = false;
        if (this.history.length > 0 && this.history[this.history.length - 1].role === 'user') {
          this.history.pop();
        }
        contentDiv.innerHTML += `<div style="color:#f48771; margin-top:6px;">Error: ${err}</div>`;
        this.scrollToBottom();
      }
    );
  }

  private renderMarkdown(md: string): string {
    // Lightweight markdown parser for chat
    let html = md
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Code blocks with curved SaaS container, language badge, and Open in Editor / Copy buttons
    html = html.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_m, lang, code) => {
      const language = lang || 'code';
      const coloredCode = code
        .replace(/\b(def|class|return|if|else|elif|import|from|as|while|for|in|try|except|finally|with|async|await|const|let|var|function)\b/g, '<span class="syn-kw">$1</span>')
        .replace(/\b(RunContext|AgentDeps|Agent|Tool|str|int|bool|list|dict|bytes)\b/g, '<span class="syn-type">$1</span>')
        .replace(/("[^"\n]*"|'[^'\n]*')/g, '<span class="syn-str">$1</span>')
        .replace(/(#.*$|\/\/.*$)/gm, '<span class="syn-comment">$1</span>')
        .replace(/\b([a-zA-Z_]\w*)\s*(?=\()/g, '<span class="syn-fn">$1</span>');

      return `
        <div class="chat-code-block" style="background:#000000; border:1px solid rgba(255,255,255,0.12); border-radius:10px; margin:10px 0; overflow:hidden;">
          <div style="display:flex; justify-content:space-between; align-items:center; background:#121212; padding:5px 12px; font-size:11px; color:#a3a3a3; border-bottom:1px solid rgba(255,255,255,0.08); font-family:var(--font-code);">
            <span style="font-weight:600; color:#e2e8f0;">${language}</span>
            <div style="display:flex; gap:6px; align-items:center;">
              <button class="btn-open-in-editor" data-lang="${language}" title="Open in Code Editor Working Area" style="background:#1e1e1e; border:1px solid rgba(255,255,255,0.22); color:#ffffff; padding:2px 8px; border-radius:10px; font-size:10px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:4px; transition:all 0.15s ease;">
                <span>▶ Open in Editor</span>
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

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.08); color:#ffffff; padding:2px 6px; border-radius:4px; font-family:var(--font-code); font-size:12px; border:1px solid rgba(255,255,255,0.15);">$1</code>');

    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Tool call banner detection (e.g. "calling write(...)")
    html = html.replace(/(calling \w+\([^\)]*\))/g, '<div class="tool-call-banner">🛠 $1</div>');

    // Paragraphs
    html = html.replace(/\n\n/g, '<br><br>');

    return html;
  }

  private scrollToBottom(): void {
    const parent = this.messagesContainer.parentElement;
    if (parent) {
      parent.scrollTop = parent.scrollHeight;
    }
  }
}
