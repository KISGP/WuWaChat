import type { AgentSettingsStore, MoeGirlpediaConnectionTestRequest } from '@shared/agent-settings'
import type { ModelProfile } from '@shared/chat'
import type { AppSettings } from '@shared/app-settings'
import type { AppearanceSettings } from '@shared/settings'
import type { ProfilesStore } from '@shared/model-settings'

/**
 * @description 读取统一应用设置快照。
 * @returns 主进程返回的统一设置。
 */
export function getUnifiedSettings(): ReturnType<typeof window.settings.getUnifiedSettings> {
  return window.settings.getUnifiedSettings()
}

/**
 * @description 保存应用通用设置。
 * @param settings 要持久化的完整应用设置。
 * @returns 主进程保存后的规范化设置 Promise。
 */
export function saveAppSettings(
  settings: AppSettings
): ReturnType<typeof window.settings.saveAppSettings> {
  return window.settings.saveAppSettings(settings)
}

/**
 * @description 保存聊天外观设置。
 * @param settings 要持久化的外观设置。
 * @returns 主进程确认保存后的 Promise。
 */
export function saveAppearance(
  settings: AppearanceSettings
): ReturnType<typeof window.settings.saveAppearance> {
  return window.settings.saveAppearance(settings)
}

/**
 * @description 保存模型 Profile 集合。
 * @param profiles 要持久化的模型配置集合。
 * @returns 主进程确认保存后的 Promise。
 */
export function saveProfiles(
  profiles: ProfilesStore
): ReturnType<typeof window.settings.saveProfiles> {
  return window.settings.saveProfiles(profiles)
}

/**
 * @description 保存 Agent 设置快照。
 * @param settings 待保存的 Agent 设置。
 * @returns 规范化后的 Agent 设置。
 */
export function saveAgentSettings(
  settings: AgentSettingsStore
): ReturnType<typeof window.settings.saveAgent> {
  return window.settings.saveAgent(settings)
}

/**
 * @description 测试萌娘百科连接。
 * @param request 当前测试请求及凭据配置。
 * @returns 连接测试结果。
 */
export function testMoeGirlpedia(
  request: MoeGirlpediaConnectionTestRequest
): ReturnType<typeof window.settings.testMoeGirlpedia> {
  return window.settings.testMoeGirlpedia(request)
}

/**
 * @description 测试模型 Profile 的连接。
 * @param requestId 当前测试请求标识。
 * @param profile 待测试的模型配置。
 * @returns 模型连接测试结果。
 */
export function testModelProfile(
  requestId: string,
  profile: ModelProfile
): ReturnType<typeof window.settings.testProfile> {
  return window.settings.testProfile({ requestId, profile })
}

/**
 * @description 取消指定模型 Profile 的连接测试。
 * @param requestId 需要取消的测试请求标识。
 * @returns 取消操作完成信号。
 */
export function cancelModelProfileTest(
  requestId: string
): ReturnType<typeof window.settings.cancelProfileTest> {
  return window.settings.cancelProfileTest(requestId)
}
