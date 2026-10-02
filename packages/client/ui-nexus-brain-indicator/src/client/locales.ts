export const NS = 'nexusBrainIndicator' as const

export const en = {
  'chip.synced': 'Brain: Synced',
  'chip.drift': 'Brain: Drift',
  'chip.disconnected': 'No Brain',
  'chip.plan': 'Plan: #{{id}}',
  'chip.noPlan': 'No Plan',
  'tab.title': 'Nexus Plan',
  'tab.guide.title': 'Nexus Active Plan',
  'tab.guide.description': 'Interactive project plan checklist, next step, and milestone tracking',
  'tab.noActivePlan': 'No active plan found for this session.',
  'tab.nextStep': 'Next Step',
  'tab.status': 'Status',
  'tab.progress': 'Progress',
}

export const zh = {
  'chip.synced': 'Brain: 已同步',
  'chip.drift': 'Brain: 存在漂移',
  'chip.disconnected': '未接入 Brain',
  'chip.plan': '计划: #{{id}}',
  'chip.noPlan': '无计划',
  'tab.title': 'Nexus 计划',
  'tab.guide.title': 'Nexus 活跃计划',
  'tab.guide.description': '交互式项目计划清单、下一步指示及里程碑跟踪',
  'tab.noActivePlan': '此会话中未发现活跃计划。',
  'tab.nextStep': '下一步',
  'tab.status': '状态',
  'tab.progress': '进度',
}

export type NexusBrainIndicatorKey = keyof typeof en
