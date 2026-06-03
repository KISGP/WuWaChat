# WuWaChat

一款围绕《鸣潮》角色设定构建的桌面聊天应用，支持角色会话、模型配置与记忆检索。

WuWaChat 基于 Electron、React 和 TypeScript 构建，面向希望在本地桌面环境中管理角色聊天、模型连接和记忆能力的用户。项目当前已经包含角色资源加载、多轮会话、Prompt 编辑、模型配置、记忆检索和桌面端打包链路，定位清晰，适合继续迭代为稳定的角色聊天工具。

## 功能概览

- 内置角色资源加载，支持从 `resources/chars` 读取角色头像和卡面，并从用户数据目录读取可编辑 Prompt。
- 支持多轮会话与会话切换，聊天状态会在本地持久化保存。
- 支持配置 OpenAI 和 DeepSeek 模型档案，可测试连接并切换当前使用模型。
- 支持直接编辑角色 Prompt，便于调整角色表达方式与行为边界。
- 支持世界资料检索与角色记忆检索，可按需启用字符串模式或向量模式。
- 支持本地与云端 Embedding 配置，包含本地模型下载、选择和兼容性检查能力。
- 提供日志查看与基础设置界面，便于排查模型连接、IPC 和记忆任务问题。

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动开发环境

```bash
npm run dev
```

### 构建应用

```bash
npm run build
```

### 打包不同平台

```bash
npm run build:win
npm run build:mac
npm run build:linux
```

## 使用说明

1. 运行 `npm run dev` 启动桌面应用。
2. 在设置页的模型相关选项中配置服务提供商、`baseUrl`、API Key 和模型名称。
3. 选择角色并开始会话，应用会按当前模型档案发起聊天请求。
4. 如果需要调整效果，可以继续修改 Prompt、记忆设置、背景或查看日志。

## 项目结构

```text
src/main      Electron 主进程，负责窗口、IPC、模型运行时、设置与记忆服务
src/preload   预加载桥接层，向渲染器暴露安全的 API
src/renderer  React 界面与设置面板
src/shared    跨进程共享的类型与配置模型
resources     内置角色资源、世界资料、图片与 embedding 清单
userData/app-data  用户设置、会话、日志、记忆库、本地模型与角色 Prompt 覆盖
```

## 技术栈

- Electron
- React
- TypeScript
- electron-vite
- Tailwind CSS
- LangChain / LangGraph
- OpenAI 与 DeepSeek 模型接入
- Hugging Face Inference 与 Transformers.js 本地 Embedding 能力

## 当前状态

- 项目当前以本地桌面使用为主，角色资源也以内置内容为主。
- 记忆检索和向量能力依赖额外的 Embedding 配置，首次使用前通常需要先完成模型或索引准备。
- 模型配置中的敏感信息已按现有逻辑使用 Electron `safeStorage` 优先处理，不建议绕开这套存储方式。
- 仓库目前没有完整的自动化测试体系，主要依赖 `typecheck`、`lint` 和手动验证。

## 开发补充

- 渲染器侧调用 Electron 能力时，应通过预加载层暴露的 API 访问，不直接在组件中使用 Node 或 Electron 接口。
- 如果修改了预加载层暴露的 API，记得同步更新 `src/preload/index.ts` 和 `src/preload/index.d.ts`。
- IPC 处理器集中注册在主进程的 `src/main/ipc.ts`，新增跨进程能力时建议保持这一结构。
- 模型配置、会话和记忆相关能力都已形成相对清晰的模块边界，新增功能时优先沿用现有边界扩展。

## 常用命令

```bash
npm run lint
npm run typecheck
npm run start
npm run format
```

如果你希望把它继续打磨成更完整的可分发应用，下一步通常会是补充截图、整理角色资源、完善安装说明，以及增加基本的发布信息。
