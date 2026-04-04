// Einfache ID-Generierung (In-Memory, kein crypto nötig)
let counter = 0

export function generateId(prefix: string = ''): string {
  counter++
  const timestamp = Date.now().toString(36)
  const count = counter.toString(36).padStart(4, '0')
  return prefix ? `${prefix}_${timestamp}${count}` : `${timestamp}${count}`
}

export function resetIdCounter(): void {
  counter = 0
}
