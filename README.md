# WuWaChat

## 项目简介

飞讯模拟器




## 📁 目录结构

主要由两部分构成：

- `wuwachat-server/`: Python 后端服务。
  - `/data`: 存放游戏角色设定、背景剧情及 Prompt 模板。
  - `/model`: 模型的调用代码。
  - `/utils`: 一些工具处理函数。
- `wuwachat-ui/`: Tauri 桌面端应用代码。
  - `/src`: React 前端界面，包含角色卡片、对话流、以及各种设置组件（模型设置、提示词设置）。
  - `/src-tauri`: Tauri 原生壳代码，使用 Rust 编写，负责系统级交互与打包。
- `build.ps1`: 用于一键构建和打包项目的 PowerShell 脚本。

## 快速开始

### 1. 环境准备

要进行本地开发，您需要安装以下环境：
- [Node.js](https://nodejs.org/) 
- [Rust](https://www.rust-lang.org/) 
- [Python](https://www.python.org/)
- [UV](https://docs.astral.sh/uv/)

### 2. 启动后端服务

进入后端目录，安装相关依赖并启动服务：

```bash
cd wuwachat-server

uv sync

uv run main.py
```

### 3. 启动桌面客户端

进入前端目录，安装依赖并以开发模式启动 Tauri 客户端：

```bash
cd wuwachat-ui

npm install

npm run tauri dev
```

## 📦 构建与打包

执行项目根目录下的脚本：

```powershell
.\build.ps1
```