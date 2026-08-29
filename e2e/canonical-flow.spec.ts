import { expect, test } from '@playwright/test';

test('completes the canonical human workflow and preserves every safety gate', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('button', { name: /WebMCP (ready|unavailable)/ })).toBeVisible();
  await page.getByRole('button', { name: 'Reset demo' }).click();

  await expect(page.getByText('Equipment pickup has no owner')).toBeVisible();
  await page.getByRole('button', { name: 'Find a viable match' }).click();
  await page.getByRole('button', { name: 'Preview revision' }).click();
  await expect(page.getByText('No changes applied yet')).toBeVisible();
  await expect(page.getByText('0 changed')).toBeVisible();
  await page.getByRole('button', { name: 'Apply revision' }).click();

  await expect(page.getByText('Draft v4')).toBeVisible();
  await page.getByRole('button', { name: 'Preview projector cancellation' }).click();
  await expect(page.getByText('Temporary preview · plan unchanged')).toBeVisible();
  await expect(page.getByText('Draft v4')).toBeVisible();
  await page.getByRole('button', { name: 'Repair with backup display' }).click();

  await expect(page.getByText('Draft v5')).toBeVisible();
  await page.getByRole('button', { name: /Open plan inspector/i }).click();
  await page.getByRole('button', { name: 'Run full validation' }).click();
  await expect(page.getByText('Every hard constraint passes')).toBeVisible();
  await page.getByRole('button', { name: 'Close plan inspector' }).click();

  await page.getByRole('button', { name: 'Request in-app commitments' }).click();
  await expect(page.getByText('7 fictional responses pending')).toBeVisible();
  await page.getByRole('button', { name: 'Simulate all accept' }).click();
  await expect(page.getByText('Accepted v5')).toBeVisible();
  await page.getByRole('button', { name: 'Publish accepted plan' }).click();

  await expect(page.getByText('Published v5', { exact: true })).toBeVisible();
  await expect(page.getByText('Plan v5 is immutable')).toBeVisible();
  await expect(page.getByText('Canonical end-to-end story complete')).toBeVisible();
});

test('preserves graph meaning and readable WebMCP status on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Reset demo' }).click();

  await expect(page.getByRole('button', { name: /WebMCP (ready|unavailable)/ })).toBeVisible();
  await expect(page.getByLabel(/Relationship direction legend/)).toContainText('Contributor');
  await expect(page.getByLabel(/Relationship direction legend/)).toContainText('Prerequisite');
  await expect(page.locator('.graph-task')).toHaveCount(8);
  await expect(page.locator('.graph-contributor')).toHaveCount(8);

  const layout = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    goalTop: document.querySelector('.goal-panel')?.getBoundingClientRect().top ?? 0,
    graphTop: document.querySelector('.canvas-panel')?.getBoundingClientRect().top ?? 0,
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth);
  expect(layout.goalTop).toBeLessThan(layout.graphTop);
});

test('traps modal focus, isolates the background, and restores the opener', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-hydrated', 'true');
  const opener = page.getByRole('button', { name: /Open plan inspector/i });
  await opener.click();

  const dialog = page.getByRole('dialog', { name: /Career Night coordination plan/i });
  await expect(dialog).toBeVisible();
  await expect(page.locator('.workspace')).toHaveAttribute('inert', '');
  await expect(page.getByRole('button', { name: 'Close plan inspector' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');

  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});
