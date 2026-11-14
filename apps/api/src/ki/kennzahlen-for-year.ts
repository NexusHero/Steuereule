import { ADVISOR_KNOWLEDGE } from './skills.generated.js'

/**
 * The figures of one tax year from the verified `kennzahlen` table of the steuerberater skill, as
 * short lines for the case prompt. The real-case test showed the model taking rates from memory
 * (Kindergeld 250 € instead of 255 €, childcare "two thirds" instead of 80 % for 2025) although the
 * table was one lookup away; with the year's lines in every prompt it does not need to remember.
 * Only rows with a column per tax year are taken; "←" means the value on the left.
 */
export function kennzahlenForYear(year: number, text: string = ADVISOR_KNOWLEDGE.kennzahlen.text): string[] {
  const lines: string[] = []
  let yearColumns: number[] | null = null
  for (const line of text.split('\n')) {
    if (!line.startsWith('|')) {
      yearColumns = null
      continue
    }
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim())
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue
    const headerYears = cells.map((cell) => (/^\d{4}$/.test(cell) ? Number(cell) : null))
    if (headerYears.some((y) => y !== null)) {
      yearColumns = headerYears.map((y) => y ?? -1)
      continue
    }
    if (!yearColumns) continue
    const column = yearColumns.indexOf(year)
    if (column < 0) continue
    let value = cells[column] ?? ''
    for (let i = column; value === '←' && i > 0; i--) value = cells[i - 1] ?? ''
    if (value === '' || value === '←') continue
    lines.push(`- ${cells[0]}: ${value.replace(/\*\*/g, '')}`)
  }
  return lines
}
