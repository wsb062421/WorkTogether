# WorkTogether

面向小型开发团队的大语言模型协作开发智能体预立项演示工程。

## 当前版本

`v0.1` 基础工程包含：

- Electron 主进程、preload 和 React 渲染进程。
- SQLite 本地状态存储。
- 共享接口契约 v1.0 的 TypeScript 类型。
- 两名成员的本地窗口基础能力。
- 初始项目、成员和需求数据。
- 一个用于验证 IPC 的最小渲染页面。

本轮演示系统范围与后续研究计划见项目根目录的工作文档。

## 开发依据

- [共享接口契约 v1.0](./共享接口契约_v1.md)
- [A/B 开发计划](./协作开发原型_AB开发计划.md)
- [B 任务说明书](./B_任务说明书.md)

## 安装

```bash
npm install
cp .env.example .env.local
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env.local
```

如需真实 DeepSeek 计划生成，在 `.env.local` 中配置：

```text
DEEPSEEK_API_KEY=your-key
```

未配置时系统使用明确标注的离线备用计划。

## 开发

```bash
npm run dev
```

## 检查

```bash
npm run typecheck
npm test
npm run build
```

## 目录

```text
src/main/       Electron 主进程、存储和执行服务
src/preload/    window.teamApi 安全桥接
src/renderer/   React 渲染界面
src/shared/     共享接口与类型
demo-template/  演示 Python 仓库模板
```

## 协作

- `main` 始终保持可安装、可启动和可构建。
- A 与 B 从最新 `main` 建立每日功能分支。
- 通过 Pull Request 合并，不直接向 `main` 推送日常开发代码。
- 共享接口变更必须同步更新 `src/shared/contracts.ts` 和接口契约文档。
