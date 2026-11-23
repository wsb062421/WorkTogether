# 团队协作智能体演示系统 A/B 开发计划

编制日期：2026 年 11 月 23 日

## 一、本轮开发目标

本轮目标是完成一个可以现场操作、能够证明关键技术可行的预立项演示系统，不建设完整产品。系统需要在一个小型 Python 演示仓库上，完成需求确认、模型生成计划、任务执行、代码检查、需求变更影响和中断交接的主流程。

演示时在一台电脑上打开两个成员窗口。两个窗口共享同一份本地状态，其中一人的操作能够在另一窗口看到。系统使用真实的本地数据库保存状态，调用真实 DeepSeek API 生成计划，并通过真实的文件修改和 pytest 测试展示一次开发任务。

本轮采用“一条真实主链路加少量受控模拟”的原则。开发、测试、持久化和状态关联必须真实执行；跨设备网络同步、完整 GitHub PR 流程、复杂权限系统和多人并发冲突可以使用简化实现或受控事件表示。界面必须明确标注演示能力与后续能力，避免把原型描述成完整系统。

## 二、演示验收场景

系统完成后必须能够连续完成以下步骤：

1. 成员甲创建一条需求，成员乙在另一窗口看到需求出现。
2. 成员乙确认需求，成员甲窗口同步显示确认结果。
3. 成员甲调用 DeepSeek，将已确认需求整理成任务计划。
4. 两个窗口显示计划版本、任务负责人、依赖关系和验收条件。
5. 成员乙执行一个演示任务。系统实际修改演示仓库文件并运行 pytest，保存修改前后差异、测试日志和测试结果。
6. 成员甲修改一条需求，系统列出受影响的任务、代码文件和已经通过的历史测试。
7. 成员乙模拟异常掉线，任务进入“等待交接”状态。
8. 成员甲在交接页面看到已完成工作、待办事项、关联需求和测试证据，并选择继续处理。
9. 系统完成一次简化评审和合并状态更新，完整操作链路能够在历史记录中回放。
10. 关闭应用并重新打开后，项目、需求、任务、测试结果和交接记录仍然存在。

上述十步全部走通，才认为演示系统达到现场使用标准。

## 三、本轮范围

### 3.1 必须实现

- Electron 桌面应用基础工程。
- React 与 TypeScript 界面。
- 两个成员窗口共享同一本地状态。
- 本地 SQLite 持久化，或经过 A 验证后使用等价 SQLite 实现。
- 需求创建、确认、修改和状态展示。
- DeepSeek 调用与结构化计划生成。
- 固定小型 Python 仓库上的一个任务执行。
- 真实文件修改、代码差异、pytest 运行与结果保存。
- 需求与任务、代码、测试记录的关联和影响分析。
- 中断、交接和恢复。
- 简化评审与合并状态。
- 演示数据一键重置、失败提示和离线备用结果。

### 3.2 可以使用简化实现

- 两名成员在一个 Electron 主进程下打开两个窗口，不建设真实跨设备网络。
- 成员身份使用本地预设账号，不接入 GitHub OAuth。
- 使用本地 bare Git 仓库模拟远端，不调用 GitHub API。
- 使用一个固定演示项目和一项预定开发任务。
- 评审和合并不执行真实远端 PR，只在本地生成操作记录和合并提交。
- 模型调用失败时使用明确标注的离线备用计划，不假装为实时模型结果。

### 3.3 本轮不实现

- 2 至 6 人跨设备实时网络同步。
- GitHub OAuth、Issue、PR、评论和分支保护。
- 任意仓库、任意语言和任意复杂任务的自主开发。
- 多智能体自由编排。
- 完整角色权限与组织管理。
- 崩溃恢复后的分布式一致性协议。
- 正式实验任务集、统计分析和论文结果。
- 安装包签名、自动升级和正式发布。

上述排除项应在答辩中明确标记为后续研究内容。

## 四、推荐技术架构

### 4.1 技术栈

| 部分 | 建议 |
|---|---|
| 桌面外壳 | Electron |
| 开发语言 | TypeScript |
| 界面 | React + Vite |
| 本地数据 | SQLite。优先验证 better-sqlite3；若 Electron ABI 影响进度，可在相同存储接口下改用 sql.js |
| 进程通信 | Electron IPC + preload contextBridge |
| 模型 | DeepSeek OpenAI 兼容接口 |
| 演示项目 | Python 与 pytest |
| 代码版本 | 本地 Git，可选本地 bare remote |
| 单元测试 | Vitest |
| 端到端检查 | 固定演示脚本，必要时增加 Playwright |

