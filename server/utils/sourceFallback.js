/** 音源切换策略：auto=自动尝试其他已激活音源；ask=失败后询问用户 */
export function getSourceFallbackMode(settings = {}) {
  return settings['source.fallbackMode'] === 'ask' ? 'ask' : 'auto'
}

export function buildSourceInfoPayload(meta) {
  if (!meta?.sourceId) return null
  return {
    id: meta.sourceId,
    name: meta.sourceName || meta.sourceId,
    switched: Boolean(meta.switched),
    fromId: meta.fromSourceId || null,
    fromName: meta.fromSourceName || null,
  }
}

export function buildSourceFallbackOffer(error) {
  if (!error || error.code !== 'SOURCE_FALLBACK_REQUIRED') return null
  return {
    failedId: error.failedSourceId,
    failedName: error.failedSourceName,
    reason: error.reason || error.message,
    alternatives: error.alternatives || [],
  }
}
