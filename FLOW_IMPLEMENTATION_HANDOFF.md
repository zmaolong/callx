# New Flow 请求编排功能交接文档

> 状态：仅完成产品与技术设计，**尚未开始实现**。
>
> 目标：在 CallX 中实现 `New Flow` 请求编排。Flow 目录中的 Request 以工作流卡片呈现；通过 Start/End 和连线组成唯一线性主流程；上游请求响应 body 经卡片输入映射注入下游 Request 的运行时变量。

## 1. 当前代码基线

- 仓库：`E:\workspace\qinsilk\callx`
- 分支：`callx/release-0.0.1`
- 起始提交：`6c3a76e0c`（`fix(callx): 修复删除 Flow 时 ENOTDIR 错误`）
- 本次讨论没有修改业务代码。
- Flow 的创建、目录化持久化、挂载、删除和 Tab 打开已存在；Flow 图、Flow 执行、响应传递、画布和测试尚不存在。

### 1.1 当前 Flow 相关实现

| 用途 | 文件 | 事实 |
| --- | --- | --- |
| 新建 Flow Redux 动作 | `packages/bruno-app/src/providers/ReduxStore/slices/collections/actions.js`，约 1843 行 | 新 Flow 初始数据目前为 `type: 'flow'`、`flow: { steps: [] }`。需要升级为新模型。 |
| 新建 Flow 对话框 | `packages/bruno-app/src/components/Sidebar/NewFlow/index.js` | 仅收集名称并调用 `newFlow`。 |
| Flow 文件创建 | `packages/bruno-electron/src/ipc/collection.js`，约 1236 行 | Flow 持久化为 `<flow-name>/flow.<format>` 目录型项目。 |
| Flow 文件删除 | `packages/bruno-electron/src/ipc/collection.js`，约 1289 行 | 已兼容目录型 Flow 的递归删除。修改时不要回归该能力。 |
| YAML Flow 读写 | `packages/bruno-filestore/src/formats/yml/items/parseFlow.ts`、`stringifyFlow.ts` | 当前读写 `flow.steps`，需要改为 `flow.nodes` / `flow.edges`。无需兼容尚未上线的旧 steps 数据。 |
| BRU Flow 读写 | `packages/bruno-filestore/src/formats/bru/index.ts` | 同样需要同步为新模型。 |
| 集合树挂载 | `packages/bruno-electron/src/services/mount/tree-builder.js` | `flow.<format>` 被识别为 Flow 容器目录，目录中的普通请求可被挂载。 |
| Flow Tab | `packages/bruno-app/src/components/FlowTab/index.js` | 目前为“Flow 编排功能暂未实现”占位页。 |
| Flow Tab 路由 | `packages/bruno-app/src/components/RequestTabPanel/index.js` | `type === 'flow'` 时渲染 `FlowTab`。 |

### 1.2 当前请求执行与变量机制

| 用途 | 文件 | 事实 |
| --- | --- | --- |
| Renderer 单请求动作 | `packages/bruno-app/src/providers/ReduxStore/slices/collections/actions.js`，约 602–730 行 | `sendRequest` 是单请求 UI/Redux 入口；现有实现会更新请求响应和 timeline。 |
| Renderer 网络封装 | `packages/bruno-app/src/utils/network/index.js` | HTTP/GraphQL 经 IPC `send-http-request` 调用主进程。 |
| 主进程请求生命周期 | `packages/bruno-electron/src/ipc/network/index.js`，约 747–1204 行 | `runRequest` 负责请求准备、前置脚本、HTTP 请求、后置脚本、断言、测试和事件。 |
| 变量插值 | `packages/bruno-electron/src/ipc/network/interpolate-vars.js` | 已有环境、Collection、文件夹、Request、runtime、prompt 等变量合并与插值。Flow 输入应作为本次请求的 runtime variables 注入。 |
| 通用表达式插值 | `packages/bruno-common/src/interpolate/index.ts` | 使用 `{{placeholder}}`，支持 lodash 风格深层取值和递归替换。 |
| 响应写入与 timeline | `packages/bruno-app/src/providers/ReduxStore/slices/collections/index.js`，约 633–669 行 | 当前按 `itemUid` / `requestUid` 写响应和 timeline；Flow 需要扩展关联字段。 |

