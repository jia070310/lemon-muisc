function pickField(...values) {
  for (const value of values) {
    if (value != null && value !== '') return value
  }
  return ''
}

/** 构建播放/歌词请求所需的完整歌曲信息（对齐落雪 Scheme URL / musicInfo 结构） */
export function buildPlayPayload(item, source, quality = '128k', extra = {}) {
  const src = pickField(item.source, source)
  const cover = pickField(item.img, item.picUrl)
  const albumMid = pickField(item.albumMid, item.albummid, item.albumId)
  const songId = pickField(item.songId, item.songmid, item.hash, item.copyrightId, item.id)
  const songmid = pickField(item.songmid, item.songId, item.hash, item.copyrightId, item.id)
  const musicId = pickField(item.musicId, item.songId, item.songmid, item.hash, item.copyrightId, item.id)

  return {
    ...item,
    source: src,
    name: item.name,
    singer: item.singer,
    album: item.album || item.albumName || '',
    albumName: item.albumName || item.album || '',
    quality,
    songId,
    songmid,
    strMediaMid: pickField(item.strMediaMid),
    hash: pickField(item.hash),
    copyrightId: pickField(item.copyrightId),
    albumAudioId: item.albumAudioId || '',
    albumId: pickField(item.albumId, albumMid),
    albumMid,
    albummid: albumMid,
    musicId,
    rid: item.rid || '',
    dcTargetId: item.dcTargetId || '',
    duration: item.duration || '',
    interval: item.interval || '',
    img: cover,
    picUrl: cover,
    types: item.types || [],
    qualitys: item.qualitys || [],
    localPath: item.localPath || '',
    ...extra,
  }
}
