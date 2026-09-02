<template>
  <div class="tag-track-redirect">
    <p>正在打开标签编辑...</p>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { openTagEditTrack } from '../utils/tagEdit.js'

const route = useRoute()
const router = useRouter()

onMounted(() => {
  const path = String(route.query.path || '').trim()
  if (path) {
    openTagEditTrack(path)
    router.replace(route.query.redirect ? String(route.query.redirect) : '/search')
    return
  }
  router.replace('/search')
})
</script>

<style scoped>
.tag-track-redirect {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-muted);
}
</style>
