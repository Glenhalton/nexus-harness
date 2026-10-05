/** `nexus-setup` namespace dictionaries: the Session-header setup prompt and its dialog. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'nexus-setup'

export const zh = {
  'action.label': '设置 NEXUS',
  'action.tooltip': '这个文件夹还不是 NEXUS 项目',
  'dialog.title': '为这个文件夹设置 NEXUS',
  'dialog.close': '关闭',
  'dialog.body': 'NEXUS 会为 AI 助手保存这个项目的记忆：你在做什么、已经做过哪些决定、下一步做什么。设置时会在这里新建一个 .nexus 文件夹和几个说明文件，不会改动你现有的文件。',
  'dialog.folder': '文件夹：{path}',
  'dialog.confirm': '设置 NEXUS',
  'dialog.working': '正在设置…',
  'dialog.later': '暂不设置',
  'dialog.failed': '无法在这个文件夹中设置 NEXUS。请确认你有权限在这里保存文件，然后重试',
}

export const en: Record<keyof typeof zh, string> = {
  'action.label': 'Set up NEXUS',
  'action.tooltip': 'This folder isn’t a NEXUS project yet',
  'dialog.title': 'Set up NEXUS for this folder',
  'dialog.close': 'Close',
  'dialog.body': 'NEXUS gives your AI assistant a memory for this project: what you’re building, what’s been decided, and what to do next. Setting it up adds a .nexus folder and a few guide files here. Your existing files stay as they are.',
  'dialog.folder': 'Folder: {path}',
  'dialog.confirm': 'Set up NEXUS',
  'dialog.working': 'Setting up…',
  'dialog.later': 'Not now',
  'dialog.failed': 'NEXUS couldn’t be set up in this folder. Check that you can save files here, then try again.',
}

export type NexusSetupKey = keyof typeof zh