### 4.2 进程职责

Electron 主进程是唯一的数据与执行中心，负责：

- 打开和管理两个成员窗口。
- 读写 SQLite。
- 调用 DeepSeek。
- 修改演示仓库。
- 运行 Git 和 pytest。
- 记录操作事件并向所有窗口广播状态变化。

渲染进程只负责显示和用户操作，不能直接访问文件系统、数据库、API 密钥或子进程。渲染进程通过 preload 暴露的窄接口访问主进程。

### 4.3 推荐目录

```text
WorkTogether/
  src/
    main/                 # A：Electron 主进程
      ipc/
      services/
      storage/
      windows/
    preload/              # A 维护，B只使用
    renderer/             # B：界面与交互
      pages/
      components/
      styles/
      data/               # B 的UI测试数据
    shared/               # A/B共同维护
      contracts.ts
      types.ts
      fixtures.ts
  demo-repo/              # A/B共同准备，A负责执行
  tests/
  scripts/
  package.json
```

### 4.4 数据模型

主状态至少包含以下实体：

| 实体 | 必要字段 |
|---|---|
| Project | id、名称、仓库路径、当前计划版本、状态 |
| Member | id、名称、显示角色、在线或中断状态 |
| Requirement | id、标题、内容、提出者、确认人、状态、版本、更新时间 |
| Plan | id、版本号、状态、生成来源、创建人、确认人、创建时间 |
| Task | id、标题、目标、负责人、状态、依赖、验收条件、关联需求 |
| CodeLink | id、taskId、文件路径、分支、commit、说明 |
| Decision | id、对象类型、对象ID、动作、操作人、依据版本、时间 |
| TestResult | id、taskId、命令、退出码、日志路径、是否通过、时间 |
| Handover | id、taskId、原负责人、接替人、已完成、待办、证据、时间 |
| Event | id、类型、对象ID、摘要、成员、时间、版本 |

### 4.5 状态约束

需求状态使用：

- `proposed`：已提出，尚未生效。
- `confirmed`：已确认，可作为计划和验收依据。
- `rejected`：已否决。
- `changed`：已修改，正在等待相关任务重新核对。

任务状态至少使用：

- `planned`
- `ready`
- `running`
- `tests_failed`
- `waiting_review`
- `waiting_handover`
- `reviewed`
- `merged`

系统不得允许任务直接引用不存在或未确认的需求。每次状态转换都写入 Event，并保留操作成员、时间和依据版本。

## 五、共享接口契约

共享接口已于 2026 年 11 月 23 日定稿为 v1.0。完整定义、请求类型、返回类型、状态转换、错误约定和 mock 要求见《共享接口契约_v1.md》。

A 与 B 现在可以依据该契约并行开发。双方不得自行修改方法名、参数名、返回类型或状态字符串；确需调整时，按契约第十节的版本变更规则同步处理。

契约代码如下，完整实体说明以《共享接口契约_v1.md》为准：

```ts
export type MemberId = "member-a" | "member-b";

export interface TeamApi {
  getSnapshot(memberId: MemberId): Promise<AppSnapshot>;
  createRequirement(input: CreateRequirementInput): Promise<Requirement>;
  confirmRequirement(input: RequirementActionInput): Promise<Requirement>;
  rejectRequirement(input: RequirementActionInput): Promise<Requirement>;
  changeRequirement(input: ChangeRequirementInput): Promise<ImpactReport>;
  generatePlan(input: GeneratePlanInput): Promise<Plan>;
  startTask(input: TaskActionInput): Promise<PlanTask>;
  executeTask(input: TaskActionInput): Promise<TaskExecutionResult>;
  interruptTask(input: TaskActionInput): Promise<Handover>;
  resumeTask(input: ResumeTaskInput): Promise<PlanTask>;
  submitReview(input: ReviewInput): Promise<PlanTask>;
  mergeTask(input: MergeTaskInput): Promise<PlanTask>;
  resetDemo(): Promise<void>;
  openSecondMemberWindow(): Promise<void>;
  onStateChanged(listener: () => void): () => void;
}
```

接口原则：

