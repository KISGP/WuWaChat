import type { AgentToolPackage } from '@main/agent/runtime/agent-types'
import { createCurrentDatetimeTool } from './tool'

/**
 * @description 创建提供当前时间查询的只读工具包。
 * @returns 时间工具包。
 */
export function createDatetimeToolPackage(): AgentToolPackage {
  return {
    id: 'datetime',
    tools: [createCurrentDatetimeTool()]
  }
}
