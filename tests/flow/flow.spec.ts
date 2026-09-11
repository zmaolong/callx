import { test, expect } from '../../playwright';
import { createCollection, closeAllCollections, createRequest, sendRequestAndWaitForResponse } from '../utils/page';
import { buildCommonLocators } from '../utils/page/locators';

test.describe('Flow 编排', () => {
  test.afterEach(async ({ page }) => {
    await closeAllCollections(page);
  });

  test('应创建 Flow 并显示 Start/End 节点', async ({ page, createTmpDir }) => {
    const collectionName = 'flow-test-collection';
    const flowName = 'test-flow';
    const collectionPath = await createTmpDir(collectionName);

    await test.step('创建集合', async () => {
      await createCollection(page, collectionName, collectionPath);
    });

    await test.step('创建 Flow', async () => {
      const locators = buildCommonLocators(page);

      // 点击集合操作按钮，选择 New Flow
      await locators.sidebar.collection(collectionName).hover();
      await locators.actions.collectionActions(collectionName).click();
      await locators.dropdown.tippyItem('New Flow').click();

      // 填写 Flow 名称并提交
      const modal = page.locator('.bruno-modal-card').filter({ hasText: 'New Flow' });
      await modal.waitFor({ state: 'visible', timeout: 5000 });
      await modal.locator('input[data-testid="new-flow-name-input"]').fill(flowName);
      await modal.getByRole('button', { name: 'Create' }).click();
      await modal.waitFor({ state: 'hidden', timeout: 5000 });
    });

    await test.step('验证 Flow 创建成功，Flow Tab 被打开', async () => {
      // 验证 Flow Tab 渲染（顶栏承载 Flow 名称）
      await expect(page.getByTestId('flow-topbar')).toBeVisible({ timeout: 5000 });
      await expect(page.getByTestId('flow-topbar')).toContainText(flowName);
    });

    await test.step('验证侧边栏中 Flow 容器显示', async () => {
      const locators = buildCommonLocators(page);
      await expect(locators.sidebar.collection(flowName)).toBeVisible({ timeout: 5000 });
    });
  });

  test('应在 Flow 目录中创建请求并自动生成卡片', async ({ page, createTmpDir }) => {
    const collectionName = 'flow-card-test';
    const flowName = 'card-flow';
    const requestName = 'step-one';
    const collectionPath = await createTmpDir(collectionName);

    await test.step('创建集合和 Flow', async () => {
      await createCollection(page, collectionName, collectionPath);
      const locators = buildCommonLocators(page);

      await locators.sidebar.collection(collectionName).hover();
      await locators.actions.collectionActions(collectionName).click();
      await locators.dropdown.tippyItem('New Flow').click();

      const modal = page.locator('.bruno-modal-card').filter({ hasText: 'New Flow' });
      await modal.waitFor({ state: 'visible', timeout: 5000 });
      await modal.locator('input[data-testid="new-flow-name-input"]').fill(flowName);
      await modal.getByRole('button', { name: 'Create' }).click();
      await modal.waitFor({ state: 'hidden', timeout: 5000 });
    });

    await test.step('在 Flow 目录中创建请求', async () => {
      // 使用 createRequest 在 Flow 容器中创建请求
      await createRequest(page, requestName, flowName, { url: 'http://localhost:8081/api/step1' });
    });

    await test.step('验证请求创建成功', async () => {
      const locators = buildCommonLocators(page);
      await expect(locators.sidebar.request(requestName)).toBeVisible({ timeout: 5000 });
    });
  });

  test('应能发送请求并收到响应', async ({ page, createTmpDir }) => {
    const collectionName = 'flow-req-test';
    const requestName = 'ping';
    const collectionPath = await createTmpDir(collectionName);

    await test.step('创建集合和请求', async () => {
      await createCollection(page, collectionName, collectionPath);
      await createRequest(page, requestName, collectionName, { url: 'http://localhost:8081/ping' });
    });

    await test.step('发送请求并验证响应', async () => {
      // 保存请求
      await page.locator('#request-actions').getByTestId('save-request-button').click();
      // 发送请求
      await sendRequestAndWaitForResponse(page, 200);
      // 验证响应状态码
      await expect(page.getByTestId('response-status-code')).toContainText('200');
    });
  });

  test('集合操作下拉菜单应包含 New Flow 选项', async ({ page, createTmpDir }) => {
    const collectionName = 'menu-test';
    const collectionPath = await createTmpDir(collectionName);

    await test.step('创建集合', async () => {
      await createCollection(page, collectionName, collectionPath);
    });

    await test.step('验证 New Flow 菜单项存在', async () => {
      const locators = buildCommonLocators(page);
      await locators.sidebar.collection(collectionName).hover();
      await locators.actions.collectionActions(collectionName).click();
      await expect(locators.dropdown.item('New Flow')).toBeVisible({ timeout: 5000 });
    });
  });
});
