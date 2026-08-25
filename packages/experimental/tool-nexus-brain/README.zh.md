# @deepseek-ai/dsh-experimental-tool-nexus-brain

[English](README.md) | 中文

面向模型的 NEXUS 项目大脑工具 —— 将 NEXUS 的 16 个工具 MCP 接口（`@nexus-framework/cli`）直接注册到 `ctx.tools` 上，而不再经由独立的 stdio MCP 传输层。

## 功能

注册 16 个工具 —— `nexus_wake`、`nexus_get_vital_signs`、`nexus_query_knowledge`、`nexus_get_active_plan`、`nexus_list_plans`、`nexus_get_plan`、`nexus_brief`、`nexus_doctor`、`nexus_list_skills`、`nexus_get_skill`、`nexus_list_agents`、`nexus_get_agent`、`nexus_get_handoff`、`nexus_plan_tick`、`nexus_plan_note`、`nexus_add_knowledge_entry` —— 每一个都是对 `@nexus-framework/cli` 的 `./mcp` 子路径中同名处理函数的薄封装。每次调用都会经过这个 harness 真实的工具流水线（`ctx.tools.execute`），因此会被会话日志的 `tools/result` 事件自动捕获 —— 与这个 harness 中其他工具享有同样的“模型可见 ⟺ 已记录”保证，且不需要再维护第二条传输通道。

这个包本身不持有任何状态。每一次读写 —— 计划勾选、知识库条目、wake 令牌会话文件 —— 都会落到目标项目的 `.nexus/` 目录里，与通过 stdio 上的 `nexus mcp` 完全一致；这只是同一个大脑的第二个入口，不是第二个大脑。

上下文组合本身（`nexus_get_context` —— 活跃计划片段、匹配的知识/技能、生命体征，受 token 预算限制）已经从这个工具调用接口迁移到了配套包 `@deepseek-ai/dsh-experimental-nexus-brain-context` 中，该包会在每轮对话开始时自动注入同样的内容包，无需等待模型发起调用 —— 适合工具调用不可靠或不可用的 harness 配置。当模型需要能够显式索取大脑内容时使用这个包；当每一轮都应该已经具备这些内容时使用配套包。

## 配置

`projectRoot` 是必填项：目标 NEXUS 项目根目录（即包含 `.nexus/` 的目录）的绝对路径。没有默认值 —— 如果依赖该宿主进程自身的 `process.cwd()`，当这个插件运行在为另一个仓库组合的 harness 会话中时，会悄无声息地指向错误的项目。若 `projectRoot` 下不存在 `.nexus/` 目录，插件加载时（`apply` 中 `resolveBrainContext` 同步抛出）就会立即失败，而不是等到第一次工具调用时才失败。

## Schema 转换

`@nexus-framework/cli` 在自己的 MCP 边界上用 zod 校验工具输入；这个包的 `defineTool` 参数是手工翻译成 Cordis 的 `ParameterSchemaSpec`/`ValueSchemaSpec` DSL 的，并非程序化转换 —— 这个 harness 中不存在 zod→DSL 的适配器。两种输出 schema 模式覆盖了全部 16 个工具：少数扁平、字段不可为空的返回值（`nexus_get_plan`、`nexus_get_skill`、`nexus_get_agent`、`nexus_brief`、`nexus_plan_note`、`nexus_add_knowledge_entry`）使用显式的 `type: 'object'` schema；其余嵌套或字段可为空的返回值（`nexus_wake`、`nexus_get_active_plan`、`nexus_doctor` 等）使用 DSL 的 `type: 'json'` 逃生舱，并通过 `JSON.stringify` 渲染，与 stdio MCP 服务器对每个工具的既有做法一致。

## 导出形态

这是一个函数/命名空间插件：导出 `name` / `inject` / `Config` / `apply`，没有默认导出。误加的 `export default` 会在 Loader 的 `unwrapExports` 中导致模块坍塌并丢失 `inject`（参见 [docs/postmortem/0001](../../../docs/postmortem/0001-acp-default-export-drops-inject.zh.md)）。

## Model Experience

### 工具 schema

#### 模型可见内容

模型看到的是生成的 16 份 [`nexus_*` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-experimental-tool-nexus-brain)，每个 NEXUS 大脑操作对应一份，描述文字沿用了 `@nexus-framework/cli` 自身的 MCP 工具描述。

#### Token 影响

只要这些工具可见，每次请求都会有固定的 schema 开销 —— 16 份工具定义，比这个 harness 中其他大多数包注册的一两个工具要多。

#### KV 缓存影响

只要 `projectRoot` 和工具可见性不变，前缀就是稳定的；schema 不会随调用变化。

### 工具调用历史与结果

#### 模型可见内容

每次调用的结果要么是目标工具的规范 JSON 值（扁平 schema 的工具），要么是一段格式化打印的 JSON 文本块，其形态与 `nexus mcp` 通过 stdio 返回的完全一致（`type: 'json'` 的工具）。处理函数抛出的错误（例如 `nexus_plan_tick` 的步骤序号越界、未知的技能名）会以 `McpToolError` 的消息形式，经工具注册表的 `isError` 结果呈现出来 —— 与通过 stdio 调用时看到的错误文本相同。

#### Token 影响

随对应的 NEXUS 操作变化：`nexus_get_plan`/`nexus_get_skill`/`nexus_get_agent` 返回完整的 markdown 文件，可能很大；`nexus_query_knowledge` 受自身 `limit` 限制。

#### KV 缓存影响

仅追加；结果和其他工具结果一样，跟在可复用的请求前缀之后。

## 已知限制与遗留工作

- **没有写锁** —— `nexus_plan_tick`、`nexus_plan_note`、`nexus_add_knowledge_entry` 都是对普通文件做“读-改-写”循环，没有并发保护。这是继承自 `@nexus-framework/cli` 本身的行为，并非这个包引入的问题；并发调用（比如这个 harness 与针对同一个 `.nexus/` 的另一次独立 `nexus` CLI 调用同时发生）可能产生竞态。
- **工具 schema 中没有数值范围校验** —— `nexus_query_knowledge` 的 `limit` 在 `@nexus-framework/cli` 一侧有 zod 声明的取值范围，但 Cordis 的 `ValueSchemaSpec` DSL 无法表达；底层处理函数内部已经对越界值做了截断，所以这只是 schema 可见性上的缺口，不是校验上的缺口。
- **没有包专属的运行时不变式** —— 参见 `src/invariant.ts`；这个包不写入任何自己的持久化会话事件，每一次副作用都落在 `@nexus-framework/cli` 基于文件系统的 `.nexus/` 大脑里，处于这个 harness 的不变式系统所管辖的事件溯源会话日志之外。
- **只有单一固定的提供方** —— 目前只有一种方式能触达 NEXUS 大脑（进程内导入 `@nexus-framework/cli` 的处理函数），没有 Service Definition/Provider 接缝，因为目前只有一种实现可供替换。
