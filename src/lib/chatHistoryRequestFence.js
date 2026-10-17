export function createChatHistoryRequestFence() {
  let generation = 0;
  let activeTicket = null;

  return Object.freeze({
    begin(accountId, conversationId) {
      const ticket = Object.freeze({
        generation: ++generation,
        accountId: typeof accountId === "string" && accountId ? accountId : null,
        conversationId,
      });
      activeTicket = ticket;
      return ticket;
    },
    isCurrent(ticket, accountId, conversationId) {
      return Boolean(ticket && activeTicket === ticket && ticket.generation === generation &&
        ticket.accountId === (typeof accountId === "string" && accountId ? accountId : null) &&
        ticket.conversationId === conversationId);
    },
    invalidate() {
      generation += 1;
      activeTicket = null;
    },
  });
}