### 1.3 测试与 UI 基础

- UI 单测：Jest + jsdom + React Testing Library。
  - 配置：`packages/bruno-app/jest.config.js`
- E2E：Playwright Electron。
  - 配置：`playwright.config.ts`
  - 规范：`.claude/rules/testing.md`、`docs/playwright-testing-guide.md`
- Redux：Redux Toolkit 1.8 + 手写 thunk；保持状态可序列化。
  - 约定：`.claude/rules/redux-store.md`
- 现有拖拽库：`react-dnd@^16.0.1`，已用于 Tab 和侧边栏。
- 尚未安装画布库；已决定新增 **`@xyflow/react`** 到 `packages/bruno-app/package.json`，并更新根 `package-lock.json`。

## 2. 已确认的产品决策

### 2.1 范围

- 首版是**线性执行**，但 UI 使用工作流/审批流式画布与连线。
- 数据模型从第一版起持久化图结构，未来可扩展分支、合流、循环、并行。
- 首版只执行从 Start 到 End 的唯一主链。
- 不实现分支、循环、并行、从中间步骤继续、运行历史持久化、响应聚合导出。

### 2.2 Request 与 Flow 的关系

- Flow 目录中的每个普通 Request 都对应一张画布卡片。
- Request 配置与卡片编排配置必须分离：
  - **Request 配置**：URL、Method、Headers、Body、Auth、脚本等，继续复用已有 Request Tab。
  - **卡片配置**：Flow alias、位置、连线、输入映射。
- 点击卡片的“编辑请求”入口打开现有 Request Tab；Request 本身不需要知道自己位于 Flow。
- 通过现有新增、复制、删除、移动机制在 Flow 目录操作 Request：
  - 新增到 Flow 目录后生成卡片。
  - 复制产生独立请求文件、独立 `requestUid`、独立 `stepId`。
  - 同一个 Request 文件**不能**对应多张卡片；需要重复执行时必须先复制 Request。
  - 删除卡片即删除关联 Request 文件、节点和相关边。
  - 外部复制/移动 Request 进入 Flow 目录后，自动生成未连接卡片。
  - 外部删除/移出 Flow 目录后，移除对应卡片与相关边。
- 常规同步依赖现有文件/集合操作事件；打开 Flow Tab 时仍要做一次 **reconcile**，处理崩溃、漏事件和文件系统外部修改。

### 2.3 主流程结构

画布存在两个不可删除的特殊节点：`Start` 与 `End`。

合法执行链：

```text
Start → Request → Request → End
```

- `Start` 和 `End` 都要持久化位置。
- 仅允许以下边：`Start → Request`、`Request → Request`、`Request → End`。
- 首版不允许分叉、合流、自连接或环。
- Start 最多一条出边；End 最多一条入边；主链中的 Request 恰好一入一出。
- Flow 可包含未连接的 Request 卡片：它们不报错、不执行，用于暂存或待编排请求。
- 若存在多组独立链，只能识别唯一 Start→End 主链；其他链不参与执行，应在 UI 中体现为未接入主流程。
- 编辑态允许断链和不完整图；保存不阻塞。运行前严格校验并阻止执行。

### 2.4 节点与边持久化协议

> `flow.steps` 不再作为主模型。New Flow 未上线，**无需兼容旧 steps**。

推荐 YAML 结构：

```yaml
info:
  name: supplier-flow
  type: flow
flow:
  nodes:
    - id: start
      type: start
      position:
        x: 80
        y: 200

    - id: step_01H...
      type: request
      requestUid: req_...
      requestPath: login.bru
      alias: 登录
      position:
        x: 320
        y: 200
      inputs: []

    - id: end
      type: end
      position:
        x: 920
        y: 200

  edges:
    - id: edge_start_login
      source: start
      target: step_01H...

    - id: edge_login_end
      source: step_01H...
      target: end
```

