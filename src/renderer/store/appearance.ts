import { create } from 'zustand'
import type { AppearanceSettings } from '@shared/settings'
import BG1 from '@renderer/assets/T_PhoneSystemPanelS.png'
import BG2 from '@renderer/assets/T_PhoneSystemIconBg02.png'
import BG3 from '@renderer/assets/T_PhoneSystemIconBg03.png'
import BG1Pre from '@renderer/assets/T_PhoneSystemIconBg00Small.png'
import BG2Pre from '@renderer/assets/T_PhoneSystemIconBg02Small.png'
import BG3Pre from '@renderer/assets/T_PhoneSystemIconBg03Small.png'
import PhoneDialogueR_000 from '@renderer/assets/T_IconA_PhoneDialogueR_000_UI.png'
import PhoneDialogueR_001 from '@renderer/assets/T_IconA_PhoneDialogueR_001_UI.png'
import PhoneDialogueR_002 from '@renderer/assets/T_IconA_PhoneDialogueR_002_UI.png'
import PhoneDialogueR_003 from '@renderer/assets/T_IconA_PhoneDialogueR_003_UI.png'
import { saveAppearance as persistAppearance } from '@renderer/services/settings'

export type ChatBackground = {
  id: string
  name: string
  previewSrc: string
  fullSrc: string
  description: string
  obtained: string
}

export const CHAT_BACKGROUNDS: ChatBackground[] = [
  {
    id: 'default',
    name: '默认背景',
    previewSrc: BG1Pre,
    fullSrc: BG1,
    description: '飞讯默认聊天背景',
    obtained: '默认获得'
  },
  {
    id: 'sweet-coffee-time',
    name: '甜咖时光',
    previewSrc: BG2Pre,
    fullSrc: BG2,
    description: '研磨的时光中，唯有伙伴的笑语与咖啡的香气与你共享此刻的静谧。',
    obtained: '购买飞讯特惠礼包 · 甜咖的金印后解锁'
  },
  {
    id: 'i-miss-you-all-the-time',
    name: 'I miss you all the time',
    previewSrc: BG3Pre,
    fullSrc: BG3,
    description: 'I Really Want to Stay At Your House.',
    obtained: '在幻梦珊瑚商店购买后解锁'
  }
]

export const BUBBLE_BACKGROUNDS: ChatBackground[] = [
  {
    id: 'default',
    name: '默认气泡',
    previewSrc: PhoneDialogueR_000,
    fullSrc: '',
    description: '飞讯默认聊天气泡。',
    obtained: '默认获得'
  },
  {
    id: 'bzbb',
    name: '波仔啵啵',
    previewSrc: PhoneDialogueR_001,
    fullSrc: '',
    description: '客人,又见面了。这次要尝尝店内的新款咖啡吗?',
    obtained: '购买飞讯特惠礼包 ·甜咖的金印后解锁'
  },
  {
    id: 'pgzd',
    name: '盘古终端',
    previewSrc: PhoneDialogueR_002,
    fullSrc: '',
    description: '为飞讯新用户准备的礼物,一款以盘古终端为原型设计的聊天气泡。',
    obtained: '默认获得'
  },
  {
    id: 'dwmdns',
    name: '大卫·马丁内斯',
    previewSrc: PhoneDialogueR_003,
    fullSrc: '',
    description: '不过,或许所谓传奇便是如此:世间有千万人,就有千万个传奇的影子。',
    obtained: '在幻梦珊瑚商店购买后解锁'
  }
]

const BACKGROUND_BY_ID = new Map(CHAT_BACKGROUNDS.map((background) => [background.id, background]))
const DEFAULT_BACKGROUND_ID = CHAT_BACKGROUNDS[0].id

type AppearanceStore = {
  appearance: Appearance
  isLoaded: boolean
  saveError: string | null
  hydrate: (appearance: AppearanceSettings) => void
  setBackgroundId: (backgroundId: string) => Promise<void>
  retrySave: () => Promise<void>
}

type Appearance = {
  backgroundId: string
}

/**
 * @description 从背景列表中解析可用的背景 ID，不合法时回退为默认背景。
 * @param backgroundId 待解析的背景 ID，允许为空或未知值。
 * @returns 可安全使用的背景 ID。
 */
function resolveBackgroundId(backgroundId: string | null | undefined): string {
  if (!backgroundId || !BACKGROUND_BY_ID.has(backgroundId)) {
    return DEFAULT_BACKGROUND_ID
  }

  return backgroundId
}

/**
 * @description 保存界面外观设置，并将失败状态保留给界面显示与重试。
 * @param appearance 待持久化的外观设置。
 * @param set Zustand 的状态更新函数。
 * @returns 外观设置保存尝试结束后的 Promise。
 * @remarks 写入失败时会记录错误并更新 Store，不会向调用方重新抛出异常。
 */
async function saveAppearance(
  appearance: Appearance,
  set: (partial: Partial<AppearanceStore>) => void
): Promise<void> {
  try {
    await persistAppearance(appearance)
    set({ saveError: null })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Failed to save appearance settings', error)
    set({ saveError: message })
  }
}

/**
 * @description 根据背景 ID 获取完整背景元数据，不合法时回退为默认背景。
 * @param backgroundId 待查找的背景 ID。
 * @returns 匹配到的背景配置。
 */
export function getChatBackgroundById(backgroundId: string): ChatBackground {
  return BACKGROUND_BY_ID.get(backgroundId) ?? CHAT_BACKGROUNDS[0]
}

export const useAppearanceStore = create<AppearanceStore>((set, get) => ({
  appearance: {
    backgroundId: DEFAULT_BACKGROUND_ID
  },
  isLoaded: false,
  saveError: null,
  /**
   * @description 使用主进程返回的外观设置初始化 Store。
   * @param appearance 主进程返回的外观设置快照。
   * @returns 无返回值。
   */
  hydrate: (appearance) =>
    set({
      appearance: { backgroundId: resolveBackgroundId(appearance.backgroundId) },
      isLoaded: true
    }),
  /**
   * @description 更新聊天背景并持久化外观设置。
   * @param backgroundId 用户选择的背景标识。
   * @returns 外观设置保存流程完成后的 Promise。
   * @remarks 无效背景标识会在写入前回退为默认背景。
   */
  setBackgroundId: async (backgroundId) => {
    const appearance = { backgroundId: resolveBackgroundId(backgroundId) }
    set({ appearance, saveError: null })
    await saveAppearance(appearance, set)
  },
  /**
   * @description 重试保存当前外观设置。
   * @returns 当前外观设置保存流程完成后的 Promise。
   */
  retrySave: async () => saveAppearance(get().appearance, set)
}))

/**
 * @description 从外观 Store 中选出当前生效的聊天背景配置。
 * @param state 聊天外观状态。
 * @returns 当前选中的背景配置。
 */
export function selectActiveBackground(state: AppearanceStore): ChatBackground {
  return getChatBackgroundById(state.appearance.backgroundId)
}
