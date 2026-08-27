import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type { ModelProfile } from '@shared/chat'
import type { OpenAIProfileConnectionTestResult } from '@shared/model-settings'
import { trackUiEvent } from '@renderer/app/telemetry'
import { connectionFingerprint, isValidUrl } from '@renderer/common/lib/cn'
import { useSettingsStore } from '@renderer/store/profiles'
import { cancelModelProfileTest, testModelProfile } from '@renderer/services/settings'

type UseModelTabStateArgs = {
  currentProfile?: ModelProfile
  updateProfile: (profileId: string, patch: Partial<ModelProfile>) => void
  updateProfileProvider: (profileId: string, provider: ModelProfile['provider']) => void
  removeProfile: (profileId: string) => void
}

type UseModelTabStateResult = {
  showApiKey: boolean
  setShowApiKey: Dispatch<SetStateAction<boolean>>
  advancedOpen: boolean
  setAdvancedOpen: Dispatch<SetStateAction<boolean>>
  providerDropdownOpen: boolean
  setProviderDropdownOpen: Dispatch<SetStateAction<boolean>>
  modelDropdownOpen: boolean
  setModelDropdownOpen: Dispatch<SetStateAction<boolean>>
  deleteTarget: ModelProfile | null
  setDeleteTarget: Dispatch<SetStateAction<ModelProfile | null>>
  testingProfile: string | null
  currentResult?: OpenAIProfileConnectionTestResult
  currentModelOptions: string[]
  hasModelOptions: boolean
  baseUrlInvalid: boolean
  canTest: boolean
  testResults: Record<string, OpenAIProfileConnectionTestResult>
  updateCurrentProfile: (patch: Partial<ModelProfile>) => void
  handleProviderSelect: (provider: ModelProfile['provider']) => void
  handleTestConnection: () => Promise<void>
  handleCancelTestConnection: () => Promise<void>
  handleConfirmDelete: () => void
}

/**
 * @description 管理模型 Profile 编辑状态、连接测试和模型目录持久化。
 * @param args 设置页所需的当前 Profile 及 Store 操作。
 * @returns 模型设置页使用的状态和事件处理函数。
 */
