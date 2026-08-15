import type { ModelProfile } from '@shared/chat'
import type { AppSettings } from '@shared/app-settings'
import type { ProfilesStore } from '@shared/model-settings'
import { getProfiles, saveProfiles, testProfile } from '@main/settings'
import { getAppSettings, saveAppSettings } from '@main/settings/app-settings'
import { handleLogged } from './logged-handler'

export function registerSettingsIpc(): void {
  handleLogged('settings:getAppSettings', () => getAppSettings())
  handleLogged('settings:saveAppSettings', (_event, settings: AppSettings) =>
    saveAppSettings(settings)
  )
  handleLogged('settings:getProfiles', () => getProfiles())
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
    (_event, profile: ModelProfile) => testProfile(profile),
    (profile) => ({
      profileId: profile.id,
      provider: profile.provider,
      baseUrl: profile.baseUrl,
      model: profile.model
    })
  )
}