规则：

- `stepId`（`node.id`）系统生成、稳定、不可编辑，供 Flow 表达式引用。
- `requestUid` 与 `stepId` 必须分离。
- `requestUid` 是请求身份；`requestPath` 为 Flow 根目录相对路径，用于文件定位、恢复与同步。
- `alias` 可选；为空时显示请求名称。
- `position` 保存画布位置。
- 边 ID 可系统生成，必须稳定且唯一。

### 2.5 卡片输入映射

执行每张 Request 卡片之前，先解析卡片输入映射；映射结果只作为该次请求的 runtime variables 注入。

Flow 来源：

```json
{
  "name": "supplierId",
  "source": {
    "kind": "flow",
    "expression": "{{$flow.step_01H.body.items[0].id}}"
  }
}
```

字面量来源：

```json
{
  "name": "retryCount",
  "source": {
    "kind": "literal",
    "value": 3,
    "valueType": "number"
  }
}
```

规则：

- 每张卡片可有零条或多条输入映射。
- 映射变量名允许任意**非空**字符串，包括 `$flow...`；不应以名称前缀做静态拒绝。
- 来源只有两种：`flow` 和 `literal`。
- `flow` 来源必须是完整单一表达式，首版不支持混合文本模板：
  - 有效：`{{$flow.step_01H.body.user.id}}`
  - 有效：`{{$flow.last.body.token}}`
  - 无效：`token-{{$flow.step_01H.body.id}}`
- `literal` 支持字符串、数字、布尔、JSON 对象、JSON 数组、`null`；JSON 必须合法。
- Flow 求值保留原始类型，不强制转字符串。
- Flow 表达式在**卡片输入映射**中有专用语义，优先从本次 Flow 运行上下文读取。
- 映射解析失败时，不执行当前请求，当前节点失败，Flow 停止，后续主链节点标记为 `skipped`。
- 输入映射默认必填；首版不提供可选、默认值或类型转换。

#### Flow 表达式

支持：

```text
{{$flow.<stepId>.body...}}
{{$flow.last.body...}}
```

- `<stepId>` 指稳定节点 ID，而不是 alias 或请求文件名。
- `last` 是线性流的虚拟 ID，永远指向当前主链中上一个卡片，**不因成功/失败改变指向**。
- `last` 只适用于单前驱线性链；未来多前驱时应废弃或重新定义。
- 失败节点若收到 HTTP 响应 body，仍要保留在本次运行态，以便未来扩展/诊断；首版因失败即停止而不会执行下游。

### 2.6 Request 变量边界

- Flow 响应 **不会自动**写入普通 Request 的变量上下文。
- 只有卡片输入映射声明接收的值，才作为当前 Request 的 runtime variables 注入。
- Request 内仍使用现有变量插值，例如：

```text
{{supplierId}}
```

- 卡片输入变量仅对当前卡片执行生效，不自动传给后续卡片。
- Flow 运行使用当前 Collection 选中的环境。
- 不能对 Request 内容中 `{{$flow...}}` 进行前缀式静态禁止：若现有环境/Collection/Request/runtime 变量中确实定义了相同键，必须遵循已有插值逻辑正常解析。能否解析取决于上下文是否有值，而不是变量名是否以 `$flow` 开头。
- Flow 专属的结构化上下文只应在“卡片输入映射求值”阶段显式提供；Request 执行器本身保持无感。

### 2.7 运行与取消

执行调度位于 **Renderer**：

1. 严格校验图和主链。
2. 生成唯一 `flowRunId`。
3. 从 Start 沿唯一主链依序执行到 End。
4. 执行每张卡片前解析输入映射。
5. 映射值作为 runtime variables 调用现有单请求执行入口。
6. 取最终响应 body，保存进本次运行上下文。
7. 实时更新节点状态，继续下一节点。
8. End 到达后完成运行。

