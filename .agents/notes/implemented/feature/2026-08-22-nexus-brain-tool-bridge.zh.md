# Agent Note: 作为 Cordis 工具的 NEXUS 项目大脑工具

Status: implemented

[English](2026-08-22-nexus-brain-tool-bridge.md) | 中文

## 问题

NEXUS（`@nexus-framework/cli`）是一个独立的项目智能 CLI，它通过自己的 stdio MCP 服务器暴露 17 个工具 —— 会话握手、当前活跃计划、知识库、技能、agent 角色、doctor 漂移报告、组合上下文包。一份 NEXUS 2.0 调查得出结论：NEXUS 应当拥有项目的“意义”（计划、知识、证据），而执行引擎拥有回合、工具调用与可追溯的运行；这份调查还认为这个 harness 已经提供了缺失的执行层：插件运行时、会话/事件日志、模型路由、subagent 编排。但两者之间没有任何连接：运行在这个 harness 内的 agent 除了再调用一条独立的 stdio MCP 传输之外，没有别的办法触达 NEXUS 项目的大脑 —— 而这个 harness 自身的工具流水线、会话日志、不变式系统都看不见那条独立传输。

## 决策

`@deepseek-ai/dsh-experimental-tool-nexus-brain` 将 NEXUS 的 17 个 MCP 工具处理函数封装为原生的 `ctx.tools` 注册。为此，`@nexus-framework/cli` 新增了一个与传输方式无关的公开接口：一个 `src/mcp/index.ts` 桶文件和一个 `./mcp` 的 `package.json` 导出，重新导出 `resolveBrainContext`、`BrainContext`、`McpToolError`、全部 17 个工具函数及其类型，以及 `buildMcpServer` —— 与 `src/mcp/server.ts` 早已为 stdio 封装的那些函数完全相同，只是现在可以被直接调用了。

这个包放在 `packages/experimental/` 下（而不是新建一个 `packages/nexus/` 分组），因为它通过 `file:../../../../nexus-cli` 引用依赖 `@nexus-framework/cli` —— nexus-cli 尚未发布新的 `./mcp` 子路径 —— 而工作区约束要求 `experimental/` 之外的任何 `packages/*/*` 都必须是 `private: false` 的发布成员，且不得有本地文件依赖。`scripts/publint-all.ts` 为这个包由此产生的 `LOCAL_DEPENDENCY` 提示携带了一条范围极窄、具名的白名单条目，因为 publint 没有按包覆盖严重级别的机制，而对一个永远不会被发布的 `private: true` 包来说，这条提示也没有真实的消费者。

每个工具的 zod 输入 schema（只存在于 nexus-cli 的 `server.ts` 里，用于 MCP 传输校验）都被手工翻译成 Cordis 的 `ParameterSchemaSpec`/`ValueSchemaSpec` DSL —— 这个 harness 中不存在任何 zod→DSL 的适配器。输出 schema 分两种模式：扁平、字段不可为空的返回值（`nexus_get_plan`、`nexus_get_skill`、`nexus_get_agent`、`nexus_brief`、`nexus_plan_note`、`nexus_add_knowledge_entry`）使用显式的 `type: 'object'` schema；嵌套或字段可为空的返回值使用 DSL 的 `type: 'json'` 逃生舱（与 `packages/extensions/tool-cordis` 已有的同一逃生舱用法一致），并通过 `JSON.stringify` 渲染，与 stdio MCP 服务器已有的输出完全一致。大脑上下文只在插件 `apply()` 时从必填的 `Config.projectRoot` 解析一次，因此目标项目缺少 `.nexus/` 会在加载时就立即失败，而不是等到第一次工具调用。`src/invariant.ts` 注册了一个空的安装器，并给出包专属的理由（沿用 `packages/settings/settings-file` 的先例）：这个包不写入任何自己的持久化会话事件，因此不变式系统没有可检查的会话日志关系。

## 已考虑的替代方案

**让 NEXUS 直接内嵌 Cordis，自己成为一个 harness 插件宿主。** 已否决：这会让 NEXUS 对这个 harness 自身的概念产生运行时依赖，恰恰是 NEXUS 2.0 调查所警示的那种纠缠 —— NEXUS 本应独立于任何一个执行引擎，拥有项目的“意义”。

**只在 harness 会话内部，通过 NEXUS 现有的 stdio MCP 服务器来驱动它（类似 `dsh-tool-mcp` 的桥接）。** 目前已否决：这会让每一次 `nexus_*` 调用都留在这个 harness 自身的会话日志之外（与“模型可见 ⟺已记录”的目标正相反），并且每次调用都要多开一个进程和一条传输。直接的进程内封装以同样的成本复用了同一套底层处理函数。

**在接入这条接缝之前，先发布一个带版本号的 `@nexus-framework/cli` 正式版。** 本次已否决：这会让这条接缝被外部发布周期卡住。`file:` 依赖加上 publint 白名单条目是一个刻意为之、范围狭窄且有文档记录的取舍，而不是对本地依赖规则的普遍放宽。

## 后果

任何在这个 harness 中组合出来的 agent 会话都可以挂载 `@deepseek-ai/dsh-experimental-tool-nexus-brain`，获得与通过 stdio 接入的 NEXUS 感知编码 agent 相同的 NEXUS 项目智能，并且每次调用都会被这个 harness 的会话日志自动捕获。代价是：`@nexus-framework/cli` 的数值范围 zod 校验（`nexus_query_knowledge` 的 `limit`、`nexus_get_context` 的 `maxChars`）在 Cordis 工具 schema 中不可见 —— 底层处理函数内部已经对越界值做了截断，所以这只是 schema 可见性上的缺口，不是正确性上的缺口。在 nexus-cli 发布携带 `./mcp` 导出的版本、把这个依赖变成普通的 semver 范围之前，这个包无法从 `packages/experimental/` 中被提升出去。
