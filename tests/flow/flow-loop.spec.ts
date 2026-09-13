import { test, expect } from '../../playwright';
import { createCollection, closeAllCollections, createRequest } from '../utils/page';
import { buildCommonLocators } from '../utils/page/locators';

/**
 * Flow 实机回归：合流 DAG（不等长分支）与循环节点。
 *
 * 通过画布把手拖拽连线（ReactFlow 标准交互），驱动真实执行器与 mock 服务器，
 * 覆盖纯单测无法覆盖的渲染接线与交互链路。
 */

const MOCK = (path: string) => `http://localhost:8081/api/echo/anything/${path}`;

async function createFlow(page: any, collectionName: string, flowName: string, collectionPath: string) {
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
}

async function openFlowTab(page: any, flowName: string) {
  // 优先点击已打开的 Flow Tab 标签聚焦（createFlow 时已自动打开）；
  // 不走侧边栏行点击——树重建后 flow 项可能被判为 folder 而打开 folder-settings 视图
  await expect(async () => {
    const flowTab = page.locator('.request-tab').filter({ hasText: flowName }).first();
    if (await flowTab.isVisible().catch(() => false)) {
      await flowTab.click();
    } else {
      const locators = buildCommonLocators(page);
      await locators.sidebar.folder(flowName).click();
    }
    await expect(page.getByTestId('flow-topbar')).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 20000 }).catch(async (e) => {
    await page.screenshot({ path: 'test-results/debug-opentab.png', fullPage: true });
    throw e;
  });
}

/** 打开 Flow Tab 并等待 reconcile 补建完节点 */
async function openFlowCanvas(page: any, flowName: string, expectedNodes: number) {
  await openFlowTab(page, flowName);
  await expect(page.locator('.react-flow__node')).toHaveCount(expectedNodes, { timeout: 10000 });
}

/** 用自动布局把节点铺开并适应视图，避免随机位置重叠/越界干扰把手拖拽 */
async function autoLayout(page: any) {
  await page.locator('button[title="自动布局"]').click();
  await page.locator('button[title="适应视图"]').click();
  await page.waitForTimeout(300);
}

/**
 * 从源节点右侧把手拖到目标节点左侧把手，并断言对应的边已在画布生成。
 *
 * ReactFlow 的命中检测对子像素稳定性敏感（详见记忆 callx-sidebar-drag-flow-crash），
 * 把手 mousedown 用 dispatchEvent 直接派发，拖拽轨迹用真实 CDP 鼠标驱动；
 * 连线结果以 `.react-flow__edge[data-id]` 存在性为准，未建上则自动重试。
 */
async function connectNodes(page: any, sourceText: string, targetText: string) {
  const sourceNode = page.locator('.react-flow__node').filter({ hasText: sourceText });
  const targetNode = page.locator('.react-flow__node').filter({ hasText: targetText });
  const sourceId = await sourceNode.getAttribute('data-id');
  const targetId = await targetNode.getAttribute('data-id');
  const edgeLocator = page.locator(`.react-flow__edge[data-id="edge_${sourceId}_${targetId}"]`).first();

  const mouseupJitter = [
    [0, 0], [3, 2], [-3, 2], [0, 3], [0, -3], [2, -2], [-2, -2]
  ];
  let connectAttempt = 0;
  await expect(async () => {
    const [jx, jy] = mouseupJitter[connectAttempt % mouseupJitter.length];
    connectAttempt += 1;
    const sourceHandle = sourceNode.locator('.react-flow__handle.source');
    const targetHandle = targetNode.locator('.react-flow__handle.target');
    const sb = await sourceHandle.boundingBox();
    const tb = await targetHandle.boundingBox();
    expect(sb).toBeTruthy();
    expect(tb).toBeTruthy();
    const sx = sb!.x + sb!.width / 2;
    const sy = sb!.y + sb!.height / 2;
    const tx = tb!.x + tb!.width / 2 + jx;
    const ty = tb!.y + tb!.height / 2 + jy;

    await sourceHandle.dispatchEvent('mousedown', {
      bubbles: true,
      button: 'left',
      clientX: sx,
      clientY: sy
    });
    await page.mouse.move(sx, sy);
    await page.mouse.move((sx + tx) / 2 + 40, (sy + ty) / 2, { steps: 6 });
    await page.mouse.move(tx, ty, { steps: 6 });
    await page.mouse.up();

    await expect(edgeLocator).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30000 }).catch(async (e) => {
    await page.screenshot({ path: 'test-results/debug-connect.png', fullPage: true });
    const dump = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('.react-flow__node')).map((el) => (
        `${el.getAttribute('data-id')}=${el.textContent?.slice(0, 14)}`
      ));
      const edges = Array.from(document.querySelectorAll('.react-flow__edge')).map((el) => (
        `${el.getAttribute('data-id')}`
      ));
      return { nodes, edges };
    });
    require('fs').writeFileSync(
      'test-results/debug-edges.txt',
      ['nodes:', ...dump.nodes, 'edges:', ...dump.edges].join('\n')
    );
    throw e;
  });
}

