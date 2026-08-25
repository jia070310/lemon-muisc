/** 从歌曲信息推导可用封面 URL 列表（按优先级） */
export function resolveCoverCandidates(info = {}) {
  const list = []
  const push = (url) => {
    if (!url || typeof url !== 'string') return
    const u = url.trim()
    if (!u || !/^https?:\/\//i.test(u)) return
    if (!list.includes(u)) list.push(u)
  }

  push(info.picUrl)
  push(info.img)
  push(info.cover)
  push(info.albumpic)
  push(info.Image)
  push(info.AlbumImage)

  const source = String(info.source || '')
  const albumMid = info.albumMid || info.albummid || info.albumId || ''

  if (source === 'tx' || albumMid) {
    if (albumMid && String(albumMid) !== '0') {
      push(`https://y.gtimg.cn/music/photo_new/T002R500x500M000${albumMid}.jpg`)
      push(`https://y.gtimg.cn/music/photo_new/T002R300x300M000${albumMid}.jpg`)
    }
  }

  // 酷我短路径
  const kwAlbum = String(info.web_albumpic_short || '').trim()
  if (kwAlbum) {
    push(`https://img4.kuwo.cn/star/albumcover/${kwAlbum.replace(/120/, '500')}`)
  }
  const kwArtist = String(info.web_artistpic_short || info.artistPic || '').trim()
  if (kwArtist) {
    if (/^https?:\/\//i.test(kwArtist)) push(kwArtist.replace(/\/120\//, '/500/'))
    else push(`https://img1.kuwo.cn/star/starheads/${kwArtist.replace(/120/, '500')}`)
  }

  // 酷狗 {size}
  for (const raw of [info.Image, info.AlbumImage, info.album_img, info.album_info?.sizable_cover]) {
    if (typeof raw === 'string' && raw.includes('{size}')) {
      push(raw.replace(/\{size\}/g, '400'))
      push(raw.replace(/\{size\}/g, '480'))
    }
  }

  // 咪咕多尺寸
  for (const key of ['img3', 'img2', 'img1', 'imgUrl']) {
    push(info[key])
  }
  const imgs = info.imgItems || info.imgList
  if (Array.isArray(imgs)) {
    for (const it of imgs) push(it?.img || it?.url)
  }

  return list
}

export function resolveCoverUrl(info = {}) {
  return resolveCoverCandidates(info)[0] || ''
}
