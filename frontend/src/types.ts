export interface FileItem {
  name: string;
  path: string;
  is_dir: boolean;
  size?: number | null;
  children?: FileItem[] | null;
}

export interface FileContent {
  path: string;
  content: string;
  is_readonly?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: Array<{
    name: string;
    args: any;
    output?: string;
  }>;
}

export interface ModelOption {
  id: string;
  name: string;
}

export interface EditorTab {
  id: string;
  title: string;
  path: string;
  content: string;
  modified: boolean;
  badge?: string;
}
