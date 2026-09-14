import { publish } from "./eventBus.js";
import { recordAudit } from "./auditLog.js";
import { getSetting } from "./settingsRegistry.js";
import { supabaseClient } from "../lib/supabase.js";
import { safeStorage } from "../lib/safeStorage.js";

const CONVERSATION_STATES = Object.freeze({
  DRAFT: "draft",
  ACTIVE: "active",
  ARCHIVED: "archived",
  DELETED: "deleted",
});

const MESSAGE_STATES = Object.freeze({
  DRAFT: "draft",
  SENDING: "sending",
  SENT: "sent",
  DELIVERED: "delivered",
  FAILED: "failed",
  STREAMING: "streaming",
  COMPLETE: "complete",
  INTERRUPTED: "interrupted",
});

const ATTACHMENT_STATES = Object.freeze({
  UPLOADING: "uploading",
  READY: "ready",
  PROCESSING: "processing",
  COMPLETE: "complete",
  FAILED: "failed",
});

function generateConversationId() {
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateMessageId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateAttachmentId() {
  return `att_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

class ChatTransportEngine {
  constructor() {
    this.conversations = new Map();
    this.drafts = new Map();
    this.listeners = new Set();
    this.load();
  }

  load() {
    try {
      const stored = safeStorage.getItem("hey_chat_transport");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.conversations) {
          Object.entries(parsed.conversations).forEach(([id, conv]) => {
            this.conversations.set(id, conv);
          });
        }
        if (parsed.drafts) {
          Object.entries(parsed.drafts).forEach(([id, draft]) => {
            this.drafts.set(id, draft);
          });
        }
      }
    } catch (err) {
      console.warn("Failed to load chat transport:", err);
    }
  }

  save() {
    try {
      safeStorage.setItem("hey_chat_transport", JSON.stringify({
        conversations: Object.fromEntries(this.conversations),
        drafts: Object.fromEntries(this.drafts),
      }));
    } catch (err) {
      console.warn("Failed to save chat transport:", err);
    }
  }

  createConversation(input = {}) {
    const id = generateConversationId();
    const now = new Date().toISOString();
    
    const conversation = {
      id,
      title: input.title || "New Conversation",
      projectId: input.projectId || null,
      state: CONVERSATION_STATES.ACTIVE,
      participants: input.participants || [],
      tags: input.tags || [],
      metadata: input.metadata || {},
      createdAt: now,
      updatedAt: now,
      lastMessageAt: null,
      messageCount: 0,
      branchFrom: input.branchFrom || null,
      branchPoint: input.branchPoint || null,
      retentionPolicy: input.retentionPolicy || "default",
    };

    this.conversations.set(id, conversation);
    this.save();
    this.notify("conversation_created", conversation);
    
    publish("chat.conversation_created", conversation);
    recordAudit({ action: "conversation.created", status: "completed", metadata: { conversationId: id } });
    
    return conversation;
  }

  getConversation(id) {
    return this.conversations.get(id) || null;
  }

  getAllConversations() {
    return Array.from(this.conversations.values())
      .filter(c => c.state !== CONVERSATION_STATES.DELETED)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  getConversationsByProject(projectId) {
    return this.getAllConversations().filter(c => c.projectId === projectId);
  }

  updateConversation(id, updates) {
    const conversation = this.conversations.get(id);
    if (!conversation) return null;

    const updated = {
      ...conversation,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.conversations.set(id, updated);
    this.save();
    this.notify("conversation_updated", updated);
    return updated;
  }

  deleteConversation(id, hard = false) {
    const conversation = this.conversations.get(id);
    if (!conversation) return false;

    if (hard) {
      this.conversations.delete(id);
    } else {
      this.updateConversation(id, { state: CONVERSATION_STATES.DELETED, deletedAt: new Date().toISOString() });
    }
    
    this.save();
    this.notify("conversation_deleted", { id, hard });
    return true;
  }

  archiveConversation(id) {
    return this.updateConversation(id, { state: CONVERSATION_STATES.ARCHIVED, archivedAt: new Date().toISOString() });
  }

  unarchiveConversation(id) {
    return this.updateConversation(id, { state: CONVERSATION_STATES.ACTIVE, archivedAt: null });
  }

  createMessage(conversationId, input) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return { error: "Conversation not found" };

    const id = generateMessageId();
    const now = new Date().toISOString();
    
    const message = {
      id,
      conversationId,
      role: input.role || "user",
      content: input.content || "",
      state: MESSAGE_STATES.DRAFT,
      attachments: input.attachments || [],
      metadata: input.metadata || {},
      replyTo: input.replyTo || null,
      branchFrom: input.branchFrom || null,
      createdAt: now,
      updatedAt: now,
      sentAt: null,
      deliveredAt: null,
      clientRequestId: input.clientRequestId || generateMessageId(),
    };

    if (!conversation.messages) conversation.messages = [];
    conversation.messages.push(message);
    conversation.messageCount = (conversation.messageCount || 0) + 1;
    conversation.lastMessageAt = now;
    conversation.updatedAt = now;

    this.conversations.set(conversationId, conversation);
    this.save();
    this.notify("message_created", { conversationId, message });
    
    return message;
  }

  saveDraft(conversationId, content, metadata = {}) {
    const draftKey = `draft_${conversationId}`;
    const draft = {
      conversationId,
      content,
      metadata,
      updatedAt: new Date().toISOString(),
    };
    
    this.drafts.set(draftKey, draft);
    this.save();
    return draft;
  }

  getDraft(conversationId) {
    return this.drafts.get(`draft_${conversationId}`) || null;
  }

  clearDraft(conversationId) {
    this.drafts.delete(`draft_${conversationId}`);
    this.save();
  }

  async sendMessage(messageId) {
    const conversation = Array.from(this.conversations.values()).find(c => 
      c.messages?.some(m => m.id === messageId)
    );
    if (!conversation) return { error: "Message not found" };

    const message = conversation.messages.find(m => m.id === messageId);
    if (!message) return { error: "Message not found" };

    message.state = MESSAGE_STATES.SENDING;
    message.updatedAt = new Date().toISOString();
    this.save();

    try {
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const response = await fetch(`${getSetting("api.base_url") || "https://api.hey.example"}/functions/v1/hey`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${(await supabaseClient.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          message: message.content,
          conversationId: conversation.id,
          clientRequestId: message.clientRequestId,
          attachments: message.attachments,
          metadata: message.metadata,
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      
      message.state = MESSAGE_STATES.SENT;
      message.sentAt = new Date().toISOString();
      message.metadata = { ...message.metadata, response: data };
      conversation.updatedAt = new Date().toISOString();

      this.save();
      this.notify("message_sent", { conversationId: conversation.id, message });
      
      return { success: true, message };
    } catch (error) {
      message.state = MESSAGE_STATES.FAILED;
      message.error = error.message;
      message.updatedAt = new Date().toISOString();
      this.save();
      
      publish("chat.message_failed", { conversationId: conversation.id, message, error: error.message });
      return { error: error.message };
    }
  }

  streamMessage(messageId, onChunk) {
    const conversation = Array.from(this.conversations.values()).find(c => 
      c.messages?.some(m => m.id === messageId)
    );
    if (!conversation) return { error: "Message not found" };

    const message = conversation.messages.find(m => m.id === messageId);
    if (!message) return { error: "Message not found" };

    message.state = MESSAGE_STATES.STREAMING;
    this.save();

    return new Promise((resolve) => {
      const eventSource = new EventSource(`${getSetting("api.base_url") || "https://api.hey.example"}/functions/v1/hey/stream?messageId=${messageId}`);
      
      eventSource.onmessage = (event) => {
        const chunk = JSON.parse(event.data);
        message.content += chunk.delta || "";
        message.updatedAt = new Date().toISOString();
        onChunk(chunk);
      };
      
      eventSource.onerror = () => {
        eventSource.close();
        message.state = MESSAGE_STATES.COMPLETE;
        message.updatedAt = new Date().toISOString();
        this.save();
        resolve({ success: true, message });
      };
    });
  }

  branchConversation(conversationId, messageId, options = {}) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return { error: "Conversation not found" };

    const message = conversation.messages?.find(m => m.id === messageId);
    if (!message) return { error: "Message not found" };

    const branch = this.createConversation({
      title: `${conversation.title} (branch)`,
      projectId: conversation.projectId,
      branchFrom: conversationId,
      branchPoint: messageId,
      metadata: { ...conversation.metadata, ...options.metadata },
    });

    branch.messages = conversation.messages.slice(0, conversation.messages.findIndex(m => m.id === messageId) + 1);
    branch.messageCount = branch.messages.length;
    
    this.conversations.set(branch.id, branch);
    this.save();
    
    publish("chat.conversation_branched", { original: conversationId, branch: branch.id, branchPoint: messageId });
    return branch;
  }

  addAttachment(conversationId, input) {
    const id = generateAttachmentId();
    const attachment = {
      id,
      conversationId,
      filename: input.filename,
      mimeType: input.mimeType,
      size: input.size,
      state: ATTACHMENT_STATES.UPLOADING,
      url: null,
      metadata: input.metadata || {},
      createdAt: new Date().toISOString(),
    };

    return attachment;
  }

  async uploadAttachment(attachment, file) {
    attachment.state = ATTACHMENT_STATES.PROCESSING;
    this.save();

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("attachmentId", attachment.id);

      const response = await fetch(`${getSetting("api.base_url") || "https://api.hey.example"}/functions/v1/hey/upload`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${(await supabaseClient.auth.getSession()).data.session?.access_token}`,
        },
        body: formData,
      });

      if (!response.ok) throw new Error(`Upload failed: ${response.status}`);

      const data = await response.json();
      attachment.state = ATTACHMENT_STATES.COMPLETE;
      attachment.url = data.url;
      attachment.updatedAt = new Date().toISOString();
      this.save();

      return { success: true, attachment };
    } catch (error) {
      attachment.state = ATTACHMENT_STATES.FAILED;
      attachment.error = error.message;
      this.save();
      return { error: error.message };
    }
  }

  exportConversation(id, format = "json") {
    const conversation = this.conversations.get(id);
    if (!conversation) return null;

    const exportData = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      conversation: {
        id: conversation.id,
        title: conversation.title,
        projectId: conversation.projectId,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        messages: conversation.messages || [],
      },
    };

    if (format === "json") {
      return JSON.stringify(exportData, null, 2);
    } else if (format === "markdown") {
      let md = `# ${conversation.title}\n\n`;
      md += `**Created:** ${conversation.createdAt}\n`;
      md += `**Project:** ${conversation.projectId || "None"}\n\n`;
      
      (conversation.messages || []).forEach(msg => {
        md += `## ${msg.role.toUpperCase()}\n${msg.content}\n\n`;
      });
      
      return md;
    }

    return exportData;
  }

  importConversation(data) {
    if (!data?.conversation) return { error: "Invalid import data" };

    const conversation = this.createConversation({
      title: data.conversation.title,
      projectId: data.conversation.projectId,
      metadata: data.conversation.metadata,
    });

    conversation.messages = data.conversation.messages || [];
    conversation.messageCount = conversation.messages.length;
    conversation.lastMessageAt = conversation.messages[conversation.messages.length - 1]?.createdAt || null;
    
    this.conversations.set(conversation.id, conversation);
    this.save();
    
    return { success: true, conversation };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    this.listeners.forEach(l => {
      try { l(event, data); } catch (err) { console.error("Chat listener error:", err); }
    });
  }
}

