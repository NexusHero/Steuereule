// What a gate's page showed when a step failed: the URL, the visible text and a full-page screenshot. A timeout
// alone ("waiting for [data-testid=…]") says nothing about whether the page showed an error state, another
// screen or a dialog; this record does, in the job log and in the uploaded artifact, so a failure is understood
// from CI without a local stack run.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const OUT = process.env.VISUAL_OUT ?? '/tmp/visual-regression'

/** Writes `<OUT>/failures/<tag>-<label>.{png,txt}` and prints URL and text; never throws (it runs on a failure). */
export async function snapshotPage(page, tag, label = 'failure') {
  try {
    const dir = join(OUT, 'failures')
    await mkdir(dir, { recursive: true })
    const base = join(dir, `${tag}-${label}`.replace(/[^a-z0-9._-]+/gi, '-'))
    const url = page.url()
    const text = await page.locator('body').innerText({ timeout: 2_000 }).catch(() => '(no body text)')
    await page.screenshot({ path: `${base}.png`, fullPage: true, timeout: 5_000 }).catch(() => undefined)
    await writeFile(`${base}.txt`, `${url}\n\n${text}\n`)
    console.error(`[${tag}] the page at ${url} showed:\n${text.slice(0, 2_000)}`)
  } catch (error) {
    console.error(`[${tag}] could not record the page: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** Runs `step(page)`; on a failure records what the page showed, then rethrows. */
export async function withPageSnapshot(page, tag, step) {
  try {
    return await step(page)
  } catch (error) {
    await snapshotPage(page, tag)
    throw error
  }
}