- 所有写操作由主进程执行。
- 每次写操作校验成员身份、当前状态和依据版本。
- 成功后保存数据库、追加 Event 并广播 `stateChanged`。
- 失败返回可显示给用户的错误码和中文说明。
- B 先用 mock adapter 实现相同接口，不等待 A 完成真实服务。
- 接口结构变化必须由双方确认，并在同一天完成联调。
- `stateChanged` 只作为刷新通知，B 收到后重新调用 `getSnapshot`。
- 任务新增 `needs_recheck` 状态，需求变更后的受影响任务进入该状态。

## 六、A 的工作包

你负责 A，即系统执行闭环、数据持久化、模型调用、代码与测试执行。A 的代码主要位于 `src/main`、`src/preload` 和 `src/shared`。

### A0：工程初始化与风险验证

交付：

- 建立 Electron + React + Vite + TypeScript 工程。
- 配置开发、构建、类型检查和测试命令。
- 验证 Electron 主进程、preload 与 renderer 通信。
- 验证 SQLite 方案，必要时确定 sql.js 替代方案。
- 建立演示仓库和固定 pytest 测试。
- 建立 `.env.local` 与 `.gitignore`，禁止提交模型密钥。

验收：

- `npm run dev` 能打开窗口。
- 一个测试 IPC 调用成功返回数据。
- 数据库建表、写入、关闭、重新打开读取均成功。
- 演示仓库测试在终端可以执行。

### A1：本地状态与事件日志

交付：

- SQLite 建表、初始化、版本迁移和测试数据重置。
- Project、Member、Requirement、Plan、Task、Decision、TestResult、Handover、Event 的读写服务。
- 状态转换校验。
- 两个窗口共享同一主进程状态。
- 状态变化广播。

验收：

- 窗口甲创建需求后，窗口乙自动刷新看到。
- 未确认需求不能被正式计划引用。
- 所有写操作在 Event 中留下成员和时间。
- 关闭并重新打开应用后数据仍然存在。

### A2：计划生成服务

交付：

- DeepSeekProvider，读取 `.env.local` 中的 API Key。
- 结构化提示词，要求模型返回固定 JSON Schema。
- Zod 或等价方式校验模型结果。
- 模型结果转换为 Requirement、Task、依赖和验收条件。
- 超时、失败重试、密钥缺失和无效 JSON 的处理。
- 明确标注“实时模型计划”和“离线备用计划”。

验收：

- 输入两条已确认需求，能够生成至少三个结构化任务。
- 模型输出为空或格式错误时，界面显示错误，不写入脏数据。
- 无网络时可以使用演示备用计划继续演示。

### A3：任务执行、代码修改与测试

交付：

- 从任务读取需求、文件范围和验收条件。
- 准备固定演示任务的安全执行器。
- 保存修改前文件内容和统一 diff。
- 执行真实 pytest，保存退出码、标准输出、错误输出和耗时。
- 测试通过后更新 CodeLink、TestResult 和 Task 状态。
- 失败时进入 `tests_failed`，保留完整证据。

实现建议：

- 第一批只允许修改 `demo-repo` 中明确白名单的文件。
- 不允许模型执行任意 Shell 命令。
- 任务执行器可调用 DeepSeek 生成补丁，但补丁必须经过路径与格式校验。
- 为演示稳定性保留固定补丁备用路径，但界面必须标注当前执行来源。

验收：

- 修改前测试失败，执行任务后测试通过。
- 数据库记录代码文件、diff、测试日志和提交内容。
- 另一个窗口能看到任务状态和测试结果。

### A4：变更影响与中断交接

交付：

- 修改需求时创建新版本，不覆盖历史记录。
- 根据 CodeLink 查找受影响任务、代码文件和测试。
- 把受影响任务标记为需要重新核对。
- 中断任务时生成 Handover。
- 交接信息包含已完成、待办、关联需求、文件位置、测试证据和原负责人。
- 接替成员恢复后更新负责人并保留原记录。

验收：

- 修改需求后，系统能指出受影响任务。
- 模拟中断后，另一窗口显示交接入口。
- 接替成员能看到足够信息并继续任务。

### A5：评审、合并和稳定性

交付：

- 简化评审记录。
- 本地 Git 合并或状态合并记录。
- 演示一键重置。
- 主流程自动化测试。
- 端到端演示运行脚本。
- 技术说明和故障排查文档。

验收：

- 完整十步场景连续运行三次，至少两次无需重启成功。
- 应用重启后历史记录完整。
- 模型、数据库或仓库执行失败时有可见提示和备用路径。

## 七、B 的工作包

