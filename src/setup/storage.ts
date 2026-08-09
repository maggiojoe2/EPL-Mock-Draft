// ── localStorage persistence for save history ─────────────────────────────

const STORAGE_KEY_PREFIX = 'epl-mock-drafter:save-history:'

/**
 * Load save history for all teams from localStorage.
 * Returns a Map<teamName, Set<playerId>>.
 */
export function loadSaveHistoryFromStorage(): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>()
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith(STORAGE_KEY_PREFIX)) continue
    const teamName = key.slice(STORAGE_KEY_PREFIX.length)
    try {
      const raw = localStorage.getItem(key)
      const ids: string[] = raw ? JSON.parse(raw) : []
      result.set(teamName, new Set(ids))
    } catch {
      // Ignore malformed entries
    }
  }
  return result
}

/**
 * Persist a team's save history to localStorage.
 */
export function saveSaveHistoryToStorage(teamName: string, saveHistory: Set<string>): void {
  const key = `${STORAGE_KEY_PREFIX}${teamName}`
  localStorage.setItem(key, JSON.stringify(Array.from(saveHistory)))
}
