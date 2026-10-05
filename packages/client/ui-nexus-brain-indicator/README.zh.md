---
description: "Web NEXUS Brain 状态标签与计划标签页：在会话头部如实显示会话所在文件夹的状态，并在右侧栏显示活跃计划。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-nexus-brain-indicator

[English](README.md) | 中文

## 概述

本包在 Web 会话头部添加「Nexus」状态标签，在右侧栏添加「Nexus 计划」标签页。状态标签只显示有依据的状态：不是 NEXUS 项目的文件夹显示「尚无 NEXUS Brain」，点击会打开 [`dsh-client-ui-nexus-setup`](../ui-nexus-setup/README.zh.md) 的「设置 NEXUS」对话框；NEXUS 项目在某一轮带上它的上下文之前显示「Brain 已就绪」，之后标签显示该上下文中的计划、分支与漂移。标签页根据同一上下文列出活跃计划的清单。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在 Web 组合中挂载本插件；本行不接受配置。请同时挂载 [`dsh-client-ui-nexus-setup`](../ui-nexus-setup/README.zh.md) 与 [`dsh-host-nexus-setup`](../../host/nexus-setup/README.zh.md)，以便标签在任何一轮之前读取文件夹状态；缺少它们时，标签在某一轮带上 NEXUS 上下文之前显示「状态未知」。

| 标签 | 时机 |
|---|---|
| 加载图标，无文字 | 正在读取文件夹状态 |
| 「尚无 NEXUS Brain」 | 文件夹没有 `.nexus/`；点击打开设置对话框 |
| 「Brain 已就绪」 | 文件夹有 `.nexus/`，但还没有任何一轮带上它的上下文 |
| 「Brain: 已同步」/ 计划编号 | 最近一轮带上了 NEXUS 上下文，且工作区干净 |
| 「Brain: 存在漂移」 | 最近一轮报告了未提交的改动 |
| 「状态未知」 | 没有文件夹，或主机无法报告文件夹状态 |

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

一个纯函数（[`src/client/brain-status.ts`](src/client/brain-status.ts)）决定标签状态。轮次上下文优先：标签解析会话聊天中最新的 `nexus-brain-context` 节点。在这样的一轮之前，由可选的 `nexusSetup` 服务提供的文件夹阶段决定。一个中继（[`src/client/setup-link.ts`](src/client/setup-link.ts)）通过 inject 的 `hooks` 隔间给标签一个稳定的可观察源，无论该服务是否已加载。中继通过 `ctx.inject(['nexusSetup'], …)` 绑定服务，并在服务到达后重新发起此前请求过的状态读取。设置成功会通过同一个源重新发布文件夹阶段，因此标签无需轮询，也无需等待下一轮，就会显示「Brain 已就绪」。标签通过服务的 `openDialog` 打开设置对话框，对话框仍归 `dsh-client-ui-nexus-setup` 所有。

</details>

-----

<a id="model-experience"></a>
## 模型体验

无，标签与标签页是浏览器界面元素，只读取其他包注入的上下文；这里的内容不会进入模型请求。

#### KV Cache 影响

无；本包既不组装也不发送模型请求。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **每个页面只读取一次文件夹状态。** 在应用外创建的 `.nexus/`（例如在终端运行 `nexus init`）会在下一轮带上 NEXUS 上下文时显示，或在重新加载后显示。
- **计划标签页的勾选只在本地生效。** 在标签页中勾选步骤只改变标签页的显示；计划文件通过智能体的 NEXUS 工具更新。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

计划：`.nexus/plans/in-app-onboarding-for-non-technical-users.md`。

</details>

**运行时不变量：** 不发布伴随包。插件注册一个词典 effect、一个侧栏标签类型、三个 slot 条目和一个绑定服务的子 fiber，全部随插件 fiber 移除；[`tests/plugin.client.spec.ts`](tests/plugin.client.spec.ts) 证明其移除。