状态：

```text
idle → queued → running → success
                       ├→ failed
                       ├→ cancelled
                       └→ skipped
```

- 失败即停止：HTTP 4xx/5xx、网络错误、超时、变量映射错误均可使 Flow 停止。
- 当前 Flow 禁止并发运行。
- 暂不支持从中间节点继续。
- Request 的 pre-request/post-response 脚本照常运行；脚本内部 `bru.runRequest` 的嵌套请求不写入 Flow 上下文。
- 取消必须真正取消当前网络请求，而不只是停止后续调度。
- 优先复用现有单请求取消能力；如现有链路无法承载取消信号，再扩展 IPC/执行器。
- 取消时当前节点标记为 `cancelled`，主链尚未执行节点标记为 `skipped`；取消前已收到的 body 可保留作诊断。

### 2.8 Flow 运行态与 Timeline

运行态不写回 Flow 文件，仅保留在当前 Flow Tab 的内存/Redux 状态中：

```js
{
  [stepId]: {
    status: 'success' | 'failed' | 'cancelled' | 'skipped',
    body,
    duration,
    error
  }
}
```

- 关闭 Flow Tab 后丢弃。
- JSON 响应 body 保存对象/数组；文本保存字符串；空 body 为 `null`；二进制首版不作为可用 Flow 输出。
- 失败响应若有 body 也保存。
- 未执行、取消且无响应、跳过节点没有可用 body。
- 每个 Flow 步骤继续写入 Collection timeline，并带上：

```js
{
  flowRunId,
  flowUid,
  stepId,
  requestUid
}
```

- `flowRunId` 每次运行都重新生成；不可复用 Flow UID。

### 2.9 UI

- 使用 `@xyflow/react` 实现 Flow 画布。
- FlowTab 替换占位页。
- 卡片至少显示：请求名称/alias、请求类型、执行状态、耗时、HTTP 状态码、错误摘要。
- 卡片至少提供：编辑请求、复制、删除、选择/配置入口。
- 画布右侧卡片配置面板负责：alias、输入映射（变量名、来源类型、表达式/字面量、字面量类型和值）。
- Request 编辑仍由独立的现有 Request Tab 承担。
- 支持拖动、连线、删除边、自动布局、运行状态视觉反馈。
- 新建/复制/外部移入请求时分配不重叠的默认位置；不得自动连线。
- 提供自动布局按钮；平时保留用户手工布局。
- Start/End 参与布局但不可删除。
- Flow 顶部显示运行、取消、校验错误汇总；错误必须同时标记具体卡片或边。

## 3. 推荐实施顺序

> 不要先做完整 UI。先把数据协议、纯函数和可测试的执行逻辑建立起来。

### 阶段 1：摸清现有契约并建立类型/纯函数

1. 在开始修改前核实：
   - Request UID 的生成、复制、移动、删除 action/IPC 入口；
   - 现有 request cancellation 机制和事件；
   - runtime variables 从 Renderer 传到 Main 的准确参数形态；
   - Flow 配置更新现有 autosave/draft/snapshot 机制的接入方式。
2. 设计 Flow 图 helper：
   - 生成 Start/End、step ID、edge ID；
   - 线性主链解析；
   - 图校验；
   - 未接入节点识别；
   - Flow 表达式语法校验与求值；
   - 输入映射解析；
   - 节点/请求 reconcile。
3. 为这些纯函数先写 Jest 单测。

### 阶段 2：存储格式与创建

1. 将新 Flow 初始数据改成包含 `nodes`（Start/End）和 `edges` 的 `flow` 模型。
2. 调整 YAML/BRU Flow parse/stringify：读写 `flow.nodes` 与 `flow.edges`。
3. 不做旧 `steps` 迁移；对缺失字段使用合理空值/新建默认值，避免打开空 Flow 报错。
4. 让更新 Flow 图配置能够触发既有持久化机制。
5. 测试 YAML/BRU round-trip。

### 阶段 3：请求文件事件同步与 reconcile

