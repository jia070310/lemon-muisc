<template>
  <div v-if="artists.length || showAlbum" class="track-meta-links" @click.stop>
    <template v-for="(name, i) in artists" :key="`${name}-${i}`">
      <button
        type="button"
        class="track-meta-link"
        :title="`查看歌手：${name}`"
        @click="goArtist(name)"
      >{{ name }}</button>
      <span v-if="i < artists.length - 1" class="track-meta-sep"> / </span>
    </template>
    <template v-if="showAlbum">
      <span v-if="artists.length" class="track-meta-dot">·</span>
      <button
        type="button"
        class="track-meta-link"
        :title="`查看专辑：${albumName}`"
        @click="goAlbum"
      >{{ albumName }}</button>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { splitArtists } from '../utils/text.js'
import { encodeAlbumId } from '../utils/albumId.js'
import { artistToId } from '../stores/library.js'

const props = defineProps({
  /** 歌手署名（可多歌手） */
  singer: { type: String, default: '' },
  /** 专辑名 */
  album: { type: String, default: '' },
  /** 是否显示专辑入口（专辑页可关掉） */
  showAlbumLink: { type: Boolean, default: true },
  /** 是否显示歌手入口（歌手页可关掉当前页同名，仍建议保留以便跳到合唱其它人） */
  showArtistLink: { type: Boolean, default: true },
})

const router = useRouter()

const artists = computed(() => {
  if (!props.showArtistLink) return []
  return splitArtists(props.singer).filter((n) => n && n !== '未知歌手' && n !== '未知艺术家')
})

const albumName = computed(() => String(props.album || '').trim())
const showAlbum = computed(() => (
  props.showAlbumLink
  && albumName.value
  && albumName.value !== '未知专辑'
))

function goArtist(name) {
  const id = artistToId(name)
  if (!id) return
  router.push({ path: '/library/artist', query: { id } })
}

function goAlbum() {
  if (!albumName.value) return
  // 与音乐库 groupAlbums 一致：用完整歌手署名做专辑 id
  const artist = String(props.singer || '').trim() || '未知艺术家'
  router.push({ path: '/library/album', query: { id: encodeAlbumId(artist, albumName.value) } })
}
</script>

<style scoped>
.track-meta-links {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: inherit;
  color: inherit;
  line-height: inherit;
}
.track-meta-link {
  display: inline;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-decoration: none;
  vertical-align: baseline;
}
.track-meta-link:hover {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.track-meta-sep,
.track-meta-dot {
  opacity: 0.6;
  pointer-events: none;
}
.track-meta-dot { margin: 0 5px; }
</style>
