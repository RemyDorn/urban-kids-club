// Sichere ID-Generierung mit crypto.randomUUID
import { randomUUID } from 'node:crypto'

export function generateId(prefix: string = ''): string {
  const uuid = randomUUID().replace(/-/g, '').slice(0, 16)
  return prefix ? `${prefix}_${uuid}` : uuid
}

// Kein resetIdCounter mehr nötig – UUIDs sind immer einzigartig
export function resetIdCounter(): void {
  // No-op – beibehalten für Test-Kompatibilität
}