B 独立任务书见《B_任务说明书.md》。B 负责渲染界面、成员交互、演示场景和端到端用户流程，代码主要位于 `src/renderer`。

### B0：界面骨架与 mock adapter

交付：

- 桌面布局、导航、成员身份切换和状态栏。
- 与共享契约一致的 mock adapter。
- 项目总览、需求、计划与任务、执行证据、变更与交接页面。
- 全局错误提示、加载状态和空状态。

验收：

- 不启动后端也能通过 mock 数据操作完整页面。
- UI 不直接调用 Electron、数据库、文件系统或 DeepSeek。

### B1：需求与计划交互

交付：

- 添加、确认、否决和修改需求。
- 展示需求提出者、确认人、版本和影响提示。
- 生成计划触发按钮和生成中、成功、失败状态。
- 计划版本、任务依赖、负责人和验收条件展示。

验收：

- 用户能够从需求创建进入计划生成。
- 未确认需求有明显状态标识。
- 两个窗口状态变化时，界面平滑刷新。

### B2：任务执行与证据

交付：

- 任务开始、执行中、测试通过和失败页面。
- 模型执行来源标签。
- 修改文件、统一 diff 和 pytest 日志展示。
- 保存历史测试记录。

验收：

- 用户能看懂系统修改了什么、运行了什么、是否通过。
- 失败状态不只显示红色图标，还要给出错误原因和下一步。

### B3：变更影响与中断交接

交付：

- 需求修改后的受影响任务、代码与测试视图。
- 成员掉线和任务暂停状态。
- 交接卡片和恢复操作。
- 接替成员视图。

验收：

- 修改需求后用户能定位需要重新核对的任务。
- 接替成员无需查看开发日志即可理解继续工作的依据。

### B4：评审合并与演示体验

交付：

- 评审结果、合并操作和最终交付状态。
- 历史事件时间线。
- 一键重置演示。
- 两个成员窗口的并排演示布局或清晰切换入口。
- 答辩现场可读的字号、间距和状态颜色。

验收：

- 90 秒内能够完成主演示路径。
- 每一步都有明确反馈，不让评委猜测系统是否执行。

## 八、A/B 协作规则

### 8.1 目录所有权

- A 主责：`src/main`、`src/preload`、存储、模型、Git、测试和进程通信。
- B 主责：`src/renderer`、样式、页面交互、mock 数据和现场操作流程。
- 双方共同维护：`src/shared`、`demo-repo`、`tests`、README。
- `src/shared` 的修改必须提前通知对方，并在当天提交。

### 8.2 GitHub 仓库初始化

团队共用仓库已经创建：

```text
https://github.com/wsb062421/WorkTogether.git
```

A 负责在该仓库中首次推送可由双方使用的 `main` 分支。A 还需要确认仓库权限已正确邀请 B。第一次推送的 `main` 分支至少包含：

- 基础工程文件和依赖锁文件。
- `src/shared/contracts.ts`、`src/shared/validation.ts`。
- 《共享接口契约_v1.0》所需的共享类型。
- `.gitignore` 和 README。
- `demo-template` 的目录结构。
- 能通过的基础构建或启动说明。

这里的 GitHub 仓库用于 A/B 开发协作和源代码管理。演示系统运行时对任务代码执行的本地 Git 操作仍按本轮简化范围处理，不调用 GitHub API。

初始骨架推送到 GitHub 后，B 再克隆仓库并创建自己的开发分支。B 只需等待仓库骨架建立，不需要等待 A 完成数据库、模型或任务执行功能。

B 克隆方式：

```bash
git clone https://github.com/wsb062421/WorkTogether.git
cd WorkTogether
```

A 负责 `main` 分支的最终合并检查，并负责 `package.json`、依赖锁文件、Electron 主进程和共享字段的基础结构。B 需要新增页面依赖或修改共享字段时，先与 A 确认。

### 8.3 每日分支与 Pull Request

每天从最新 `main` 建立独立功能分支，分支名称包含日期和负责人：

```text
feature/day1-a-core
feature/day1-b-ui
feature/day2-a-planning
feature/day2-b-requirements
feature/day3-a-execution
feature/day3-b-task-ui
feature/day4-a-change-handoff
feature/day4-b-impact-review
feature/day5-a-stability
feature/day5-b-demo-polish
```

A 开始开发：

```bash
git checkout main
git pull
git checkout -b feature/day1-a-core
```

B 开始开发：

