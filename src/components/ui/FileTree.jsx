import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, File, Folder, FileText, Image, Video, Music, Code, Archive } from 'lucide-react';
import './FileTree.css';

const fileIcons = {
  folder: Folder,
  file: File,
  text: FileText,
  image: Image,
  video: Video,
  audio: Music,
  code: Code,
  archive: Archive,
  default: File,
};

function getFileType(name, isFolder) {
  if (isFolder) return 'folder';
  const ext = name.split('.').pop()?.toLowerCase();
  if (!ext) return 'file';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'flac', 'ogg', 'm4a'].includes(ext)) return 'audio';
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'rs', 'go', 'java', 'cpp', 'c', 'h', 'html', 'css', 'json', 'md', 'txt'].includes(ext)) return 'code';
  if (['zip', 'tar', 'gz', 'rar', '7z'].includes(ext)) return 'archive';
  return 'file';
}

function FileTreeNode({
  node,
  level = 0,
  selectedPath,
  expandedPaths,
  onSelect,
  onToggle,
  onContextMenu,
  dragState,
  searchQuery = '',
  className = '',
}) {
  const isExpanded = expandedPaths.has(node.path);
  const isSelected = selectedPath === node.path;
  const isFolder = node.children && node.children.length > 0;
  const hasChildren = isFolder && node.children.length > 0;
  const matchesSearch = searchQuery && node.name.toLowerCase().includes(searchQuery.toLowerCase());
  const childMatches = isFolder && node.children?.some(child =>
    child.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (child.children && child.children.some(c => c.name.toLowerCase().includes(searchQuery.toLowerCase())))
  );

  const shouldRender = !searchQuery || matchesSearch || childMatches;
  if (!shouldRender && level > 0) return null;

  const FileIcon = fileIcons[getFileType(node.name, isFolder)] || fileIcons.default;
  const dragOver = dragState?.overPath === node.path;
  const dragging = dragState?.draggingPath === node.path;

  const handleClick = (e) => {
    e.stopPropagation();
    onSelect?.(node);
  };

  const handleDoubleClick = (e) => {
    e.stopPropagation();
    if (isFolder) {
      onToggle?.(node.path);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (isFolder) {
        onToggle?.(node.path);
      } else {
        onSelect?.(node);
      }
    } else if (e.key === 'ArrowRight' && isFolder && !isExpanded) {
      e.preventDefault();
      onToggle?.(node.path);
    } else if (e.key === 'ArrowLeft' && isFolder && isExpanded) {
      e.preventDefault();
      onToggle?.(node.path);
    }
  };

  const handleDragStart = (e) => {
    e.dataTransfer.setData('text/plain', node.path);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const draggedPath = e.dataTransfer.getData('text/plain');
    if (draggedPath && draggedPath !== node.path) {
      // Handle drop - would need parent component to manage
    }
  };

  return (
    <div className={`hey-file-tree__node ${className} ${isSelected ? 'hey-file-tree__node--selected' : ''} ${dragOver ? 'hey-file-tree__node--drag-over' : ''} ${dragging ? 'hey-file-tree__node--dragging' : ''} ${matchesSearch ? 'hey-file-tree__node--match' : ''}`} style={{ '--indent': `${level * 20}px` }}>
      <div
        className="hey-file-tree__item"
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
        onContextMenu={onContextMenu}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        draggable={!isFolder}
        role="treeitem"
        aria-expanded={isFolder ? isExpanded : undefined}
        aria-selected={isSelected}
        aria-level={level + 1}
        tabIndex={0}
      >
        {hasChildren && (
          <motion.button
            className="hey-file-tree__expand"
            onClick={(e) => { e.stopPropagation(); onToggle?.(node.path); }}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
            initial={{ rotate: isExpanded ? 90 : 0 }}
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
          >
            <ChevronRight size={14} />
          </motion.button>
        )}
        <FileIcon size={16} className="hey-file-tree__icon" aria-hidden="true" />
        <span className="hey-file-tree__name" title={node.path}>{node.name}</span>
        {node.size && <span className="hey-file-tree__size">{formatSize(node.size)}</span>}
        {node.modified && <span className="hey-file-tree__modified">{formatDate(node.modified)}</span>}
        {node.status && <span className={`hey-file-tree__status hey-file-tree__status--${node.status}`}>{node.status}</span>}
      </div>
      <AnimatePresence>
        {isExpanded && hasChildren && (
          <motion.div
            className="hey-file-tree__children"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            role="group"
          >
            {node.children?.map((child) => (
              <FileTreeNode
                key={child.path}
                node={child}
                level={level + 1}
                selectedPath={selectedPath}
                expandedPaths={expandedPaths}
                onSelect={onSelect}
                onToggle={onToggle}
                onContextMenu={onContextMenu}
                dragState={dragState}
                searchQuery={searchQuery}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

function formatDate(date) {
  const d = new Date(date);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function FileTree({
  root,
  selectedPath,
  onSelect,
  onToggle,
  onContextMenu,
  dragState,
  searchQuery = '',
  expandedPaths: controlledExpandedPaths,
  defaultExpandedPaths = new Set(),
  className = '',
  ...props
}) {
  const [uncontrolledExpandedPaths, setUncontrolledExpandedPaths] = useState(defaultExpandedPaths);
  const expandedPaths = controlledExpandedPaths || uncontrolledExpandedPaths;

  const handleToggle = useCallback((path) => {
    if (controlledExpandedPaths) {
      onToggle?.(path);
    } else {
      setUncontrolledExpandedPaths(prev => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
    }
  }, [controlledExpandedPaths, onToggle]);

  return (
    <div className={`hey-file-tree ${className}`} role="tree" aria-label="File tree" {...props}>
      <FileTreeNode
        node={root}
        selectedPath={selectedPath}
        expandedPaths={expandedPaths}
        onSelect={onSelect}
        onToggle={handleToggle}
        onContextMenu={onContextMenu}
        dragState={dragState}
        searchQuery={searchQuery}
      />
    </div>
  );
}

FileTree.displayName = 'FileTree';