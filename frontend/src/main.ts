import { FileExplorer } from './explorer';
import { AgentChat } from './agent';
import { setupResizers } from './resizer';

document.addEventListener('DOMContentLoaded', () => {
  setupResizers();

  const explorer = new FileExplorer('file-tree-root');
  const agent = new AgentChat(explorer);
  explorer.init();

  // Sidebar toggle
  const sidebar = document.getElementById('sidebar-explorer') as HTMLElement;
  const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');

  const toggleSidebar = () => {
    const isHidden = sidebar.style.display === 'none';
    sidebar.style.display = isHidden ? 'flex' : 'none';
  };

  btnToggleSidebar?.addEventListener('click', toggleSidebar);

  console.log('DEVs Agent Workspace Frontend initialized successfully.');
});
