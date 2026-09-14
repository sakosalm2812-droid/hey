import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import './Tabs.css';

export function Tabs({
  tabs = [],
  defaultIndex = 0,
  onChange,
  variant = 'default',
  size = 'md',
  fullWidth = false,
  className = '',
  'aria-label': ariaLabel,
}) {
  const [activeIndex, setActiveIndex] = useState(defaultIndex);
  const tabsRef = useRef(null);
  const indicatorRef = useRef(null);

  const updateIndicator = useCallback(() => {
    if (tabsRef.current && indicatorRef.current) {
      const activeTab = tabsRef.current.children[activeIndex];
      if (activeTab) {
        const { offsetLeft, offsetWidth } = activeTab;
        indicatorRef.current.style.transform = `translateX(${offsetLeft}px)`;
        indicatorRef.current.style.width = `${offsetWidth}px`;
      }
    }
  }, [activeIndex]);

  useEffect(() => {
    updateIndicator();
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [updateIndicator, tabs.length]);

  const handleClick = (index) => {
    setActiveIndex(index);
    onChange?.(index, tabs[index]);
  };

  const handleKeyDown = (e, index) => {
    let newIndex;
    if (e.key === 'ArrowRight') newIndex = (index + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') newIndex = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') newIndex = 0;
    else if (e.key === 'End') newIndex = tabs.length - 1;
    else return;

    e.preventDefault();
    handleClick(newIndex);
    tabsRef.current?.children[newIndex]?.focus();
  };

  return (
    <div className={`hey-tabs hey-tabs--${variant} hey-tabs--${size} ${fullWidth ? 'hey-tabs--full' : ''} ${className}`} role="tablist" aria-label={ariaLabel}>
      <div className="hey-tabs__list" ref={tabsRef} role="presentation">
        {variant === 'underline' && (
          <motion.div
            ref={indicatorRef}
            className="hey-tabs__indicator"
            animate={{ x: 0, width: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            aria-hidden="true"
          />
        )}
        {tabs.map((tab, index) => (
          <button
            key={tab.id || index}
            type="button"
            role="tab"
            id={`hey-tab-${index}`}
            aria-controls={`hey-tabpanel-${index}`}
            aria-selected={index === activeIndex}
            tabIndex={index === activeIndex ? 0 : -1}
            className={`hey-tabs__trigger ${index === activeIndex ? 'hey-tabs__trigger--active' : ''} ${tab.disabled ? 'hey-tabs__trigger--disabled' : ''}`}
            onClick={() => !tab.disabled && handleClick(index)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            disabled={tab.disabled}
          >
            {tab.icon && <span className="hey-tabs__icon" aria-hidden="true">{tab.icon}</span>}
            <span className="hey-tabs__label">{tab.label}</span>
            {tab.badge && <span className="hey-tabs__badge">{tab.badge}</span>}
          </button>
        ))}
      </div>
      <div className="hey-tabs__panels">
        {tabs.map((tab, index) => (
          <div
            key={tab.id || index}
            role="tabpanel"
            id={`hey-tabpanel-${index}`}
            aria-labelledby={`hey-tab-${index}`}
            hidden={index !== activeIndex}
            className="hey-tabs__panel"
            tabIndex={0}
          >
            {index === activeIndex && tab.content}
          </div>
        ))}
      </div>
    </div>
  );
}

Tabs.displayName = 'Tabs';