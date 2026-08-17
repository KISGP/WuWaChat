import { getLoreService } from '@main/chat'
import { handleLogged } from './logged-handler'

/**
 * @description 注册原作 Lore Package 的状态查询和重建 IPC。
 */
export function registerLoreIpc(): void {
  const lore = getLoreService()

  handleLogged('lore:getStatus', () => lore.getStatus())
  handleLogged('lore:updateSource', () => lore.updateSource())
  handleLogged('lore:rebuild', () => lore.rebuild())
  handleLogged('lore:buildSemanticIndex', () => lore.buildSemanticIndex())
}
