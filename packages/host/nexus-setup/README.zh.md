---
description: "应用内 NEXUS 设置的主机半边：以两个 webServer 路由报告文件夹是否为 NEXUS 项目，并通过内置的 NEXUS CLI 完成初始化。"
kind: "package-reference"
---

# @deepseek-ai/dsh-host-nexus-setup

[English](README.md) | 中文

## 概述

使用 `dsh-host-nexus-setup`，让从不打开终端的用户也能一键把文件夹变成 NEXUS 项目。它提供一个状态路由和一个初始化路由；初始化在进程内调用内置的 `@nexus-framework/cli` 生成器，从不执行 shell 命令。[浏览器提示](../../client/ui-nexus-setup/README.zh.md)与桌面欢迎窗口都调用这些路由。所有请求都需要部署的浏览器认证和主机来源信任检查。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在带有 `webServer` 与 `connection` 的组合中挂载本包，通常与 [`dsh-client-ui-nexus-setup`](../../client/ui-nexus-setup/README.zh.md) 并排。本包不接受配置。

```yaml
- name: '@deepseek-ai/dsh-host-nexus-setup'
```

| 路由 | 方法 | 应答 |
|---|---|---|
| `/nexus-setup/status?path=<绝对文件夹路径>` | GET | `{ path, state }`，`state` 为 `ready`（已有 `.nexus/`）、`needs-setup` 或 `missing` |
| `/nexus-setup/init`，请求体 `{ "path": "<绝对文件夹路径>" }` | POST | `{ path, state: 'ready', created }`；`.nexus/` 已存在时 `created` 为 false |

初始化会写入 `.nexus/` 以及 CLI 的 `nexus adopt` 写入的 AI 指引文件（`AGENTS.md`、`CLAUDE.md`、`.cursorrules` 等），不会改动源代码。错误应答为 `{ code, message }`，`code` 为 `bad-request`（400）、`not-found`（404）、`unsupported-media-type`（415）、`payload-too-large`（413）或 `init-failed`（500）。路由路径与载荷类型以浏览器安全的 `./shared` 子路径发布。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

[`src/scaffold.ts`](src/scaffold.ts) 读取文件夹状态并调用 CLI 导出的 `adoptProject`。不使用 CLI 的 `adoptCommand`，因为它会交互提问并调用 `process.exit`；其项目探测器不在包的公开导出中，因此本包自行探测生成器读取的少量信息（名称、框架、测试框架、包管理器）。CLI 在首次初始化时才惰性加载，主机启动不会载入它。同一规范化路径的并发初始化请求会合并为一次执行。

</details>

-----

<a id="model-experience"></a>
## 模型体验

无，这些路由是用户操作；在此完成设置的文件夹之后会获得 [`nexus-brain-context`](../../experimental/nexus-brain-context/README.zh.md) 的环境上下文。

#### KV Cache 影响

无；本包既不组装也不发送模型请求。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **设置时不进行访谈。** 生成的文档以模板状态开始；NEXUS 引导访谈之后由智能体进行。
- **项目探测是 CLI 的子集。** monorepo 与非 Node 框架的探测保持生成器默认值。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

计划：`.nexus/plans/in-app-onboarding-for-non-technical-users.md`。

</details>

**运行时不变量：** 不发布伴随包。插件以 fiber 作用域的 effect 注册两个路由；除进行中的初始化 promise 外不持有状态。
