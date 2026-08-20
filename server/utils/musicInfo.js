export function buildMusicInfo({ songId, source, name = '', singer = '', album = '', hash, songmid, copyrightId }) {

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

  })

}

