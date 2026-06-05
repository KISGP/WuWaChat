import { CheckCircle2, Clock3, LoaderCircle, XCircle } from 'lucide-react'
import type { ReactElement } from 'react'
import type { MemoryTask } from '../../../../shared/memory-settings'
import { cn } from '../../../utils'
import {
  formatDateTime,
  getMemoryTaskScopeLabel,
  getMemoryTaskStatusMeta,
  getMemoryTaskTitle,
  isVisibleMemoryTask,
  renderStructuredMessage
} from './helpers'

type BuildLaunchNotice = {
  type: 'error'
  title: string
  message: string
} | null

function TaskIcon({ status }: { status: MemoryTask['status'] }): ReactElement {
  if (status === 'running') {
    return <LoaderCircle className="size-4 animate-spin text-amber-200" />
  }

  if (status === 'completed') {
    return <CheckCircle2 className="size-4 text-emerald-200" />
  }

  if (status === 'failed') {
    return <XCircle className="size-4 text-red-200" />
  }

  return <Clock3 className="size-4 text-white/60" />
}

function TaskCard({ task }: { task: MemoryTask }): ReactElement {
  const statusMeta = getMemoryTaskStatusMeta(task.status)
  const details = renderStructuredMessage(task.message || '')
  const progress = Math.max(0, Math.min(100, Math.round(task.progress || 0)))

  return (
    <div className="rounded border border-white/10 bg-black/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-white/90">
            <TaskIcon status={task.status} />
            <span>{getMemoryTaskTitle(task)}</span>
          </div>
          <div className="mt-1 text-xs text-white/50">
            {getMemoryTaskScopeLabel(task)} · {formatDateTime(task.updatedAt)}
          </div>
        </div>
        <span className={cn('shrink-0 rounded px-2 py-1 text-[11px]', statusMeta.tone)}>
          {statusMeta.label}
        </span>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            task.status === 'failed'
              ? 'bg-red-300/80'
              : task.status === 'completed'
                ? 'bg-emerald-300/80'
                : 'bg-[#e8c690]'
          )}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-white/55">
        <span>{task.message || '等待任务更新...'}</span>
        <span>{progress}%</span>
      </div>

      {details.length > 1 && task.status !== 'running' && (
        <div className="mt-3 rounded border border-white/10 bg-black/25 px-3 py-2 text-xs text-white/55">
          {details.slice(1).map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      )}
    </div>
  )
}

export function TaskPanel({
  tasks,
  buildLaunchNotice
}: {
  tasks: MemoryTask[]
  buildLaunchNotice: BuildLaunchNotice
}): ReactElement | null {
  const visibleTasks = tasks.filter(isVisibleMemoryTask)
  const runningTasks = visibleTasks.filter(
    (task) => task.status === 'queued' || task.status === 'running'
  )
  const latestFinishedTask =
    visibleTasks.find(
      (task) =>
        task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled'
    ) || null

  if (runningTasks.length === 0 && !latestFinishedTask && !buildLaunchNotice) {
    return null
  }

  return (
    <div className="rounded border border-white/10 bg-black/15 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-white/90">构建任务反馈</h3>
          <p className="mt-1 text-xs text-white/50">
            这里会显示向量构建的实时进度，以及最近一次任务结果。
          </p>
        </div>
        {runningTasks.length > 0 && (
          <span className="rounded border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
            {runningTasks.length} 个任务进行中
          </span>
        )}
      </div>

      {buildLaunchNotice && (
        <div className="mt-3 rounded border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          <div className="font-medium">{buildLaunchNotice.title}</div>
          <div className="mt-1 whitespace-pre-wrap text-red-100/90">
            {buildLaunchNotice.message}
          </div>
        </div>
      )}

      {runningTasks.length > 0 && (
        <div className="mt-3 space-y-3">
          {runningTasks.map((task) => (
            <TaskCard key={task.taskId} task={task} />
          ))}
        </div>
      )}

      {latestFinishedTask && (
        <div className="mt-3">
          <div className="mb-2 text-xs text-white/45">最近一次结果</div>
          <TaskCard task={latestFinishedTask} />
        </div>
      )}
    </div>
  )
}
