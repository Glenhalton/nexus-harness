# Agent Note: Nexus 品牌化外观模式

Status: implemented

[English](2026-08-22-nexus-branded-appearance-mode.md) | 中文

## 问题

Nexus 品牌占位者（参见[姊妹 note](2026-08-22-nexus-brand-occupants.zh.md)）把 Nexus 标志放到了侧边栏和 hero 区域，但产品的配色方案仍然是 DeepSeek Harness 自己的——`ThemeRuntime`（`packages/client/ui-theme/src/client/index.ts`）此前只认识 `light`／`dark`／`system` 三种偏好，两个内置 `ThemeDefinition` 的 `tokens` 都是空的，因为它们完整的调色板都活在 `design-platform.css` 的静态／别名 CSS 代码块里。一个以 Nexus 组合出来的构建，就是把一个 Nexus 标记放在一个原本没有品牌化（DeepSeek 蓝强调色）的深色主题上。

## 决策

`nexus` 是第四个内置偏好（`packages/client/ui-theme/src/theme-settings.ts` 里的 `THEME_PREFERENCES`——`ThemePreference`、`ThemeSettingsSchema`、`isThemePreference` 都由它派生），也是 `ThemeRuntime` 中 `BUILTIN_THEMES` 的第三个条目（`packages/client/ui-theme/src/client/index.ts`）：`{ id: 'nexus', colorScheme: 'dark', tokens: NEXUS_ACCENT_TOKENS }`。

`ThemeDefinition.colorScheme`是一个硬性的 `'light' | 'dark'` 字面量——不存在第三种渲染模式，而为了这一处颜色差异去复刻深色模式约 78 个别名 + 73 个静态 token、做成一套平行的 CSS 代码块，纯属不必要的重复。现有的 `tokens: ThemeTokens` 字段正是 `overrideTokens` 已经在用的那套分层机制（用于动态的按包覆盖）——`ThemeRuntime.composeActive` 会把它们叠加进去；`ThemePresenter.apply`（`packages/client/ui-layout/src/client/theme-presenter.ts`）把叠加后的结果作为内联 `body.style` 属性应用出去——把它复用给一个永久性的内置主题，不需要任何新机制。

这些覆盖值来自 `nexus-homepage` 自己的调色板（`--mint: #34d399`，那边的文档写作“唯一一个代表‘活着’的强调色”），而不是凭空发明的颜色——`rgb(52, 211, 153)`，hover／按下状态用加深的 `rgb(28, 168, 122)`。阅读 `design-platform.css` 的深色别名代码块（`body[data-ds-dark-theme] {...}`）可以看到，DeepSeek 品牌蓝在深色模式下出现的范围其实很窄：`--dsw-alias-brand-primary`（目前接近白色，一个单色的主 CTA；`--dsw-alias-button-primary-fill` 通过 `var()` 从它派生，因此会通过级联免费继承覆盖）、`--dsw-alias-button-primary-hover`（一个字面值，不是派生值——需要单独覆盖）、`--dsw-alias-button-info-fill`／`-hover`（目前是 `deepseek-*` 色阶）、以及 `--dsw-alias-state-business-primary`／`-tertiary`（同一色阶）。`NEXUS_ACCENT_TOKENS` 把这些覆盖为薄荷绿强调色（tertiary business 淡色用 `rgba(52, 211, 153, 0.16)`，与 `nexus-homepage` 自己那种半透明的 `--mintbg` 惯例一致）——但如果只做到这一步，在任何没有可见按钮或徽章的界面上，这个主题看起来就会与 `dark` 毫无区别，因为那些表面正是 `dark` 主题唯一带有颜色的地方。第七个覆盖项 `--dsw-specific-sidebar-nav-item-active-accent`（`rgba(52, 211, 153, 0.14)`）解决了这个问题：`dark` 把这个 token 设为纯中性色（`--dsw-static-neutral-bluish-800`，没有颜色），覆盖它之后，当前选中的侧边栏导航项背后就会出现可见的薄荷绿色调——这是每个会话都会显示的界面，不像某个视图可能根本不会渲染的 business 徽章或 info 按钮。其余所有别名 token（背景、边框、中性色、气泡、markdown、滚动条、错误／成功／警告状态）都不变，因此 `nexus` 读起来就是“深色主题，但凡是品牌表面出现的地方都是 Nexus 薄荷绿而不是 DeepSeek 蓝，而且当前选中的导航项终于有颜色了”。

