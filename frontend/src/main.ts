import { FileExplorer } from './explorer';
import { CodeEditor } from './editor';
import { AgentChat } from './agent';
import { setupResizers } from './resizer';

document.addEventListener('DOMContentLoaded', () => {
  setupResizers();

  const editor = new CodeEditor();
  const explorer = new FileExplorer('file-tree-root', (path: string, name: string) => {
    editor.openFile(path, name);
  });
  explorer.init();

  // Synchronize deletions between Explorer and Editor
  editor.setOnFileDeleted(() => {
    explorer.init();
  });
  explorer.setOnFileDeleted((deletedPath: string) => {
    editor.closeFileByPath(deletedPath);
  });

  const agent = new AgentChat(editor, explorer);

  // Sidebar toggle
  const sidebar = document.getElementById('sidebar-explorer') as HTMLElement;
  const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');

  const toggleSidebar = () => {
    const isHidden = sidebar.style.display === 'none';
    sidebar.style.display = isHidden ? 'flex' : 'none';
  };

  btnToggleSidebar?.addEventListener('click', toggleSidebar);

  // Agent pane toggle
  const agentPane = document.getElementById('agent-pane') as HTMLElement;
  const btnToggleAgent = document.getElementById('btn-toggle-agent');
  const btnCloseAgent = document.getElementById('btn-close-agent');

  const toggleAgent = () => {
    const isHidden = agentPane.style.display === 'none';
    agentPane.style.display = isHidden ? 'flex' : 'none';
  };

  btnToggleAgent?.addEventListener('click', toggleAgent);

  btnCloseAgent?.addEventListener('click', () => {
    agentPane.style.display = 'none';
  });

  console.log('DEVs IDE Frontend initialized successfully.');
});
