import { InferenceClient } from '@huggingface/inference'
import { OpenAIEmbeddings } from '@langchain/openai'
import type {
  CloudEmbeddingSettings,
  EmbeddingConnectionTestResult,
  EmbeddingFingerprint,
  HuggingFaceInferenceProvider
} from '@shared/memory-settings'

function requireValue(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`${label} is required`)
  }

  return trimmed
}

function getHuggingFaceInferenceProvider(
  settings: CloudEmbeddingSettings
): HuggingFaceInferenceProvider {
  return requireValue(
    settings.inferenceProvider || 'hf-inference',
    'Hugging Face inference provider'
  ) as HuggingFaceInferenceProvider
}

function getVolcengineArkBaseUrl(settings: CloudEmbeddingSettings): string {
  return requireValue(settings.baseUrl, 'Volcengine Ark base URL')
}

function joinUrl(baseUrl: string, path: string): string {
  if (baseUrl.replace(/\/+$/, '').endsWith(path)) {
    return baseUrl.replace(/\/+$/, '')
  }

  return `${baseUrl.replace(/\/+$/, '')}${path}`
}

export function createCloudEmbeddingFingerprint(
  settings: CloudEmbeddingSettings,
  dimensions?: number
): EmbeddingFingerprint {
  return {
    mode: 'cloud',
    provider: settings.provider,
    model: settings.model.trim(),
    dimensions: dimensions ?? settings.dimensions ?? null,
    implementationVersion:
      settings.provider === 'huggingface-inference'
        ? `huggingface-inference-v1:${getHuggingFaceInferenceProvider(settings)}`
        : settings.provider === 'volcengine-ark'
          ? `volcengine-ark-v1:${getVolcengineArkBaseUrl(settings)}`
          : 'openai-compatible-v1',
    createdAt: new Date().toISOString()
  }
}

type EmbeddingAdapter = {
  embedDocuments: (texts: string[]) => Promise<number[][]>
  embedQuery: (text: string) => Promise<number[]>
}

class OpenAICompatibleAdapter implements EmbeddingAdapter {
  private readonly model: OpenAIEmbeddings

  constructor(settings: CloudEmbeddingSettings) {
    this.model = new OpenAIEmbeddings({
      apiKey: settings.apiKey.trim() || undefined,
      model: requireValue(settings.model, 'Embedding model'),
      dimensions: settings.dimensions || undefined,
      configuration: {
        baseURL: requireValue(settings.baseUrl, 'Embedding base URL')
      }
    })
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return []
    }

    return this.model.embedDocuments(texts)
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.model.embedQuery(text)
  }
}

class HuggingFaceInferenceAdapter implements EmbeddingAdapter {
  private readonly client: InferenceClient
  private readonly model: string
  private readonly inferenceProvider: HuggingFaceInferenceProvider

  constructor(settings: CloudEmbeddingSettings) {
    this.client = new InferenceClient(requireValue(settings.apiKey, 'Hugging Face API key'))
    this.model = requireValue(settings.model, 'Embedding model')
    this.inferenceProvider = getHuggingFaceInferenceProvider(settings)
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const results = await Promise.all(texts.map((text) => this.embedSingle(text)))
    return results
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.embedSingle(text)
  }

  private async embedSingle(text: string): Promise<number[]> {
    const output = await this.client.featureExtraction({
      model: this.model,
      inputs: text,
      provider: this.inferenceProvider
    })

    if (!Array.isArray(output)) {
      throw new Error('Hugging Face feature extraction returned an unexpected response.')
    }

    if (typeof output[0] === 'number') {
      return output as number[]
    }

    if (Array.isArray(output[0])) {
      const matrix = output as number[][]
      if (matrix.length === 0) {
        return []
      }

      const dimensions = matrix[0].length
      const vector = new Array<number>(dimensions).fill(0)
      matrix.forEach((row) => {
        row.forEach((value, index) => {
          vector[index] += Number(value) || 0
        })
      })

      return vector.map((value) => value / matrix.length)
    }

    throw new Error('Hugging Face feature extraction returned a malformed vector.')
  }
}

class VolcengineArkAdapter implements EmbeddingAdapter {
  private readonly baseUrl: string
  private readonly model: string
  private readonly apiKey: string

  constructor(settings: CloudEmbeddingSettings) {
    this.baseUrl = getVolcengineArkBaseUrl(settings)
    this.model = requireValue(settings.model, 'Volcengine Ark model')
    this.apiKey = requireValue(settings.apiKey, 'Volcengine Ark API key')
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => this.embedSingle(text)))
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.embedSingle(text)
  }

  private async embedSingle(text: string): Promise<number[]> {
    const response = await fetch(joinUrl(this.baseUrl, '/embeddings/multimodal'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        input: [
          {
            type: 'text',
            text
          }
        ]
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `Volcengine Ark multimodal embeddings request failed with ${response.status} ${response.statusText}: ${errorText}`
      )
    }

    const payload = (await response.json()) as {
      data?: { embedding?: unknown } | Array<{ embedding?: unknown }>
      embedding?: unknown
    }

    const embedding =
      (Array.isArray(payload.data) ? payload.data[0]?.embedding : payload.data?.embedding) ??
      payload.embedding
    if (!Array.isArray(embedding)) {
      throw new Error(
        'Volcengine Ark multimodal embeddings response did not include a vector. Check that the model supports /embeddings/multimodal and that the model field is your Ark model ID.'
      )
    }

    return embedding.map((value) => Number(value))
  }
}

export class CloudEmbeddingProvider {
  private readonly adapter: EmbeddingAdapter

  constructor(private readonly settings: CloudEmbeddingSettings) {
    this.adapter =
      settings.provider === 'huggingface-inference'
        ? new HuggingFaceInferenceAdapter(settings)
        : settings.provider === 'volcengine-ark'
          ? new VolcengineArkAdapter(settings)
          : new OpenAICompatibleAdapter(settings)
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return this.adapter.embedDocuments(texts)
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.adapter.embedQuery(text)
  }

  async testConnection(): Promise<EmbeddingConnectionTestResult> {
    const startedAt = Date.now()

    try {
      const vector = await this.embedQuery('ping')
      return {
        ok: true,
        latencyMs: Date.now() - startedAt,
        dimensions: vector.length,
        message:
          this.settings.provider === 'huggingface-inference'
            ? `Hugging Face embedding connection succeeded via ${getHuggingFaceInferenceProvider(this.settings)}. Returned ${vector.length} dimensions.`
            : this.settings.provider === 'volcengine-ark'
              ? `Volcengine Ark embedding connection succeeded. Returned ${vector.length} dimensions.`
              : `Embedding connection succeeded. Returned ${vector.length} dimensions.`
      }
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }
}
