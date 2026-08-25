# @deepseek-ai/dsh-skill-filesystem

[English](README.md) | 中文

`ctx.skills` 注册表的本地文件系统提供方。

该包实现一个 skill（技能）来源。它扫描本地项目、自定义和用户 skill 根目录，解析 `SKILL.md` 或平铺 Markdown skill 文件，并将提供方注册到 `ctx.skills`。注册表仍位于 `@deepseek-ai/dsh-skill`；持久化会话目录和面向模型的 loader 工具仍位于 `@deepseek-ai/dsh-tool-skill`。

## 插件

需要 `ctx.skills`（`inject: ['skills']`）。

### 配置

| 字段 | 默认值 | 含义 |
|---|---|---|
| `providerName` | `filesystem` | 在 `ctx.skills` 上注册该提供方时使用的唯一名称。 |
| `includeDefaultRoots` | `true` | 在 `customSkillDirs` 周围包含项目根和用户根；设为 false 时仅使用隔离的自定义根。 |
| `dshHome` | `$DSH_HOME` 或 `~/.dsh` | 由 [`@deepseek-ai/dsh-home-paths`](../../util/home-paths/README.zh.md) 解析的 DeepSeek Harness 配置根目录；扫描该目录下的 `skills`。 |
| `agentsHome` | `$DSH_AGENTS_HOME` 或 `~/.agents` | 为兼容 skill 扫描的共享 agent（智能体）配置根目录。 |
| `customSkillDirs` | `[]` | 在项目根目录之后、用户根目录之前扫描的其他本地 skill 根目录。 |
| `watch` | `true` | 监视宿主本地根，并在目录成员或 frontmatter 可能发生变化时使本地提供方失效。 |
| `watchUsePolling` | `false` | 对现有 skill 根使用 Chokidar 轮询，而不是原生事件。 |
| `watchStabilityThresholdMs` | `200` | Chokidar `add` 和 `change` 事件的稳定写入窗口。 |
| `watchPollIntervalMs` | `100` | Chokidar 轮询／稳定性间隔和缺失路径探测间隔。 |
| `watchMaxProjects` | `128` | watcher LRU 中保留的不同项目根数量上限。 |
| `watchFollowSymlinks` | `true` | 监视现有根时跟随符号链接。 |

## 发现

默认根按该提供方的 rank 顺序解析：

| Rank | 来源 | 路径 |
|---|---|---|
| 100 | `project-dsh` | `<projectRoot>/.dsh/skills` |
| 200 | `project-agents` | `<projectRoot>/.agents/skills` |
| 300 | `custom` | `Config.customSkillDirs` |
| 400 | `user-dsh` | `<dshHome>/skills` |
| 500 | `user-agents` | `<agentsHome>/skills` |

项目根目录是包含 `.git` 的最近祖先目录；如果不存在，则使用当前 cwd。用户 DSH 根目录会跳过其 `.system` 子目录，因此归系统所有的目录不会被当作普通用户 skill。`includeDefaultRoots: false` 会省略项目根、用户根以及 `$DSH_BUNDLED_SKILL_DIR` 环境默认值，同时保留显式配置的自定义根与 bundled 根，因此可以挂载多个只看到自身根的唯一命名隔离提供方。该提供方提供项目和用户 skill；其他提供方可提供内置系统 skill。

两个用户根（`user-dsh`、`user-agents`）在这台机器上对每个项目都是同一份：默认情况下，在那里发现的任何 skill 都会在每一个会话中提供，无论该项目实际是什么。若 skill 的 frontmatter 声明了 `projects`，则会收窄这一行为：只有当前项目目录的 basename 出现在该列表中时，才会从用户根包含这个 skill，否则会被跳过，如同从未被发现过。没有 `projects` 字段的 skill 不受影响，其行为与该字段存在之前完全一致，在任何项目中都会出现；这正是为什么一个漂流到用户根却没有 `projects` 字段的 skill（比如安装在 `~/.agents/skills` 下的 Cloudflare 专属 skill）会在每一个与之无关的项目里,把完整的目录描述都展示出来。`projects` 只对这两个用户根生效；从项目根、自定义根或 bundled 根发现的 skill 会忽略它，因为这些根本身已经通过放置位置或显式配置完成了范围限定。没有 `cwd`（例如对历史会话的冷读取）时，无法解析出项目，范围限定也就无法执行，此时每个 skill 都会被包含，这与省略 `projects` 字段时得到的回退行为一致。

