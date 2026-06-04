import type {
  CharacterMemoryIndexStatus,
  CloudEmbeddingSettings,
  MemoryRetrievalMode,
  MemoryTask,
  WorldIndexStatus
} from '../../../../shared/memory-settings'

type IndexStatus = WorldIndexStatus | CharacterMemoryIndexStatus | null

export function inputClassName(): string {
  return 'h-9 rounded border border-white/15 bg-black/35 px-3 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-[#e8c690]'
}

export function cardClassName(): string {
  return 'rounded border border-white/10 bg-white/[0.03] p-4'
}

export function getDefaultCloudModel(provider: CloudEmbeddingSettings['provider']): string {
  if (provider === 'huggingface-inference') {
    return 'ibm-granite/granite-embedding-97m-multilingual-r2'
  }

  if (provider === 'volcengine-ark') {
    return ''
  }

  return 'text-embedding-3-small'
}

export function getDefaultCloudBaseUrl(provider: CloudEmbeddingSettings['provider']): string {
  if (provider === 'openai-compatible') {
    return 'https://api.openai.com/v1'
  }

  if (provider === 'volcengine-ark') {
    return 'https://ark.cn-beijing.volces.com/api/v3'
  }

  return ''
}

export function renderStructuredMessage(message: string): string[] {
  return message
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

export function formatDateTime(value?: string | null): string {
  if (!value) {
    return '暂无记录'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

export function getAvailabilityMeta(
  availability?: WorldIndexStatus['availability'],
  index?: IndexStatus
): {
  label: string
  tone: string
  description: string
} {
  switch (availability) {
    case 'ready':
      return {
        label: '可用',
        tone: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
        description: '索引已经准备完成，可以直接参与检索。'
      }
    case 'building':
      return {
        label: '构建中',
        tone: 'border-amber-400/30 bg-amber-500/10 text-amber-200',
        description: '后台正在生成或更新索引，完成前系统可能会回退到其他检索方式。'
      }
    case 'incompatible':
      return {
        label: '需重建',
        tone: 'border-amber-400/30 bg-amber-500/10 text-amber-200',
        description: '现有索引与当前 embedding 配置不匹配，需要重新构建。'
      }
    case 'failed':
      return {
        label: '构建失败',
        tone: 'border-red-400/30 bg-red-500/10 text-red-200',
        description: '最近一次构建没有成功，建议检查配置后重新执行。'
      }
    case 'missing':
    default:
      if (index?.scope === 'character-memory') {
        if ((index.entryCount || 0) > 0) {
          return {
            label: '未构建',
            tone: 'border-white/15 bg-white/5 text-white/70',
            description:
              '当前已有角色记忆内容，但未构建向量索引，系统将回退到字符串检索。'
          }
        }

        return {
          label: '未构建',
          tone: 'border-white/15 bg-white/5 text-white/70',
          description:
            '当前无可供索引的角色记忆内容。系统将使用字符串检索，先开始聊天后再构建即可。'
        }
      }

      return {
        label: '未构建',
        tone: 'border-white/15 bg-white/5 text-white/70',
        description: '当前无可用索引，系统将回退到字符串检索。'
      }
  }
}

export function getRuntimeModeMeta(runtimeMode?: WorldIndexStatus['runtimeMode']): {
  label: string
  description: string
} {
  switch (runtimeMode) {
    case 'vector':
      return {
        label: '向量检索',
        description: '当前优先使用 embedding 向量进行语义检索。'
      }
    case 'degraded':
      return {
        label: '降级运行',
        description: '由于索引或配置问题，当前没有使用理想的向量检索路径。'
      }
    case 'string':
    default:
      return {
        label: '字符串检索',
        description: '当前使用关键词匹配方式检索内容。'
      }
  }
}

export function getSelectedEmbeddingModeLabel(mode: MemoryRetrievalMode): string {
  switch (mode) {
    case 'vector-cloud':
      return '云端向量检索'
    case 'vector-local':
      return '本地向量检索'
    case 'string':
    default:
      return '字符串检索'
  }
}

export function getStatusCardEmptyHint(index: IndexStatus, fallbackHint: string): string {
  if (!index) {
    return fallbackHint
  }

  if (index.scope !== 'character-memory' || index.availability !== 'missing') {
    return fallbackHint
  }

  if (index.entryCount > 0) {
    return '当前已有角色记忆内容。完成一次当前角色或全部角色重建后，就可以启用向量检索。'
  }

  return '当前无可供索引的角色记忆。先开始聊天，等有记忆内容后再构建向量索引即可。'
}

export function hasRunningTask(tasks: MemoryTask[], taskType: MemoryTask['taskType']): boolean {
  return tasks.some(
    (task) => task.taskType === taskType && (task.status === 'queued' || task.status === 'running')
  )
}

export function hasRunningMemoryBuildTask(tasks: MemoryTask[]): boolean {
  return tasks.some(
    (task) =>
      (task.taskType === 'character-memory-build' || task.taskType === 'all-memory-build') &&
      (task.status === 'queued' || task.status === 'running')
  )
}

export function isVisibleMemoryTask(task: MemoryTask): boolean {
  return (
    task.taskType === 'world-bundle-download' ||
    task.taskType === 'world-vector-build' ||
    task.taskType === 'character-memory-build' ||
    task.taskType === 'all-memory-build'
  )
}

export function getMemoryTaskTitle(task: MemoryTask): string {
  switch (task.taskType) {
    case 'world-bundle-download':
      return '更新世界知识包'
    case 'world-vector-build':
      return '构建世界知识向量'
    case 'character-memory-build':
      return task.characterId ? '重建当前角色记忆' : '重建角色记忆'
    case 'all-memory-build':
      return '重建全部角色记忆'
    case 'local-model-download':
      return '下载本地模型'
    case 'local-model-validate':
      return '校验本地模型'
    default:
      return '记忆任务'
  }
}

export function getMemoryTaskScopeLabel(task: MemoryTask): string {
  if (task.taskType === 'all-memory-build') {
    return '全部角色'
  }

  if (task.scope === 'world') {
    return '世界知识'
  }

  if (task.characterId) {
    return `角色 ${task.characterId}`
  }

  return '角色记忆'
}

export function getMemoryTaskStatusMeta(status: MemoryTask['status']): {
  label: string
  tone: string
} {
  switch (status) {
    case 'running':
      return {
        label: '进行中',
        tone: 'border-amber-400/30 bg-amber-500/10 text-amber-200'
      }
    case 'queued':
      return {
        label: '排队中',
        tone: 'border-white/15 bg-white/5 text-white/70'
      }
    case 'completed':
      return {
        label: '成功',
        tone: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
      }
    case 'failed':
      return {
        label: '失败',
        tone: 'border-red-400/30 bg-red-500/10 text-red-200'
      }
    case 'cancelled':
    default:
      return {
        label: '已取消',
        tone: 'border-white/15 bg-white/5 text-white/70'
      }
  }
}
