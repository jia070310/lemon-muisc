const BASE = '/api'
const DEFAULT_TIMEOUT = 30000

async function request(url, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeout || DEFAULT_TIMEOUT)

  try {
    const res = await fetch(BASE + url, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
      signal: controller.signal,
      body: options.body ? JSON.stringify(options.body) : undefined,
    })

    let data
    try {
      data = await res.json()
    } catch {
      throw new Error('服务器响应异常')
    }

    if (!res.ok) throw new Error(data.error || '请求失败')
    return data
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('请求超时，请检查服务是否正常运行')
    if (e.message === 'Failed to fetch') throw new Error('无法连接服务器，请确认后端已启动')
    throw e
  } finally {
    clearTimeout(timeout)
  }
}

export const api = {
  settings: {
    get: () => request('/settings'),
    update: (data) => request('/settings', { method: 'PUT', body: data }),
  },
  source: {
    list: () => request('/source/list'),
    importScript: (script) => request('/source/import', { method: 'POST', body: { script } }),
    importFile: async (file) => {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(BASE + '/source/import', { method: 'POST', body: form })
      return res.json()
    },
    importUrl: (url) => request('/source/import-url', { method: 'POST', body: { url } }),
    remove: (id) => request(`/source/${id}`, { method: 'DELETE' }),
    activate: (id) => request(`/source/activate/${id}`, { method: 'POST' }),
    deactivate: () => request('/source/deactivate', { method: 'POST' }),
    active: () => request('/source/active'),
    request: (source, action, info) => request('/source/request', { method: 'POST', body: { source, action, info } }),
  },
  search: {
    search: (keyword, source, page = 1) => request(`/search?keyword=${encodeURIComponent(keyword)}&source=${source}&page=${page}`),
    sources: () => request('/search/sources'),
  },
  download: {
    list: () => request('/download/list'),
    add: (tasks) => request('/download/add', { method: 'POST', body: { tasks } }),
    pause: (id) => request(`/download/pause/${id}`, { method: 'POST' }),
    resume: (id) => request(`/download/resume/${id}`, { method: 'POST' }),
    remove: (id) => request(`/download/${id}`, { method: 'DELETE' }),
    clearCompleted: () => request('/download/clear-completed', { method: 'POST' }),
  },
  play: {
    getUrl: (songId, source, name, singer, quality, localPath) =>
      request('/play/url', { method: 'POST', body: { songId, source, name, singer, quality, localPath } }),
    getLyric: (songId, source, lyric) =>
      request('/play/lyric', { method: 'POST', body: { songId, source, lyric } }),
  },
  paths: {
    list: () => request('/paths'),
    add: (dirPath, fromPicker) => request('/paths', { method: 'POST', body: { dirPath, fromPicker } }),
    update: (oldPath, newPath, fromPicker) => request('/paths', { method: 'PUT', body: { oldPath, newPath, fromPicker } }),
    remove: (dirPath) => request('/paths', { method: 'DELETE', body: { dirPath } }),
    setDownload: (dirPath) => request('/paths/download', { method: 'PUT', body: { dirPath } }),
  },
  tag: {
    dirs: {
      list: () => request('/tag/dirs'),
      add: (dirPath) => request('/tag/dirs', { method: 'POST', body: { dirPath } }),
      remove: (dirPath) => request('/tag/dirs', { method: 'DELETE', body: { dirPath } }),
    },
    scan: (dirPath) => request('/tag/scan', { method: 'POST', body: { dirPath }, timeout: 120000 }),
    read: (filePath) => request('/tag/read', { method: 'POST', body: { filePath }, timeout: 60000 }),
    readBatch: (filePaths, lite = true) => request('/tag/read-batch', {
      method: 'POST',
      body: { filePaths, lite },
      timeout: 180000,
    }),
    write: (filePath, meta) => request('/tag/write', { method: 'POST', body: { filePath, meta } }),
    writeBatch: (files) => request('/tag/write-batch', { method: 'POST', body: { files } }),
    match: (params, source) => {
      if (typeof params === 'string') {
        return request('/tag/match', { method: 'POST', body: { fileName: params, source } })
      }
      return request('/tag/match', { method: 'POST', body: { ...params, source } })
    },
    matchApply: (match, source, fields) => request('/tag/match-apply', { method: 'POST', body: { match, source, fields } }),
    matchBatch: (files, source) => request('/tag/match-batch', { method: 'POST', body: { files, source } }),
  },
  about: {
    get: () => request('/about'),
  },
}