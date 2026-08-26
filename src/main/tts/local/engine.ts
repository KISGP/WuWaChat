export type LocalTtsSynthesisInput = {
  text: string
  voicePath: string
  outputPath: string
  signal: AbortSignal
}

/**
 * @description 定义本地 TTS 引擎共用的合成和连接测试生命周期。
 * @remarks 各引擎自行实现其上传、请求和响应协议，基类不强制统一 HTTP 格式。
 */
export abstract class LocalTtsEngine {
  /**
   * @description 调用引擎生成音频并写入指定输出路径。
   * @param input 本次合成所需的文本、音色文件、输出路径和取消信号。
   */
  abstract synthesize(input: LocalTtsSynthesisInput): Promise<void>

  /**
   * @description 检查引擎服务是否可连接。
   * @returns 可展示给用户的连接成功说明。
   */
  abstract testConnection(): Promise<string>
}