export const chatTransportEngine = new ChatTransportEngine();

export function createConversation(input) {
  return chatTransportEngine.createConversation(input);
}

export function getConversation(id) {
  return chatTransportEngine.getConversation(id);
}

export function getAllConversations() {
  return chatTransportEngine.getAllConversations();
}

export function getConversationsByProject(projectId) {
  return chatTransportEngine.getConversationsByProject(projectId);
}

export function updateConversation(id, updates) {
  return chatTransportEngine.updateConversation(id, updates);
}

export function deleteConversation(id, hard) {
  return chatTransportEngine.deleteConversation(id, hard);
}

export function archiveConversation(id) {
  return chatTransportEngine.archiveConversation(id);
}

export function unarchiveConversation(id) {
  return chatTransportEngine.unarchiveConversation(id);
}

export function createMessage(conversationId, input) {
  return chatTransportEngine.createMessage(conversationId, input);
}

export function saveDraft(conversationId, content, metadata) {
  return chatTransportEngine.saveDraft(conversationId, content, metadata);
}

export function getDraft(conversationId) {
  return chatTransportEngine.getDraft(conversationId);
}

export function clearDraft(conversationId) {
  return chatTransportEngine.clearDraft(conversationId);
}

export function sendMessage(messageId, options) {
  return chatTransportEngine.sendMessage(messageId, options);
}

export function streamMessage(messageId, onChunk) {
  return chatTransportEngine.streamMessage(messageId, onChunk);
}

export function branchConversation(conversationId, messageId, options) {
  return chatTransportEngine.branchConversation(conversationId, messageId, options);
}

export function addAttachment(conversationId, input) {
  return chatTransportEngine.addAttachment(conversationId, input);
}

export function uploadAttachment(attachment, file) {
  return chatTransportEngine.uploadAttachment(attachment, file);
}

export function exportConversation(id, format) {
  return chatTransportEngine.exportConversation(id, format);
}

export function importConversation(data) {
  return chatTransportEngine.importConversation(data);
}

export function subscribeToChat(listener) {
  return chatTransportEngine.subscribe(listener);
}

export { CONVERSATION_STATES, MESSAGE_STATES, ATTACHMENT_STATES };

export default chatTransportEngine;
