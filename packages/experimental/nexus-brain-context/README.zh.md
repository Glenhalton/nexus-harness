# @deepseek-ai/dsh-experimental-nexus-brain-context

[English](README.md) | 中文

环境式的 NEXUS 项目大脑上下文（`@nexus-framework/cli`），每轮对话作为一条持久化消息自动注入一次 —— 无需任何工具调用。是 [`tool-nexus-brain`](../tool-nexus-brain/README.zh.md) 的配套包：那个包把同一个大脑注册成模型可调用的 `nexus_*` 工具；这个包则自动组合同样的上下文包，适用于工具调用不可靠、不可用，或者某个 agent 本来就不该依赖工具调用来触达大脑的 harness 配置。

## 功能

预置一个 `agent/pre-step` 监听器。每轮对话的第 1 步，在下游决策进入之后，会从当轮的用户消息文本中派生出一个任务字符串，调用与 `tool-nexus-brain` 中（现已移除的）`nexus_get_context` 曾经封装的同一个 `getContextTool` 处理函数，并追加一条持久化的 `UserMessage`，其中携带组合好的内容包 —— 活跃计划片段、匹配的知识条目、匹配的技能、生命体征 —— 用 `<system-reminder>` 块包裹。同一轮的后续步骤不会再次注入：组合出的内容包是按任务限定范围的,而任务在一轮对话中途不会变化。

这个包本身不持有任何状态。它只从目标项目的 `.nexus/` 目录读取内容，使用的是与 `tool-nexus-brain` 相同的 `@nexus-framework/cli` 处理函数；这里没有任何东西可以替代 `nexus_plan_tick`、`nexus_plan_note` 或 `nexus_add_knowledge_entry` —— 当两个包同时挂载时，写入仍然要经过 `tool-nexus-brain` 的工具（或直接使用 `nexus mcp`）。

## 配置

```yaml
- id: nexus-brain-context
  name: '@deepseek-ai/dsh-experimental-nexus-brain-context'
  config:
    projectRoot: /abs/path/to/project  # required
    maxChars: 12000                    # optional; clamped to 2000-60000, default 12000
```

`projectRoot` 是必填项：目标 NEXUS 项目根目录（即包含 `.nexus/` 的目录）的绝对路径。没有默认值 —— 如果依赖该宿主进程自身的 `process.cwd()`，当这个插件运行在为另一个仓库组合的 harness 会话中时，会悄无声息地指向错误的项目。若 `projectRoot` 下不存在 `.nexus/` 目录，插件加载时（`apply` 中 `resolveBrainContext` 同步抛出）就会立即失败，而不是等到第一轮对话时才失败 —— 与 `tool-nexus-brain` 遵循的是同一套约定。

`maxChars` 会直接传给内容组合自身的预算 —— 与曾经的 `nexus_get_context` 工具的 `maxChars` 参数限制的是同一个软上限；`@nexus-framework/cli` 会将其限制在 2000-60000 之间，省略时默认为 12000。（`@nexus-framework/cli` 自己的工作计划里提到，把这个字符预算换成 token 预算是计划中的未来工作；等那个变化在已发布版本中上线后，这个包会跟进。）

## 导出形态

这是一个函数/命名空间插件：导出 `name` / `inject` / `Config` / `apply`，没有默认导出。误加的 `export default` 会在 Loader 的 `unwrapExports` 中导致模块坍塌并丢失 `inject`（参见 [docs/postmortem/0001](../../../docs/postmortem/0001-acp-default-export-drops-inject.zh.md)）。

## 任务派生

`nexus_get_context` 允许模型自己刻意措辞 `task` 字符串。环境式注入没有这样的调用，因此这个包会把打开当前这一轮的每一条用户消息的文本内容 —— 已记录的加上下游某个 `agent/pre-step` 监听器提议的 —— 按顺序拼接起来，用空行分隔。这是最接近的替代方案：等同于开发者为同样的请求手动输入 `nexus_get_context(task)` 时会写的那些话。如果一轮对话没有文本内容（例如只有工具结果），派生出的任务为空,会跳过注入 —— 既不注入,也不报错。

