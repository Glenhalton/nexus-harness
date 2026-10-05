---
description: "Web「设置 NEXUS」提示：会话头部的一个操作，通过主机 nexus-setup 路由一键把会话所在文件夹变成 NEXUS 项目。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-nexus-setup

[English](README.md) | 中文

## 概述

当会话所在文件夹没有 `.nexus/` 时，本包在 Web 会话头部显示「设置 NEXUS」按钮。按钮打开一个简短、易懂的对话框；点击一次即可通过 [`dsh-host-nexus-setup`](../../host/nexus-setup/README.zh.md) 完成设置，随后按钮消失。已经是 NEXUS 项目的文件夹、不存在的文件夹以及没有设置路由的主机都不显示任何内容。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在 Web 组合中与 [`dsh-host-nexus-setup`](../../host/nexus-setup/README.zh.md) 并排挂载本插件；本行不接受配置。「暂不设置」会在页面重新加载前隐藏该文件夹的按钮。设置失败时对话框保持打开，显示简短说明并可重试。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

一个页面生命周期的 controller（[`src/client/controller.ts`](src/client/controller.ts)）对每个文件夹只读取一次状态，并负责设置 POST；每个文件夹的阶段（`checking`、`needs-setup`、`setting-up`、`failed`、`ready`、`missing`、`unavailable`、`dismissed`）通过一个 snapshot store 发布，组件经 inject 的 `hooks` 隔间接收它。组件通过 `useSessions` 读取会话的 `cwd`，只在 `needs-setup`、`setting-up` 与 `failed` 阶段渲染。哪个会话的对话框处于打开状态也由 controller 保存，因此其他界面也能打开它。插件提供 `nexusSetup` 服务（`phases`、`check`、`openDialog`）；[`ui-nexus-brain-indicator`](../ui-nexus-brain-indicator/README.zh.md) 在任何一轮之前从中读取文件夹状态，并在设置成功时刷新。路由形式来自主机包浏览器安全的 `./shared` 子路径。

</details>

-----

<a id="model-experience"></a>
## 模型体验

无，提示是浏览器界面元素；这里的内容不会进入模型请求。

#### KV Cache 影响

无；本包既不组装也不发送模型请求。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **每个页面对每个文件夹只读取一次状态。** 在应用外创建的 `.nexus/`（例如在终端运行 `nexus init`）会在重新加载后隐藏按钮。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

计划：`.nexus/plans/in-app-onboarding-for-non-technical-users.md`。

</details>

**运行时不变量：** 不发布伴随包。插件注册一个词典 effect、一个 slot 条目与 `nexusSetup` 服务，HMR 安全测试证明其移除；文件夹阶段与打开的对话框只存在于 controller 的 snapshot store 中。
