import type { LocalTtsProviderSettings } from '@shared/app-settings'
import type { LocalTtsEngine } from './engine'
import { IndexTtsEngine } from './index-tts'

/**
 * @description 根据本地 TTS 设置创建当前选中的引擎适配器。
 * @param settings 本地 provider 的完整配置。
 * @returns 可执行本地合成和连接测试的引擎。
 */
export function createLocalTtsEngine(settings: LocalTtsProviderSettings): LocalTtsEngine {
  return new IndexTtsEngine(settings.engineConfigs.indexTts.baseUrl)
}
