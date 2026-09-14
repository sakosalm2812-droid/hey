

const ACCOUNT_STATES = Object.freeze({
  PENDING: "account_pending",
  ACTIVE: "active",
  LOCKED: "locked",
  DELETION_PENDING: "deletion_pending",
  DELETED: "deleted",
});

const SUBSCRIPTION_STATES = Object.freeze({
  NONE: "none",
  PENDING: "pending",
  ACTIVE: "active",
  PAST_DUE: "past_due",
  CANCEL_AT_PERIOD_END: "cancel_at_period_end",
  EXPIRED: "expired",
  REFUNDED: "refunded",
});

const TRANSACTION_STATES = Object.freeze({
  CREATED: "created",
  SUBMITTED: "submitted",
  CONFIRMED: "confirmed",
  FAILED: "failed",
  UNKNOWN: "unknown",
});

const PLANS = Object.freeze({
  FREE: "free",
  PRO: "pro",
  ELITE: "elite",
});

function generateAccountId() {
  return `acc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateSessionId() {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateInvoiceId() {
  return `inv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateSupportId() {
  return `sup_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

class AccountsBillingEngine {
  constructor() {
    this.accounts = new Map();
    this.sessions = new Map();
    this.billingCustomers = new Map();
    this.subscriptions = new Map();
    this.entitlements = new Map();
    this.invoices = new Map();
    this.usageLedger = new Map();
    this.supportCases = new Map();
    this.listeners = new Set();
    this.load();
  }

  load() {
    try {
      const stored = localStorage.getItem("hey_accounts_billing");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.accounts) Object.entries(parsed.accounts).forEach(([k, v]) => this.accounts.set(k, v));
        if (parsed.sessions) Object.entries(parsed.sessions).forEach(([k, v]) => this.sessions.set(k, v));
        if (parsed.billingCustomers) Object.entries(parsed.billingCustomers).forEach(([k, v]) => this.billingCustomers.set(k, v));
        if (parsed.subscriptions) Object.entries(parsed.subscriptions).forEach(([k, v]) => this.subscriptions.set(k, v));
        if (parsed.entitlements) Object.entries(parsed.entitlements).forEach(([k, v]) => this.entitlements.set(k, v));
        if (parsed.invoices) Object.entries(parsed.invoices).forEach(([k, v]) => this.invoices.set(k, v));
        if (parsed.usageLedger) Object.entries(parsed.usageLedger).forEach(([k, v]) => this.usageLedger.set(k, v));
        if (parsed.supportCases) Object.entries(parsed.supportCases).forEach(([k, v]) => this.supportCases.set(k, v));
      }
    } catch (err) {
      console.warn("Failed to load accounts/billing:", err);
    }
  }

  save() {
    try {
      localStorage.setItem("hey_accounts_billing", JSON.stringify({
        accounts: Object.fromEntries(this.accounts),
        sessions: Object.fromEntries(this.sessions),
        billingCustomers: Object.fromEntries(this.billingCustomers),
        subscriptions: Object.fromEntries(this.subscriptions),
        entitlements: Object.fromEntries(this.entitlements),
        invoices: Object.fromEntries(this.invoices),
        usageLedger: Object.fromEntries(this.usageLedger),
        supportCases: Object.fromEntries(this.supportCases),
      }));
    } catch (err) {
      console.warn("Failed to save accounts/billing:", err);
    }
  }

  signup(input) {
    const accountId = generateAccountId();
    const account = {
      id: accountId,
      email: input.email,
      passwordHash: input.passwordHash,
      state: ACCOUNT_STATES.PENDING,
      plan: PLANS.FREE,
      entitlements: [],
      emailVerified: false,
      verificationToken: `ver_${Date.now()}`,
      passwordResetToken: null,
      passwordResetExpires: null,
      lastLogin: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.accounts.set(accountId, account);
    this.save();
    this.notify("account_created", { accountId });
    return { accountId, verificationToken: account.verificationToken };
  }

  login(email, passwordHash) {
    const account = Array.from(this.accounts.values()).find(a => a.email === email);
    if (!account) return { error: "Invalid credentials" };
    if (account.passwordHash !== passwordHash) {
      account.failedLoginAttempts++;
      if (account.failedLoginAttempts >= 5) {
        account.lockedUntil = new Date(Date.now() + 15 * 60000).toISOString();
      }
      this.accounts.set(account.id, account);
      this.save();
      return { error: "Invalid credentials" };
    }
    if (account.state === ACCOUNT_STATES.LOCKED) return { error: "Account locked" };
    if (account.lockedUntil && new Date(account.lockedUntil) > new Date()) {
      return { error: "Account temporarily locked" };
    }

    account.failedLoginAttempts = 0;
    account.lockedUntil = null;
    account.lastLogin = new Date().toISOString();
    this.accounts.set(account.id, account);

    const sessionId = generateSessionId();
    const session = {
      id: sessionId,
      accountId: account.id,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      ip: null,
      userAgent: null,
    };
    this.sessions.set(sessionId, session);
    this.accounts.set(account.id, account);
    this.save();
    
    this.notify("login", { accountId: account.id, sessionId });
    return { accountId: account.id, sessionId, plan: account.plan, entitlements: account.entitlements };
  }

  logout(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "Session not found" };
    this.sessions.delete(sessionId);
    this.save();
    return { success: true };
  }

  verifyEmail(token) {
    const account = Array.from(this.accounts.values()).find(a => a.verificationToken === token);
    if (!account) return { error: "Invalid token" };
    account.emailVerified = true;
    account.verificationToken = null;
    account.state = ACCOUNT_STATES.ACTIVE;
    this.accounts.set(account.id, account);
    this.save();
    return { success: true, accountId: account.id };
  }

  requestPasswordReset(email) {
    const account = Array.from(this.accounts.values()).find(a => a.email === email);
    if (!account) return { success: true };
    account.passwordResetToken = `reset_${Date.now()}`;
    account.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    this.accounts.set(account.id, account);
    this.save();
    return { success: true, token: account.passwordResetToken };
  }

  resetPassword(token, newPasswordHash) {
    const account = Array.from(this.accounts.values()).find(a => a.passwordResetToken === token);
    if (!account) return { error: "Invalid token" };
    if (new Date(account.passwordResetExpires) < new Date()) return { error: "Token expired" };
    account.passwordHash = newPasswordHash;
    account.passwordResetToken = null;
    account.passwordResetExpires = null;
    this.accounts.set(account.id, account);
    this.save();
    return { success: true };
  }

  getAccount(id) {
    return this.accounts.get(id) || null;
  }

  updateAccount(id, updates) {
    const account = this.accounts.get(id);
    if (!account) return null;
    const updated = { ...account, ...updates, updatedAt: new Date().toISOString() };
    this.accounts.set(id, updated);
    this.save();
    return updated;
  }

  createBillingCustomer(accountId, provider, providerCustomerId) {
    const customer = {
      id: `cust_${Date.now()}`,
      accountId,
      provider,
      providerCustomerId,
      paymentMethods: [],
      createdAt: new Date().toISOString(),
    };
    this.billingCustomers.set(customer.id, customer);
    this.save();
    return customer;
  }

  createSubscription(input) {
    const subId = `sub_${Date.now()}`;
    const subscription = {
      id: subId,
      accountId: input.accountId,
      billingCustomerId: input.billingCustomerId,
      plan: input.plan,
      provider: input.provider,
      providerSubscriptionId: input.providerSubscriptionId,
      state: SUBSCRIPTION_STATES.PENDING,
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      cancelAtPeriodEnd: false,
      canceledAt: null,
      trialEnd: null,
      metadata: input.metadata || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.subscriptions.set(subId, subscription);
    this.save();
    return subscription;
  }

  getSubscription(id) {
    return this.subscriptions.get(id) || null;
  }

  getAccountSubscription(accountId) {
    return Array.from(this.subscriptions.values()).find(s => s.accountId === accountId && s.state === SUBSCRIPTION_STATES.ACTIVE);
  }

  updateSubscription(id, updates) {
    const sub = this.subscriptions.get(id);
    if (!sub) return null;
    const updated = { ...sub, ...updates, updatedAt: new Date().toISOString() };
    this.subscriptions.set(id, updated);
    this.save();
    return updated;
  }

  syncEntitlements(accountId) {
    const subscription = this.getAccountSubscription(accountId);
    const entitlements = subscription ? [subscription.plan] : [];
    
    const entitlement = {
      accountId,
      plan: subscription?.plan || PLANS.FREE,
      entitlements,
      source: subscription?.provider || "internal",
      updatedAt: new Date().toISOString(),
    };
    
    this.entitlements.set(accountId, entitlement);
    this.accounts.set(accountId, { ...this.accounts.get(accountId), plan: entitlement.plan, entitlements });
    this.save();
    return entitlement;
  }

  getEntitlements(accountId) {
    return this.entitlements.get(accountId) || { plan: PLANS.FREE, entitlements: [] };
  }

  createInvoice(input) {
    const invoiceId = generateInvoiceId();
    const invoice = {
      id: invoiceId,
      accountId: input.accountId,
      subscriptionId: input.subscriptionId,
      amount: input.amount,
      currency: input.currency || "USD",
      status: "draft",
      items: input.items || [],
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      dueDate: input.dueDate,
      paidAt: null,
      pdfUrl: null,
      createdAt: new Date().toISOString(),
    };
    this.invoices.set(invoiceId, invoice);
    this.save();
    return invoice;
  }

  getInvoices(accountId) {
    return Array.from(this.invoices.values()).filter(i => i.accountId === accountId);
  }

  recordUsage(input) {
    const entry = {
      id: `usage_${Date.now()}`,
      accountId: input.accountId,
      feature: input.feature,
      quantity: input.quantity || 1,
      unit: input.unit || "count",
      cost: input.cost || 0,
      timestamp: new Date().toISOString(),
    };
    const key = `${input.accountId}_${input.feature}_${new Date().toISOString().slice(0, 7)}`;
    const existing = this.usageLedger.get(key) || { total: 0, entries: [] };
    existing.total += entry.quantity;
    existing.entries.push(entry);
    this.usageLedger.set(key, existing);
    this.save();
    return entry;
  }

  getUsage(accountId, feature, month) {
    const key = `${accountId}_${feature}_${month}`;
    return this.usageLedger.get(key) || { total: 0, entries: [] };
  }

  createSupportCase(input) {
    const caseId = generateSupportId();
    const supportCase = {
      id: caseId,
      accountId: input.accountId,
      subject: input.subject,
      description: input.description,
      priority: input.priority || "normal",
      status: "open",
      assignedTo: null,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.supportCases.set(caseId, supportCase);
    this.save();
    return supportCase;
  }

  getSupportCases(accountId) {
    return Array.from(this.supportCases.values()).filter(c => c.accountId === accountId);
  }

  addSupportMessage(caseId, message) {
    const supportCase = this.supportCases.get(caseId);
    if (!supportCase) return { error: "Case not found" };
    supportCase.messages.push({ ...message, timestamp: new Date().toISOString() });
    supportCase.updatedAt = new Date().toISOString();
    this.supportCases.set(caseId, supportCase);
    this.save();
    return supportCase;
  }

  exportAccountData(accountId) {
    const account = this.accounts.get(accountId);
    if (!account) return null;
    return {
      account: { ...account, passwordHash: undefined },
      subscriptions: Array.from(this.subscriptions.values()).filter(s => s.accountId === accountId),
      invoices: Array.from(this.invoices.values()).filter(i => i.accountId === accountId),
      usage: Array.from(this.usageLedger.entries()).filter(([k]) => k.startsWith(accountId)),
      supportCases: Array.from(this.supportCases.values()).filter(c => c.accountId === accountId),
      exportedAt: new Date().toISOString(),
    };
  }

  deleteAccount(accountId) {
    const account = this.accounts.get(accountId);
    if (!account) return { error: "Account not found" };
    account.state = ACCOUNT_STATES.DELETION_PENDING;
    account.deletionRequestedAt = new Date().toISOString();
    this.accounts.set(accountId, account);
    this.save();
    return { success: true };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    this.listeners.forEach(l => {
      try { l(event, data); } catch (err) { console.error("Accounts/Billing listener error:", err); }
    });
  }
}

export const accountsBillingEngine = new AccountsBillingEngine();

export function signup(input) {
  return accountsBillingEngine.signup(input);
}

export function login(email, passwordHash) {
  return accountsBillingEngine.login(email, passwordHash);
}

export function logout(sessionId) {
  return accountsBillingEngine.logout(sessionId);
}

export function verifyEmail(token) {
  return accountsBillingEngine.verifyEmail(token);
}

export function requestPasswordReset(email) {
  return accountsBillingEngine.requestPasswordReset(email);
}

export function resetPassword(token, newPasswordHash) {
  return accountsBillingEngine.resetPassword(token, newPasswordHash);
}

export function getAccount(id) {
  return accountsBillingEngine.getAccount(id);
}

export function updateAccount(id, updates) {
  return accountsBillingEngine.updateAccount(id, updates);
}

export function createBillingCustomer(accountId, provider, providerCustomerId) {
  return accountsBillingEngine.createBillingCustomer(accountId, provider, providerCustomerId);
}

export function createSubscription(input) {
  return accountsBillingEngine.createSubscription(input);
}

export function getSubscription(id) {
  return accountsBillingEngine.getSubscription(id);
}

export function getAccountSubscription(accountId) {
  return accountsBillingEngine.getAccountSubscription(accountId);
}

export function updateSubscription(id, updates) {
  return accountsBillingEngine.updateSubscription(id, updates);
}

export function syncEntitlements(accountId) {
  return accountsBillingEngine.syncEntitlements(accountId);
}

export function getEntitlements(accountId) {
  return accountsBillingEngine.getEntitlements(accountId);
}

export function createInvoice(input) {
  return accountsBillingEngine.createInvoice(input);
}

export function getInvoices(accountId) {
  return accountsBillingEngine.getInvoices(accountId);
}

export function recordUsage(input) {
  return accountsBillingEngine.recordUsage(input);
}

export function getUsage(accountId, feature, month) {
  return accountsBillingEngine.getUsage(accountId, feature, month);
}

export function createSupportCase(input) {
  return accountsBillingEngine.createSupportCase(input);
}

export function getSupportCases(accountId) {
  return accountsBillingEngine.getSupportCases(accountId);
}

export function addSupportMessage(caseId, message) {
  return accountsBillingEngine.addSupportMessage(caseId, message);
}

export function exportAccountData(accountId) {
  return accountsBillingEngine.exportAccountData(accountId);
}

export function deleteAccount(accountId) {
  return accountsBillingEngine.deleteAccount(accountId);
}

export function subscribeToAccountsBilling(listener) {
  return accountsBillingEngine.subscribe(listener);
}

export { ACCOUNT_STATES, SUBSCRIPTION_STATES, TRANSACTION_STATES, PLANS };

export default accountsBillingEngine;