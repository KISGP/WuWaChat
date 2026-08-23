import { app } from 'electron'
import { join } from 'path'

/**
 * @description 返回 World 资料根目录。
 * @returns World 资料的应用数据目录。
 */
export function getWorldRoot(): string {
  return join(app.getPath('userData'), 'app-data', 'world')
}

/**
 * @description 返回 World Story JSON 资料目录。
 * @returns Story JSON 文件目录。
 */
export function getWorldStoryRoot(): string {
  return join(getWorldRoot(), 'story')
}

/**
 * @description 返回 World Glossary 资料目录。
 * @returns Glossary JSON 文件目录。
 */
export function getWorldGlossaryRoot(): string {
  return join(getWorldRoot(), 'glossary')
}

/**
 * @description 返回 World 资料清单路径。
 * @returns World manifest 文件路径。
 */
export function getWorldManifestPath(): string {
  return join(getWorldRoot(), 'manifest.json')
}
