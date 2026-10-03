import { expect, test } from '@playwright/test'

test('ask the co-author, then accept one proposal', async ({ page }) => {
  await page.goto(`/?doc=e2e-${Date.now()}&ai=mock`)
  const editor = page.getByRole('textbox', { name: 'Document' })
  await expect(editor).toContainText('Why the AI should knock first')
  await editor.getByText('Most AI writing tools', { exact: false }).click()
  await page.getByLabel('Instruction').fill('Cut filler words')
  await page.getByRole('button', { name: 'Propose' }).click()
  const cards = page.getByTestId('proposal-card')
  await expect(cards.first().getByRole('button', { name: 'Accept' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Propose' })).toBeVisible()
  const count = await cards.count()
  expect(count).toBeGreaterThan(1)
  await cards.first().getByRole('button', { name: 'Accept' }).click()
  await expect(cards).toHaveCount(count - 1)
  await expect(editor).toContainText('Most AI writing tools write straight')
})

test('edits sync to a second tab', async ({ context }) => {
  const url = `/?doc=e2e-sync-${Date.now()}&ai=mock`
  const a = await context.newPage()
  const b = await context.newPage()
  await a.goto(url)
  await b.goto(url)
  const editorA = a.getByRole('textbox', { name: 'Document' })
  await editorA.getByText('Why the AI should knock first').click()
  await a.keyboard.press('Control+End')
  await a.keyboard.type(' now')
  await expect(b.getByRole('textbox', { name: 'Document' })).toContainText('when you reconnect. now')
})