export function useModelTabState({
  currentProfile,
  updateProfile,
  updateProfileProvider,
  removeProfile
}: UseModelTabStateArgs): UseModelTabStateResult {
  const [showApiKey, setShowApiKey] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [providerDropdownOpen, setProviderDropdownOpen] = useState(false)
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ModelProfile | null>(null)
  const [testingProfile, setTestingProfile] = useState<string | null>(null)
  const [testingRequestId, setTestingRequestId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, OpenAIProfileConnectionTestResult>>(
    {}
  )
  const currentResult = currentProfile ? testResults[currentProfile.id] : undefined
  const currentModelOptions = useMemo(
    () => currentProfile?.modelCatalog?.models || [],
    [currentProfile?.modelCatalog]
  )
  const hasModelOptions = currentModelOptions.length > 0
  const baseUrlInvalid = currentProfile ? !isValidUrl(currentProfile.baseUrl) : false
  const canTest =
    Boolean(currentProfile) && !baseUrlInvalid && testingProfile !== currentProfile?.id

  /**
   * @description 在连接凭据变化后清除指定 Profile 的临时测试结果。
   * @param profileId 测试结果已失效的 Profile 标识。
   * @returns 无返回值。
   */
  const clearProfileConnectionState = (profileId: string): void => {
    setTestResults((current) => {
      const next = { ...current }
      delete next[profileId]
      return next
    })
  }

  /**
   * @description 更新当前 Profile，并在连接配置变化时使模型目录失效。
   * @param patch 要应用到当前 Profile 的可编辑字段。
   * @returns 无返回值。
   */
  const updateCurrentProfile = (patch: Partial<ModelProfile>): void => {
    if (!currentProfile) return

    if ('provider' in patch || 'baseUrl' in patch || 'apiKey' in patch) {
      updateProfile(currentProfile.id, { ...patch, modelCatalog: undefined })
      clearProfileConnectionState(currentProfile.id)
      return
    }

    updateProfile(currentProfile.id, patch)
    if ('model' in patch) {
      setTestResults((current) => {
        const next = { ...current }
        delete next[currentProfile.id]
        return next
      })
    }
  }

  /**
   * @description 应用用户选择的模型提供商并关闭提供商下拉菜单。
   * @param provider 新选择的模型提供商。
   * @returns 无返回值。
   */
  const handleProviderSelect = (provider: ModelProfile['provider']): void => {
    if (!currentProfile) return

    trackUiEvent('model-provider-select', 'User changed model provider', {
      profileId: currentProfile.id,
      provider
    })
    updateProfileProvider(currentProfile.id, provider)
    clearProfileConnectionState(currentProfile.id)
    setProviderDropdownOpen(false)
  }

  /**
   * @description 测试当前模型 Profile 的连接，并在配置未变化时保存测试结果。
   * @returns 连接测试结束并写入结果后的 Promise。
   * @remarks 当当前 Profile 不可测试时会直接返回，不会调用主进程。
   */
  const handleTestConnection = async (): Promise<void> => {
    if (!currentProfile || !canTest) return

    const requestId = crypto.randomUUID()

    trackUiEvent('model-connection-test', 'User started a model connection test', {
      profileId: currentProfile.id,
      provider: currentProfile.provider,
      baseUrl: currentProfile.baseUrl,
      model: currentProfile.model
    })
    setTestingProfile(currentProfile.id)
    setTestingRequestId(requestId)
    try {
      const result = await testModelProfile(requestId, currentProfile)
      const latestProfile = useSettingsStore
        .getState()
        .store.profiles.find((profile) => profile.id === currentProfile.id)
      if (
        latestProfile &&
        connectionFingerprint(latestProfile) === connectionFingerprint(currentProfile)
      ) {
        setTestResults((current) => ({
          ...current,
          [currentProfile.id]: result
        }))
        if (result.modelCatalog) {
          updateProfile(currentProfile.id, { modelCatalog: result.modelCatalog })
        }
      }
    } catch (error) {
      const latestProfile = useSettingsStore
        .getState()
        .store.profiles.find((profile) => profile.id === currentProfile.id)
      if (
        latestProfile &&
        connectionFingerprint(latestProfile) === connectionFingerprint(currentProfile)
      ) {
        setTestResults((current) => ({
          ...current,
          [currentProfile.id]: {
            ok: false,
            message: error instanceof Error ? error.message : String(error)
          }
        }))
      }
    } finally {
      setTestingProfile(null)
      setTestingRequestId(null)
    }
  }

  /**
   * @description 请求取消当前正在执行的模型连接测试。
   * @returns 主进程收到取消请求后的完成信号。
   */
  const handleCancelTestConnection = async (): Promise<void> => {
    if (!testingRequestId) return

    try {
      await cancelModelProfileTest(testingRequestId)
    } catch (error) {
      console.error('Failed to cancel model connection test', error)
    }
  }

  /**
   * @description 确认删除选中的模型 Profile，并清除其临时连接状态。
   * @returns 无返回值。
   */
  const handleConfirmDelete = (): void => {
    if (!deleteTarget) return

    trackUiEvent('model-profile-delete-confirmed', 'User confirmed deleting a model profile', {
      profileId: deleteTarget.id
    })
    removeProfile(deleteTarget.id)
    clearProfileConnectionState(deleteTarget.id)
    setDeleteTarget(null)
  }

  return {
    showApiKey,
    setShowApiKey,
    advancedOpen,
    setAdvancedOpen,
    providerDropdownOpen,
    setProviderDropdownOpen,
    modelDropdownOpen,
    setModelDropdownOpen,
    deleteTarget,
    setDeleteTarget,
    testingProfile,
    currentResult,
    currentModelOptions,
    hasModelOptions,
    baseUrlInvalid,
    canTest,
    testResults,
    updateCurrentProfile,
    handleProviderSelect,
    handleTestConnection,
    handleCancelTestConnection,
    handleConfirmDelete
  }
}
