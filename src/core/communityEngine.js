

const MATCH_PURPOSES = Object.freeze({
  MENTOR: "mentor",
  FAMILY: "family",
  PEER: "peer",
  SCHOLAR: "scholar",
  RESEARCHER: "researcher",
  CAREER: "career",
  SKILL_TRADE: "skill_trade",
  CREATOR: "creator",
});

const SPACE_ROLES = Object.freeze({
  OWNER: "owner",
  ADMIN: "admin",
  EDITOR: "editor",
  VIEWER: "viewer",
});

const CONTACT_STATES = Object.freeze({
  PENDING: "pending",
  ACCEPTED: "accepted",
  DECLINED: "declined",
  BLOCKED: "blocked",
});

function generateSpaceId() {
  return `space_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateProfileId() {
  return `profile_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateMatchId() {
  return `match_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateContactId() {
  return `contact_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateBlockId() {
  return `block_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateModerationId() {
  return `mod_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

class CommunityEngine {
  constructor() {
    this.spaces = new Map();
    this.memberships = new Map();
    this.sharedResources = new Map();
    this.profiles = new Map();
    this.matches = new Map();
    this.contacts = new Map();
    this.blocks = new Map();
    this.moderation = new Map();
    this.listeners = new Set();
    this.load();
  }

  load() {
    try {
      const stored = localStorage.getItem("hey_community");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.spaces) Object.entries(parsed.spaces).forEach(([k, v]) => this.spaces.set(k, v));
        if (parsed.memberships) Object.entries(parsed.memberships).forEach(([k, v]) => this.memberships.set(k, v));
        if (parsed.sharedResources) Object.entries(parsed.sharedResources).forEach(([k, v]) => this.sharedResources.set(k, v));
        if (parsed.profiles) Object.entries(parsed.profiles).forEach(([k, v]) => this.profiles.set(k, v));
        if (parsed.matches) Object.entries(parsed.matches).forEach(([k, v]) => this.matches.set(k, v));
        if (parsed.contacts) Object.entries(parsed.contacts).forEach(([k, v]) => this.contacts.set(k, v));
        if (parsed.blocks) Object.entries(parsed.blocks).forEach(([k, v]) => this.blocks.set(k, v));
        if (parsed.moderation) Object.entries(parsed.moderation).forEach(([k, v]) => this.moderation.set(k, v));
      }
    } catch (err) {
      console.warn("Failed to load community:", err);
    }
  }

  save() {
    try {
      localStorage.setItem("hey_community", JSON.stringify({
        spaces: Object.fromEntries(this.spaces),
        memberships: Object.fromEntries(this.memberships),
        sharedResources: Object.fromEntries(this.sharedResources),
        profiles: Object.fromEntries(this.profiles),
        matches: Object.fromEntries(this.matches),
        contacts: Object.fromEntries(this.contacts),
        blocks: Object.fromEntries(this.blocks),
        moderation: Object.fromEntries(this.moderation),
      }));
    } catch (err) {
      console.warn("Failed to save community:", err);
    }
  }

  createSpace(input) {
    const spaceId = generateSpaceId();
    const space = {
      id: spaceId,
      name: input.name,
      description: input.description || "",
      type: input.type || "private",
      ownerId: input.ownerId,
      visibility: input.visibility || "private",
      matchGoals: input.matchGoals || [],
      language: input.language || "en",
      region: input.region || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.spaces.set(spaceId, space);
    this.addMembership(spaceId, input.ownerId, SPACE_ROLES.OWNER);
    this.save();
    return space;
  }

  getSpace(id) {
    return this.spaces.get(id) || null;
  }

  getAllSpaces() {
    return Array.from(this.spaces.values());
  }

  addMembership(spaceId, userId, role = SPACE_ROLES.VIEWER) {
    const membershipId = `mem_${spaceId}_${userId}`;
    const membership = {
      id: membershipId,
      spaceId,
      userId,
      role,
      permissions: this.getPermissionsForRole(role),
      joinedAt: new Date().toISOString(),
      revokedAt: null,
    };
    this.memberships.set(membershipId, membership);
    this.save();
    return membership;
  }

  getPermissionsForRole(role) {
    const permissions = {
      [SPACE_ROLES.OWNER]: ["manage_space", "manage_members", "manage_resources", "moderate", "view_all"],
      [SPACE_ROLES.ADMIN]: ["manage_members", "manage_resources", "moderate", "view_all"],
      [SPACE_ROLES.EDITOR]: ["manage_resources", "view_all"],
      [SPACE_ROLES.VIEWER]: ["view_all"],
    };
    return permissions[role] || [];
  }

  getMembership(spaceId, userId) {
    return this.memberships.get(`mem_${spaceId}_${userId}`) || null;
  }

  getSpaceMembers(spaceId) {
    return Array.from(this.memberships.values()).filter(m => m.spaceId === spaceId && !m.revokedAt);
  }

  removeMember(spaceId, userId) {
    const membership = this.getMembership(spaceId, userId);
    if (!membership) return { error: "Membership not found" };
    membership.revokedAt = new Date().toISOString();
    this.memberships.set(membership.id, membership);
    this.save();
    return membership;
  }

  createSharedResource(input) {
    const resourceId = `res_${Date.now()}`;
    const resource = {
      id: resourceId,
      spaceId: input.spaceId,
      name: input.name,
      type: input.type,
      data: input.data,
      grantedBy: input.grantedBy,
      permissions: input.permissions || [],
      createdAt: new Date().toISOString(),
    };
    this.sharedResources.set(resourceId, resource);
    this.save();
    return resource;
  }

  getSharedResources(spaceId) {
    return Array.from(this.sharedResources.values()).filter(r => r.spaceId === spaceId);
  }

  createProfile(input) {
    const profileId = generateProfileId();
    const profile = {
      id: profileId,
      userId: input.userId,
      visibility: input.visibility || "private",
      matchGoals: input.matchGoals || [],
      language: input.language || "en",
      region: input.region || "",
      contactMethods: input.contactMethods || [],
      notificationPreference: input.notificationPreference || "in_app",
      blockedCategories: input.blockedCategories || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.profiles.set(profileId, profile);
    this.save();
    return profile;
  }

  getProfile(userId) {
    return Array.from(this.profiles.values()).find(p => p.userId === userId) || null;
  }

  updateProfile(userId, updates) {
    const profile = this.getProfile(userId);
    if (!profile) return { error: "Profile not found" };
    const updated = { ...profile, ...updates, updatedAt: new Date().toISOString() };
    this.profiles.set(profile.id, updated);
    this.save();
    return updated;
  }

  createMatch(input) {
    const matchId = generateMatchId();
    const match = {
      id: matchId,
      purpose: input.purpose,
      seekerId: input.seekerId,
      criteria: input.criteria || {},
      uncertainty: input.uncertainty || "medium",
      status: "proposed",
      proposedAt: new Date().toISOString(),
      matchedAt: null,
      matchedUserId: null,
      declineReason: null,
    };
    this.matches.set(matchId, match);
    this.save();
    return match;
  }

  getMatches(userId = null) {
    return Array.from(this.matches.values()).filter(m => !userId || m.seekerId === userId);
  }

  respondToMatch(matchId, userId, response) {
    const match = this.matches.get(matchId);
    if (!match) return { error: "Match not found" };
    if (response === "accept") {
      match.status = "accepted";
      match.matchedAt = new Date().toISOString();
      match.matchedUserId = userId;
    } else {
      match.status = "declined";
      match.declineReason = response;
    }
    this.matches.set(matchId, match);
    this.save();
    return match;
  }

  createContactRequest(input) {
    const contactId = generateContactId();
    const contact = {
      id: contactId,
      fromUserId: input.fromUserId,
      toUserId: input.toUserId,
      purpose: input.purpose,
      message: input.message || "",
      state: CONTACT_STATES.PENDING,
      createdAt: new Date().toISOString(),
      respondedAt: null,
    };
    this.contacts.set(contactId, contact);
    this.save();
    return contact;
  }

  getContactRequests(userId) {
    return Array.from(this.contacts.values()).filter(c => c.toUserId === userId);
  }

  respondToContact(contactId, userId, response) {
    const contact = this.contacts.get(contactId);
    if (!contact) return { error: "Contact request not found" };
    if (contact.toUserId !== userId) return { error: "Unauthorized" };
    contact.state = response === "accept" ? CONTACT_STATES.ACCEPTED : CONTACT_STATES.DECLINED;
    contact.respondedAt = new Date().toISOString();
    this.contacts.set(contactId, contact);
    this.save();
    return contact;
  }

  blockUser(input) {
    const blockId = generateBlockId();
    const block = {
      id: blockId,
      blockerId: input.blockerId,
      blockedId: input.blockedId,
      reason: input.reason || "",
      categories: input.categories || [],
      createdAt: new Date().toISOString(),
    };
    this.blocks.set(blockId, block);
    this.save();
    return block;
  }

  isBlocked(blockerId, blockedId) {
    return Array.from(this.blocks.values()).some(b => b.blockerId === blockerId && b.blockedId === blockedId);
  }

  unblockUser(blockerId, blockedId) {
    const block = Array.from(this.blocks.values()).find(b => b.blockerId === blockerId && b.blockedId === blockedId);
    if (block) {
      this.blocks.delete(block.id);
      this.save();
    }
  }

  createModerationCase(input) {
    const caseId = generateModerationId();
    const modCase = {
      id: caseId,
      spaceId: input.spaceId,
      reportedUserId: input.reportedUserId,
      reporterId: input.reporterId,
      reason: input.reason,
      evidence: input.evidence || [],
      status: "open",
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      resolution: null,
    };
    this.moderation.set(caseId, modCase);
    this.save();
    return modCase;
  }

  getModerationCases(spaceId = null) {
    return Array.from(this.moderation.values()).filter(c => !spaceId || c.spaceId === spaceId);
  }

  resolveModerationCase(caseId, resolution) {
    const modCase = this.moderation.get(caseId);
    if (!modCase) return { error: "Case not found" };
    modCase.status = "resolved";
    modCase.resolvedAt = new Date().toISOString();
    modCase.resolution = resolution;
    this.moderation.set(caseId, modCase);
    this.save();
    return modCase;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    this.listeners.forEach(l => {
      try { l(event, data); } catch (err) { console.error("Community listener error:", err); }
    });
  }
}

export const communityEngine = new CommunityEngine();

export function createSpace(input) {
  return communityEngine.createSpace(input);
}

export function getSpace(id) {
  return communityEngine.getSpace(id);
}

export function getAllSpaces() {
  return communityEngine.getAllSpaces();
}

export function addSpaceMembership(spaceId, userId, role) {
  return communityEngine.addMembership(spaceId, userId, role);
}

export function getSpaceMembers(spaceId) {
  return communityEngine.getSpaceMembers(spaceId);
}

export function removeSpaceMember(spaceId, userId) {
  return communityEngine.removeMember(spaceId, userId);
}

export function createSharedResource(input) {
  return communityEngine.createSharedResource(input);
}

export function getSharedResources(spaceId) {
  return communityEngine.getSharedResources(spaceId);
}

export function createCommunityProfile(input) {
  return communityEngine.createProfile(input);
}

export function getCommunityProfile(userId) {
  return communityEngine.getProfile(userId);
}

export function updateCommunityProfile(userId, updates) {
  return communityEngine.updateProfile(userId, updates);
}

export function createMatch(input) {
  return communityEngine.createMatch(input);
}

export function getMatches(userId) {
  return communityEngine.getMatches(userId);
}

export function respondToMatch(matchId, userId, response) {
  return communityEngine.respondToMatch(matchId, userId, response);
}

export function createContactRequest(input) {
  return communityEngine.createContactRequest(input);
}

export function getContactRequests(userId) {
  return communityEngine.getContactRequests(userId);
}

export function respondToContact(contactId, userId, response) {
  return communityEngine.respondToContact(contactId, userId, response);
}

export function blockUser(input) {
  return communityEngine.blockUser(input);
}

export function isUserBlocked(blockerId, blockedId) {
  return communityEngine.isBlocked(blockerId, blockedId);
}

export function unblockUser(blockerId, blockedId) {
  return communityEngine.unblockUser(blockerId, blockedId);
}

export function createModerationCase(input) {
  return communityEngine.createModerationCase(input);
}

export function getModerationCases(spaceId) {
  return communityEngine.getModerationCases(spaceId);
}

export function resolveModerationCase(caseId, resolution) {
  return communityEngine.resolveModerationCase(caseId, resolution);
}

export function subscribeToCommunity(listener) {
  return communityEngine.subscribe(listener);
}

export { MATCH_PURPOSES, SPACE_ROLES, CONTACT_STATES };

export default communityEngine;