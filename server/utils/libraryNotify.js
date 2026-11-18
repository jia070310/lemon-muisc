import { broadcast, broadcastAll } from '../ws.js'
import { getLibraryIndexState } from './libraryIndexState.js'

/** 曲库索引 revision 变更广播（客户端可秒级感知，不必轮询 sync-state） */
export function notifyLibraryIndexChanged(extra = {}) {
  const state = getLibraryIndexState()
  broadcastAll('library:index-changed', {
    revision: state.revision,
    dirty: state.dirty,
    updated: state.dirty,
    ...extra,
  })
}

/** 通知前端音乐库有文件变更（新增/更新），用于热更新 */
export function notifyLibraryChanged(filePaths, extra = {}) {
  const paths = [...new Set((filePaths || []).map(String).filter(Boolean))]
  if (!paths.length) return
  const state = getLibraryIndexState()
  broadcastAll('library:changed', {
    filePaths: paths,
    revision: state.revision,
    dirty: state.dirty,
    ...extra,
  })
}

/** 通知前端音乐库有文件被删除或移出目录 */
export function notifyLibraryRemoved(filePaths, extra = {}) {
  const paths = [...new Set((filePaths || []).map(String).filter(Boolean))]
  if (!paths.length) return
  const state = getLibraryIndexState()
  broadcastAll('library:removed', {
    filePaths: paths,
    revision: state.revision,
    dirty: state.dirty,
    ...extra,
  })
}

/** 通知前端用户库数据已更新（歌单/收藏/最近播放，多设备同步） */
export function notifyLibraryUserDataChanged(userId, extra = {}) {
  broadcast('library:user-data-changed', { ...extra }, userId)
  // 有新版本待升级时：用户数据变更则追加自动备份
  import('./autoUserBackup.js')
    .then(({ scheduleAutoBackupAfterUserDataChange }) => scheduleAutoBackupAfterUserDataChange())
    .catch(() => {})
}

/** 后台扫描进度（标签读取阶段） */
export function notifyLibraryScanProgress(payload = {}) {
  broadcastAll('library:scan-progress', payload)
}

/** 后台扫描完成 */
export function notifyLibraryScanComplete(payload = {}) {
  const state = getLibraryIndexState()
  broadcastAll('library:scan-complete', {
    revision: state.revision,
    dirty: state.dirty,
    ...payload,
  })
  notifyLibraryIndexChanged({ reason: 'scan-complete', ...payload })
}

/** 情绪分析进度 */
export function notifyLibraryMoodProgress(payload = {}) {
  broadcastAll('library:mood-progress', payload)
}

/** 情绪分析完成 */
export function notifyLibraryMoodComplete(payload = {}) {
  broadcastAll('library:mood-complete', payload)
}

/** @deprecated 使用 notifyLibraryUserDataChanged */
export function notifyLibraryPlaylistsChanged(extra = {}) {
  notifyLibraryUserDataChanged(extra)
}
