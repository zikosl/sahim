export const normalizeGtin = (raw: string) => raw.trim().replace(/[\s-]/g, '')

export function validGtin(raw: string) {
  const value = normalizeGtin(raw)
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(value)) return false
  const digits = value.split('').map(Number)
  const check = digits.pop()!
  return (10 - digits.reverse().reduce((sum, digit, index) => sum + digit * (index % 2 === 0 ? 3 : 1), 0) % 10) % 10 === check
}

export function scanGtin(raw: string) {
  const value = normalizeGtin(raw)
  if (validGtin(value)) return value
  const gs1 = raw.trim().match(/(?:^\(01\)|\/01\/)(\d{14})(?:$|[/?#])/)
  return gs1 && validGtin(gs1[1]) ? gs1[1] : ''
}

export function manualCodeError(raw: string) {
  const value = normalizeGtin(raw)
  if (!value) return 'Enter a barcode first.'
  if (!/^\d+$/.test(value)) return 'Use digits only. Spaces and hyphens are okay.'
  if (![8, 12, 13, 14].includes(value.length)) return 'Use an 8, 12, 13, or 14-digit barcode.'
  if (!validGtin(value)) return 'Check the last digit. This barcode has an invalid check digit.'
  return ''
}
