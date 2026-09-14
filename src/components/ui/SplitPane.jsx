import { useRef, useState } from 'react';
import './SplitPane.css';

export function SplitPane({
  children,
  direction = 'horizontal',
  defaultSize = 50,
  minSize = 100,
  maxSize,
  onResize,
  className = '',
  ...props
}) {
  const [size, setSize] = useState(defaultSize);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef(null);
  const paneRefs = useRef([null, null]);

  const handleMouseMove = (e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    let newSize;
    if (direction === 'horizontal') {
      newSize = ((e.clientX - rect.left) / rect.width) * 100;
    } else {
      newSize = ((e.clientY - rect.top) / rect.height) * 100;
    }
    newSize = Math.max(minSize / rect.width * 100, Math.min(newSize, maxSize ? maxSize / rect.width * 100 : 100 - minSize / rect.height * 100));
    setSize(newSize);
    onResize?.(newSize);
  };

  const handleTouchMove = (e) => {
    e.preventDefault();
    handleMouseMove(e.touches[0]);
  };

  const handleMouseUp = () => {
    setDragging(false);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.removeEventListener('touchend', handleMouseUp);
  };

  const handleMouseDown = (e) => {
    setDragging(true);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    e.preventDefault();
  };

  const handleTouchStart = (_e) => {
    setDragging(true);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleMouseUp);
  };

  const isHorizontal = direction === 'horizontal';

  return (
    <div
      ref={containerRef}
      className={`hey-split-pane ${isHorizontal ? 'hey-split-pane--horizontal' : 'hey-split-pane--vertical'} ${dragging ? 'hey-split-pane--dragging' : ''} ${className}`}
      {...props}
    >
      <div className="hey-split-pane__pane" ref={(el) => paneRefs.current[0] = el} style={{ [isHorizontal ? 'width' : 'height']: `${size}%` }}>
        {Array.isArray(children) ? children[0] : children}
      </div>
      <div
        className={`hey-split-pane__divider ${isHorizontal ? 'hey-split-pane__divider--horizontal' : 'hey-split-pane__divider--vertical'}`}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        role="separator"
        aria-orientation={isHorizontal ? 'horizontal' : 'vertical'}
        aria-label="Resize pane"
        tabIndex={0}
        onKeyDown={(e) => {
          const step = 1;
          if ((isHorizontal && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) || (!isHorizontal && (e.key === 'ArrowUp' || e.key === 'ArrowDown'))) {
            e.preventDefault();
            const delta = (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -step : step;
            setSize(prev => Math.max(minSize, Math.min(maxSize || 100 - minSize, prev + delta)));
          }
        }}
      >
        <div className="hey-split-pane__divider-handle" />
      </div>
      <div className="hey-split-pane__pane" ref={(el) => paneRefs.current[1] = el} style={{ [isHorizontal ? 'width' : 'height']: `calc(100% - ${size}%)` }}>
        {Array.isArray(children) ? children[1] : null}
      </div>
    </div>
  );
}

SplitPane.displayName = 'SplitPane';

export function ResizablePane({
  children,
  direction = 'horizontal',
  defaultSize = 300,
  minSize = 200,
  maxSize,
  onResize,
  className = '',
  ...props
}) {
  const [size, setSize] = useState(defaultSize);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef(null);
  const paneRefs = useRef([null, null]);

  const handleMouseMove = (e) => {
    if (!containerRef.current) return;
    let newSize;
    if (direction === 'horizontal') {
      newSize = e.clientX - containerRef.current.getBoundingClientRect().left;
    } else {
      newSize = e.clientY - containerRef.current.getBoundingClientRect().top;
    }
    newSize = Math.max(minSize, Math.min(maxSize || Infinity, newSize));
    setSize(newSize);
    onResize?.(newSize);
  };

  const handleTouchMove = (e) => {
    e.preventDefault();
    handleMouseMove(e.touches[0]);
  };

  const handleMouseUp = () => {
    setDragging(false);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.removeEventListener('touchend', handleMouseUp);
  };

  const handleMouseDown = (e) => {
    setDragging(true);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    e.preventDefault();
  };

  const handleTouchStart = (_e) => {
    setDragging(true);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleMouseUp);
  };

  const isHorizontal = direction === 'horizontal';

  return (
    <div
      ref={containerRef}
      className={`hey-resizable-pane ${isHorizontal ? 'hey-resizable-pane--horizontal' : 'hey-resizable-pane--vertical'} ${dragging ? 'hey-resizable-pane--dragging' : ''} ${className}`}
      {...props}
    >
      <div className="hey-resizable-pane__pane" ref={(el) => paneRefs.current[0] = el} style={{ [isHorizontal ? 'width' : 'height']: `${size}px` }}>
        {Array.isArray(children) ? children[0] : children}
      </div>
      <div
        className={`hey-resizable-pane__divider ${isHorizontal ? 'hey-resizable-pane__divider--horizontal' : 'hey-resizable-pane__divider--vertical'}`}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        role="separator"
        aria-orientation={isHorizontal ? 'horizontal' : 'vertical'}
        aria-label="Resize pane"
        tabIndex={0}
        onKeyDown={(e) => {
          const step = 10;
          if ((isHorizontal && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) || (!isHorizontal && (e.key === 'ArrowUp' || e.key === 'ArrowDown'))) {
            e.preventDefault();
            const delta = (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -step : step;
            setSize(prev => Math.max(minSize, Math.min(maxSize || Infinity, prev + delta)));
          }
        }}
      >
        <div className="hey-resizable-pane__divider-handle" />
      </div>
      <div className="hey-resizable-pane__pane" ref={(el) => paneRefs.current[1] = el} style={{ flex: 1, [isHorizontal ? 'minWidth' : 'minHeight']: 0 }}>
        {Array.isArray(children) ? children[1] : null}
      </div>
    </div>
  );
}

ResizablePane.displayName = 'ResizablePane';