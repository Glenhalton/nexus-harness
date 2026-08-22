# @deepseek-ai/dsh-client-ui-brand-nexus

[English](README.md) | 中文

本包填充 `sidebar.brand.mark`、`sidebar.brand.name` 和 `conversation.hero.brand.mark`，注册 Nexus 品牌占位者。与 [`@deepseek-ai/dsh-client-ui-brand-official`](../ui-brand-official/README.zh.md) 不同，它不带任何 `DSH_CLIENT_BUILD_PROFILE` 判断——一次部署最多把一个品牌包组合进自己的 bundle，因此显示哪个品牌是组合层面的选择（`packages/bundle/web-app/cordis.patch.yml`），而不是运行时判断。

三个占位者与官方包一样，通过嵌套的 `slots.inject()` 作为一组声明感知注册安装：无论该包的条目先于还是后于侧边栏和会话声明方激活，它都能工作；任一声明折叠时会撤回全部占位者，HMR 期间不会留下混合品牌。它不保留运行时状态。node 半边是空的 Loader seat；浏览器标题仍属于本包之外的构建环境事项（`apps/web/vite.config.ts` 的 `DEFAULT_CLIENT_TITLE`）。

## 占位美术

`src/client/Brand.tsx` 中的标记——一个把首字母嵌入其中的六边形节点框架——是等待最终 Nexus 品牌美术定稿前的占位设计。它遵循与官方 DeepSeek 标记完全相同的构造方式（一个跟随 `currentColor` 的扁平形状，因此会随主题自动换色），这样以后换上最终 SVG 时只需改动单个文件：替换 `NexusBrandMark` 里的 `<path>` 数据，别无其他。`NexusBrandName` 词标是样式化文字，不是自定义字形，所以选定展示字体后完全不需要更新它。

## Model Experience

无，因为本包只贡献浏览器呈现；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；本包既不组装也不发送 provider 请求。

## 已知限制与暂缓事项

- **标记是占位美术** —— 见 § 占位美术；最终的 Nexus 标志尚未选定。
- **本包只提供一组 occupant** —— 其他呈现应由占用相同 slot 的另一个 Cordis 包提供。
- **浏览器标题相互独立** —— `DSH_CLIENT_TITLE` 在构建期选择标题文字，而不经过 UI slot。
