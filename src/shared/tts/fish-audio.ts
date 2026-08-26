import type { TtsCharacterVoiceOverrides } from '@shared/app-settings'

/**
 * @description 提供随应用发布的 Fish Audio 角色初始音色 ID。
 * @remarks 新增角色时在此映射中补充其稳定角色 ID 与 Fish Audio reference_id。
 */
export const DEFAULT_FISH_CHARACTER_REFERENCE_IDS: Readonly<Record<string, string>> = {
  Aemeath: '50108f5c1e494ea08d07415b5e675ae8',
  Cartethyia: '0400c1c77c7f40f89c9ba920ef501823',
  jinxi: '17d05621aa4c483fa2ce75db3cf37d86',
  Denia:'caa0d59b603249b883f12d0a77cce1ad',
  feixue: 'd741449a67614cedbe1701ef4c09ae14',
  Lupa: '658ffd60f30f4f09b76056db548f20a7',
  moning: '7547901e9ccb4d69b85c93a78b23f923',
  shorekeeper: '25ee57dea62e4376902190510527afe2',
  Sigrika: '2934bcdacee942ffb8c449f12ae8d4c6',
  Zani: '85e5c7e0625642cc86c76942e1610fa0',
}

/**
 * @description 解析角色在 Fish Audio 下最终生效的音色 ID。
 * @param characterId 当前待合成角色的稳定标识。
 * @param characterVoices 用户保存的角色声音覆盖。
 * @returns 用户覆盖优先、否则使用应用初始值；两者都不存在时返回空字符串。
 */
export function resolveFishCharacterReferenceId(
  characterId: string,
  characterVoices: TtsCharacterVoiceOverrides
): string {
  return (
    characterVoices[characterId]?.fish?.referenceId ||
    DEFAULT_FISH_CHARACTER_REFERENCE_IDS[characterId] ||
    ''
  )
}
