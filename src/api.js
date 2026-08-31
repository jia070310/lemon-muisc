import { formatUserError } from './utils/userError.js'

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

    if (!res.ok) {
      const err = new Error(formatUserError(data.error || '请求失败', '请求失败，请稍后重试'))
      if (data.code) err.code = data.code
      if (data.sourceFallbackOffer) err.sourceFallbackOffer = data.sourceFallbackOffer
      throw err
    }
    return data
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('请求超时，请检查服务是否正常运行')
    if (e.message === 'Failed to fetch') throw new Error('无法连接服务器，请确认后端已启动')
    if (e instanceof Error && /[\u4e00-\u9fff]/.test(e.message) && !/socket hang|Failed to fetch|ECONN/i.test(e.message)) {
      throw e
    }
    throw new Error(formatUserError(e, '请求失败，请稍后重试'))
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
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(formatUserError(data.error || '导入失败', '导入失败'))
      return data
    },
    importUrl: (url) => request('/source/import-url', { method: 'POST', body: { url } }),
    remove: (id) => request(`/source/${id}`, { method: 'DELETE' }),
    activate: (id) => request(`/source/activate/${id}`, { method: 'POST' }),
    deactivate: (id) => id
      ? request(`/source/deactivate/${encodeURIComponent(id)}`, { method: 'POST' })
      : request('/source/deactivate', { method: 'POST' }),
    active: () => request('/source/active'),
    getFault: () => request('/source/fault'),
    deleteFault: () => request('/source/fault/delete', { method: 'POST' }),
    dismissFault: () => request('/source/fault/dismiss', { method: 'POST' }),
    reimportFault: () => request('/source/fault/reimport', { method: 'POST' }),
    request: (source, action, info) => request('/source/request', { method: 'POST', body: { source, action, info } }),
  },
  search: {
    search: (keyword, source, page = 1) => request(`/search?keyword=${encodeURIComponent(keyword)}&source=${source}&page=${page}`),
    searchAlbums: (keyword, source, page = 1) =>
      request(`/search/album?keyword=${encodeURIComponent(keyword)}&source=${source}&page=${page}`),
    fetchAlbum: (source, id) => request(`/search/album/detail?source=${source}&id=${encodeURIComponent(id)}`),
    sources: () => request('/search/sources'),
  },
  playlist: {
    fetch: (url, source, { partial = false } = {}) => {
      const qs = new URLSearchParams({ url, source })
      if (partial) qs.set('partial', '1')
      return request(`/playlist?${qs}`, { timeout: partial ? 30000 : 120000 })
    },
    recommend: (source, sort = 'hot', page = 1) =>
      request(`/playlist/recommend?source=${source}&sort=${sort}&page=${page}`),
    sources: () => request('/playlist/sources'),
  },
  download: {
    list: () => request('/download/list'),
    add: (tasks) => request('/download/add', { method: 'POST', body: { tasks } }),
    pause: (id) => request(`/download/pause/${id}`, { method: 'POST' }),
    resume: (id) => request(`/download/resume/${id}`, { method: 'POST' }),
    pauseAll: (ids) => request('/download/pause-all', { method: 'POST', body: ids?.length ? { ids } : {} }),
    resumeAll: (ids) => request('/download/resume-all', { method: 'POST', body: ids?.length ? { ids } : {} }),
    remove: (id) => request(`/download/${id}`, { method: 'DELETE' }),
    dismiss: (ids) => request('/download/dismiss', { method: 'POST', body: { ids } }),
    dismissAll: () => request('/download/dismiss-all', { method: 'POST' }),
    confirmDowngrade: (id) => request(`/download/confirm-downgrade/${id}`, { method: 'POST' }),
    rejectDowngrade: (id) => request(`/download/reject-downgrade/${id}`, { method: 'POST' }),
    confirmSource: (id, sourceApiId) => request(`/download/confirm-source/${id}`, { method: 'POST', body: { sourceApiId } }),
    rejectSource: (id) => request(`/download/reject-source/${id}`, { method: 'POST' }),
    clearCompleted: () => request('/download/clear-completed', { method: 'POST' }),
  },
  play: {
    getUrl: (payload, source, name, singer, quality, localPath) => {
      const body = typeof payload === 'object' && payload !== null
        ? payload
        : { songId: payload, source, name, singer, quality, localPath }
      return request('/play/url', { method: 'POST', body })
    },
    getLyric: (songIdOrPayload, source, lyric) =>
      request('/play/lyric', {
        method: 'POST',
        body: typeof songIdOrPayload === 'object'
          ? songIdOrPayload
          : { songId: songIdOrPayload, source, lyric },
        timeout: 45000,
      }),
    getCover: (payload) =>
      request('/play/cover', {
        method: 'POST',
        body: typeof payload === 'object' && payload !== null ? payload : {},
      }),
  },
  paths: {
    list: () => request('/paths'),
    stats: () => request('/paths/stats', { timeout: 120000 }),
    add: (dirPath, fromPicker) => request('/paths', { method: 'POST', body: { dirPath, fromPicker } }),
    update: (oldPath, newPath, fromPicker) => request('/paths', { method: 'PUT', body: { oldPath, newPath, fromPicker } }),
    remove: (dirPath) => request('/paths', { method: 'DELETE', body: { dirPath } }),
    setDownload: (dirPath, fromPicker) => request('/paths/download', { method: 'PUT', body: { dirPath, fromPicker } }),
  },
  library: {
    tracks: () => request('/library/tracks', { timeout: 60000 }),
    sync: () => request('/library/sync', { method: 'POST', timeout: 120000 }),
    scanBatch: (files) => request('/library/scan-batch', {
      method: 'POST',
      body: { files },
      timeout: 180000,
    }),
    playlists: {
      list: () => request('/library/playlists'),
      save: (playlists) => request('/library/playlists', {
        method: 'PUT',
        body: { playlists },
      }),
    },
    userData: {
      get: () => request('/library/user-data'),
      save: (data) => request('/library/user-data', {
        method: 'PUT',
        body: data,
      }),
    },
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
    writeBatch: (files) => request('/tag/write-batch', { method: 'POST', body: { files }, timeout: 180000 }),
    match: (params, source) => {
      if (typeof params === 'string') {
        return request('/tag/match', { method: 'POST', body: { fileName: params, source } })
      }
      return request('/tag/match', { method: 'POST', body: { ...params, source } })
    },
    matchApply: (match, source, fields) => request('/tag/match-apply', { method: 'POST', body: { match, source, fields } }),
    matchBatch: (files, source) => request('/tag/match-batch', { method: 'POST', body: { files, source }, timeout: 60000 }),
  },
  about: {
    get: () => request('/about'),
  },
}