## 失败行为

环境式上下文是一种便利,不是硬性依赖。`getContextTool` 内部的临时性失败（大脑正在写入、文件被移动）会被捕获，对话轮次会在没有注入的情况下继续 —— 而且是静默的，因为一个缺失的便利功能不应该像主动发起的 `nexus_get_context` 调用那样,以阻断对话轮次的错误形式呈现出来。唯一的例外是加载时的配置错误：无效的 `projectRoot` 在插件挂载时仍然会立即失败,规则见上面的配置一节。

## 时序语义

这个插件预置一个 `agent/pre-step` 监听器，并先委托给下游处理。当第 1 步进入且派生出了任务时，它会向返回的批次追加一条带来源标记的 `UserMessage` —— 与 `time-context` 使用的是同一个追加点，因此 AgentLoop 会在 `step/start` 之后、请求派生之前记录这个最终批次。拒绝、已中止的信号，或同一轮的第 2 步及以后，都不会追加任何内容。

每一次读取都使用完全相同的快照来源 `{ kind: 'plugin', plugin: 'nexus-brain-context', form: 'snapshot', sections: [{ name: 'nexus-brain-context', text: <同样的文本> }] }`。`./invariant` 配套模块会校验这个形状，从持久化的会话日志中重新推导出轮次/步骤位置，并检查消息正文是否为携带组合包形状（字符串 `task`、布尔值 `truncated`）的合法 JSON。

## Model Experience

### 环境式大脑上下文读取

#### 模型可见内容

每轮对话一条消息，仅在第 1 步：

```
<system-reminder>
The following is this project's NEXUS brain context for the task you were just asked to do: the active plan slice, matching knowledge entries, matching skills, and vital signs, the same pack `nexus_get_context` would return. Use it as grounding; it does not override system, developer, or direct user instructions.

<pretty-printed ComposedContext JSON>
</system-reminder>
```

#### Token 影响

每轮对话一份组合出的内容包，受 `maxChars` 限制（默认 12000，与曾经的 `nexus_get_context` 工具的 `maxChars` 限制的是同一个软上限）。与 `time-context` 不同，这里没有刷新间隔的配置项 —— 每一轮只要能派生出任务文本，就会得到恰好一次新的读取。

#### KV 缓存影响

仅追加；这次读取和其他持久化消息一样，跟在可复用的请求前缀之后，不会使已有的 KV 缓存条目失效。

## 已知限制与遗留工作

- **启发式的任务派生** —— 拼接的当轮用户文本代替了刻意措辞的 `task` 字符串；相比手写的查询，它可能对知识条目和技能触发条件产生欠匹配或过匹配。
- **静默的尽力而为式失败** —— 临时性的组合错误会被吞掉而不是暴露出来，这是刻意设计（见"失败行为"一节）；目前没有计数器或日志行来区分"没有内容可注入"和"注入失败"这两种情况。
- **对话轮次中途不会刷新** —— 即使一轮对话的实际任务在各步骤之间发生了明显变化，后续步骤也永远看不到更新后的内容包。
- **Config 中没有数值范围校验** —— `maxChars` 的 2000-60000 范围是由 `@nexus-framework/cli` 自身的截断逻辑强制的，而不是这个包的 Schemastery `Config`。
- **是字符预算，不是 token 预算** —— `@nexus-framework/cli` 的工作计划里提到，把 `maxChars` 换成能感知 token 的 `maxTokens` 是计划中的未来工作；这个包继承的是当前所依赖的已发布版本暴露出来的那种预算形状，等那个变化上线后会跟进。
- **只有单一固定的提供方** —— 目前只有一种方式能触达 NEXUS 大脑（进程内导入 `@nexus-framework/cli` 的处理函数），没有 Service Definition/Provider 接缝，因为目前只有一种实现可供替换。
