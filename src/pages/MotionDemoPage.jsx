/**
 * HEY V1 — Motion Demo Page
 * Showcases all motion components and interactions
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  MotionButton,
  MotionCard,
  MotionModal,
  MotionDrawer,
  MotionToast,
  ToastContainer,
  MotionTooltip,
  MotionPopover,
  MotionContextMenu,
  MotionDynamicIsland,
  MotionWidget,
  MotionVoiceVisualizer,
  MotionLive,
  MotionTutorial,
  tutorialRegistry,
  PageTransition,
  MotionSidebar,
} from './components/ui/motion-index';
import { PerformanceTierProvider } from './components/ui/PerformanceTierProvider';
import { usePerformanceTier, useReducedMotion } from './lib/motion';
import '../../styles/motion.css';

const MotionDemo = () => {
  const tier = usePerformanceTier();
  const reduced = useReducedMotion();
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [islandState, setIslandState] = useState('collapsed');
  const [voiceState, setVoiceState] = useState('idle');
  const [liveMode, setLiveMode] = useState('guide');
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const addToast = useCallback((type) => {
    const id = `toast-${Date.now()}`;
    setToasts(prev => [...prev, { id, message: `${type} toast message`, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const sidebarItems = [
    { id: 'home', label: 'Home', icon: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
    { id: 'chat', label: 'Chat', icon: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>, badge: 3 },
    { id: 'projects', label: 'Projects', icon: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> },
    { id: 'settings', label: 'Settings', icon: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
  ];

  return (
    <PerformanceTierProvider>
      <PageTransition>
        <div className="hey-motion-demo">
          {/* Header */}
          <header className="hey-demo-header">
            <h1>HEY V1 Motion System Demo</h1>
            <div className="hey-demo-status">
              <span className={`hey-tier-badge hey-tier-${tier}`}>Tier: {tier}</span>
              <span className={reduced ? 'hey-reduced-badge' : ''}>
                {reduced ? 'Reduced Motion: ON' : 'Reduced Motion: OFF'}
              </span>
            </div>
          </header>

          <div className="hey-demo-layout">
            {/* Sidebar */}
            <MotionSidebar
              items={sidebarItems}
              collapsed={sidebarCollapsed}
              onToggle={setSidebarCollapsed}
              onNavigate={(id) => console.log('Navigate to:', id)}
            />

            {/* Main Content */}
            <main className="hey-demo-content">
              {/* Section: Buttons */}
              <section className="hey-demo-section">
                <h2>Buttons (Section 3)</h2>
                <div className="hey-demo-grid">
                  <MotionButton variant="primary" onClick={() => addToast('success')}>
                    Primary Button
                  </MotionButton>
                  <MotionButton variant="secondary" onClick={() => addToast('info')}>
                    Secondary Button
                  </MotionButton>
                  <MotionButton variant="ghost" onClick={() => addToast('warning')}>
                    Ghost Button
                  </MotionButton>
                  <MotionButton variant="danger" onClick={() => addToast('error')}>
                    Danger Button
                  </MotionButton>
                  <MotionButton disabled>Disabled</MotionButton>
                  <MotionButton loading>Loading...</MotionButton>
                </div>
              </section>

              {/* Section: Cards */}
              <section className="hey-demo-section">
                <h2>Cards (Section 17)</h2>
                <div className="hey-demo-grid">
                  <MotionCard hoverable selectable>
                    <h3>Hoverable Card</h3>
                    <p>Lifts 1px on hover with subtle shadow</p>
                  </MotionCard>
                  <MotionCard hoverable selectable selected>
                    <h3>Selected Card</h3>
                    <p>Shows active state</p>
                  </MotionCard>
                  <MotionCard elevated>
                    <h3>Elevated Card</h3>
                    <p>Higher elevation shadow</p>
                  </MotionCard>
                </div>
              </section>

              {/* Section: Modal & Drawer */}
              <section className="hey-demo-section">
                <h2>Modals & Drawers (Section 7)</h2>
                <div className="hey-demo-grid">
                  <MotionButton onClick={() => setModalOpen(true)}>Open Modal</MotionButton>
                  <MotionButton onClick={() => setDrawerOpen(true)}>Open Drawer</MotionButton>
                </div>

                <MotionModal
                  open={modalOpen}
                  onClose={() => setModalOpen(false)}
                  title="Motion Modal"
                  description="Demonstrates panel enter/exit animation with backdrop"
                  size="medium"
                >
                  <p>This modal uses the specified motion tokens:</p>
                  <ul>
                    <li>Backdrop: 160ms fade</li>
                    <li>Panel: 250ms scale (0.975→1) + translateY (8→0)</li>
                    <li>Close: 180ms</li>
                    <li>Easing: cubic-bezier(.22,1,.36,1)</li>
                  </ul>
                  <div style={{ marginTop: '16px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <MotionButton variant="ghost" onClick={() => setModalOpen(false)}>Cancel</MotionButton>
                    <MotionButton onClick={() => setModalOpen(false)}>Confirm</MotionButton>
                  </div>
                </MotionModal>

                <MotionDrawer
                  open={drawerOpen}
                  onClose={() => setDrawerOpen(false)}
                  title="Motion Drawer"
                  position="right"
                  size="medium"
                >
                  <p>This drawer slides in from the right:</p>
                  <ul>
                    <li>290ms translateX (100%→0)</li>
                    <li>Spring easing</li>
                    <li>Content fades in after drawer begins</li>
                  </ul>
                  <div style={{ marginTop: '16px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <MotionButton variant="ghost" onClick={() => setDrawerOpen(false)}>Close</MotionButton>
                  </div>
                </MotionDrawer>
              </section>

              {/* Section: Toasts */}
              <section className="hey-demo-section">
                <h2>Toasts (Section 9)</h2>
                <div className="hey-demo-grid">
                  <MotionButton onClick={() => addToast('success')}>Success Toast</MotionButton>
                  <MotionButton onClick={() => addToast('error')}>Error Toast</MotionButton>
                  <MotionButton onClick={() => addToast('info')}>Info Toast</MotionButton>
                  <MotionButton onClick={() => addToast('warning')}>Warning Toast</MotionButton>
                </div>
                <ToastContainer toasts={toasts} onClose={removeToast} />
              </section>

              {/* Section: Tooltip & Popover */}
              <section className="hey-demo-section">
                <h2>Tooltips & Popovers (Section 8)</h2>
                <div className="hey-demo-grid">
                  <MotionTooltip content="This is a tooltip" position="top">
                    <MotionButton variant="ghost">Hover for Tooltip (Top)</MotionButton>
                  </MotionTooltip>
                  <MotionTooltip content="Bottom tooltip" position="bottom">
                    <MotionButton variant="ghost">Hover for Tooltip (Bottom)</MotionButton>
                  </MotionTooltip>
                  <MotionPopover
                    content={<div><p>Popover content with more details</p><MotionButton size="small">Action</MotionButton></div>}
                    trigger="click"
                    position="bottom"
                  >
                    <MotionButton variant="ghost">Click for Popover</MotionButton>
                  </MotionPopover>
                </div>
              </section>

              {/* Section: Context Menu */}
              <section className="hey-demo-section">
                <h2>Context Menu (Section 8)</h2>
                <MotionContextMenu
                  items={[
                    { label: 'Edit', icon: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>, onClick: () => addToast('info') },
                    { label: 'Duplicate', icon: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>, onClick: () => addToast('info') },
                    { divider: true },
                    { label: 'Delete', icon: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>, onClick: () => addToast('error'), dangerous: true },
                  ]}
                >
                  <MotionCard style={{ width: '200px', cursor: 'context-menu' }}>
                    <p>Right-click this card</p>
                  </MotionCard>
                </MotionContextMenu>
              </section>

              {/* Section: Dynamic Island */}
              <section className="hey-demo-section">
                <h2>Dynamic Island (Section 14)</h2>
                <div className="hey-demo-grid">
                  <MotionButton onClick={() => setIslandState('collapsed')}>Collapsed</MotionButton>
                  <MotionButton onClick={() => setIslandState('listening')}>Listening</MotionButton>
                  <MotionButton onClick={() => setIslandState('thinking')}>Thinking</MotionButton>
                  <MotionButton onClick={() => setIslandState('expanded')}>Expanded</MotionButton>
                  <MotionButton onClick={() => setIslandState('progress')}>Progress</MotionButton>
                  <MotionButton onClick={() => setIslandState('success')}>Success</MotionButton>
                  <MotionButton onClick={() => setIslandState('error')}>Error</MotionButton>
                </div>
                <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center' }}>
                  <MotionDynamicIsland
                    state={islandState}
                    audioLevel={islandState === 'listening' ? 0.5 + Math.random() * 0.5 : 0}
                    thinkingMessage="Processing your request..."
                    progress={islandState === 'progress' ? 0.6 : 0}
                    successMessage="Task completed!"
                    errorMessage="Something went wrong"
                    onExpand={() => console.log('Island expanded')}
                    onCollapse={() => console.log('Island collapsed')}
                  />
                </div>
              </section>

              {/* Section: Widgets */}
              <section className="hey-demo-section">
                <h2>Widgets (Section 15)</h2>
                <div className="hey-widget-grid">
                  <MotionWidget
                    id="widget-1"
                    title="Widget One"
                    minimizable
                    maximizable
                    closable
                    resizable
                    draggable
                    onMinimize={(id) => console.log('Minimize:', id)}
                    onMaximize={(id) => console.log('Maximize:', id)}
                    onClose={(id) => console.log('Close:', id)}
                  >
                    <p>Drag by header, resize from bottom-right, minimize/maximize/close via controls</p>
                  </MotionWidget>
                  <MotionWidget
                    id="widget-2"
                    title="Widget Two"
                    minimizable
                    maximizable
                    closable
                    resizable
                    draggable
                    defaultPosition={{ x: 400, y: 100 }}
                  >
                    <p>Another widget for stacking demo</p>
                  </MotionWidget>
                </div>
              </section>

              {/* Section: Voice Visualizer */}
              <section className="hey-demo-section">
                <h2>Voice Visualizer (Section 12)</h2>
                <div className="hey-demo-grid">
                  <MotionButton onClick={() => setVoiceState('idle')}>Idle</MotionButton>
                  <MotionButton onClick={() => setVoiceState('listening')}>Listening</MotionButton>
                  <MotionButton onClick={() => setVoiceState('thinking')}>Thinking</MotionButton>
                  <MotionButton onClick={() => setVoiceState('speaking')}>Speaking</MotionButton>
                  <MotionButton onClick={() => setVoiceState('interrupted')}>Interrupted</MotionButton>
                  <MotionButton onClick={() => setVoiceState('muted')}>Muted</MotionButton>
                </div>
                <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center', gap: '32px' }}>
                  <MotionVoiceVisualizer state={voiceState} audioLevel={0.7} size={100} />
                </div>
              </section>

              {/* Section: HEY Live */}
              <section className="hey-demo-section">
                <h2>HEY Live (Section 13)</h2>
                <div className="hey-demo-grid">
                  <MotionButton onClick={() => setLiveMode('guide')}>Guide Mode</MotionButton>
                  <MotionButton onClick={() => setLiveMode('assist')}>Assist Mode</MotionButton>
                  <MotionButton onClick={() => setLiveMode('act')}>Act Mode</MotionButton>
                </div>
                <MotionLive
                  mode={liveMode}
                  source="screen"
                  active={true}
                  pointer={{ x: 200, y: 150, visible: true }}
                  annotations={[
                    { id: '1', type: 'arrow', x: 200, y: 100, color: 'var(--accent)' },
                    { id: '2', type: 'circle', x: 300, y: 200, color: 'var(--success)' },
                  ]}
                  onModeChange={setLiveMode}
                />
              </section>

              {/* Section: Tutorials */}
              <section className="hey-demo-section">
                <h2>Tutorials (Sections 38-42)</h2>
                <div className="hey-demo-grid">
                  <MotionButton onClick={() => setTutorialOpen(true)}>Start First Launch Tutorial</MotionButton>
                  <MotionButton onClick={() => setTutorialOpen(true)}>Start Chat Tutorial</MotionButton>
                </div>
                {tutorialOpen && (
                  <MotionTutorial
                    choreography={tutorialRegistry['first-launch']}
                    autoStart
                  />
                )}
              </section>

              {/* Section: Page Transitions */}
              <section className="hey-demo-section">
                <h2>Page Transitions (Section 4)</h2>
                <p>Navigate between pages to see transitions. Current transition uses:</p>
                <ul>
                  <li>Outgoing: opacity 1→0.96 over 100ms</li>
                  <li>Incoming: opacity 0→1, translateY 10→0 over 250ms</li>
                  <li>Easing: cubic-bezier(.22,1,.36,1)</li>
                  <li>Reduced motion: crossfade only</li>
                </ul>
              </section>
            </main>
          </div>
        </div>
      </PageTransition>
    </PerformanceTierProvider>
  );
};

export default MotionDemo;