当 `ctx.fs` 可用时，发现通过 `ctx.fs.listDir` 列出根，通过 `ctx.fs.readText` 读取 skill 文件，并通过文件系统服务探测 `.git`。完整 skill 加载会将查找中止信号转发给文件系统元数据和内容读取。如果没有文件系统服务，提供方回退到可中止的 Node 文件系统 I/O，使最小本地上下文仍能加载 skill。已确认缺失的路径属于有效空状态；遇到格式错误或非文本条目时，提供方会发出警告并跳过；意外的发现或读取失败会使注册表快照不完整，系统不会因此用看似发生删除的结果替换上一份可用模型目录。

## 目录变更检测

现有 skill 根由 Chokidar 监视。打开原生 watcher 前，提供方会对现有根或祖先执行 realpath 解析，并拼回下一个缺失路径段；当 `watchFollowSymlinks` 为 false 且根本身是符号链接时，提供方不会展开最后这一级链接，使 Chokidar 能够强制执行配置边界。发现与诊断仍保留配置路径，从而避免 Windows 在 libuv 内部混用 8.3 别名与长格式事件路径。提供方会观察直属 bundle 目录的添加／移除、平铺 Markdown 文件的添加／移除，以及直接 `SKILL.md` 的添加／移除／变更；`change` 事件用于重新发现 `name`、`description` 等目录 frontmatter。`references`、`scripts`、`assets` 或其他 bundle 资源下的变更不会使目录失效。同一微任务批次内送达的事件会合并为一次提供方失效。

不存在的根会从最近的现有祖先开始，每次沿一个缺失路径段跟踪。系统使用 `fs.watchFile` 探测下一段；当 `.agents`、`skills` 或已配置的根出现后，观察会逐级推进，直至 Chokidar 可以附加到真实根。根删除时，该过程反向执行，因此删除再重建整个 skills 目录仍可被观察到。按项目划分的 watcher 数量受 `watchMaxProjects` 限制；再次访问已被驱逐的项目时，发现阶段会重新附加观察。

如果第一方文件系统 `write` 和 `edit` 工具的目标可能影响受监视的 skill 条目，它们还会通过 `fs/observed` 同步使提供方失效。这条快速路径让模型的下一个步骤无需等待宿主 watcher，即可观察到自身的文件系统变更。外部 IDE、Git、shell 和进程产生的变更依赖 Chokidar 或缺失路径探测。现有根的 watcher 会保持持久状态直至 effect 释放，使 Chokidar 能够接管异步原生错误事件；watcher 启动或运行时失败会被记录并触发重试。发现过程仍会扫描可读根目录，并返回其候选项供直接加载，但会将观测标记为不完整，因此不会缓存，也不会作为权威模型目录发布。effect 释放会关闭所有 watcher，并收束延迟回调。

## skill 格式

skill 可以是单层目录 bundle（`<name>/SKILL.md`），也可以是平铺 Markdown 文件（`<name>.md`）。刻意不支持发现嵌套的 `**/SKILL.md`。Frontmatter 使用 `yaml` 包解析为开放的 YAML 对象；该提供方解析必填的 `name` 和 `description`，以及可选的 `whenToUse`、`metadata`、`disable-model-invocation`、`user-invocable` 和 `projects`。名称必须使用 kebab-case。

