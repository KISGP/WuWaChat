import { Eye, EyeOff } from 'lucide-react'
import { type ReactElement } from 'react'
import { PROVIDER_DEFAULTS } from '@shared/model-settings'
import { useModelTabState } from '@renderer/hooks/useModelTabState'
import { selectActiveProfile, useSettingsStore } from '@renderer/stores/settingsStore'
import { useShallow } from 'zustand/react/shallow'
import { ModelConnectionSection } from './model/ModelConnectionSection'
import { ModelDeleteModal } from './model/ModelDeleteModal'
import { ModelProfileList } from './model/ModelProfileList'
import { ModelProviderField } from './model/ModelProviderField'
import { ModelSelectorField } from './model/ModelSelectorField'
import { SectionCard } from '@renderer/components/settings/section'
import { Input } from '@renderer/components/ui/input'

export function ModelTab(): ReactElement {
  const activeProfile = useSettingsStore(selectActiveProfile)
  const {
    store,
    isLoaded,
    setActiveProfileId,
    updateProfile,
    updateProfileProvider,
    addProfile,
    removeProfile
  } = useSettingsStore(
    useShallow((state) => ({
      store: state.store,
      isLoaded: state.isLoaded,
      setActiveProfileId: state.setActiveProfileId,
      updateProfile: state.updateProfile,
      updateProfileProvider: state.updateProfileProvider,
      addProfile: state.addProfile,
      removeProfile: state.removeProfile
    }))
  )

  const profiles = store.profiles
  const currentProfile = activeProfile || profiles[0]
  const {
    showApiKey,
    setShowApiKey,
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
  } = useModelTabState({
    currentProfile,
    updateProfile,
    updateProfileProvider,
    removeProfile
  })

  return (
    <>
      <div className="mx-auto flex h-full max-w-6xl flex-col gap-4 overflow-y-auto px-4 pb-3">
        {!isLoaded && (
          <div className="rounded border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/60">
            正在读取模型配置...
          </div>
        )}

        <SectionCard title="模型配置">
          <ModelProfileList
            profiles={profiles}
            currentProfileId={currentProfile?.id}
            testResults={testResults}
            onAddProfile={addProfile}
            onSelectProfile={setActiveProfileId}
            onDeleteProfile={setDeleteTarget}
          />
        </SectionCard>

        {currentProfile ? (
          <>
            <SectionCard title={currentProfile.name}>
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="rounded border border-white/8 bg-black/20 p-4">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs text-white/55">显示名称</span>
                      <Input
                        type="text"
                        value={currentProfile.name}
                        onChange={(event) => updateCurrentProfile({ name: event.target.value })}
                      />
                    </label>

                    <ModelProviderField
                      profile={currentProfile}
                      providerDropdownOpen={providerDropdownOpen}
                      onToggleDropdown={() => setProviderDropdownOpen((value) => !value)}
                      onCloseDropdown={() => setProviderDropdownOpen(false)}
                      onOpenDropdown={() => setProviderDropdownOpen(true)}
                      onSelectProvider={handleProviderSelect}
                    />

                    <ModelSelectorField
                      model={currentProfile.model}
                      placeholder={PROVIDER_DEFAULTS[currentProfile.provider].model}
                      hasModelOptions={hasModelOptions}
                      modelDropdownOpen={modelDropdownOpen}
                      visibleModelOptions={visibleModelOptions}
                      onChange={(value) => {
                        updateCurrentProfile({ model: value })
                        setModelDropdownOpen(true)
                      }}
                      onToggleDropdown={() => setModelDropdownOpen((value) => !value)}
                      onOpenDropdown={() => setModelDropdownOpen(true)}
                      onCloseDropdown={() => setModelDropdownOpen(false)}
                      onSelectModel={(model) => {
                        updateCurrentProfile({ model })
                        setModelDropdownOpen(false)
                      }}
                    />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs text-white/55">Base URL</span>
                      <Input
                        type="url"
                        value={currentProfile.baseUrl}
                        onChange={(event) => updateCurrentProfile({ baseUrl: event.target.value })}
                        placeholder={PROVIDER_DEFAULTS[currentProfile.provider].baseUrl}
                      />
                      {baseUrlInvalid && (
                        <span className="text-xs text-red-300">
                          请输入以 `http` 或 `https` 开头的有效地址。
                        </span>
                      )}
                    </label>

                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs text-white/55">API Key</span>
                      <span className="relative">
                        <Input
                          type={showApiKey ? 'text' : 'password'}
                          value={currentProfile.apiKey}
                          onChange={(event) => updateCurrentProfile({ apiKey: event.target.value })}
                          className="w-full pr-10"
                          placeholder="sk-..."
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey((value) => !value)}
                          className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center text-white/45 hover:text-white/80"
                          title={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                        >
                          {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </SectionCard>

            {/* <SectionCard title="高级设置">
              <ModelAdvancedSection
                advancedOpen={advancedOpen}
                profile={currentProfile}
                onToggle={() => setAdvancedOpen((value) => !value)}
                onUpdate={updateCurrentProfile}
              />
            </SectionCard> */}

            <ModelConnectionSection
              canTest={canTest}
              testing={testingProfile === currentProfile.id}
              result={currentResult}
              modelOptions={currentModelOptions}
              onTest={handleTestConnection}
            />
          </>
        ) : (
          <SectionCard title="模型设置">
            <div className="flex min-h-36 items-center justify-center rounded border border-dashed border-white/10 bg-black/20 text-white/50">
              暂无模型配置
            </div>
          </SectionCard>
        )}
      </div>

      {deleteTarget && (
        <ModelDeleteModal
          target={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </>
  )
}
