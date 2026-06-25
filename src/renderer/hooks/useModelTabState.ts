import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type { ModelProfile } from '@shared/chat'
import type { OpenAIProfileConnectionTestResult } from '@shared/model-settings'
import { type ModelOptionsCache } from '@renderer/components/settings/model/helpers'
import { trackUiEvent } from '@renderer/logging'
import { connectionFingerprint, isValidUrl } from '@renderer/utils'

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
  visibleModelOptions: string[]
  hasModelOptions: boolean
  baseUrlInvalid: boolean
  canTest: boolean
  testResults: Record<string, OpenAIProfileConnectionTestResult>
  updateCurrentProfile: (patch: Partial<ModelProfile>) => void
  handleProviderSelect: (provider: ModelProfile['provider']) => void
  handleTestConnection: () => Promise<void>
  handleConfirmDelete: () => void
}

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
  const [testResults, setTestResults] = useState<Record<string, OpenAIProfileConnectionTestResult>>(
    {}
  )
  const [modelOptions, setModelOptions] = useState<Record<string, ModelOptionsCache>>({})

  const currentFingerprint = currentProfile ? connectionFingerprint(currentProfile) : ''
  const currentResult = currentProfile ? testResults[currentProfile.id] : undefined
  const currentModelOptions = useMemo(() => {
    if (!currentProfile) {
      return []
    }

    return modelOptions[currentProfile.id]?.fingerprint === currentFingerprint
      ? modelOptions[currentProfile.id].models
      : []
  }, [currentFingerprint, currentProfile, modelOptions])
  const visibleModelOptions = useMemo(() => {
    const query = currentProfile?.model.trim().toLowerCase() || ''
    if (!query) return currentModelOptions

    return currentModelOptions.filter((model) => model.toLowerCase().includes(query))
  }, [currentModelOptions, currentProfile?.model])

  const hasModelOptions = currentModelOptions.length > 0
  const baseUrlInvalid = currentProfile ? !isValidUrl(currentProfile.baseUrl) : false
  const canTest =
    Boolean(currentProfile) && !baseUrlInvalid && testingProfile !== currentProfile?.id

  const clearProfileConnectionState = (profileId: string): void => {
    setTestResults((current) => {
      const next = { ...current }
      delete next[profileId]
      return next
    })
    setModelOptions((current) => {
      const next = { ...current }
      delete next[profileId]
      return next
    })
  }

  const updateCurrentProfile = (patch: Partial<ModelProfile>): void => {
    if (!currentProfile) return

    updateProfile(currentProfile.id, patch)

    if ('provider' in patch || 'baseUrl' in patch || 'apiKey' in patch) {
      clearProfileConnectionState(currentProfile.id)
      return
    }

    if (!('model' in patch)) {
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

    trackUiEvent('model-connection-test', 'User started a model connection test', {
      profileId: currentProfile.id,
      provider: currentProfile.provider,
      baseUrl: currentProfile.baseUrl,
      model: currentProfile.model
    })
    setTestingProfile(currentProfile.id)
    try {
      const result = await window.settings.testProfile(currentProfile)
      setTestResults((current) => ({
        ...current,
        [currentProfile.id]: result
      }))

      if (result.ok && result.models && result.models.length > 0) {
        setModelOptions((current) => ({
          ...current,
          [currentProfile.id]: {
            fingerprint: currentFingerprint,
            models: result.models || []
          }
        }))
      } else {
        setModelOptions((current) => {
          const next = { ...current }
          delete next[currentProfile.id]
          return next
        })
      }
    } catch (error) {
      setTestResults((current) => ({
        ...current,
        [currentProfile.id]: {
          ok: false,
          message: error instanceof Error ? error.message : String(error)
        }
      }))
      setModelOptions((current) => {
        const next = { ...current }
        delete next[currentProfile.id]
        return next
      })
    } finally {
      setTestingProfile(null)
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
    visibleModelOptions,
    hasModelOptions,
    baseUrlInvalid,
    canTest,
    testResults,
    updateCurrentProfile,
    handleProviderSelect,
    handleTestConnection,
    handleConfirmDelete
  }
}
