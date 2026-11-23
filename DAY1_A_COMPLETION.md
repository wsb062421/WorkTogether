# Day 1 A 验收记录

日期：2026 年 11 月 23 日

分支：`feature/day1-a-core`

## 当日目标

完成 GitHub 基础工程、共享接口、Electron 安全桥接、本地状态、最小 IPC 页面和演示 Python 仓库。

## 已完成

- GitHub 仓库 `WorkTogether` 已建立，`main` 已推送基础工程。
- 已定义共享接口契约 v1.0。
- 已建立 `src/shared/contracts.ts` 和 `src/shared/validation.ts`。
- Electron 主进程、preload 和 React 渲染进程可以启动。
- 渲染层通过 `window.teamApi.getSnapshot()` 读取真实本地状态。
- 两个成员窗口可以通过主进程打开。
- SQLite 可以首次建库、读取、写入并在关闭后重新打开。
- 初始数据包含两名成员、三条需求和活动记录。
- Python 演示仓库模板已建立。
- 已提供最小 IPC 验证页面。

## 自动验证

在项目根目录运行：

```bash
npm run check
```

该命令依次执行：

1. TypeScript 类型检查。
2. Vitest 契约与 SQLite 持久化测试。
3. Electron 生产构建。

另已执行 `npm run start` 启动 Electron 应用，窗口成功打开，并生成：

- 本地 SQLite 状态数据库。
- 本地演示工作仓库。

## 给 B 的联调入口

B 从 `main` 创建 `feature/day1-b-ui` 后，可以直接：

```bash
npm install
npm run dev
```

当前渲染入口：

```text
src/renderer/src/App.tsx
```

正式接口入口：

```text
window.teamApi
```

共享类型入口：

```text
src/shared/contracts.ts
```

B 在 Day 1 使用 mock adapter 开发五页面骨架。A 已经提供真实 `getSnapshot()`、`stateChanged` 和打开第二个成员窗口的基础能力。

## 当日边界

以下能力在后续天完成：

- 需求创建、确认、否决和修改的完整页面联调。
- DeepSeek 结构化计划生成联调。
- 任务执行、pytest 和测试证据页联调。
- 变更影响、中断交接、评审合并和完整历史界面。

## 验收结论

Day 1 的 A 部分达到可交接状态。B 可以基于当前共享接口开始前端骨架和 mock adapter 开发。
