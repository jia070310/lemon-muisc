const META_TAGS = ['name', 'description', 'version', 'author', 'homepage']

/**
 * 从 LX Music 自定义音源脚本头部注释提取元数据。
 * 支持 /** 与 /*! 两种 JSDoc 块，以及行首 * 前缀。
 */
export function parseScriptMeta(script) {
  const meta = {}
  if (!script || typeof script !== 'string') return meta

  const trimmed = script.trimStart()
  const match = trimmed.match(/^\/\*!?([\s\S]*?)\*\//)
  if (!match) return meta

  const lines = match[1].split('\n')
  for (const line of lines) {
    const cleaned = line.replace(/^\s*\*?\s*/, '').trim()
    const tagMatch = cleaned.match(/^@(\w+)\s+(.*)$/)
    if (!tagMatch) continue

    const key = tagMatch[1].toLowerCase()
    if (!META_TAGS.includes(key)) continue

    let value = tagMatch[2].trim()
    value = value.replace(/\s*\*+\s*$/, '').trim()
    if (key === 'version') value = value.replace(/^v/i, '')
    if (value) meta[key] = value
  }

  return meta
}

export function metaToDbFields(meta, defaults = {}) {
  return {
    name: meta.name || defaults.name || '未命名音源',
    description: meta.description || defaults.description || '',
    author: meta.author || defaults.author || '',
    version: meta.version || defaults.version || '',
    homepage: meta.homepage || defaults.homepage || '',
  }
}
