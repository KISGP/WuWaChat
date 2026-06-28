import type { MemoryRetrievalMode } from '@shared/memory-settings'

export const RETRIEVAL_OPTIONS: {
  value: MemoryRetrievalMode
  label: string
  description: string
}[] = [
  {
    value: 'string',
    label: '字符串检索',
    description: '使用关键词匹配检索世界知识和长期记忆。'
  },
  {
    value: 'vector-local',
    label: '本地向量检索',
    description: '使用本地 Transformers.js embedding 模型进行语义检索。'
  }
]
