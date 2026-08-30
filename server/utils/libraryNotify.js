import { broadcast } from '../ws.js'

/** 通知前端音乐库有文件变更（新增/更新），用于热更新 */
export function notifyLibraryChanged(filePaths, extra = {}) {
  const paths = [...new Set((filePaths || []).map(String).filter(Boolean))]
  if (!paths.length) return
  broadcast('library:changed', { filePaths: paths, ...extra })
}
