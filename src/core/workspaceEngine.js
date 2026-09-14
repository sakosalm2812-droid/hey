import { publish } from "./eventBus.js";
import { recordAudit } from "./auditLog.js";
import { getSetting } from "./settingsRegistry.js";
import { safeStorage } from "../lib/safeStorage.js";

const WIDGET_STATES = Object.freeze({
  ACTIVE: "active",
  MINIMIZED: "minimized",
  MAXIMIZED: "maximized",
  DOCKED: "docked",
  CLOSED: "closed",
  LOADING: "loading",
  ERROR: "error",
});

const WIDGET_FAMILIES = Object.freeze({
  CHAT: "chat",
  LIVE: "live",
  IMAGE: "image",
  FRAME_STORYBOARD: "frame_storyboard",
  VIDEO: "video",
  AUDIO: "audio",
  PRESENTATION: "presentation",
  DOCUMENT: "document",
  BROWSER: "browser",
  RESEARCH: "research",
  NOTES: "notes",
  FILES: "files",
  CODE: "code",
  TERMINAL: "terminal",
  CALENDAR: "calendar",
  TASKS: "tasks",
  TIMERS: "timers",
  MEDIA: "media",
  CAMERA: "camera",
  COSMOS: "cosmos",
  AGENTS: "agents",
  MISSIONS: "missions",
  DEVICES: "devices",
  SMART_HOME: "smart_home",
  WEATHER: "weather",
  PRAYER: "prayer",
  USAGE: "usage",
  NOTIFICATIONS: "notifications",
  CUSTOM: "custom",
});

const DRAG_TYPES = Object.freeze({
  WIDGET: "widget",
  SEMANTIC_DROP: "semantic_drop",
  FILE: "file",
  TEXT: "text",
  IMAGE: "image",
  URL: "url",
});

const SNAP_MODES = Object.freeze({
  OFF: "off",
  SOFT: "soft",
  STRICT: "strict",
});

