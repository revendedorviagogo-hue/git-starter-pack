/**
 * Deprecated: presence tracking is now handled by useVisitorPresence(sessionId).
 * This hook is kept as a no-op to avoid breaking imports until all pages are updated.
 */
export const useClientPresenceTracker = (_sessionId: string | null) => {
  // No-op: useVisitorPresence(sessionId) handles everything now
};