```bash
git checkout main
git pull
git checkout -b feature/day1-b-ui
```

双方可以在本地频繁提交，在完成一个可验证阶段时推送：

```bash
git add .
git commit -m "feat: add day 1 renderer skeleton"
git push -u origin feature/day1-b-ui
```

每天至少推送一次并创建 Pull Request。当天功能尚未完成时可以先创建 Draft PR，不合并到 `main`。功能满足当天验收标准后，再把 Draft PR 转为正式 PR。

每次 PR 说明必须包含：

```text
完成内容：
验证方式：
接口变化：
仍需联调：
```

### 8.4 每日合并与整合

- 功能通过 Pull Request 合入 `main`，不直接向 `main` 推送日常开发代码。
- `main` 始终保持可安装、可启动和可构建。
- 两人互相查看对方当天的 PR，重点检查接口调用、状态名称和页面数据是否一致。
- 涉及 `src/shared` 的 PR 由另一方优先检查。
- 第一天先合并 A 的基础骨架和共享接口，再合并 B 的渲染骨架。
- 后续阶段允许 B 先使用 mock 完成页面并合并，A 的真实接口接入后再次联调。
- 每次合并后，双方执行 `git pull --rebase origin main`，从最新主分支继续开发。
- 不得把长期独立分支留到最后几天一次性合并。
- 测试失败、工程无法启动或接口未说明的 PR 保持 Draft，不进入 `main`。

若双方修改同一文件，先拉取最新 `main` 并解决冲突；共享类型冲突由双方共同确认，接口变化按第 8.6 节处理。

每天结束时可以建立 `day1`、`day2` 等轻量标签，便于回退演示版本。标签只标记已经通过当天验收的 `main` 提交。

### 8.5 固定联调节奏

第一次联调：工程骨架和 IPC。

- A 证明 renderer 能调用一个真实 IPC。
- B 证明页面能显示返回数据。

第二次联调：需求和计划。

- A 接通真实数据库和模型。
- B 替换 mock adapter 中对应的接口。

第三次联调：任务执行。

- A 接通文件修改和 pytest。
- B 展示 diff、日志和状态变化。

第四次联调：变更、交接和评审。

- 两人共同跑完整十步场景。

每次联调结束必须形成一份简短记录：完成项、未完成项、接口变化、下一步和负责人。

### 8.6 接口变更规则

- 新增字段必须同时更新《共享接口契约_v1.0》、`src/shared/contracts.ts`、`src/shared/validation.ts`、mock 数据、数据库映射和界面。
- 删除字段前必须确认没有其他页面使用。
- 不允许 B 在主进程之外临时保存正式状态。
- 不允许 A 为了适配单个页面而返回未定义结构。
- mock adapter 与真实 adapter 必须实现同一接口。
- 接口变化必须在当天的四个 PR 汇报项中明确写出，并在双方完成联调后合并。

### 8.7 禁止提交的内容

以下内容不得上传到 GitHub：

- `node_modules`。
- `.env.local` 和 DeepSeek API Key。
- `.data` 中的 SQLite 数据库和运行记录。
- 运行时生成的演示仓库。
- 临时日志、测试缓存和本地编辑器配置。

## 九、五天开发安排

以下按两人全职投入估算。若为课余时间，应预留一倍以上日历时间。

### 第 1 天：GitHub 仓库与工程骨架

A：

- 使用已创建的 `WorkTogether` GitHub 仓库，推送可由双方使用的 `main` 基础工程，并邀请 B 加入仓库。
- 将已经定稿的共享接口落实为 TypeScript 类型和校验结构。
- 验证 Electron、IPC 和 SQLite。
- 建立演示 Python 仓库。

B：

- 从 A 推送的基础仓库克隆项目，创建 B 的功能分支。
- 画出五页面信息层级。
- 建立 mock adapter 和静态测试数据。
- 完成应用外壳、导航和成员切换。
- 开始需求页面。

当天整合标准：B 的页面能通过 mock adapter 显示数据；A 提供一个可调用的真实 IPC 示例。

### 第 2 天：需求、计划与持久化

A：

- 完成数据库表和需求服务。
- 接通 DeepSeek 计划生成与备用结果。
- 完成状态广播。

B：

- 接通真实需求接口。
- 完成计划生成交互和任务列表。
- 加入加载、错误和失败状态。

当天整合标准：两个窗口创建和确认需求，A 生成计划，B 页面显示。

