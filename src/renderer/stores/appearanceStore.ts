import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import BG1 from '@renderer/assets/T_PhoneSystemPanelS.png'
import BG2 from '@renderer/assets/T_PhoneSystemIconBg02.png'
import BG3 from '@renderer/assets/T_PhoneSystemIconBg03.png'
import BG1Pre from '@renderer/assets/T_PhoneSystemIconBg00Small.png'
import BG2Pre from '@renderer/assets/T_PhoneSystemIconBg02Small.png'
import BG3Pre from '@renderer/assets/T_PhoneSystemIconBg03Small.png'

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

const BACKGROUND_BY_ID = new Map(CHAT_BACKGROUNDS.map((background) => [background.id, background]))
const DEFAULT_BACKGROUND_ID = CHAT_BACKGROUNDS[0].id

type AppearanceStore = {
  appearance: Appearance
  setBackgroundId: (backgroundId: string) => void
}

type Appearance = {
  backgroundId: string
}

type PersistedAppearanceState = Pick<AppearanceStore, 'appearance'>

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
 * @description 从持久化的外观状态中解析可用的外观配置，并确保背景 ID 合法。
 * @param persistedState 由 Zustand persist 反序列化后的状态片段。
 * @param fallbackAppearance 持久化数据不可用时使用的回退外观配置。
 * @returns 已校验可用的外观配置。
 */
function resolvePersistedAppearance(
  persistedState: unknown,
  fallbackAppearance: Appearance
): Appearance {
  if (!persistedState || typeof persistedState !== 'object') {
    return fallbackAppearance
  }

  const candidateState = persistedState as Partial<PersistedAppearanceState>
  return {
    ...fallbackAppearance,
    backgroundId: resolveBackgroundId(candidateState.appearance?.backgroundId)
  }
}

/**
 * @description 合并持久化外观状态与当前 store 状态，并确保恢复后的外观配置始终有效。
 * @param persistedState 由 Zustand persist 反序列化后的状态片段。
 * @param currentState 当前初始化完成的 appearance store 状态。
 * @returns 已合并且经过背景 ID 校验的外观状态。
 */
function mergePersistedAppearanceState(
  persistedState: unknown,
  currentState: AppearanceStore
): AppearanceStore {
  return {
    ...currentState,
    appearance: resolvePersistedAppearance(persistedState, currentState.appearance)
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

export const useAppearanceStore = create<AppearanceStore>()(
  persist(
    (set) => ({
      appearance: {
        backgroundId: DEFAULT_BACKGROUND_ID
      },
      setBackgroundId: (backgroundId) => {
        const nextBackgroundId = resolveBackgroundId(backgroundId)
        set({
          appearance: {
            backgroundId: nextBackgroundId
          }
        })
      }
    }),
    {
      name: 'appearance-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state): PersistedAppearanceState => ({
        appearance: state.appearance
      }),
      merge: (persistedState, currentState) =>
        mergePersistedAppearanceState(persistedState, currentState)
    }
  )
)

/**
 * @description 从 appearance store 中选出当前生效的聊天背景配置。
 * @param state 聊天外观状态。
 * @returns 当前选中的背景配置。
 */
export function selectActiveBackground(state: AppearanceStore): ChatBackground {
  return getChatBackgroundById(state.appearance.backgroundId)
}