1. 找出集合请求新增、复制、移动、删除完成后的真实事件/Redux action。
2. 当目标父节点为 Flow 时：
   - 新增/复制/移入：添加未连接 Request 节点（若尚不存在）。
   - 删除/移出：移除节点和关联边。
3. 打开 Flow 时执行 reconcile：
   - Flow 目录中存在、但图中没有的 Request，补建未连接节点；
   - 图中引用、但文件不存在的 Request，按设计决定移除节点或显示缺失状态。讨论中前后出现过两种表述；建议实现前确认现有事件能否可靠区分“真实删除”和“暂时无法挂载”。默认推荐：reconcile 对确实不存在的文件移除节点和边，以保证“一文件一卡片”。
4. 确保删除卡片会走现有 Request 删除逻辑，避免只删图不删文件。
5. 为同步路径写 slice/action 单测。

### 阶段 4：React Flow 画布

1. 安装 `@xyflow/react`，更新 `packages/bruno-app/package.json` 和根 `package-lock.json`。
2. 替换 `FlowTab` 占位页，接入 React Flow 的 nodes/edges。
3. 实现自定义 Start、End、Request 卡片节点。
4. 实现拖动位置保存、边增删、非法连线即时拒绝、选中节点。
5. 实现右侧面板与输入映射编辑。
6. 实现默认布局与自动布局按钮。
7. 对关键 UI 交互写 React Testing Library 测试；E2E 只保留核心路径。

### 阶段 5：Flow 执行器

1. 新增 Flow Tab/Redux 运行态，确保可序列化。
2. 从 Start 解析唯一主链，忽略未接入卡片。
3. 为每次运行生成 `flowRunId`，阻止同一 Flow 并发。
4. 在执行前解析 mappings，按专用 Flow 上下文得到 runtime variables。
5. 最小改造现有 `sendRequest` 或抽取可复用的请求执行 thunk，使 Flow 可传入 runtime variables、运行元数据及取消句柄。
6. 收集响应 body、状态、耗时、错误并实时更新 Flow 节点。
7. 引入/复用真正的取消通路。
8. 不把 Flow 运行态写回文件。

### 阶段 6：Timeline 与端到端验证

1. 给每个 Flow 请求 timeline 事件附加 `flowRunId`、`flowUid`、`stepId`、`requestUid`，同时不破坏普通请求 timeline。
2. 覆盖成功、HTTP 失败、网络失败、映射失败、取消、未连接节点忽略。
3. 用 Playwright Electron 覆盖至少一条 `A → B`：A 返回 JSON body，B 映射 A 的 body 字段并在 URL/Body/Headers 中使用 `{{localVar}}`。

## 4. 建议的测试矩阵

### 4.1 纯函数 / 单元测试

- 新 Flow 初始化有且仅有 Start / End 节点，无边。
- 节点 ID、边 ID 唯一。
- 合法 `Start → A → B → End` 解析出正确顺序。
- 无 Start→End 路径、断链、环、自连接、分叉、合流、Start 多出边、End 多入边均被阻断。
- 未连接节点不参与主链、不阻断合法主链执行。
- `{{$flow.<stepId>.body.a[0].b}}` 解析正确。
- `{{$flow.last.body...}}` 指向静态直接前驱。
- 不完整/混合 Flow 表达式被拒绝。
- `literal` 的 string/number/boolean/object/array/null 正确保留类型。
- 映射失败时返回携带变量名、表达式、节点 ID 的可定位错误。
- runtime variables 优先级与现有机制兼容，且不持久化。
- reconcile 新增/删除/移动请求与图节点同步正确。

### 4.2 Redux/执行器测试

- 顺序执行主链，状态按 queued/running/success 更新。
- Request 成功 body 写入运行上下文，下游获取映射值。
- HTTP 4xx/5xx、网络错误、映射错误终止后续并标记 skipped。
- 未连接卡片不被调用。
- 重复执行生成不同 flowRunId。
- 同一 Flow 并发被拒绝。
- 取消信号取消当前请求，当前标记 cancelled、后续标记 skipped。
- Flow 状态关闭 Tab 后清理，不写入 Flow 文件。
- Timeline 事件含 Flow 元数据，普通请求 timeline 不受回归影响。

