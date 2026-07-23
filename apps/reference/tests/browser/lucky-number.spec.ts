import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

async function blockExternalNetwork(page: Page): Promise<void> {
  await page.route('**/*', async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      await route.continue();
      return;
    }
    await route.abort();
  });
}

test.beforeEach(async ({ page }) => {
  await blockExternalNetwork(page);
});

test('generates a custom lucky number through the hydrated form', async ({ page }) => {
  await page.goto('/lucky/number');

  await page.getByLabel('Minimum').fill('10');
  await page.getByLabel('Maximum').fill('20');
  await page.getByRole('button', { name: 'Generálás Server Actionnel' }).click();

  await expect(page.getByRole('status')).toBeVisible();
  await expect(page.getByRole('status')).toContainText(/Eredmény: \d+ \(10–20\)/u);
});

test('returns an accessible field error for a reversed range', async ({ page }) => {
  await page.goto('/lucky/number');

  await page.getByLabel('Minimum').fill('20');
  await page.getByLabel('Maximum').fill('10');
  await page.getByRole('button', { name: 'Generálás Server Actionnel' }).click();

  await expect(page.getByText('A maximum nem lehet kisebb a minimumnál.').first()).toBeVisible();
  await expect(page.getByLabel('Maximum')).toHaveAttribute('aria-invalid', 'true');
});

test('@a11y lucky-number form has no detectable WCAG A or AA violations', async ({ page }) => {
  await page.goto('/lucky/number');

  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  expect(result.violations).toEqual([]);
});
