import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type { ModelProfile } from '@shared/chat'
import type { OpenAIProfileConnectionTestResult } from '@shared/model-settings'
import { trackUiEvent } from '@renderer/logging'
import { connectionFingerprint, isValidUrl } from '@renderer/utils'
import { useSettingsStore } from '@renderer/stores/settingsStore'

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
 * @description Coordinates model-profile editor state, connection testing, and persisted catalogs.
 * @param args The selected profile and store operations required by the settings page.
 * @returns UI state and event handlers for the model settings tab.
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
   * @description Removes volatile test feedback after endpoint credentials are changed.
   * @param profileId The profile whose current test result is no longer valid.
   */
  const clearProfileConnectionState = (profileId: string): void => {
    setTestResults((current) => {
      const next = { ...current }
      delete next[profileId]
      return next
    })
  }

  /**
   * @description Updates the selected profile and invalidates its catalog when its connection changes.
   * @param patch The editable fields to apply to the selected profile.
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
      const result = await window.settings.testProfile({ requestId, profile: currentProfile })
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
   * @description Requests cancellation for the active connection test, if one exists.
   * @returns A promise that resolves after the main process receives the cancellation request.
   */
  const handleCancelTestConnection = async (): Promise<void> => {
    if (!testingRequestId) return

    try {
      await window.settings.cancelProfileTest(testingRequestId)
    } catch (error) {
      console.error('Failed to cancel model connection test', error)
    }
  }

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
