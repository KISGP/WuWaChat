# WuWaChat

<div align="center">

![](https://raw.githubusercontent.com/KISGP/WuWaChat/main/resources/icon.png)

“飞讯是先行公约为终端开发的远程通讯程序，生活在索拉里斯的人们可以用飞讯互相联系。”

一款根据《鸣潮》内的飞讯设定构建的桌面聊天应用，支持角色会话、模型配置与记忆检索。

</div>

## 开发计划

https://github.com/users/KISGP/projects/9

## 功能概览

WuWaChat 基于 Electron、React 和 TypeScript 构建，提供在本地桌面环境中管理角色聊天、模型连接和记忆能力的功能。

- 内置角色资源加载，支持从本地读取角色头像和卡面，并从用户数据目录读取可编辑 Prompt。
- 支持多轮会话与会话切换，聊天状态会在本地持久化保存。
- 支持配置 OpenAI 和 DeepSeek 等模型，可测试连接并切换当前使用模型。
- 支持直接编辑角色 Prompt，便于调整角色表达方式与行为边界。
- 支持世界资料检索与角色记忆检索，可按需启用字符串模式或向量模式。
- 支持本地与云端 Embedding 配置，包含本地模型下载、选择和兼容性检查能力。
- 提供日志查看与基础设置界面，便于排查模型连接、IPC 和记忆任务问题。

## 页面预览

<table align="center">
	<tr>
		<td><img src="https://raw.githubusercontent.com/KISGP/WuWaChat/main/docs/1.png" width="420" /></td>
		<td><img src="https://raw.githubusercontent.com/KISGP/WuWaChat/main/docs/2.png" width="420" /></td>
	</tr>
	<tr>
		<td><img src="https://raw.githubusercontent.com/KISGP/WuWaChat/main/docs/3.png" width="420" /></td>
		<td><img src="https://raw.githubusercontent.com/KISGP/WuWaChat/main/docs/4.png" width="420" /></td>
	</tr>
</table>

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
${userData}/app-data  用户设置、会话、日志、记忆库、本地模型与角色 Prompt
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
