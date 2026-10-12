import { FileItem, FileContent } from './types';

const API_BASE = '/api';

export async function getWorkspaceTree(): Promise<FileItem[]> {
  const res = await fetch(`${API_BASE}/files/tree`);
  if (!res.ok) throw new Error('Failed to load file tree');
  return res.json();
}

export async function getFileContent(path: string): Promise<FileContent> {
  const res = await fetch(`${API_BASE}/files/content?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error(`Failed to load file content for ${path}`);
  return res.json();
}

export async function saveFile(path: string, content: string): Promise<any> {
  const res = await fetch(`${API_BASE}/files/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  });
  if (!res.ok) throw new Error(`Failed to save ${path}`);
  return res.json();
}

export async function getWorkspaceInfo(): Promise<{
  workspace_root: string;
  name: string;
  git_branch?: string;
  python_version?: string;
}> {
  const res = await fetch(`${API_BASE}/files/info`);
  if (!res.ok) return { workspace_root: 'user_files', name: 'USER_FILES', git_branch: 'main', python_version: '3.12' };
  return res.json();
}

export async function createItem(path: string, is_dir = false): Promise<any> {
  const res = await fetch(`${API_BASE}/files/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, is_dir }),
  });
  if (!res.ok) throw new Error(`Failed to create ${path}`);
  return res.json();
}

export async function deleteItem(path: string): Promise<any> {
  const res = await fetch(`${API_BASE}/files/delete?path=${encodeURIComponent(path)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete ${path}`);
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

export async function streamChat(
  message: string,
  model: string,
  history: Array<{ role: string; content: string }>,
  onChunk: (chunk: string) => void,
  onDone: (data?: { modified_files?: string[] }) => void,
  onError: (err: string) => void
) {
  try {
    const res = await fetch(`${API_BASE}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, model, history }),
    });

    if (!res.ok || !res.body) {
      onError(`Request failed with status: ${res.status}`);
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
            if (data.type === 'chunk') {
              onChunk(data.content);
            } else if (data.type === 'error') {
              onError(data.content);
            } else if (data.type === 'done') {
              onDone(data);
              return;
            }
          } catch (e) {
            // raw text line fallback
            onChunk(line.slice(6));
          }
        }
      }
    }
    onDone();
  } catch (err: any) {
    onError(err.message || String(err));
  }
}
