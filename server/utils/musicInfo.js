export function buildMusicInfo({
  songId, source, name = '', singer = '', album = '',
  hash, songmid, copyrightId, albumAudioId, duration,
  musicId, rid, dcTargetId,
}) {
  const id = songId || hash || songmid || copyrightId || ''

  return {
    songId: id,
    source: source || '',
    name,
    singer,
    album,
    hash: hash || id,
    songmid: songmid || id,
    copyrightId: copyrightId || id,
    albumAudioId: albumAudioId || '',
    duration: duration ?? '',
    musicId: musicId || id,
    rid: rid || '',
    dcTargetId: dcTargetId || '',
  }
}

export function buildMusicInfoFromTask(task, meta = {}) {
  return buildMusicInfo({
    songId: meta.songId,
    source: meta.source || task.source,
    name: task.name,
    singer: task.singer,
    album: task.album,
    hash: meta.hash,
    songmid: meta.songmid,
    copyrightId: meta.copyrightId,
    albumAudioId: meta.albumAudioId,
    duration: meta.duration,
    musicId: meta.musicId,
    rid: meta.rid,
    dcTargetId: meta.dcTargetId,
  })
}

export function lyricLookupExtra(info = {}) {
  return {
    name: info.name || '',
    singer: info.singer || '',
    album: info.album || '',
    hash: info.hash || '',
    albumAudioId: info.albumAudioId || '',
    duration: info.duration ?? '',
    musicId: info.musicId || info.songId || '',
    rid: info.rid || '',
    dcTargetId: info.dcTargetId || '',
  }
}