### 4.3 Playwright E2E

- 新 Flow 的 Start/End、目录请求卡片显示。
- 连线并自动保存，重新打开仍存在。
- A 返回 JSON；B 配置 `localId ← {{$flow.<A-stepId>.body.id}}`；B 的请求中使用 `{{localId}}`，断言实际请求收到正确值。
- 存在未连接请求时，仅主链节点执行。
- A 失败后 B 显示 skipped。
- 取消运行时当前卡片 cancelled、后续 skipped（若稳定测试基础设施允许）。

## 5. 风险与必须先验证的事实

1. **运行时变量注入 API**：不要假设 `sendRequest` 已经可以接收外部 runtime variables。先读其完整调用链和 Main IPC 参数，找到最小侵入的注入点。
2. **请求取消能力**：先验证单请求是否已有可从 Renderer 调用的取消 API。若没有，明确设计 request/run ID 与 AbortController 的传递，避免 UI 假取消。
3. **请求文件事件**：先追踪新增、复制、移动、删除到底在哪个 action/IPC 成功后更新 collection tree；不要仅靠 UI 层猜测。
4. **Flow 更新持久化**：检查 draft/autosave/snapshot 机制，确保仅编辑配置写回 `flow.yml`，运行态不会触发保存。
5. **文件删除语义**：现有删除 action 是否有确认框、回收机制或批量行为；Flow 删除卡片必须复用它而非手写文件删除。
6. **React Flow 与 React 19**：安装前确认要选的 `@xyflow/react` 版本对 React 19 兼容，并使用 npm 更新 lockfile。
7. **表达式精确 key**：映射变量名允许 `$flow...` 和含非标识符字符。复用通用插值前需验证其对“精确 key”和 lodash 深路径的优先级，避免 `$flow.custom` 被误拆为对象路径。
8. **请求类型范围**：HTTP/GraphQL 是首要范围。现有执行器对 gRPC/WS/SSE 有独立路径与限制；实现前明确首版是否只允许 HTTP/GraphQL 节点，或对其他类型显示不可执行/跳过。不要默默让它们表现不一致。
9. **响应 body 来源**：确认主进程回传结构中 JSON、文本、错误响应、Buffer/Base64 的准确字段，做明确标准化后才写入 Flow 运行态。
10. **节点缺失 reconcile 策略**：产品已明确目录中的每个请求对应卡片、删除卡片会删文件。对“图有节点但文件没了”应尽量由事件实时移除；打开时 reconcile 的最终行为需基于现有挂载可靠性确定并补单测。

## 6. 不应做的事项

- 不要把 Flow 运行结果、body、状态或 timeline 直接写进 `flow.yml`。
- 不要在 Request 内容中通过 `$flow` 前缀静态禁止插值。
- 不要让上游 body 自动泄漏到所有后续 Request；只能经卡片输入映射注入。
- 不要复制或重写现有完整 Request 编辑器；卡片只打开现有 Request Tab。
- 不要为了首版线性流放弃 nodes/edges 图模型。
- 不要把未连接卡片视为执行错误。
- 不要让复制卡片隐式复制输入映射或自动接入主链。
- 不要在未确认现有取消机制前实现“仅 UI 状态变化”的伪取消。
- 不要破坏现有目录型 Flow 的创建、挂载、删除行为。

## 7. 建议下一上下文使用的技能

- 不需要专门 Slash Skill 才能实施。
- 若需要浏览器/Electron 端到端验证，使用 `/playwright-cli`。
- 若需要把实施方案再次压力测试，可使用 `/grill-me`；但本设计已达成一致，除非新发现代码约束，否则不要重复访谈。
- 实施前应先使用计划模式并只读探索精确调用链，再请求批准进行多文件修改。