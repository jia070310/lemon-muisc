function pickField(...values) {
  for (const value of values) {
    if (value != null && value !== '') return value
  }
  return ''
}

/** 构建传给落雪音源的 musicInfo，保留各平台独立字段 */
export function buildMusicInfo(input = {}) {
  const body = input || {}
  const albumMid = pickField(body.albumMid, body.albummid, body.albumId)
  const cover = pickField(body.img, body.picUrl)
  const songId = pickField(body.songId, body.songmid, body.hash, body.copyrightId, body.id)
  const songmid = pickField(body.songmid, body.songId, body.hash, body.copyrightId, body.id)
  const musicId = pickField(body.musicId, body.songId, body.songmid, body.hash, body.copyrightId, body.id)

  return {
    ...body,
    source: pickField(body.source),
    name: body.name || '',
    singer: body.singer || '',
    album: body.album || body.albumName || '',
    albumName: body.albumName || body.album || '',
    songId,
    songmid,
    strMediaMid: pickField(body.strMediaMid),
    hash: pickField(body.hash, songId, songmid),
    copyrightId: pickField(body.copyrightId, songId),
    albumAudioId: body.albumAudioId || '',
    albumId: pickField(body.albumId, albumMid),
    albumMid,
    albummid: albumMid,
    duration: body.duration ?? body.interval ?? '',
    interval: body.interval ?? body.duration ?? '',
    musicId,
    rid: body.rid || '',
    dcTargetId: body.dcTargetId || '',
    img: cover,
    picUrl: cover,
    types: Array.isArray(body.types) ? body.types : [],
    qualitys: Array.isArray(body.qualitys) ? body.qualitys : [],
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
    strMediaMid: meta.strMediaMid,
    copyrightId: meta.copyrightId,
    albumAudioId: meta.albumAudioId,
    albumId: meta.albumId,
    albumMid: meta.albumMid || meta.albummid,
    albummid: meta.albummid,
    duration: meta.duration,
    interval: task.interval,
    musicId: meta.musicId,
    rid: meta.rid,
    dcTargetId: meta.dcTargetId,
    picUrl: meta.picUrl,
    img: meta.img || meta.picUrl,
    types: meta.types,
    qualitys: meta.qualitys,
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
    musicId: pickField(info.musicId, info.songId, info.songmid),
    rid: info.rid || '',
    dcTargetId: info.dcTargetId || '',
  }
}
