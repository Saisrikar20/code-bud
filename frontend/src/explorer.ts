import { FileItem } from './types';
import { getWorkspaceTree, getWorkspaceInfo, createItem, deleteItem } from './api';

export class FileExplorer {
  private container: HTMLElement;
  private headerTitle: HTMLElement | null;
  private onFileSelect: (path: string, name: string) => void;
  private onFileDeleted?: (path: string) => void;
  private activePath: string | null = null;

  constructor(containerId: string, onFileSelect: (path: string, name: string) => void) {
    this.container = document.getElementById(containerId) as HTMLElement;
    this.headerTitle = document.getElementById('workspace-folder-name');
    this.onFileSelect = onFileSelect;
    this.setupHeaderActions();
  }

  setOnFileDeleted(cb: (path: string) => void): void {
    this.onFileDeleted = cb;
  }

  async init(): Promise<void> {
    try {
      const info = await getWorkspaceInfo();
      if (this.headerTitle) {
        this.headerTitle.textContent = info.name || 'WORKSPACE';
      }
      const titleProject = document.getElementById('window-title-project');
      if (titleProject) {
        titleProject.textContent = info.name || 'workspace';
      }
      const agentWorkspace = document.querySelector('.agent-workspace-title');
      if (agentWorkspace) {
        agentWorkspace.textContent = (info.name || 'workspace').toLowerCase();
      }

      const tree = await getWorkspaceTree();
      this.renderTree(tree);
    } catch (err) {
      console.warn('API tree load failed, using starter workspace', err);
      this.renderFallbackTree();
    }
  }

