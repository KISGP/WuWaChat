import { Eye, EyeOff, Trash2 } from 'lucide-react'
import { type ReactElement } from 'react'
import { PROVIDER_DEFAULTS } from '../../../shared/model-settings'
import { useSettings } from '../../context/SettingsContext'
import { useModelTabState } from '../../hooks/useModelTabState'
import { cn } from '../../utils'
import { ModelAdvancedSection } from './model/ModelAdvancedSection'
import { ModelConnectionSection } from './model/ModelConnectionSection'
import { ModelDeleteModal } from './model/ModelDeleteModal'
import { ModelProfileList } from './model/ModelProfileList'
import { ModelProviderField } from './model/ModelProviderField'
import { ModelSelectorField } from './model/ModelSelectorField'
import { inputClassName } from './model/helpers'

export function ModelTab(): ReactElement {
  const {
    store,
    isLoaded,
    activeProfile,
    setActiveProfileId,
    updateProfile,
    updateProfileProvider,
    addProfile,
    removeProfile
  } = useSettings()

  const profiles = store.profiles
  const currentProfile = activeProfile || profiles[0]
  const {
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
  } = useModelTabState({
    currentProfile,
    updateProfile,
    updateProfileProvider,
    removeProfile
  })

  return (
    <div className="relative flex h-full w-full px-6">
      <ModelProfileList
        profiles={profiles}
        currentProfileId={currentProfile?.id}
        testResults={testResults}
        onAddProfile={addProfile}
        onSelectProfile={setActiveProfileId}
      />

      <div className="flex flex-1  flex-col gap-4 overflow-y-auto p-6">
        {!isLoaded && (
          <div className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/60">
            正在读取模型配置...
          </div>
        )}

        {currentProfile ? (
          <>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="truncate text-base font-medium text-white/90">
                  {currentProfile.name}
                </h2>
                <p className="mt-1 text-xs text-white/45">
                  当前已接入 OpenAI 和 DeepSeek，后续厂商会继续沿用同一 profile 架构扩展。
                </p>
              </div>

              {profiles.length > 1 && (
                <button
                  type="button"
                  onClick={() => setDeleteTarget(currentProfile)}
                  className="flex size-9 shrink-0 items-center justify-center rounded border border-red-400/30 bg-red-500/10 text-red-300 transition-colors hover:bg-red-500/20"
                  title="删除模型配置"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>

            <section className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-white/55">显示名称</span>
                <input
                  type="text"
                  value={currentProfile.name}
                  onChange={(event) => updateCurrentProfile({ name: event.target.value })}
                  className={inputClassName()}
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
            </section>

            <section className="grid grid-cols-2 gap-3">
              <label className="col-span-2 flex flex-col gap-1.5">
                <span className="text-xs text-white/55">Base URL</span>
                <input
                  type="url"
                  value={currentProfile.baseUrl}
                  onChange={(event) => updateCurrentProfile({ baseUrl: event.target.value })}
                  className={inputClassName(baseUrlInvalid)}
                  placeholder={PROVIDER_DEFAULTS[currentProfile.provider].baseUrl}
                />
                {baseUrlInvalid && (
                  <span className="text-xs text-red-300">
                    请输入以 http 或 https 开头的有效地址
                  </span>
                )}
              </label>

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

              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-white/55">API Key</span>
                <span className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={currentProfile.apiKey}
                    onChange={(event) => updateCurrentProfile({ apiKey: event.target.value })}
                    className={cn(inputClassName(), 'w-full pr-10')}
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
            </section>

            <ModelAdvancedSection
              advancedOpen={advancedOpen}
              profile={currentProfile}
              onToggle={() => setAdvancedOpen((value) => !value)}
              onUpdate={updateCurrentProfile}
            />

            <ModelConnectionSection
              canTest={canTest}
              testing={testingProfile === currentProfile.id}
              result={currentResult}
              modelOptions={currentModelOptions}
              onTest={handleTestConnection}
            />
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-white/50">暂无模型配置</div>
        )}
      </div>

      {deleteTarget && (
        <ModelDeleteModal
          target={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  )
}
