import { broadcast } from '../ws.js'

/** 通知前端音乐库有文件变更（新增/更新），用于热更新 */
export function notifyLibraryChanged(filePaths, extra = {}) {
  const paths = [...new Set((filePaths || []).map(String).filter(Boolean))]
  if (!paths.length) return
  broadcast('library:changed', { filePaths: paths, ...extra })
}

/** 通知前端音乐库有文件被删除或移出目录 */
export function notifyLibraryRemoved(filePaths, extra = {}) {
  const paths = [...new Set((filePaths || []).map(String).filter(Boolean))]
  if (!paths.length) return
  broadcast('library:removed', { filePaths: paths, ...extra })
}

/** 通知前端用户库数据已更新（歌单/收藏/最近播放，多设备同步） */
export function notifyLibraryUserDataChanged(extra = {}) {
  broadcast('library:user-data-changed', { ...extra })
}

/** @deprecated 使用 notifyLibraryUserDataChanged */
export function notifyLibraryPlaylistsChanged(extra = {}) {
  notifyLibraryUserDataChanged(extra)
}
