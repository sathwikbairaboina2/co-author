import { copyFileSync, mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const size = { width: 960, height: 700 }

test('record the two-peer demo', async ({ browser }) => {
  mkdirSync('demo-video/raw', { recursive: true })
  // Warm the dev server first so the recording does not open on a blank page.
  const warm = await browser.newContext({ viewport: size })
  const warmPage = await warm.newPage()
  await warmPage.goto('/?doc=warm&ai=mock')
  await expect(warmPage.getByRole('textbox', { name: 'Document' })).toContainText('Why the AI should knock first')
  await warm.close()
  const context = await browser.newContext({ recordVideo: { dir: 'demo-video/raw', size }, viewport: size })
  const url = `/?doc=demo-${Date.now()}&ai=mock`
  const a = await context.newPage()
  const b = await context.newPage()
  await a.goto(url)
  await b.goto(url)
  const editorA = a.getByRole('textbox', { name: 'Document' })
  const editorB = b.getByRole('textbox', { name: 'Document' })
  await expect(editorA).toContainText('Why the AI should knock first')
  await expect(editorB).toContainText('Why the AI should knock first')
  await a.waitForTimeout(1200)

  // Peer B types at the end of the document and A sees it.
  await editorB.getByText('Why the AI should knock first').click()
  await b.keyboard.press('Control+End')
  await b.keyboard.type(' Peer B wrote this line.', { delay: 40 })
  await expect(editorA).toContainText('Peer B wrote this line.')
  await a.waitForTimeout(1200)

  // Peer A asks the AI peer for a tracked suggestion.
  await editorA.getByText('Most AI writing tools', { exact: false }).click()
  await a.waitForTimeout(600)
  await a.getByLabel('Instruction').fill('Cut filler words')
  await a.waitForTimeout(600)
  await a.getByRole('button', { name: 'Propose' }).click()
  const cardsA = a.getByTestId('proposal-card')
  const cardsB = b.getByTestId('proposal-card')
  await expect(cardsA.first().getByRole('button', { name: 'Accept' })).toBeVisible()
  await expect(a.getByRole('button', { name: 'Propose' })).toBeVisible()
  await expect(cardsB.first()).toBeVisible()
  await a.waitForTimeout(1200)

  // Accept the first suggestion, reject another one.
  const count = await cardsA.count()
  expect(count).toBeGreaterThan(1)
  await cardsA.first().getByRole('button', { name: 'Accept' }).click()
  await expect(cardsA).toHaveCount(count - 1)
  await a.waitForTimeout(800)
  await cardsA.first().getByRole('button', { name: 'Reject' }).click()
  await expect(cardsA).toHaveCount(count - 2)
  await expect(editorB).toContainText('Most AI writing tools write straight')
  await b.waitForTimeout(1500)

  const pathA = await a.video()!.path()
  const pathB = await b.video()!.path()
  await context.close()
  copyFileSync(pathA, 'demo-video/a.webm')
  copyFileSync(pathB, 'demo-video/b.webm')
})
