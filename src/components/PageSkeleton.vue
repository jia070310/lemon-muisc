<template>
  <div class="page-skeleton" :class="`page-skeleton--${page}`" aria-hidden="true">
    <template v-if="page === 'library'">
      <div class="sk-row sk-search-bar" />
      <div class="sk-row sk-tabs" />
      <div class="sk-section-title" />
      <div class="sk-h-scroll">
        <div v-for="i in 4" :key="i" class="sk-card-h" />
      </div>
      <div class="sk-section-title" />
      <div v-for="i in 6" :key="`row-${i}`" class="sk-list-row" />
    </template>

    <template v-else-if="page === 'download'">
      <div class="sk-title" />
      <div class="sk-subtitle" />
      <div v-for="i in 5" :key="i" class="sk-list-row tall" />
    </template>

    <template v-else-if="page === 'tag'">
      <div class="sk-title" />
      <div class="sk-row sk-search-bar" />
      <div v-for="i in 7" :key="i" class="sk-tree-row" />
    </template>

    <template v-else-if="page === 'settings'">
      <div class="sk-title" />
      <div class="sk-tabs wide" />
      <div v-for="i in 4" :key="i" class="sk-block" />
    </template>

    <template v-else-if="page === 'about'">
      <div class="sk-title" />
      <div class="sk-block large" />
      <div class="sk-block" />
      <div class="sk-block" />
    </template>

    <template v-else>
      <div class="sk-title" />
      <div class="sk-subtitle" />
      <div class="sk-card">
        <div class="sk-row sk-search-bar" />
        <div class="sk-tabs" />
      </div>
      <div class="sk-grid">
        <div v-for="i in 6" :key="i" class="sk-grid-item" />
      </div>
    </template>
  </div>
</template>

<script setup>
defineProps({
  page: { type: String, default: 'default' },
})
</script>

<style scoped>
.page-skeleton {
  padding: 4px 0 20px;
  animation: sk-fade-in 0.15s ease;
}

@keyframes sk-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.sk-title,
.sk-subtitle,
.sk-row,
.sk-section-title,
.sk-card,
.sk-card-h,
.sk-list-row,
.sk-tree-row,
.sk-block,
.sk-grid-item {
  background: linear-gradient(
    90deg,
    var(--bg-elevated) 0%,
    color-mix(in srgb, var(--bg-elevated) 70%, var(--text-muted)) 50%,
    var(--bg-elevated) 100%
  );
  background-size: 200% 100%;
  animation: sk-shimmer 1.2s ease-in-out infinite;
  border-radius: 8px;
}

.sk-title {
  width: 28%;
  height: 22px;
  margin-bottom: 10px;
}

.sk-subtitle {
  width: 72%;
  height: 14px;
  margin-bottom: 18px;
  border-radius: 6px;
}

.sk-row {
  height: 42px;
  margin-bottom: 12px;
}

.sk-search-bar {
  border-radius: 22px;
  height: 44px;
}

.sk-tabs {
  height: 32px;
  width: 80%;
  border-radius: 16px;
}

.sk-tabs.wide {
  width: 100%;
  margin-bottom: 16px;
}

.sk-card {
  padding: 14px;
  margin-bottom: 18px;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
}

.sk-card > .sk-row:last-child {
  margin-bottom: 0;
}

.sk-section-title {
  width: 18%;
  height: 16px;
  margin: 8px 0 12px;
}

.sk-h-scroll {
  display: flex;
  gap: 12px;
  overflow: hidden;
  margin-bottom: 20px;
}

.sk-card-h {
  flex: 0 0 108px;
  height: 132px;
  border-radius: 10px;
}

.sk-list-row {
  height: 52px;
  margin-bottom: 10px;
  border-radius: 10px;
}

.sk-list-row.tall {
  height: 64px;
}

.sk-tree-row {
  height: 36px;
  margin-bottom: 8px;
  border-radius: 6px;
}

.sk-tree-row:nth-child(odd) { width: 92%; }
.sk-tree-row:nth-child(even) { width: 78%; margin-left: 12px; }

.sk-block {
  height: 88px;
  margin-bottom: 12px;
  border-radius: var(--radius-lg);
}

.sk-block.large {
  height: 140px;
}

.sk-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.sk-grid-item {
  height: 168px;
  border-radius: 10px;
}

@keyframes sk-shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}
</style>
