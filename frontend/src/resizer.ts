export function setupResizers(): void {
  const sidebar = document.getElementById('sidebar-explorer') as HTMLElement;
  const resizerSidebar = document.getElementById('resizer-sidebar') as HTMLElement;
  const agentPane = document.getElementById('agent-pane') as HTMLElement;
  const resizerAgent = document.getElementById('resizer-agent') as HTMLElement;

  if (resizerSidebar && sidebar) {
    resizerSidebar.addEventListener('mousedown', (e) => {
      e.preventDefault();
      resizerSidebar.classList.add('active');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMouseMove = (moveEvent: MouseEvent) => {
        const sidebarLeft = sidebar.getBoundingClientRect().left;
        const newWidth = Math.max(160, Math.min(550, moveEvent.clientX - sidebarLeft));
        sidebar.style.width = `${newWidth}px`;
      };

      const onMouseUp = () => {
        resizerSidebar.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }

  if (resizerAgent && agentPane) {
    resizerAgent.addEventListener('mousedown', (e) => {
      e.preventDefault();
      resizerAgent.classList.add('active');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMouseMove = (moveEvent: MouseEvent) => {
        const agentRight = agentPane.getBoundingClientRect().right;
        const newWidth = Math.max(260, Math.min(800, agentRight - moveEvent.clientX));
        agentPane.style.width = `${newWidth}px`;
      };

      const onMouseUp = () => {
        resizerAgent.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }
}
