import { test, expect } from '../../playwright';

test.describe('Sidebar Section Auto-Expand', () => {
  test('should switch between Collections and API Specs within one expanded section', async ({ page }) => {
    const sidebarSection = page.locator('.sidebar-section').filter({ has: page.getByTestId('collections-panel-tab') });
    const collectionsPanel = page.getByTestId('collections-panel');
    const apiSpecsPanel = page.getByTestId('api-specs-panel');

    await expect(sidebarSection).toHaveClass(/expanded/);
    await expect(collectionsPanel).toBeVisible();
    await expect(apiSpecsPanel).not.toBeVisible();

    await page.getByTestId('api-specs-panel-tab').click();
    await expect(sidebarSection).toHaveClass(/expanded/);
    await expect(apiSpecsPanel).toBeVisible();
    await expect(collectionsPanel).not.toBeVisible();
  });

  test('clicking an API Specs action keeps the shared section expanded', async ({ page }) => {
    const sidebarSection = page.locator('.sidebar-section').filter({ has: page.getByTestId('api-specs-panel-tab') });

    await page.getByTestId('api-specs-panel-tab').click();
    await page.getByTestId('api-specs-header-add-menu').click();
    await page.keyboard.press('Escape');

    await expect(sidebarSection).toHaveClass(/expanded/);
    await expect(page.getByTestId('api-specs-panel')).toBeVisible();
  });

  test('keeps the shared section active while switching panels', async ({ page }) => {
    const sidebarSection = page.locator('.sidebar-section').filter({ has: page.getByTestId('collections-panel-tab') });

    await page.getByTestId('collections-panel-tab').click();
    await page.getByTestId('api-specs-panel-tab').click();
    await expect(sidebarSection).toHaveClass(/expanded/);
    await expect(page.getByTestId('api-specs-panel')).toBeVisible();

    await page.getByTestId('collections-panel-tab').click();
    await expect(page.getByTestId('collections-panel')).toBeVisible();
    await expect(page.getByTestId('api-specs-panel')).not.toBeVisible();
  });

  test('clicking search action on a collapsed shared section should expand it', async ({ page }) => {
    const sidebarSection = page.locator('.sidebar-section').filter({ has: page.getByTestId('collections-panel-tab') });
    await sidebarSection.locator('.section-header-left').click();

    await expect(sidebarSection).not.toHaveClass(/expanded/);
    await expect(page.getByTestId('collections-panel')).not.toBeVisible();

    const searchButton = sidebarSection.locator('.section-actions button[title="Search requests"]');
    await searchButton.click();

    await expect(sidebarSection).toHaveClass(/expanded/);
    await expect(page.getByTestId('collections-panel')).toBeVisible();
  });
});