  private setupHeaderActions(): void {
    const folderHeader = document.getElementById('workspace-folder-header');
    const folderToggleIcon = document.getElementById('workspace-folder-toggle');
    folderHeader?.addEventListener('click', (e) => {
      // Don't toggle if clicking one of the action buttons
      if ((e.target as HTMLElement).closest('.tree-action-icon')) return;
      const isHidden = this.container.style.display === 'none';
      this.container.style.display = isHidden ? 'block' : 'none';
      if (folderToggleIcon) {
        folderToggleIcon.textContent = isHidden ? '˅' : '›';
      }
    });

    const btnNewFile = document.getElementById('btn-explorer-new-file');
    btnNewFile?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const filename = prompt('Enter new file name (e.g. app.py, models.py):');
      if (filename) {
        try {
          await createItem(filename, false);
          await this.init();
          this.onFileSelect(filename, filename);
        } catch (err: any) {
          alert('Error creating file: ' + err.message);
        }
      }
    });

    const btnNewFolder = document.getElementById('btn-explorer-new-folder');
    btnNewFolder?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const foldername = prompt('Enter new folder name (e.g. src, components):');
      if (foldername) {
        try {
          await createItem(foldername, true);
          await this.init();
        } catch (err: any) {
          alert('Error creating folder: ' + err.message);
        }
      }
    });

    const btnRefresh = document.getElementById('btn-explorer-refresh');
    btnRefresh?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.init();
    });
  }

  setActive(path: string): void {
    this.activePath = path;
    const allNodes = this.container.querySelectorAll('.tree-node');
    allNodes.forEach((node) => {
      const nodePath = (node as HTMLElement).dataset.path;
      if (nodePath === path) {
        node.classList.add('active');
      } else {
        node.classList.remove('active');
      }
    });
  }

  private renderTree(items: FileItem[], indent = 0): void {
    this.container.innerHTML = '';
    if (!items || items.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.style.padding = '18px 14px';
      emptyDiv.style.color = 'var(--text-muted)';
      emptyDiv.style.fontSize = '12px';
      emptyDiv.style.lineHeight = '1.6';
      emptyDiv.innerHTML = `
        <div style="color:#777777;">No files in workspace.</div>
        <div style="margin-top:8px;">
          <button id="btn-empty-add-file" style="background:#181818; border:1px solid rgba(255,255,255,0.18); color:#ffffff; padding:4px 12px; border-radius:12px; cursor:pointer; font-size:11px; font-weight:600;">+ New File</button>
        </div>
      `;
      this.container.appendChild(emptyDiv);
      document.getElementById('btn-empty-add-file')?.addEventListener('click', () => {
        document.getElementById('btn-explorer-new-file')?.click();
      });
      return;
    }
    const frag = document.createDocumentFragment();

    for (const item of items) {
      this.createNodeElement(item, frag, indent);
    }
    this.container.appendChild(frag);
  }

  private createNodeElement(item: FileItem, parent: DocumentFragment | HTMLElement, indent: number): void {
    const li = document.createElement('li');
    const node = document.createElement('div');
    node.className = 'tree-node';
    node.dataset.path = item.path;

    // Indentation
    for (let i = 0; i < indent; i++) {
      const ind = document.createElement('span');
      ind.className = 'tree-indent';
      node.appendChild(ind);
    }

    // Arrow or spacer
    const arrow = document.createElement('span');
    arrow.style.fontSize = '10px';
    arrow.style.width = '12px';
    arrow.style.display = 'inline-block';
    arrow.style.color = '#888';
    arrow.textContent = item.is_dir ? '˅ ' : '  ';
    node.appendChild(arrow);

    // Icon
    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    icon.innerHTML = this.getIcon(item.name, item.is_dir);
    node.appendChild(icon);

    // Label with text truncation
    const label = document.createElement('span');
    label.className = 'tree-label';
    label.textContent = item.name;
    label.title = item.name;
    node.appendChild(label);

    // Delete item button on hover
    const deleteBtn = document.createElement('span');
    deleteBtn.className = 'tree-delete-btn';
    deleteBtn.title = item.is_dir ? `Delete folder "${item.name}"` : `Delete file "${item.name}"`;
    deleteBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const kind = item.is_dir ? `folder "${item.name}" and all its contents` : `file "${item.name}"`;
      if (!confirm(`Are you sure you want to permanently delete ${kind} from the workspace?`)) {
        return;
      }
      try {
        await deleteItem(item.path);
        if (this.onFileDeleted) {
          this.onFileDeleted(item.path);
        }
        await this.init();
      } catch (err: any) {
        alert('Failed to delete: ' + (err.message || String(err)));
      }
    });
    node.appendChild(deleteBtn);

    li.appendChild(node);

    if (item.is_dir && item.children) {
      const childUl = document.createElement('ul');
      childUl.style.listStyle = 'none';
      childUl.style.padding = '0';
      childUl.style.margin = '0';
      for (const child of item.children) {
        this.createNodeElement(child, childUl, indent + 1);
      }
      li.appendChild(childUl);

      // Toggle folder on click
      node.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = childUl.style.display !== 'none';
        childUl.style.display = isOpen ? 'none' : 'block';
        arrow.textContent = isOpen ? '› ' : '˅ ';
      });
    } else {
      node.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setActive(item.path);
        this.onFileSelect(item.path, item.name);
      });
    }

    parent.appendChild(li);
  }

  private getIcon(name: string, isDir: boolean): string {
    if (isDir) {
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#888888" stroke-width="2" style="margin-right:4px;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
    }
    if (name.endsWith('.py')) {
      return `<span style="color:#ffffff; font-size:10px; font-weight:bold; font-family:var(--font-code); margin-right:4px; border:1px solid #444; padding:0 2px; border-radius:2px;">PY</span>`;
    }
    if (name.endsWith('.json')) {
      return `<span style="color:#aaaaaa; font-size:11px; font-weight:bold; font-family:var(--font-code); margin-right:4px;">{}</span>`;
    }
    if (name.endsWith('.toml')) {
      return `<span style="color:#aaaaaa; font-size:10px; font-weight:bold; font-family:var(--font-code); margin-right:4px; border:1px solid #444; padding:0 2px; border-radius:2px;">CFG</span>`;
    }
    if (name.endsWith('.md')) {
      return `<span style="color:#ffffff; font-size:10px; font-weight:bold; font-family:var(--font-code); margin-right:4px; border:1px solid #444; padding:0 2px; border-radius:2px;">MD</span>`;
    }
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666666" stroke-width="2" style="margin-right:4px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
  }

  private renderFallbackTree(): void {
    this.renderTree([]);
  }
}