/** 运行整条 Flow，等待结束后切到结果 Tab（未选中节点时不会自动切换） */
async function runFlowAndWaitSuccess(page: any) {
  await page.getByTestId('flow-run-button').click();
  await page
    .getByTestId('flow-cancel-button')
    .waitFor({ state: 'visible', timeout: 5000 })
    .catch(() => {});
  await expect(page.getByTestId('flow-run-button')).toBeVisible({ timeout: 60000 });
  await page.getByRole('button', { name: '运行结果' }).click();
  await page.getByText('运行总览').waitFor({ state: 'visible', timeout: 5000 });
}

test.describe('Flow 实机回归：合流与循环节点', () => {
  // 建集合/请求 + 画布连线 + 运行验证，远超默认 30s
  test.setTimeout(240_000);

  test.afterEach(async ({ page }) => {
    await closeAllCollections(page);
  });

  test('不等长分支合流（DAG）应正常执行，不误报环或回跳', async ({ page, createTmpDir }) => {
    const collectionName = 'merge-dag-coll';
    const flowName = 'merge-dag-flow';
    const collectionPath = await createTmpDir(collectionName);

    await createFlow(page, collectionName, flowName, collectionPath);
    await openFlowTab(page, flowName); // 展开 Flow 行，后续创建的请求子项才可见
    // 三个请求：A、X（A 的后继）、B（合流点，同时被 start 直连）
    await createRequest(page, 'branch-a', flowName, { url: MOCK('a'), inFolder: true });
    await createRequest(page, 'branch-x', flowName, { url: MOCK('x'), inFolder: true });
    await createRequest(page, 'merge-b', flowName, { url: MOCK('b'), inFolder: true });

    await openFlowCanvas(page, flowName, 5); // start/end + 3 请求
    await autoLayout(page);

    // 图形：start→A→X→B 与 start→B 直连（B 为不等长分支的合流点）
    await connectNodes(page, 'Start', 'branch-a');
    await connectNodes(page, 'Start', 'merge-b');
    await connectNodes(page, 'branch-a', 'branch-x');
    await connectNodes(page, 'branch-x', 'merge-b');
    await connectNodes(page, 'merge-b', 'End');

    await runFlowAndWaitSuccess(page);

    // 运行总览：三个请求节点都应为成功（修复前 X→B 会被判"回跳"，流程失败）
    for (const name of ['branch-a', 'branch-x', 'merge-b']) {
      await expect(
        page.locator('button').filter({ hasText: name }).filter({ hasText: '成功' }).first()
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test('循环节点应逐轮执行体链并推进完成后链（预置集合）', async ({ pageWithUserData }) => {
    const collectionName = 'loop-flow-collection';
    const flowName = 'loop-flow';

    // 应用启动即加载预置集合（flow.yml 已全量预接线），
    // 避开 UI 建流/监听器事件竞态；Flow 行类型来自 flow.yml 解析（type: flow）
    const locators = buildCommonLocators(pageWithUserData);
    await expect(locators.sidebar.collection(collectionName)).toBeVisible({ timeout: 15000 });
    await locators.sidebar.collectionChevron(collectionName).click();
    await openFlowTab(pageWithUserData, flowName);

    // 画布：5 节点 + 5 预接线（start/loop/body/after/end）
    await expect(pageWithUserData.locator('.react-flow__node')).toHaveCount(5, { timeout: 15000 });
    await expect(pageWithUserData.locator('.react-flow__edge')).toHaveCount(5, { timeout: 15000 });

    // 孤儿恢复：预置节点的 requestUid 与加载的请求 uid 不同，
    // reconcile 应按 requestPath/alias 回退匹配保留节点而非删除
    await expect(pageWithUserData.locator('.react-flow__node')).toHaveCount(5, { timeout: 5000 });

    await runFlowAndWaitSuccess(pageWithUserData);

    // 循环节点卡片显示 2/2 进度徽标
    await expect(
      pageWithUserData.locator('.react-flow__node').filter({ hasText: '分页循环' }).getByText('2/2')
    ).toBeVisible({ timeout: 5000 });

    // 运行总览：体链与完成后链节点都应为成功
    for (const name of ['loop-body', 'after-loop']) {
      await expect(
        pageWithUserData.locator('button').filter({ hasText: name }).filter({ hasText: '成功' }).first()
      ).toBeVisible({ timeout: 5000 });
    }

    // 轮次明细：点总览中循环步骤行（保持在结果 Tab）
    await pageWithUserData.locator('button').filter({ hasText: '分页循环' }).first().click();
    await expect(pageWithUserData.getByText('迭代轮次（2/2）')).toBeVisible({ timeout: 5000 });

    // 导出报告按钮存在（保存对话框为系统级，不在 e2e 内点击）
    await expect(pageWithUserData.getByText('导出报告')).toBeVisible();
  });
});
