import type {
  EmbeddingFingerprint,
  InstalledLocalEmbeddingModel
} from '../../shared/memory-settings'

/** Builds the fingerprint used to decide whether a local vector index is still compatible. */
export function createLocalEmbeddingFingerprint(
  model: Pick<
    InstalledLocalEmbeddingModel,
    'id' | 'repoId' | 'dimensions' | 'runtime' | 'installedAt'
  >
): EmbeddingFingerprint {
  return {
    mode: 'local',
    provider: model.runtime,
    model: model.id,
    dimensions: model.dimensions,
    implementationVersion: `transformers-js-v1:${model.repoId}`,
    createdAt: model.installedAt
  }
}

export function getEmbeddingFingerprintKey(
  fingerprint: EmbeddingFingerprint | null | undefined
): string {
  if (!fingerprint) {
    return ''
  }

  return [
    fingerprint.mode,
    fingerprint.provider,
    fingerprint.model,
    fingerprint.dimensions ?? 'auto',
    fingerprint.implementationVersion
  ].join('|')
}

export function isSameEmbeddingFingerprint(
  left: EmbeddingFingerprint | null | undefined,
  right: EmbeddingFingerprint | null | undefined
): boolean {
  if (!left || !right) {
    return false
  }

  if (
    left.mode !== right.mode ||
    left.provider !== right.provider ||
    left.model !== right.model ||
    left.implementationVersion !== right.implementationVersion
  ) {
    return false
  }

  if (left.dimensions == null || right.dimensions == null) {
    return true
  }

  return left.dimensions === right.dimensions
}