function generateWidgetId() {
  return `widget_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateLayoutId() {
  return `layout_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

const DEFAULT_WIDGET_SIZE = { width: 400, height: 300 };
const MIN_WIDGET_SIZE = { width: 200, height: 150 };
const MAX_WIDGET_SIZE = { width: 1920, height: 1080 };
const GRID_SIZE = 8;

class WorkspaceEngine {
  constructor() {
    this.widgets = new Map();
    this.layouts = new Map();
    this.currentLayoutId = null;
    this.dragState = null;
    this.listeners = new Set();
    this.load();
  }

  load() {
    try {
      const stored = safeStorage.getItem("hey_workspace");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.widgets) {
          Object.entries(parsed.widgets).forEach(([id, widget]) => {
            this.widgets.set(id, widget);
          });
        }
        if (parsed.layouts) {
          Object.entries(parsed.layouts).forEach(([id, layout]) => {
            this.layouts.set(id, layout);
          });
        }
        this.currentLayoutId = parsed.currentLayoutId || null;
      }
    } catch (err) {
      console.warn("Failed to load workspace:", err);
    }
  }

  save() {
    try {
      const data = {
        widgets: Object.fromEntries(this.widgets),
        layouts: Object.fromEntries(this.layouts),
        currentLayoutId: this.currentLayoutId,
      };
      safeStorage.setItem("hey_workspace", JSON.stringify(data));
    } catch (err) {
      console.warn("Failed to save workspace:", err);
    }
  }

  createWidget(family, options = {}) {
    const id = generateWidgetId();
    const snapMode = getSetting("workspace.snap") || "on";
    
    const widget = {
      id,
      family,
      title: options.title || this.getFamilyTitle(family),
      state: WIDGET_STATES.ACTIVE,
      bounds: {
        x: options.x || this.findEmptyPosition().x,
        y: options.y || this.findEmptyPosition().y,
        width: options.width || DEFAULT_WIDGET_SIZE.width,
        height: options.height || DEFAULT_WIDGET_SIZE.height,
      },
      minSize: options.minSize || MIN_WIDGET_SIZE,
      maxSize: options.maxSize || MAX_WIDGET_SIZE,
      zIndex: this.getMaxZIndex() + 1,
      content: options.content || {},
      settings: options.settings || {},
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
        ...options.metadata,
      },
      snapMode,
      pinned: options.pinned || false,
      groupedWith: null,
      docked: false,
      dockPosition: null,
      restoreBounds: null,
    };

    this.widgets.set(id, widget);
    this.save();
    this.notify("widget_created", widget);
    
    publish("workspace.widget_created", widget);
    recordAudit({ action: "widget.created", status: "completed", metadata: { widgetId: id, family } });
    
    return widget;
  }

  getWidget(id) {
    return this.widgets.get(id) || null;
  }

  getAllWidgets() {
    return Array.from(this.widgets.values());
  }

  getWidgetsByFamily(family) {
    return this.getAllWidgets().filter(w => w.family === family);
  }

  getActiveWidgets() {
    return this.getAllWidgets().filter(w => w.state !== WIDGET_STATES.CLOSED);
  }

  updateWidget(id, updates) {
    const widget = this.widgets.get(id);
    if (!widget) return null;

    const updated = {
      ...widget,
      ...updates,
      bounds: { ...widget.bounds, ...updates.bounds },
      settings: { ...widget.settings, ...updates.settings },
      metadata: {
        ...widget.metadata,
        ...updates.metadata,
        updatedAt: new Date().toISOString(),
        version: (widget.metadata.version || 0) + 1,
      },
    };

    if (updates.bounds) {
      updated.bounds = this.constrainBounds(updated.bounds);
    }

    this.widgets.set(id, updated);
    this.save();
    this.notify("widget_updated", updated);
    
    publish("workspace.widget_updated", updated);
    return updated;
  }

  setWidgetState(id, state) {
    const widget = this.widgets.get(id);
    if (!widget) return null;

    let updated = { ...widget, state };
    
    if (state === WIDGET_STATES.MINIMIZED) {
      updated.restoreBounds = { ...widget.bounds };
      updated.bounds = { ...widget.bounds, height: 40 };
    } else if (state === WIDGET_STATES.MAXIMIZED) {
      updated.restoreBounds = { ...widget.bounds };
      updated.bounds = { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
    } else if (state === WIDGET_STATES.ACTIVE && widget.restoreBounds) {
      updated.bounds = { ...widget.restoreBounds };
      updated.restoreBounds = null;
    } else if (state === WIDGET_STATES.DOCKED) {
      updated.docked = true;
      updated.dockPosition = widget.dockPosition || "right";
    } else if (state === WIDGET_STATES.CLOSED) {
      updated.docked = false;
      updated.dockPosition = null;
    }

    return this.updateWidget(id, updated);
  }

  moveWidget(id, x, y, options = {}) {
    const widget = this.widgets.get(id);
    if (!widget) return null;

    let newX = x;
    let newY = y;

    if (widget.snapMode !== SNAP_MODES.OFF && !options.ignoreSnap) {
      const snapResult = this.snapToGrid(newX, newY, widget.bounds.width, widget.bounds.height, widget.snapMode);
      newX = snapResult.x;
      newY = snapResult.y;
    }

    return this.updateWidget(id, { bounds: { ...widget.bounds, x: newX, y: newY } });
  }

  resizeWidget(id, width, height, options = {}) {
    const widget = this.widgets.get(id);
    if (!widget) return null;

    const minW = widget.minSize.width;
    const minH = widget.minSize.height;
    const maxW = Math.min(widget.maxSize.width, window.innerWidth);
    const maxH = Math.min(widget.maxSize.height, window.innerHeight);

    let newW = Math.max(minW, Math.min(maxW, width));
    let newH = Math.max(minH, Math.min(maxH, height));

    if (widget.snapMode !== SNAP_MODES.OFF && !options.ignoreSnap) {
      newW = Math.round(newW / GRID_SIZE) * GRID_SIZE;
      newH = Math.round(newH / GRID_SIZE) * GRID_SIZE;
    }

    return this.updateWidget(id, { bounds: { ...widget.bounds, width: newW, height: newH } });
  }

  bringToFront(id) {
    const widget = this.widgets.get(id);
    if (!widget) return null;

    const maxZ = this.getMaxZIndex();
    return this.updateWidget(id, { zIndex: maxZ + 1 });
  }

  sendToBack(id) {
    const widget = this.widgets.get(id);
    if (!widget) return null;

    const minZ = this.getMinZIndex();
    return this.updateWidget(id, { zIndex: minZ - 1 });
  }

  pinWidget(id, pinned = true) {
    return this.updateWidget(id, { pinned });
  }

  groupWidgets(widgetIds) {
    if (widgetIds.length < 2) return false;
    
    const groupId = `group_${Date.now()}`;
    widgetIds.forEach(id => {
      const widget = this.widgets.get(id);
      if (widget) {
        this.updateWidget(id, { groupedWith: groupId });
      }
    });
    
    publish("workspace.widgets_grouped", { groupId, widgetIds });
    return groupId;
  }

  ungroupWidgets(groupId) {
    const widgets = this.getAllWidgets().filter(w => w.groupedWith === groupId);
    widgets.forEach(w => this.updateWidget(w.id, { groupedWith: null }));
    publish("workspace.widgets_ungrouped", { groupId });
  }

  dockWidget(id, position) {
    const widget = this.widgets.get(id);
    if (!widget) return null;

    widget.restoreBounds = { ...widget.bounds };
    
    const dockBounds = this.calculateDockBounds(position, widget.bounds);
    
    return this.updateWidget(id, {
      state: WIDGET_STATES.DOCKED,
      docked: true,
      dockPosition: position,
      bounds: dockBounds,
    });
  }

  undockWidget(id) {
    const widget = this.widgets.get(id);
    if (!widget || !widget.docked) return null;

    return this.updateWidget(id, {
      state: WIDGET_STATES.ACTIVE,
      docked: false,
      dockPosition: null,
      bounds: widget.restoreBounds || DEFAULT_WIDGET_SIZE,
      restoreBounds: null,
    });
  }

  closeWidget(id) {
    const widget = this.widgets.get(id);
    if (!widget) return false;

    if (widget.groupedWith) {
      this.ungroupWidgets(widget.groupedWith);
    }

    return this.updateWidget(id, { state: WIDGET_STATES.CLOSED });
  }

  deleteWidget(id) {
    const widget = this.widgets.get(id);
    if (!widget) return false;

    if (widget.groupedWith) {
      this.ungroupWidgets(widget.groupedWith);
    }

    this.widgets.delete(id);
    this.save();
    this.notify("widget_deleted", { id });
    
    publish("workspace.widget_deleted", { widgetId: id });
    recordAudit({ action: "widget.deleted", status: "completed", metadata: { widgetId: id } });
    return true;
  }

  constrainBounds(bounds) {
    return {
      x: Math.max(0, Math.min(bounds.x, window.innerWidth - bounds.width)),
      y: Math.max(0, Math.min(bounds.y, window.innerHeight - bounds.height)),
      width: Math.max(MIN_WIDGET_SIZE.width, Math.min(bounds.width, window.innerWidth)),
      height: Math.max(MIN_WIDGET_SIZE.height, Math.min(bounds.height, window.innerHeight)),
    };
  }

  findEmptyPosition() {
    const widgets = this.getActiveWidgets();
    if (widgets.length === 0) return { x: 20, y: 20 };

    const positions = widgets.map(w => ({ x: w.bounds.x, y: w.bounds.y }));
    
    for (let y = 20; y < window.innerHeight - 200; y += 60) {
      for (let x = 20; x < window.innerWidth - 200; x += 60) {
        const overlap = positions.some(p => 
          Math.abs(p.x - x) < 200 && Math.abs(p.y - y) < 150
        );
        if (!overlap) return { x, y };
      }
    }
    return { x: 20, y: 20 };
  }

  getMaxZIndex() {
    return Math.max(0, ...Array.from(this.widgets.values()).map(w => w.zIndex || 0));
  }

  getMinZIndex() {
    return Math.min(0, ...Array.from(this.widgets.values()).map(w => w.zIndex || 0));
  }

  snapToGrid(x, y, width, height, mode) {
    if (mode === SNAP_MODES.OFF) return { x, y };
    
    const snappedX = Math.round(x / GRID_SIZE) * GRID_SIZE;
    const snappedY = Math.round(y / GRID_SIZE) * GRID_SIZE;
    
    if (mode === SNAP_MODES.STRICT) {
      return { x: snappedX, y: snappedY };
    }
    
    const threshold = 20;
    const finalX = Math.abs(x - snappedX) < threshold ? snappedX : x;
    const finalY = Math.abs(y - snappedY) < threshold ? snappedY : y;
    
    return { x: finalX, y: finalY };
  }

  calculateDockBounds(position, widgetBounds) {
    const width = widgetBounds.width;
    const height = widgetBounds.height;
    
    switch (position) {
      case "left":
        return { x: 0, y: 0, width: Math.min(width, 400), height: window.innerHeight };
      case "right":
        return { x: window.innerWidth - Math.min(width, 400), y: 0, width: Math.min(width, 400), height: window.innerHeight };
      case "top":
        return { x: 0, y: 0, width: window.innerWidth, height: Math.min(height, 300) };
      case "bottom":
        return { x: 0, y: window.innerHeight - Math.min(height, 300), width: window.innerWidth, height: Math.min(height, 300) };
      default:
        return { x: 20, y: 20, width, height };
    }
  }

  handleSemanticDrop(sourceWidgetId, targetWidgetId, dropData) {
    const source = this.widgets.get(sourceWidgetId);
    const target = this.widgets.get(targetWidgetId);
    
    if (!source || !target) return { success: false, error: "Widget not found" };

    const action = this.resolveSemanticAction(source, target, dropData);
    
    if (action) {
      publish("workspace.semantic_drop", { source, target, action, dropData });
      recordAudit({ action: "workspace.semantic_drop", status: "completed", metadata: { source: source.family, target: target.family, action: action.type } });
      return { success: true, action };
    }

    return { success: false, error: "No valid semantic action" };
  }

  resolveSemanticAction(source, target, dropData) {
    const typeMap = {
      [WIDGET_FAMILIES.FILES]: { [WIDGET_FAMILIES.RESEARCH]: "add_source", [WIDGET_FAMILIES.IMAGE]: "add_reference", [WIDGET_FAMILIES.TASKS]: "create_task", [WIDGET_FAMILIES.COSMOS]: "attach_context", [WIDGET_FAMILIES.AGENTS]: "grant_input" },
      [WIDGET_FAMILIES.IMAGE]: { [WIDGET_FAMILIES.IMAGE]: "add_reference", [WIDGET_FAMILIES.VIDEO]: "add_frame", [WIDGET_FAMILIES.PRESENTATION]: "add_slide" },
      [WIDGET_FAMILIES.RESEARCH]: { [WIDGET_FAMILIES.TASKS]: "create_task", [WIDGET_FAMILIES.COSMOS]: "attach_context", [WIDGET_FAMILIES.DOCUMENT]: "add_citation" },
      [WIDGET_FAMILIES.COSMOS]: { [WIDGET_FAMILIES.AGENTS]: "grant_context", [WIDGET_FAMILIES.TASKS]: "create_task" },
      [WIDGET_FAMILIES.NOTES]: { [WIDGET_FAMILIES.DOCUMENT]: "add_section", [WIDGET_FAMILIES.PRESENTATION]: "add_slide_notes" },
    };

    const actions = typeMap[source.family]?.[target.family];
    if (actions) {
      return { type: actions, sourceId: source.id, targetId: target.id, data: dropData };
    }
    return null;
  }

  saveLayout(name, description = "") {
    const id = generateLayoutId();
    const layout = {
      id,
      name,
      description,
      widgets: this.getActiveWidgets().map(w => ({
        id: w.id,
        family: w.family,
        title: w.title,
        bounds: w.bounds,
        state: w.state,
        zIndex: w.zIndex,
        pinned: w.pinned,
        groupedWith: w.groupedWith,
        docked: w.docked,
        dockPosition: w.dockPosition,
        settings: w.settings,
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.layouts.set(id, layout);
    this.save();
    this.notify("layout_saved", layout);
    return layout;
  }

  loadLayout(id) {
    const layout = this.layouts.get(id);
    if (!layout) return { error: "Layout not found" };

    this.widgets.forEach((widget, widgetId) => {
      if (!layout.widgets.find(lw => lw.id === widgetId)) {
        this.updateWidget(widgetId, { state: WIDGET_STATES.CLOSED });
      }
    });

    layout.widgets.forEach(lw => {
      let widget = this.widgets.get(lw.id);
      if (widget) {
        this.updateWidget(lw.id, {
          bounds: lw.bounds,
          state: lw.state,
          zIndex: lw.zIndex,
          pinned: lw.pinned,
          groupedWith: lw.groupedWith,
          docked: lw.docked,
          dockPosition: lw.dockPosition,
          settings: lw.settings,
        });
      } else {
        widget = this.createWidget(lw.family, {
          title: lw.title,
          bounds: lw.bounds,
          state: lw.state,
          zIndex: lw.zIndex,
          pinned: lw.pinned,
          groupedWith: lw.groupedWith,
          docked: lw.docked,
          dockPosition: lw.dockPosition,
          settings: lw.settings,
        });
        this.widgets.delete(widget.id);
        this.widgets.set(lw.id, { ...widget, id: lw.id });
      }
    });

    this.currentLayoutId = id;
    this.save();
    this.notify("layout_loaded", layout);
    publish("workspace.layout_loaded", layout);
    return layout;
  }

  getLayouts() {
    return Array.from(this.layouts.values());
  }

  deleteLayout(id) {
    this.layouts.delete(id);
    this.save();
    this.notify("layout_deleted", { id });
  }

  getFamilyTitle(family) {
    const titles = {
      [WIDGET_FAMILIES.CHAT]: "Chat",
      [WIDGET_FAMILIES.LIVE]: "HEY Live",
      [WIDGET_FAMILIES.IMAGE]: "Image",
      [WIDGET_FAMILIES.FRAME_STORYBOARD]: "Frames",
      [WIDGET_FAMILIES.VIDEO]: "Video",
      [WIDGET_FAMILIES.AUDIO]: "Audio",
      [WIDGET_FAMILIES.PRESENTATION]: "Presentation",
      [WIDGET_FAMILIES.DOCUMENT]: "Document",
      [WIDGET_FAMILIES.BROWSER]: "Browser",
      [WIDGET_FAMILIES.RESEARCH]: "Research",
      [WIDGET_FAMILIES.NOTES]: "Notes",
      [WIDGET_FAMILIES.FILES]: "Files",
      [WIDGET_FAMILIES.CODE]: "Code",
      [WIDGET_FAMILIES.TERMINAL]: "Terminal",
      [WIDGET_FAMILIES.CALENDAR]: "Calendar",
      [WIDGET_FAMILIES.TASKS]: "Tasks",
      [WIDGET_FAMILIES.TIMERS]: "Timers",
      [WIDGET_FAMILIES.MEDIA]: "Media",
      [WIDGET_FAMILIES.CAMERA]: "Camera",
      [WIDGET_FAMILIES.COSMOS]: "Cosmos",
      [WIDGET_FAMILIES.AGENTS]: "Agents",
      [WIDGET_FAMILIES.MISSIONS]: "Missions",
      [WIDGET_FAMILIES.DEVICES]: "Devices",
      [WIDGET_FAMILIES.SMART_HOME]: "Smart Home",
      [WIDGET_FAMILIES.WEATHER]: "Weather",
      [WIDGET_FAMILIES.PRAYER]: "Prayer",
      [WIDGET_FAMILIES.USAGE]: "Usage",
      [WIDGET_FAMILIES.NOTIFICATIONS]: "Notifications",
    };
    return titles[family] || family;
  }

  handleMonitorChange(monitors) {
    this.getActiveWidgets().forEach(widget => {
      if (widget.bounds.x + widget.bounds.width > monitors.totalWidth) {
        this.moveWidget(widget.id, Math.max(0, monitors.totalWidth - widget.bounds.width), widget.bounds.y);
      }
      if (widget.bounds.y + widget.bounds.height > monitors.totalHeight) {
        this.moveWidget(widget.id, widget.bounds.x, Math.max(0, monitors.totalHeight - widget.bounds.height));
      }
    });
    
    publish("workspace.monitors_changed", { monitors });
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    this.listeners.forEach(l => {
      try { l(event, data); } catch (err) { console.error("Workspace listener error:", err); }
    });
  }
}

export const workspaceEngine = new WorkspaceEngine();

export function createWidget(family, options) {
  return workspaceEngine.createWidget(family, options);
}

export function getWidget(id) {
  return workspaceEngine.getWidget(id);
}

export function getAllWidgets() {
  return workspaceEngine.getAllWidgets();
}

export function getWidgetsByFamily(family) {
  return workspaceEngine.getWidgetsByFamily(family);
}

export function getActiveWidgets() {
  return workspaceEngine.getActiveWidgets();
}

export function updateWidget(id, updates) {
  return workspaceEngine.updateWidget(id, updates);
}

export function setWidgetState(id, state, options) {
  return workspaceEngine.setWidgetState(id, state, options);
}

export function moveWidget(id, x, y, options) {
  return workspaceEngine.moveWidget(id, x, y, options);
}

export function resizeWidget(id, width, height, options) {
  return workspaceEngine.resizeWidget(id, width, height, options);
}

export function bringWidgetToFront(id) {
  return workspaceEngine.bringToFront(id);
}

export function sendWidgetToBack(id) {
  return workspaceEngine.sendToBack(id);
}

export function pinWidget(id, pinned) {
  return workspaceEngine.pinWidget(id, pinned);
}

export function groupWidgets(widgetIds) {
  return workspaceEngine.groupWidgets(widgetIds);
}

export function ungroupWidgets(groupId) {
  return workspaceEngine.ungroupWidgets(groupId);
}

export function dockWidget(id, position) {
  return workspaceEngine.dockWidget(id, position);
}

export function undockWidget(id) {
  return workspaceEngine.undockWidget(id);
}

export function closeWidget(id) {
  return workspaceEngine.closeWidget(id);
}

export function deleteWidget(id) {
  return workspaceEngine.deleteWidget(id);
}

export function handleSemanticDrop(sourceId, targetId, dropData) {
  return workspaceEngine.handleSemanticDrop(sourceId, targetId, dropData);
}

export function saveLayout(name, description) {
  return workspaceEngine.saveLayout(name, description);
}

export function loadLayout(id) {
  return workspaceEngine.loadLayout(id);
}

export function getLayouts() {
  return workspaceEngine.getLayouts();
}

export function deleteLayout(id) {
  return workspaceEngine.deleteLayout(id);
}

export function handleMonitorChange(monitors) {
  return workspaceEngine.handleMonitorChange(monitors);
}

export function subscribeToWorkspace(listener) {
  return workspaceEngine.subscribe(listener);
}

export { WIDGET_STATES, WIDGET_FAMILIES, DRAG_TYPES, SNAP_MODES };

export default workspaceEngine;