`projects` 是一个非空字符串数组，每一项是某个项目目录的 basename（例如 `nexus-harness`，而不是绝对路径——这个值需要能够迁移到其他机器的用户主目录，因此它标识的是项目本身而不是其位置）。它只在上文"发现"一节所述的两个用户根上生效。形状错误的值（不是数组、空数组、含非字符串项）会记录警告并被当作未设置处理，即不限定范围，而不会丢弃整个 skill：这个字段是建议性的过滤，不像 `disable-model-invocation` 那样是调用面的决定，因此在此处失败时选择放行不会有把 skill 暴露在本应隐藏之处的风险，最坏情况也只是出现在无关的地方，与该字段存在之前的行为一致。

这两个调用字段接受 YAML 布尔值，以及不区分大小写的 `true`/`false`、`yes`/`no`、`on`/`off` 和 `1`/`0`。`disable-model-invocation: true` 会从面向模型的目录和 loader 中排除该 skill；`user-invocable: false` 会从面向用户的命令中排除该 skill。每个省略的字段都默认为允许对应接口调用；提供方始终输出两个正向内部策略值，即使两个键都不存在也不例外。若使用驼峰拼写或提供非布尔调用值，系统会记录警告并从发现结果中排除整个 skill，而不是只丢弃该字段或回退到宽松的默认值。调用策略校验遵循失败时默认拒绝原则，因为忽略无效数据可能会在已禁用的接口上暴露 skill；类型错误的可选 `whenToUse` 和 `metadata` 值则会被省略，因为这两个字段目前都不授予调用权限。

目录与正文具有独立的生命周期。发现阶段解析 frontmatter 以生成概述。每次 `skill(name)` 加载都会重新读取并解析当前文件，因此正文编辑不需要 hash、修订号、缓存失效或主动通知模型。若在发现与加载之间更改 frontmatter 中的名称，系统会拒绝陈旧名称并使提供方失效；下一次目录观察会发布新名称。

## 模型体验

通过 `dsh-tool-skill` 间接影响模型。它将该提供方的可调用名称和有长度上限的描述渲染到初始目录或替换目录中，并将所选的当前指令正文与资源基底指引渲染到保留的工具历史中；路径、提供方 rank 和已禁用 skill 仍被隐藏。

#### KV Cache 影响

watcher 触发的失效可促使上述消费方在现有请求历史中追加替换目录。仅涉及正文的编辑不会改变目录 digest。

## 已知限制与暂缓事项

- **发现深度为一层**：只识别 `<root>/<name>/SKILL.md` 和 `<root>/<name>.md`；忽略嵌套 skill 树和包 manifest（元数据清单）。
- **项目范围为最近 `.git` 祖先**：没有该标记的工作区回退到提供的 cwd，不支持其他项目根标记或 monorepo 子项目选择。
- **格式错误的条目会随警告消失**：模型目录不会收到每个 skill 的诊断，无法区分缺失的 skill 与无效的 skill；意外 I/O 失败则会保留最后一份可用目录。
- **缺失根观察每次轮询一个路径段**：启动时不存在的根会使用 `fs.watchFile` 按 `watchPollIntervalMs` 轮询，直至 Chokidar 可以附加；这以有界检测延迟换取跨 IDE、Git 和 shell 工作流的可靠创建检测。
- **无正文修订协议**：已加载的正文是普通的已保留工具历史；后续文件编辑会影响后续调用，但既不会改写旧结果，也不会通知正文已发生变化。
- **`projects` 是逐个 skill 的主动声明，不是项目相关性判断**：系统不会推断某个 skill 是否真的适合某个项目的技术栈；一个未声明范围的用户根 skill 在其自身 frontmatter 明确指定之前,仍会在所有地方出现。它目前也只覆盖两个用户根；通过 `customSkillDirs` 配置的自定义根目前刻意不做过滤，因为那个根本身已经是一次显式、主动的选择,而非默认始终开启。
