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

export interface ChatSession {
  id: string;
  title: string;
  folder: string;
  created_at: number;
  updated_at: number;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  requests?: number;
}

export interface ActivityEvent {
  type: 'thinking' | 'activity' | 'file_action' | 'chunk' | 'done' | 'error' | 'usage';
  status?: string;
  content?: string;
  action?: 'write' | 'edit' | 'read' | 'analyze';
  file?: string;
  lines?: number;
  old_lines?: number;
  detail?: string;
  modified_files?: string[];
  activities?: any[];
  usage?: TokenUsage;
}