### 第 3 天：任务执行与测试证据

A：

- 完成任务执行器、diff 保存和 pytest。
- 写入 CodeLink 和 TestResult。
- 处理执行失败。

B：

- 完成任务执行、测试结果和日志页面。
- 展示实时执行步骤。
- 完成失败状态与重试入口。

当天整合标准：点击执行后出现真实文件修改和测试通过结果。

### 第 4 天：变更、交接与评审

A：

- 完成需求新版本和影响分析。
- 完成中断、交接、恢复、评审和合并。
- 建立一键重置。

B：

- 完成变更影响和交接页面。
- 完成历史时间线和最终交付页面。
- 制作并校准 90 秒操作路径。

当天整合标准：完整十步场景首次走通。

### 第 5 天：稳定性和验收

A：

- 修复主流程缺陷。
- 自动测试关键状态转换。
- 验证模型失败、测试失败和重启恢复。
- 编写运行与排障说明。

B：

- 修复现场可读性和操作反馈问题。
- 清理页面中的无关入口。
- 固定演示数据和操作顺序。
- 进行三次完整排练。

当天整合标准：连续三次演练至少两次完全成功，失败一次可以在 30 秒内重置恢复。

## 十、测试与验收

### 10.1 A 的测试

- 数据库初始化和重启读取。
- 需求状态转换校验。
- 计划 Schema 校验。
- DeepSeek 超时与无效响应。
- 文件白名单和补丁校验。
- pytest 通过、失败和超时。
- 需求变更后的影响映射。
- 中断、交接和恢复。
- 两个窗口状态广播。

### 10.2 B 的测试

- 五页面主要状态均有对应界面。
- 加载、空数据、成功和错误状态。
- 两个成员身份下操作入口正确。
- 需求、计划、任务和交接信息容易理解。
- 1920×1080 和常见笔记本分辨率下没有遮挡。
- 键盘和鼠标操作均可完成主流程。

### 10.3 联合验收

- 两个窗口共享状态。
- DeepSeek 生成的结构化计划可见。
- 真实任务执行与 pytest 结果可见。
- 需求变更能够指出受影响任务。
- 中断后能够看到交接卡和恢复结果。
- 重启后数据存在。
- 一键重置后可以重新演示。

## 十一、风险与处理

| 风险 | 处理 |
|---|---|
| SQLite 原生模块与 Electron ABI 不兼容 | 第一天验证；失败则用 sql.js，但保留同一存储接口 |
| DeepSeek 现场网络失败 | 明确标注的备用计划；运行前缓存最近一次合法结果 |
| 模型无法稳定生成可应用补丁 | 演示任务使用白名单与固定补丁备用路径，真实模型只负责计划生成或受校验补丁 |
| A/B 接口不一致 | 先写共享类型；B 使用 mock；每天联调 |
| B 等 A 完成后才开发 | B 从第一天使用 mock adapter |
| 页面入口过多影响演示 | 只保留主流程页面，扩展功能隐藏 |
| 两个窗口状态不同步 | 所有状态由主进程维护并统一广播 |
| 任务失败导致无法继续演示 | 提供重置、重试和固定演示数据 |

## 十二、交付物

A 交付：

- 可启动的 Electron 主进程与 preload。
- 本地存储和状态广播。
- DeepSeek 计划服务。
- 演示仓库执行与 pytest 服务。
- 变更影响、交接、评审和合并服务。
- 测试与排障文档。

B 交付：

- 完整渲染界面。
- mock adapter 与演示数据。
- 两个成员窗口的交互流程。
- 变更影响和交接展示。
- 现场 90 秒演示路径。
- UI 验收记录。

双方共同交付：

- 可运行的演示系统。
- 固定演示仓库与种子数据。
- 完整十步验收记录。
- 运行说明和现场重置说明。

## 十三、答辩时的能力边界

可以说明已经真实执行：

- 需求与任务的本地持久化。
- DeepSeek 结构化计划生成。
- 两个本地窗口共享状态。
- 演示仓库的代码修改与 pytest。
- 需求版本、代码关联、测试证据和交接记录。

应明确说明尚在后续建设：

- 两台真实电脑之间的网络同步。
- GitHub OAuth、Issue 和 PR。
- 完整多人权限、并发冲突与分布式恢复。
- 任意仓库和复杂项目的自主开发。
- 正式评价任务集与实验结论。

这样既能够展示真实技术闭环，也能避免把预立项原型误讲成完整系统。
