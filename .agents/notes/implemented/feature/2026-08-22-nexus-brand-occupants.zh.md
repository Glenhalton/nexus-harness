# Agent Note: Web 客户端的 Nexus 品牌占位者

Status: implemented

[English](2026-08-22-nexus-brand-occupants.md) | 中文

## 问题

Web 客户端此前只有一个浏览器品牌占位者包 `@deepseek-ai/dsh-client-ui-brand-official`，用 DeepSeek Harness 自己的身份标识填充侧边栏标记/名称与会话 hero 标记，并以 `DSH_CLIENT_BUILD_PROFILE === 'official'` 为开关。这个 monorepo 还承载着 NEXUS（这个 harness 通过 `packages/experimental/tool-nexus-brain/` 桥接的独立项目智能 CLI），但没有办法组合出一个以 Nexus 而非 DeepSeek Harness 身份呈现的构建——favicon、页面标题、manifest 也都是 DeepSeek 品牌，没有替代方案。

## 决策

`@deepseek-ai/dsh-client-ui-brand-nexus`（`packages/client/ui-brand-nexus/`）是第二个、结构上与官方包完全一致的品牌占位者包：它通过与官方包相同的嵌套 `slots.inject()` 模式，填充同样的三个 slot（`sidebar.brand.mark`、`sidebar.brand.name`、`conversation.hero.brand.mark`）。它不带任何 `DSH_CLIENT_BUILD_PROFILE` 判断——是否启用是组合层面的选择，而不是运行时判断，因为一次部署最多只会挂载一个品牌包。

`packages/bundle/web-app/cordis.patch.yml` 现在挂载的是 `ui-brand-nexus` 而不是 `ui-brand-official`（原本 `id: ui-brand-official` 的那一行现在是 `id: ui-brand-nexus`），`packages/bundle/web-app/package.json` 的 `dependencies` 也做了同样的替换——这第二处修改是必需的，不是装饰性的：`apps/cli/src/profile-boot.ts` 的 `healProfilesModuleFallback` 通过对该应用 `dependencies`／`peerDependencies` 闭包做 BFS（`packages/boot/app-boot/src/profile.ts`）来填充 `$DSH_HOME/profiles/node_modules`，而这正是 Loader 在启动时解析裸插件行说明符的方式。一个只出现在 `cordis.patch.yml` 里、却没有对应 `package.json` 依赖边的行，会解析不到任何东西——Loader 自身的“模块无法解析”报告要经过一个这个 profile 从未挂载的 logger 服务，因此失败是无声的：这个插件根本不会出现在启动清单里，也没有任何控制台报错。这个问题是通过比对 `window.__DSH_BOOT__` 实际返回的插件 id 列表与预期的 `ui-brand-nexus` 条目才诊断出来的。

`apps/web/public/favicon.svg`、`apps/web/public/manifest.webmanifest`（`name`／`short_name`）以及 `apps/web/vite.config.ts` 的 `DEFAULT_CLIENT_TITLE` 被直接修改（这些是构建环境层面的事实，不是 slot 占位者）以完成整个品牌替换。

`ui-brand-nexus/src/client/Brand.tsx` 中的标记（一个把首字母嵌入其中的六边形节点框架）是等待最终 Nexus 品牌美术资产定稿前的占位设计——刻意构造成一个跟随 `currentColor` 的扁平 SVG 形状（没有渐变，没有固定的明暗配色），因此会随主题自动换色，与官方包的 `FishLogo` 构造方式一致，这样以后替换它只需要改动这一个组件文件。

## 已考虑的替代方案

**像官方包那样，给 `ui-brand-nexus` 加上 `DSH_CLIENT_BUILD_PROFILE` 判断。** 已否决：官方包的判断之所以存在，是因为 `official` 构建产物必须与一个特定的、环境层面冻结的公开构建逐字节匹配（参见 `scripts/client-build-environment.ts` 的 `assertClientBuildEnvironment`）。Nexus 品牌目前没有对应的冻结产物要求；一个 bundle 组合层面的选择（`cordis.patch.yml` 里挂载哪个品牌包）就是更简单且已经足够的机制。

**直接修改 `ui-brand-official`，让它显示 Nexus 品牌，而不是新增一个包。** 已否决：那样会让“官方 DeepSeek Harness 品牌”和“Nexus 品牌”在源码层面永久互斥，导致两者都无法构建。两个可互换的包能同时保留两者。

## 后果

现在一次组合可以通过在自己的 bundle patch 里挂载 `ui-brand-nexus` 而不是 `ui-brand-official` 来选择 Nexus 品牌——目前只有 `packages/bundle/web-app` 这样做。占位标记意味着 Web 客户端的视觉身份在最终品牌美术资产落地之前都是临时的；下游没有任何代码依赖它的具体几何形状。这个 note 诊断出的“静默解析失败”这一类问题（`cordis.patch.yml` 里的一行在 `package.json` 里没有对应的依赖边）是这个 monorepo 里任何未来新增客户端插件包都会遇到的真实陷阱，并非品牌专属——添加下一个客户端插件包时值得记住。
