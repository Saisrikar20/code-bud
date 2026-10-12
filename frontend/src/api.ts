import { FileItem, FileContent, ChatSession, ActivityEvent, TokenUsage } from './types';

const API_BASE = '/api';

export async function getWorkspaceTree(folder?: string): Promise<FileItem[]> {
  const url = folder ? `${API_BASE}/files/tree?folder=${encodeURIComponent(folder)}` : `${API_BASE}/files/tree`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load file tree');
  return res.json();
}

export async function getFileContent(path: string, folder?: string): Promise<FileContent> {
  const folderParam = folder ? `&folder=${encodeURIComponent(folder)}` : '';
  const res = await fetch(`${API_BASE}/files/content?path=${encodeURIComponent(path)}${folderParam}`);
  if (!res.ok) throw new Error(`Failed to load file content for ${path}`);
  return res.json();
}

export async function saveFile(path: string, content: string, folder?: string): Promise<any> {
  const folderParam = folder ? `?folder=${encodeURIComponent(folder)}` : '';
  const res = await fetch(`${API_BASE}/files/save${folderParam}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  });
  if (!res.ok) throw new Error(`Failed to save ${path}`);
  return res.json();
}

export async function getWorkspaceInfo(folder?: string): Promise<{
  workspace_root: string;
  name: string;
  git_branch?: string;
  python_version?: string;
}> {
  const url = folder ? `${API_BASE}/files/info?folder=${encodeURIComponent(folder)}` : `${API_BASE}/files/info`;
  const res = await fetch(url);
  if (!res.ok) return { workspace_root: 'user_files', name: folder ? folder.toUpperCase() : 'USER_FILES', git_branch: 'main', python_version: '3.12' };
  return res.json();
}

export async function createItem(path: string, is_dir = false, folder?: string): Promise<any> {
  const folderParam = folder ? `?folder=${encodeURIComponent(folder)}` : '';
  const res = await fetch(`${API_BASE}/files/create${folderParam}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, is_dir }),
  });
  if (!res.ok) throw new Error(`Failed to create ${path}`);
  return res.json();
}

export async function deleteItem(path: string, folder?: string): Promise<any> {
  const folderParam = folder ? `&folder=${encodeURIComponent(folder)}` : '';
  const res = await fetch(`${API_BASE}/files/delete?path=${encodeURIComponent(path)}${folderParam}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete ${path}`);
  return res.json();
}

// Chat Session Management
export async function getChats(): Promise<ChatSession[]> {
  const res = await fetch(`${API_BASE}/chats`);
  if (!res.ok) throw new Error('Failed to load chat sessions');
  return res.json();
}

export async function createChat(title?: string, folder?: string): Promise<ChatSession> {
  const res = await fetch(`${API_BASE}/chats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, folder }),
  });
  if (!res.ok) throw new Error('Failed to create new chat session');
  return res.json();
}

export async function getChatDetails(chatId: string): Promise<{ session: ChatSession; history: any[] }> {
  const res = await fetch(`${API_BASE}/chats/${encodeURIComponent(chatId)}`);
  if (!res.ok) throw new Error('Failed to load chat session details');
  return res.json();
}

export async function saveChatHistory(chatId: string, messages: any[]): Promise<any> {
  const res = await fetch(`${API_BASE}/chats/${encodeURIComponent(chatId)}/history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) throw new Error('Failed to save chat history');
  return res.json();
}

export async function deleteChat(chatId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/chats/${encodeURIComponent(chatId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete chat session');
  return res.json();
}

export async function getModels(): Promise<{ current: string; models: string[] }> {
  const res = await fetch(`${API_BASE}/chat/models`);
  if (!res.ok) {
    return {
      current: 'nvidia:z-ai/glm-5.3-flash',
      models: [
        'nvidia:z-ai/glm-5.3-flash',
        'nvidia:openai/gpt-oss-20b',
        'nvidia:meta/llama-3.2-11b-vision-instruct',
        'openai:gpt-4o',
      ],
    };
  }
  return res.json();
}

export interface StreamChatCallbacks {
  onThinking?: (thought: string) => void;
  onActivity?: (activity: ActivityEvent) => void;
  onFileAction?: (fileAction: ActivityEvent) => void;
  onChunk: (chunk: string) => void;
  onUsage?: (usage: TokenUsage) => void;
  onDone: (data?: { modified_files?: string[]; activities?: any[]; usage?: TokenUsage }) => void;
  onError: (err: string) => void;
}

export async function streamChat(
  message: string,
  model: string,
  history: Array<{ role: string; content: string }>,
  callbacks: StreamChatCallbacks,
  workspace?: string,
  sessionId?: string
) {
  try {
    const res = await fetch(`${API_BASE}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        model,
        history,
        workspace,
        session_id: sessionId || 'default',
      }),
    });

    if (!res.ok || !res.body) {
      callbacks.onError(`Request failed with status: ${res.status}`);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'thinking') {
              callbacks.onThinking?.(data.content || 'Analyzing...');
            } else if (data.type === 'activity') {
              callbacks.onActivity?.(data);
            } else if (data.type === 'file_action') {
              callbacks.onFileAction?.(data);
            } else if (data.type === 'chunk') {
              callbacks.onChunk(data.content);
            } else if (data.type === 'usage') {
              if (data.usage) {
                callbacks.onUsage?.(data.usage);
              }
            } else if (data.type === 'error') {
              callbacks.onError(data.content);
            } else if (data.type === 'done') {
              if (data.usage) {
                callbacks.onUsage?.(data.usage);
              }
              callbacks.onDone(data);
              return;
            }
          } catch (e) {
            // raw text line fallback
            callbacks.onChunk(line.slice(6));
          }
        }
      }
    }
    callbacks.onDone();
  } catch (err: any) {
    callbacks.onError(err.message || String(err));
  }
}

