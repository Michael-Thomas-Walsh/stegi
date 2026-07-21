export type LogLevel = 'info' | 'success' | 'warning' | 'error'

let logElement: HTMLElement | null = null

export function initialiseLog(elementId: string): void {
  logElement = document.getElementById(elementId)
  if (!logElement) {
    throw new Error(`Could not find log element #${elementId}.`)
  }
}

export function writeLog(message: string, level: LogLevel = 'info'): void {
  if (!logElement) return

  const row = document.createElement('p')
  row.className = `log-entry ${level}`

  const time = document.createElement('time')
  time.dateTime = new Date().toISOString()
  time.textContent = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date())

  const text = document.createElement('span')
  text.textContent = message

  row.append(time, text)
  logElement.append(row)
  logElement.scrollTop = logElement.scrollHeight
}
