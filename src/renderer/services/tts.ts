import type { TtsSynthesisRequest } from '@shared/tts'
/**
 * @description 请求合成一段角色语音。
 * @param request 包含文本、角色和语音配置的合成请求。
 * @returns 语音合成结果的 Promise。
 */
export function synthesize(request: TtsSynthesisRequest): ReturnType<typeof window.tts.synthesize> {
  return window.tts.synthesize(request)
}
/**
 * @description 取消指定语音合成。
 * @param requestId 要取消的语音合成请求标识。
 * @returns 主进程处理取消请求后的 Promise。
 */
export function cancel(requestId: string): ReturnType<typeof window.tts.cancel> {
  return window.tts.cancel(requestId)
}
/**
 * @description 测试本地 TTS 引擎连通性。
 * @returns 本地 TTS 引擎测试结果的 Promise。
 */
export function testLocalTtsConnection(): ReturnType<typeof window.tts.testLocalEngineConnection> {
  return window.tts.testLocalEngineConnection()
}
/**
 * @description 查询角色本地音色下载状态。
 * @param characterId 要查询音色资源的角色标识。
 * @returns 角色音色下载状态的 Promise。
 */
export function getCharacterVoiceStatus(
  characterId: string
): ReturnType<typeof window.tts.getCharacterVoiceStatus> {
  return window.tts.getCharacterVoiceStatus(characterId)
}
/**
 * @description 下载角色本地音色资源。
 * @param characterId 要下载音色资源的角色标识。
 * @returns 主进程下载任务完成后的 Promise。
 */
export function downloadCharacterVoice(
  characterId: string
): ReturnType<typeof window.tts.downloadCharacterVoice> {
  return window.tts.downloadCharacterVoice(characterId)
}
