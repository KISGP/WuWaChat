import type { AppSettings } from '@shared/app-settings'
import type { OpenAIProfileConnectionTestRequest, ProfilesStore } from '@shared/model-settings'
import type { AppearanceSettings } from '@shared/settings'
import type { AgentSettingsStore, MoeGirlpediaConnectionTestRequest } from '@shared/agent-settings'
import {
  getProfiles,
  cancelProfileTest,
  getUnifiedSettings,
  cancelMoeGirlpediaTest,
  saveAppearanceSettings,
  saveAgentSettings,
  saveProfiles,
  testMoeGirlpedia,
  testProfile
} from '@main/settings'
import { getAppSettings, saveAppSettings } from '@main/settings/app-settings'
import { handleLogged } from './logged-handler'

export function registerSettingsIpc(): void {
  handleLogged('settings:getUnifiedSettings', () => getUnifiedSettings())
  handleLogged('settings:getAppSettings', () => getAppSettings())
  handleLogged('settings:saveAppSettings', (_event, settings: AppSettings) =>
    saveAppSettings(settings)
  )
  handleLogged('settings:getProfiles', () => getProfiles())
  handleLogged('settings:saveAppearance', (_event, appearance: AppearanceSettings) =>
    saveAppearanceSettings(appearance)
  )
  handleLogged('settings:saveAgent', (_event, settings: AgentSettingsStore) =>
    saveAgentSettings(settings)
  )
  handleLogged('settings:testMoeGirlpedia', (_event, request: MoeGirlpediaConnectionTestRequest) =>
    testMoeGirlpedia(request)
  )
  handleLogged(
    'settings:saveProfiles',
    (_event, store: ProfilesStore) => saveProfiles(store),
    (store) => ({
      profileCount: store.profiles.length,
      activeProfileId: store.activeProfileId
    })
  )
  handleLogged(
    'settings:testProfile',
    (_event, request: OpenAIProfileConnectionTestRequest) => testProfile(request),
    (request) => ({
      requestId: request.requestId,
      profileId: request.profile.id,
      provider: request.profile.provider,
      baseUrl: request.profile.baseUrl,
      model: request.profile.model
    })
  )
  handleLogged('settings:cancelProfileTest', (_event, requestId: string) =>
    cancelProfileTest(requestId)
  )
  handleLogged('settings:cancelMoeGirlpediaTest', (_event, requestId: string) =>
    cancelMoeGirlpediaTest(requestId)
  )
}
