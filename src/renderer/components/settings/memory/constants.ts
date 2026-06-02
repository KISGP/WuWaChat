import type {
  CloudEmbeddingSettings,
  MemoryRetrievalMode
} from '../../../../shared/memory-settings'

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
    value: 'vector-cloud',
    label: '云端向量检索',
    description: '使用远程 embedding 服务，获得更高质量的语义检索效果。'
  },
  {
    value: 'vector-local',
    label: '本地向量检索',
    description: '使用本地 Transformers.js embedding 模型进行语义检索。'
  }
]

export const CLOUD_PROVIDER_OPTIONS: {
  value: CloudEmbeddingSettings['provider']
  label: string
  description: string
}[] = [
  {
    value: 'openai-compatible',
    label: 'OpenAI-compatible',
    description: '使用兼容 OpenAI `/embeddings` 的服务接口。'
  },
  {
    value: 'huggingface-inference',
    label: '@huggingface/inference',
    description: '使用 Hugging Face Inference 特征提取接口。'
  },
  {
    value: 'volcengine-ark',
    label: 'Volcengine Ark',
    description: '使用火山引擎 Ark 的 embeddings 接口。'
  }
]
