import { useState, type ReactElement } from 'react'
import type { GachaUrlRequest, GachaUrlResult } from '@shared/tools'
import { trackUiEvent } from '@renderer/logging'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Textarea } from '@renderer/components/ui/textarea'
import { SettingItem } from './setting-item'

export function ToolsTab(): ReactElement {
  const [isLoading, setIsLoading] = useState(false)
  const [manualPath, setManualPath] = useState('')
  const [result, setResult] = useState<GachaUrlResult | null>(null)
  const [showManualPathInput, setShowManualPathInput] = useState(false)

  /**
   * @description 触发一次抽卡链接获取请求，并将结构化结果同步到当前页面状态。
   * @param request 可选请求参数；为空时走自动扫描。
   * @returns 用于等待请求完成的 Promise。
   */
  const runLookup = async (request?: GachaUrlRequest): Promise<void> => {
    try {
      setIsLoading(true)

      const nextResult = await window.tools.getGachaUrl(request)
      setResult(nextResult)
      setShowManualPathInput(nextResult.requiresManualPath)

      if (nextResult.ok) {
        setManualPath('')
      }
    } catch (error) {
      console.error('Failed to resolve gacha URL', error)
      setResult({
        ok: false,
        url: null,
        message: error instanceof Error ? error.message : String(error),
        requiresManualPath: true
      })
      setShowManualPathInput(true)
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * @description 发起自动扫描请求。
   * @returns 用于等待请求完成的 Promise。
   */
  const handleAutoLookup = async (): Promise<void> => {
    trackUiEvent('tools-gacha-url-auto', 'User started automatic gacha URL lookup')
    await runLookup()
  }

  /**
   * @description 使用用户输入的安装目录重新尝试提取抽卡链接。
   * @returns 用于等待请求完成的 Promise。
   */
  const handleManualLookup = async (): Promise<void> => {
    const nextManualPath = manualPath.trim()

    if (!nextManualPath) {
      setResult({
        ok: false,
        url: null,
        message: '请输入游戏安装目录后再重试。',
        requiresManualPath: true
      })
      setShowManualPathInput(true)
      return
    }

    trackUiEvent('tools-gacha-url-manual', 'User retried gacha URL lookup with a manual path', {
      pathLength: nextManualPath.length
    })
    await runLookup({ gamePath: nextManualPath })
  }

  return (
    <div className="px-4">
      <div className="space-y-3">
        <SettingItem
          title="抽卡链接"
          description="自动扫描本机日志并提取鸣潮抽卡记录链接；如果自动获取失败，可以手动填写游戏安装目录重试。"
        >
          <Button
            type="button"
            variant="secondary"
            className="rounded"
            disabled={isLoading}
            onClick={() => void handleAutoLookup()}
          >
            {isLoading ? '获取中...' : '获取链接'}
          </Button>
        </SettingItem>

        {result && (
          <div
            className={`rounded border px-4 py-3 text-sm ${
              result.ok
                ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
                : 'border-red-400/30 bg-red-500/10 text-red-100'
            }`}
          >
            {result.message}
          </div>
        )}

        {result?.url && (
          <div className="rounded border border-white/10 bg-black/25 p-4">
            <div className="mb-2 text-sm text-white/75">抽卡链接</div>
            <Textarea
              readOnly
              value={result.url}
              rows={4}
              className="resize-none border-white/10 bg-black/35 font-mono text-xs leading-5 text-white/90"
            />
          </div>
        )}

        {showManualPathInput && (
          <div className="rounded border border-white/10 bg-black/25 p-4">
            <div className="mb-3 text-sm text-white/75">手动输入游戏安装目录</div>
            <div className="flex flex-col gap-3 md:flex-row">
              <Input
                value={manualPath}
                onChange={(event) => setManualPath(event.target.value)}
                placeholder="例如：C:\\Wuthering Waves\\Wuthering Waves Game"
                className="flex-1"
              />
              <Button
                type="button"
                variant="secondary"
                className="rounded md:self-start"
                disabled={isLoading}
                onClick={() => void handleManualLookup()}
              >
                {isLoading ? '重试中...' : '手动重试'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