`boot-theme.ts` 的预 hydration 内联脚本（`bootThemeScript`）现在会把 `nexus` 解析到深色分支（`preference === 'dark' || preference === 'nexus' || systemDark`），这样在外壳渲染之前 `color-scheme`／`data-ds-dark-theme` 就是正确的。它**不会**内联那六个强调色 token 覆盖——这些只会在客户端插件树启动、`ThemePresenter` 运行之后才生效，因为 `light`／`dark` 从来不需要在引导脚本里注入 token（两者的 `tokens` 都是 `{}`），而为了这一个主题把一份 token 映射塞进内联脚本，被判定为不值得为一次仅影响首次绘制、亚秒级的默认深色强调色闪烁增加这份复杂度。

`AppearanceRow.tsx` 的第四个方块复用了已有的 `IconSparkle16`（`packages/client/ui-primitives/src/icons/index.tsx`），而不是新手绘一个图标，也没有用 `NexusBrandMark`。外观行里的其他每一个图标都是精确的 Figma 提取矢量形状，并带有记录来源 frame id 的注释——目前还没有可供提取的“Nexus”图标 Figma 来源，手工近似一个会破坏这个溯源惯例。`NexusBrandMark`（`packages/client/ui-brand-nexus/src/client/Brand.tsx`）也被刻意排除在外：那个包是一个组合层面可互换的品牌占位者（按姊妹 note 所述，`ui-brand-nexus`／`ui-brand-official` 中最多只会挂载一个，也可能一个都不挂），如果 `ui-theme` 对某一个具体的可互换品牌包产生静态依赖，一旦组合换了品牌包或者两个都不挂载，就会立刻出问题。

## 已考虑的替代方案

**给 `nexus` 一整套独立的静态／别名 CSS 代码块（第三个 `body[data-ds-...]` 选择器），而不是 token 覆盖。** 已否决：`ThemeDefinition.colorScheme` 的双值字面量类型，以及 `ThemePresenter` 的 `data-ds-dark-theme` 切换，在整个样式系统里都是承重结构（`base.css`、`scrollbar.css`、`gradient-shadow-text.css`、`shiki.css` 都依赖同一个属性）；引入第三个选择器意味着要改动上面每一张样式表，却换不来什么视觉收益，因为 Nexus 与 Dark 的唯一实际差异就是六个强调色 token。

**把 `NEXUS_ACCENT_TOKENS` 塞进 `boot-theme.ts` 的内联脚本，来解决预 hydration 的强调色闪烁问题。** 推迟处理，而非直接否决：技术上并不难（同一份扁平 token 映射，作为内联 `body.style` 属性写进生成的脚本），但会增加内联脚本体积，并多出一处需要与 token 值保持同步的地方——而这个限制本身在本 note 中已被明确接受为纯装饰性问题。如果实际使用中这个闪烁确实显得碍眼，再重新考虑。

**用 `NexusBrandMark` 作为第四个方块的图标。** 已否决：理由同上文的耦合论证——`ui-brand-nexus`／`ui-brand-official` 之所以做成两个独立、可互换的包，整个意义就在于它们都不应成为 `ui-theme` 这类核心 UI 包的硬依赖。

## 后果

现在一个以 Nexus 组合出来的构建可以选择“Nexus”外观，同时获得品牌标记（侧边栏／hero，来自姊妹 note）和贯穿整个产品的匹配强调色，而不再只是把一个标志贴在一个没有品牌化的深色主题上。`THEME_PREFERENCES` 新增第四个值对持久化的 settings schema 来说是纯增量变更——不需要迁移，已有的 `light`／`dark`／`system` 文档依然有效。已接受的预 hydration 闪烁（见 § 决策）是目前唯一已知的粗糙点；它只影响客户端插件树完成启动前的首次绘制，并且只针对 `nexus` 这一个偏好。
