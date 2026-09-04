<template>
  <div class="app">
    <div v-if="showAuthSplash" class="auth-splash" aria-busy="true">
      <img src="/icon.png" alt="" class="auth-splash-logo" />
      <p>柠檬音乐下载</p>
    </div>
    <router-view v-else-if="isPublicPage" class="public-page" />
    <template v-else-if="showAppShell">
    <aside class="sidebar">
      <div class="logo">
        <img src="/icon.png" alt="柠檬音乐下载" class="logo-img" />
        <div>
          <h1>柠檬音乐下载</h1>
          <span class="logo-sub">音乐下载工具</span>
        </div>
      </div>

      <nav class="nav-section">
        <div class="nav-label">功能</div>
        <router-link to="/search" class="nav-item" active-class="active">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <span>搜索</span>
        </router-link>
        <router-link to="/discover" class="nav-item" active-class="active">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          <span>发现</span>
        </router-link>
        <router-link to="/library" class="nav-item" active-class="active">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          <span>音乐库</span>
        </router-link>
        <router-link to="/download" class="nav-item" active-class="active">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span>下载</span>
        </router-link>
        <router-link to="/tag" class="nav-item" active-class="active">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
          <span>标签编辑</span>
        </router-link>
      </nav>

      <nav class="nav-section">
        <div class="nav-label">系统</div>
        <router-link to="/settings" class="nav-item" active-class="active">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          <span>设置</span>
        </router-link>
        <router-link to="/about" class="nav-item" active-class="active">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <span>关于</span>
          <span v-if="hasUpdate" class="nav-update-dot" title="有新版本"></span>
        </router-link>
      </nav>

      <div class="sidebar-footer">
        <div v-if="currentUser" class="user-bar">
          <router-link to="/settings?tab=account" class="user-info" :title="currentUser.username">
            <span class="user-name">{{ currentUser.displayName || currentUser.username }}</span>
            <span class="user-role">{{ currentUser.role === 'admin' ? '管理员' : '用户' }}</span>
          </router-link>
          <button class="btn-ghost btn-sm logout-btn" type="button" @click="handleLogout">退出</button>
        </div>
        <button class="theme-toggle" type="button" :title="theme === 'light' ? '切换深色模式' : '切换浅色模式'" @click="toggleTheme">
          <svg v-if="theme === 'dark'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5z"/></svg>
          <span>{{ theme === 'light' ? '浅色模式' : '深色模式' }}</span>
        </button>
        <div class="ws-status" :class="{ online: wsConnected }">
          <span class="dot"></span>
          {{ wsConnected ? '服务已连接' : '服务未连接' }}
        </div>
      </div>
    </aside>

    <header v-if="!showFullscreenPlayer" class="mobile-topbar">
      <div class="mobile-brand">
        <img src="/icon.png" alt="" class="mobile-brand-icon" />
        <span>柠檬音乐下载</span>
      </div>
      <button
        class="mobile-theme-btn"
        type="button"
        :title="theme === 'light' ? '切换深色模式' : '切换浅色模式'"
        @click="toggleTheme"
        :aria-label="theme === 'light' ? '切换深色模式' : '切换浅色模式'"
      >
        <svg v-if="theme === 'dark'" class="theme-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5"/>
          <path d="M12 2.5v2M12 19.5v2M4.4 4.4l1.4 1.4M18.2 18.2l1.4 1.4M2.5 12h2M19.5 12h2M4.4 19.6l1.4-1.4M18.2 5.8l1.4-1.4"/>
        </svg>
        <svg v-else class="theme-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M20.5 14.2A8.2 8.2 0 0 1 9.8 3.5 7 7 0 1 0 20.5 14.2z"/>
        </svg>
      </button>
    </header>

    <div v-if="hasAppNotices && !showFullscreenPlayer" class="app-notice-stack">
      <div v-if="setupBanner" class="app-notice setup-banner">
        <strong>首次使用请先配置数据目录</strong>
        <span>请到「应用设置 → 访问权限」添加音乐库与下载目录，保存后停用再启用。</span>
        <router-link to="/settings" class="setup-link">打开设置</router-link>
      </div>
      <div v-if="playlistPickTarget" class="app-notice playlist-pick-banner">
        <span>正在添加歌曲到歌单「{{ playlistPickTarget.name }}」</span>
        <router-link :to="{ path: '/library/playlists', query: { id: playlistPickTarget.id } }" class="setup-link">返回歌单</router-link>
        <button type="button" class="btn-ghost btn-sm" @click="stopPlaylistPick">取消</button>
      </div>
      <div v-if="tagMatchRunning && !isTagPage" class="app-notice tag-match-banner">
        <span>标签自动匹配并保存中 {{ tagMatchProgress.done }}/{{ tagMatchProgress.total }}<template v-if="tagMatchProgress.current"> · {{ tagMatchProgress.current }}</template></span>
        <router-link to="/tag" class="setup-link">查看</router-link>
      </div>
      <div v-else-if="tagMatchResult && !isTagPage" class="app-notice tag-match-banner" :class="tagMatchResult.type">
        <span>{{ tagMatchResult.text }}</span>
        <button type="button" class="btn-ghost btn-sm" @click="clearTagMatchResult">知道了</button>
      </div>
      <div v-if="sourceSwitchNotice" class="app-notice source-switch-banner">
        <span>{{ sourceSwitchNotice }}</span>
        <button type="button" class="btn-ghost btn-sm" @click="sourceSwitchNotice = ''">知道了</button>
      </div>
      <div v-if="libraryHotNotice" class="app-notice library-hot-banner">
        <span>{{ libraryHotNotice }}</span>
        <button type="button" class="btn-ghost btn-sm" @click="clearLibraryHotNotice">知道了</button>
      </div>
    </div>

    <main class="content" :class="{ 'content-fixed': isTagPage, 'content-navigating': isRouteLoading }">
      <div v-if="isRouteLoading" class="route-loading-bar" aria-hidden="true" />
      <PageSkeleton v-if="showRouteSkeleton" class="route-skeleton" :page="pendingRoutePage" />
      <router-view v-slot="{ Component }">
        <keep-alive :include="MAIN_TAB_NAMES">
          <component :is="Component" v-show="!showRouteSkeleton" />
        </keep-alive>
      </router-view>
    </main>

    <PlayerBar />
    <FullscreenPlayer />
    <TagEditModal />

    <div v-if="showFaultModal" class="modal-overlay source-fault-overlay">
      <div class="source-fault-modal">
        <h3>音源异常</h3>
        <template v-if="sourceFault">
          <p class="fault-desc">当前音源「{{ sourceFault.name }}」运行出错，已自动停用以避免影响应用。若为临时网络问题，可保留音源稍后重试；若音源脚本损坏，请删除或重新导入。</p>
          <div class="fault-error">{{ formatPromptReason(sourceFault.message) }}</div>
        </template>
        <p v-if="faultResult" class="fault-result" :class="{ ok: faultResult.ok }">{{ faultResult.text }}</p>
        <div v-if="sourceFault" class="fault-actions">
          <button class="btn-ghost" :disabled="faultBusy" @click="handleFaultDismiss">知道了，保留音源</button>
          <button class="btn-ghost" :disabled="faultBusy" @click="handleFaultDelete">删除音源</button>
          <button class="btn-primary" :disabled="faultBusy" @click="handleFaultReimport">
            {{ faultBusy ? '处理中…' : '删除并重新导入' }}
          </button>
        </div>
        <div v-else class="fault-actions">
          <router-link to="/settings" class="btn-primary fault-settings-btn" @click="closeFaultModal">前往设置 → 音源管理</router-link>
          <button class="btn-ghost" @click="closeFaultModal">关闭</button>
        </div>
      </div>
    </div>

    <div v-if="noActiveSourcePrompt" class="modal-overlay downgrade-overlay" @click.self="clearNoActiveSourcePrompt">
      <div class="downgrade-modal">
        <h3>无法下载</h3>
        <p class="downgrade-desc">{{ noActiveSourcePrompt.message }}</p>
        <div class="downgrade-actions">
          <button class="btn-ghost" type="button" @click="clearNoActiveSourcePrompt">关闭</button>
          <router-link to="/settings?tab=source" class="btn-primary fault-settings-btn" @click="clearNoActiveSourcePrompt">前往设置 → 音源管理</router-link>
        </div>
      </div>
    </div>

    <div v-if="downgradePrompt" class="modal-overlay downgrade-overlay" @click.self="dismissDowngradePrompt">
      <div class="downgrade-modal">
        <h3>下载失败，请选择下一步</h3>
        <p class="downgrade-desc">
          「{{ downgradePrompt.name }}」在
          <strong>{{ downgradePrompt.offer?.fromLabel || downgradePrompt.offer?.fromQuality }}</strong>
          音质下已自动重试多次仍失败。
        </p>
        <div v-if="downgradePrompt.offer?.reason" class="downgrade-reason">
          <div class="downgrade-reason-label">失败原因</div>
          <div>{{ formatPromptReason(downgradePrompt.offer.reason) }}</div>
        </div>
        <div class="downgrade-hint">
          <p><strong>重试原音质：</strong>失败多半是音源服务或网络短暂中断，稍后再用同一音质常能成功。</p>
          <p><strong>确认降档并自动继续：</strong>从
            <em>{{ downgradePrompt.offer?.toLabel || downgradePrompt.offer?.toQuality }}</em>
            开始自动逐档下降。此确认仅针对未在批量下载时选定策略的任务。
          </p>
        </div>
        <div class="downgrade-actions">
          <button class="btn-ghost" :disabled="downgradeBusy" @click="rejectDowngradePrompt">暂不处理</button>
          <button class="btn-ghost" :disabled="downgradeBusy" @click="retrySameQualityPrompt" title="保持原音质再试一次（适合临时网络抖动）">
            {{ downgradeBusy === 'retry' ? '重试中…' : '重试原音质' }}
          </button>
          <button class="btn-primary" :disabled="downgradeBusy" @click="acceptDowngradePrompt" title="确认后自动逐档下降，本批其余歌曲同样处理">
            {{ downgradeBusy === 'downgrade' ? '处理中…' : '确认降档并自动继续' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="sourceFallbackPrompt" class="modal-overlay downgrade-overlay" @click.self="cancelSourceFallback">
      <div class="downgrade-modal">
        <h3>切换音源继续播放？</h3>
        <p class="downgrade-desc">
          音源「<strong>{{ sourceFallbackPrompt.offer?.failedName }}</strong>」无法播放当前歌曲。
        </p>
        <div v-if="sourceFallbackPrompt.offer?.reason" class="downgrade-reason">
          <div class="downgrade-reason-label">失败原因</div>
          <div>{{ formatPromptReason(sourceFallbackPrompt.offer.reason) }}</div>
        </div>
        <p class="downgrade-desc">可切换到以下已激活音源：</p>
        <div class="source-fallback-options">
          <button
            v-for="alt in sourceFallbackPrompt.offer?.alternatives || []"
            :key="alt.id"
            class="btn-primary source-fallback-btn"
            @click="answerSourceFallback(alt.id)"
          >切换到「{{ alt.name }}」</button>
        </div>
        <div class="downgrade-actions">
          <button class="btn-ghost" @click="cancelSourceFallback">取消</button>
        </div>
      </div>
    </div>

    <div v-if="downloadSourcePrompt" class="modal-overlay downgrade-overlay" @click.self="dismissDownloadSourcePrompt">
      <div class="downgrade-modal">
        <h3>切换音源继续下载？</h3>
        <p class="downgrade-desc">
          「{{ downloadSourcePrompt.name }}」在音源「<strong>{{ downloadSourcePrompt.offer?.failedName }}</strong>」下取链失败。
        </p>
        <div v-if="downloadSourcePrompt.offer?.reason" class="downgrade-reason">
          <div class="downgrade-reason-label">失败原因</div>
          <div>{{ formatPromptReason(downloadSourcePrompt.offer.reason) }}</div>
        </div>
        <div class="source-fallback-options">
          <button
            v-for="alt in downloadSourcePrompt.offer?.alternatives || []"
            :key="alt.id"
            class="btn-primary source-fallback-btn"
            :disabled="downloadSourceBusy === alt.id"
            @click="confirmDownloadSource(alt.id)"
          >切换到「{{ alt.name }}」</button>
        </div>
        <div class="downgrade-actions">
          <button class="btn-ghost" :disabled="Boolean(downloadSourceBusy)" @click="rejectDownloadSourcePrompt">取消下载</button>
        </div>
      </div>
    </div>

    <div v-if="existFilePrompt" class="modal-overlay downgrade-overlay" @click.self="dismissExistFilePrompt">
      <div class="downgrade-modal">
        <h3>本地已有同名文件</h3>
        <p class="downgrade-desc">
          「{{ existFilePrompt.name }}」{{ existFilePrompt.singer ? ` - ${existFilePrompt.singer}` : '' }}
        </p>
        <div class="downgrade-reason">
          <div class="downgrade-reason-label">本地文件</div>
          <div>
            {{ existFilePrompt.offer?.fileName || '未知文件' }}
            <template v-if="existFilePrompt.offer?.fileCount > 1">
              （另有 {{ existFilePrompt.offer.fileCount - 1 }} 个同名扩展名）
            </template>
          </div>
          <div style="margin-top: 6px">
            本地音质：<strong>{{ existFilePrompt.offer?.localLabel || '未知' }}</strong>
          </div>
          <div style="margin-top: 4px">
            当前要下载：<strong>{{ existFilePrompt.offer?.requestedLabel || existFilePrompt.offer?.requestedQuality }}</strong>
          </div>
        </div>
        <p v-if="existFilePrompt.offer?.localBetterOrEqual" class="downgrade-desc" style="margin-top: 8px">
          本地音质已不低于当前选择，通常无需重复下载。
        </p>
        <label class="exist-apply-rest" style="display:flex;align-items:center;gap:8px;margin:12px 0 4px;font-size:13px;opacity:.9">
          <input v-model="existApplyToRest" type="checkbox" />
          后续同名文件同样处理
        </label>
        <div class="downgrade-actions">
          <button class="btn-ghost" :disabled="existFileBusy" @click="dismissExistFilePrompt">稍后决定</button>
          <button class="btn-ghost" :disabled="existFileBusy" @click="skipExistFilePrompt">
            {{ existFileBusy === 'skip' ? '处理中…' : '跳过（用本地文件）' }}
          </button>
          <button class="btn-primary" :disabled="existFileBusy" @click="confirmExistFilePrompt">
            {{ existFileBusy === 'overwrite' ? '处理中…' : '仍下载当前音质' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="existSummaryPrompt" class="modal-overlay downgrade-overlay" @click.self="dismissExistSummary">
      <div class="downgrade-modal">
        <h3>有同名文件需要处理</h3>
        <p class="downgrade-desc">
          批量下载已结束，其中 <strong>{{ existSummaryPrompt.count }}</strong> 首因本地已有同名文件未下载成功。
        </p>
        <div v-if="existSummaryPrompt.items?.length" class="downgrade-reason" style="max-height:180px;overflow:auto">
          <div class="downgrade-reason-label">待处理列表</div>
          <div
            v-for="item in existSummaryPrompt.items.slice(0, 12)"
            :key="item.id"
            style="margin-top:6px;font-size:13px;line-height:1.4"
          >
            {{ item.name }}{{ item.singer ? ` - ${item.singer}` : '' }}
            <span style="opacity:.75">（本地 {{ item.localLabel }} / 要下 {{ item.requestedLabel }}）</span>
          </div>
          <div v-if="existSummaryPrompt.count > 12" style="margin-top:6px;opacity:.7">
            …还有 {{ existSummaryPrompt.count - 12 }} 首
          </div>
        </div>
        <div class="downgrade-actions">
          <button class="btn-ghost" :disabled="existSummaryBusy" @click="dismissExistSummary">稍后处理</button>
          <button class="btn-ghost" :disabled="existSummaryBusy" @click="skipAllExistFromSummary">
            {{ existSummaryBusy === 'skip' ? '处理中…' : '全部跳过' }}
          </button>
          <button class="btn-ghost" :disabled="existSummaryBusy" @click="overwriteAllExistFromSummary">
            {{ existSummaryBusy === 'overwrite' ? '处理中…' : '全部重新下载' }}
          </button>
          <button class="btn-primary" :disabled="existSummaryBusy" @click="startExistHandlingFromSummary">
            逐首处理
          </button>
        </div>
      </div>
    </div>

    <nav v-if="!showFullscreenPlayer" class="mobile-tabbar" aria-label="主导航">
      <router-link to="/search" class="tab-item" active-class="active" @touchstart.passive="onTabPrefetch('/search')" @mousedown="onTabPrefetch('/search')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <span>搜索</span>
      </router-link>
      <router-link to="/discover" class="tab-item" active-class="active" @touchstart.passive="onTabPrefetch('/discover')" @mousedown="onTabPrefetch('/discover')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        <span>发现</span>
      </router-link>
      <router-link to="/library" class="tab-item" active-class="active" @touchstart.passive="onTabPrefetch('/library')" @mousedown="onTabPrefetch('/library')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
        <span>音乐库</span>
      </router-link>
      <router-link to="/download" class="tab-item" active-class="active" @touchstart.passive="onTabPrefetch('/download')" @mousedown="onTabPrefetch('/download')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        <span>下载</span>
      </router-link>
      <router-link to="/tag" class="tab-item" active-class="active" @touchstart.passive="onTabPrefetch('/tag')" @mousedown="onTabPrefetch('/tag')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
        <span>标签</span>
      </router-link>
      <router-link to="/settings" class="tab-item" active-class="active" @touchstart.passive="onTabPrefetch('/settings')" @mousedown="onTabPrefetch('/settings')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        <span>设置</span>
      </router-link>
      <router-link to="/about" class="tab-item" active-class="active" @touchstart.passive="onTabPrefetch('/about')" @mousedown="onTabPrefetch('/about')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        <span>关于</span>
        <span v-if="hasUpdate" class="tab-dot"></span>
      </router-link>
    </nav>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { connectWS, connected as wsConnected, onWS, disconnectWS } from './ws.js'
import { initPlayer } from './stores/player.js'
import { checkForUpdate, hasUpdate } from './composables/useUpdateCheck.js'
import { api } from './api.js'
import {
  currentUser, logout as authLogout, isAuthReady, isSessionValid, getToken,
  isAuthenticated, needsSetup,
} from './utils/auth.js'
import { useRouter } from 'vue-router'
import { applyTheme, theme, THEME_KEY, COLOR_SCHEME_KEY, CUSTOM_COLOR_KEY } from './utils/theme.js'
import { formatUserError } from './utils/userError.js'
import {
  playlistPickTarget, stopPlaylistPick,
  initLibraryHotReload, initLibraryUserData, libraryHotNotice, clearLibraryHotNotice,
  loadLibrarySongColumns,
} from './stores/library.js'
import {
  tagMatchRunning, tagMatchProgress, tagMatchResult, clearTagMatchResult,
} from './stores/tagMatch.js'
import {
  SOURCE_FALLBACK_MODE_KEY,
  applySourceFallbackMode,
  sourceFallbackPrompt,
  sourceSwitchNotice,
  answerSourceFallback,
  cancelSourceFallback,
  notifySourceSwitch,
} from './stores/sourceFallback.js'
import PlayerBar from './components/PlayerBar.vue'
import TagEditModal from './components/TagEditModal.vue'
import FullscreenPlayer from './components/FullscreenPlayer.vue'
import PageSkeleton from './components/PageSkeleton.vue'
import { showFullscreenPlayer } from './stores/player.js'
import {
  noActiveSourcePrompt,
  clearNoActiveSourcePrompt,
} from './stores/downloadGuard.js'
import {
  isRouteLoading, pendingRoutePage, MAIN_TAB_NAMES,
  prefetchRoute, startRouteLoading,
} from './stores/navigation.js'
import { isMobileUiContext } from './utils/device.js'

const route = useRoute()
const router = useRouter()
const isPublicPage = computed(() => ['Login', 'Setup', 'AuthCallback', 'ResetPassword', 'VerifyEmail'].includes(route.name))
const showAppShell = computed(() => (
  isAuthReady.value
  && !isPublicPage.value
  && !needsSetup.value
  && isAuthenticated.value
))
const showAuthSplash = computed(() => !isPublicPage.value && !showAppShell.value)
const isTagPage = computed(() => route.path === '/tag' || route.path.startsWith('/tag/'))
const showRouteSkeleton = computed(() => isRouteLoading.value && isMobileUiContext(768))

function onTabPrefetch(path) {
  if (route.path === path) return
  prefetchRoute(path)
  startRouteLoading(path)
}

const hasAppNotices = computed(() => Boolean(
  setupBanner.value
  || playlistPickTarget.value
  || (tagMatchRunning.value && !isTagPage.value)
  || (tagMatchResult.value && !isTagPage.value)
  || sourceSwitchNotice.value
  || libraryHotNotice.value,
))
const setupBanner = ref(false)
const sourceFault = ref(null)
const faultBusy = ref(false)
const faultResult = ref(null)
const showFaultModal = computed(() => Boolean(sourceFault.value || faultResult.value))
let offSourceFaultWS = null

const downgradePrompt = ref(null)
/** @type {import('vue').Ref<false | 'retry' | 'downgrade' | 'reject'>} */
const downgradeBusy = ref(false)
const autoConfirmDowngrade = ref(false)
let offDowngradeWS = null
/** @type {Array<{ id: string, name?: string, singer?: string, offer?: object, downgradeOffer?: object }>} */
const downgradeQueue = []

const downloadSourcePrompt = ref(null)
const downloadSourceBusy = ref('')
const downloadSourceQueue = []
let offDownloadSourceWS = null
let offLibraryHotReload = null

const existFilePrompt = ref(null)
/** @type {import('vue').Ref<false | 'skip' | 'overwrite'>} */
const existFileBusy = ref(false)
const existApplyToRest = ref(false)
const existFileQueue = []
const existSummaryPrompt = ref(null)
/** @type {import('vue').Ref<false | 'skip' | 'overwrite'>} */
const existSummaryBusy = ref(false)
let offExistSummaryWS = null

function enqueueDownloadSourcePrompt(payload) {
  const offer = payload?.sourceFallbackOffer
  if (!payload?.id || !offer?.alternatives?.length) return
  const item = {
    id: payload.id,
    name: payload.name || '未知歌曲',
    singer: payload.singer || '',
    offer,
  }
  if (downloadSourcePrompt.value?.id === item.id) {
    downloadSourcePrompt.value = item
    return
  }
  if (downloadSourcePrompt.value) {
    if (!downloadSourceQueue.some(q => q.id === item.id)) downloadSourceQueue.push(item)
    return
  }
  downloadSourcePrompt.value = item
}

function showNextDownloadSourcePrompt() {
  downloadSourcePrompt.value = downloadSourceQueue.shift() || null
}

function dismissDownloadSourcePrompt() {
  if (downloadSourceBusy.value) return
  downloadSourcePrompt.value = null
  showNextDownloadSourcePrompt()
}

async function confirmDownloadSource(sourceApiId) {
  const cur = downloadSourcePrompt.value
  if (!cur?.id || !sourceApiId) return
  downloadSourceBusy.value = sourceApiId
  try {
    await api.download.confirmSource(cur.id, sourceApiId)
    downloadSourcePrompt.value = null
    showNextDownloadSourcePrompt()
  } catch (e) {
    alert(e.message || '切换音源失败')
  } finally {
    downloadSourceBusy.value = ''
  }
}

async function rejectDownloadSourcePrompt() {
  const cur = downloadSourcePrompt.value
  if (!cur?.id) {
    downloadSourcePrompt.value = null
    return
  }
  downloadSourceBusy.value = 'reject'
  try {
    await api.download.rejectSource(cur.id)
  } catch {}
  finally {
    downloadSourceBusy.value = ''
    downloadSourcePrompt.value = null
    showNextDownloadSourcePrompt()
  }
}

async function loadPendingDownloadSourcePrompts() {
  try {
    const list = await api.download.list()
    for (const task of list || []) {
      if (task.status === 'await_source' && task.meta?.sourceFallbackOffer?.alternatives?.length) {
        enqueueDownloadSourcePrompt({
          id: task.id,
          name: task.name,
          singer: task.singer,
          sourceFallbackOffer: task.meta.sourceFallbackOffer,
        })
      }
    }
  } catch {}
}

function enqueueExistFilePrompt(payload) {
  const offer = payload?.existFileOffer || payload?.offer
  if (!payload?.id || !offer?.filePath) return
  // 批量延后项不在中途弹窗
  if (payload.deferredExist || payload.deferred) return
  const item = {
    id: payload.id,
    name: payload.name || '未知歌曲',
    singer: payload.singer || '',
    offer,
  }
  if (existFilePrompt.value?.id === item.id) {
    existFilePrompt.value = item
    return
  }
  if (existFilePrompt.value) {
    if (!existFileQueue.some(q => q.id === item.id)) existFileQueue.push(item)
    return
  }
  existApplyToRest.value = false
  existFilePrompt.value = item
}

function showExistSummary(payload) {
  const count = Number(payload?.count) || 0
  if (count <= 0) return
  // 正在逐首处理时不打断
  if (existFilePrompt.value) return
  existSummaryPrompt.value = {
    count,
    items: Array.isArray(payload?.items) ? payload.items : [],
  }
}

function dismissExistSummary() {
  if (existSummaryBusy.value) return
  existSummaryPrompt.value = null
}

async function skipAllExistFromSummary() {
  const firstId = existSummaryPrompt.value?.items?.[0]?.id
  if (!firstId) {
    // 无列表时从接口取
    try {
      const list = await api.download.list()
      const pending = (list || []).filter(t => t.status === 'await_exist' && t.meta?.existFileOffer?.filePath)
      if (!pending.length) {
        existSummaryPrompt.value = null
        return
      }
      existSummaryBusy.value = 'skip'
      await api.download.skipExist(pending[0].id, true)
      existSummaryPrompt.value = null
    } catch (e) {
      alert(e.message || '全部跳过失败')
    } finally {
      existSummaryBusy.value = false
    }
    return
  }
  existSummaryBusy.value = 'skip'
  try {
    await api.download.skipExist(firstId, true)
    existSummaryPrompt.value = null
    existFileQueue.length = 0
  } catch (e) {
    alert(e.message || '全部跳过失败')
  } finally {
    existSummaryBusy.value = false
  }
}

async function overwriteAllExistFromSummary() {
  const firstId = existSummaryPrompt.value?.items?.[0]?.id
  existSummaryBusy.value = 'overwrite'
  try {
    let id = firstId
    if (!id) {
      const list = await api.download.list()
      id = (list || []).find(t => t.status === 'await_exist' && t.meta?.existFileOffer?.filePath)?.id
    }
    if (!id) {
      existSummaryPrompt.value = null
      return
    }
    await api.download.confirmExist(id, true)
    existSummaryPrompt.value = null
    existFileQueue.length = 0
  } catch (e) {
    alert(e.message || '全部重新下载失败')
  } finally {
    existSummaryBusy.value = false
  }
}

async function startExistHandlingFromSummary() {
  existSummaryBusy.value = 'overwrite'
  try {
    const list = await api.download.list()
    const pending = (list || []).filter(t => t.status === 'await_exist' && t.meta?.existFileOffer?.filePath)
    existSummaryPrompt.value = null
    existFileQueue.length = 0
    for (const task of pending) {
      enqueueExistFilePrompt({
        id: task.id,
        name: task.name,
        singer: task.singer,
        existFileOffer: task.meta.existFileOffer,
        deferredExist: false,
      })
    }
  } catch (e) {
    alert(e.message || '加载待处理列表失败')
  } finally {
    existSummaryBusy.value = false
  }
}

function showNextExistFilePrompt() {
  existApplyToRest.value = false
  existFilePrompt.value = existFileQueue.shift() || null
}

function dismissExistFilePrompt() {
  if (existFileBusy.value) return
  existFilePrompt.value = null
  showNextExistFilePrompt()
}

async function skipExistFilePrompt() {
  const cur = existFilePrompt.value
  if (!cur?.id) return
  existFileBusy.value = 'skip'
  try {
    await api.download.skipExist(cur.id, existApplyToRest.value)
    if (existApplyToRest.value) existFileQueue.length = 0
    existFilePrompt.value = null
    showNextExistFilePrompt()
  } catch (e) {
    alert(e.message || '跳过失败')
  } finally {
    existFileBusy.value = false
  }
}

async function confirmExistFilePrompt() {
  const cur = existFilePrompt.value
  if (!cur?.id) return
  existFileBusy.value = 'overwrite'
  try {
    await api.download.confirmExist(cur.id, existApplyToRest.value)
    if (existApplyToRest.value) existFileQueue.length = 0
    existFilePrompt.value = null
    showNextExistFilePrompt()
  } catch (e) {
    alert(e.message || '确认下载失败')
  } finally {
    existFileBusy.value = false
  }
}

async function loadPendingExistFilePrompts() {
  try {
    const list = await api.download.list()
    const pending = (list || []).filter(t => t.status === 'await_exist' && t.meta?.existFileOffer?.filePath)
    if (!pending.length) return
    const active = (list || []).some(t => t.status === 'waiting' || t.status === 'downloading')
    const immediate = pending.filter(t => !t.meta?.deferExistAsk)
    const deferred = pending.filter(t => t.meta?.deferExistAsk)
    for (const task of immediate) {
      enqueueExistFilePrompt({
        id: task.id,
        name: task.name,
        singer: task.singer,
        existFileOffer: task.meta.existFileOffer,
      })
    }
    if (!active && deferred.length && !existFilePrompt.value) {
      showExistSummary({
        count: deferred.length,
        items: deferred.map(t => ({
          id: t.id,
          name: t.name,
          singer: t.singer,
          quality: t.quality,
          localLabel: t.meta.existFileOffer?.localLabel || '未知音质',
          requestedLabel: t.meta.existFileOffer?.requestedLabel || t.quality,
          fileName: t.meta.existFileOffer?.fileName || '',
        })),
      })
    }
  } catch {}
}

function enqueueDowngradePrompt(payload) {
  const offer = payload?.downgradeOffer || payload?.offer
  if (!payload?.id || !offer?.toQuality) return
  if (autoConfirmDowngrade.value) {
    api.download.confirmDowngrade(payload.id).catch(() => {})
    return
  }
  const item = {
    id: payload.id,
    name: payload.name || '未知歌曲',
    singer: payload.singer || '',
    offer,
    downgradeOffer: offer,
  }
  if (downgradePrompt.value?.id === item.id) {
    downgradePrompt.value = item
    return
  }
  if (downgradePrompt.value) {
    if (!downgradeQueue.some(q => q.id === item.id)) downgradeQueue.push(item)
    return
  }
  downgradePrompt.value = item
}

function showNextDowngradePrompt() {
  downgradePrompt.value = downgradeQueue.shift() || null
}

function formatPromptReason(reason) {
  return formatUserError(reason, '音源取链失败，请稍后重试')
}

/** 仅关闭弹窗，任务仍保持「待确认」，可在下载页再操作 */
function dismissDowngradePrompt() {
  if (downgradeBusy.value) return
  downgradePrompt.value = null
  showNextDowngradePrompt()
}

async function acceptDowngradePrompt() {
  const cur = downgradePrompt.value
  if (!cur?.id) return
  downgradeBusy.value = 'downgrade'
  try {
    await api.download.confirmDowngrade(cur.id)
    autoConfirmDowngrade.value = true
    downgradeQueue.length = 0
    downgradePrompt.value = null
  } catch (e) {
    alert(e.message || '确认降质失败')
  } finally {
    downgradeBusy.value = false
  }
}

/** 保持原音质重新排队（临时网络问题常见，再试可能成功） */
async function retrySameQualityPrompt() {
  const cur = downgradePrompt.value
  if (!cur?.id) return
  downgradeBusy.value = 'retry'
  try {
    await api.download.resume(cur.id)
    downgradePrompt.value = null
    showNextDowngradePrompt()
  } catch (e) {
    alert(e.message || '重试失败')
  } finally {
    downgradeBusy.value = false
  }
}

async function rejectDowngradePrompt() {
  const cur = downgradePrompt.value
  if (!cur?.id) {
    downgradePrompt.value = null
    return
  }
  downgradeBusy.value = 'reject'
  try {
    await api.download.rejectDowngrade(cur.id)
  } catch {}
  finally {
    downgradeBusy.value = false
    downgradePrompt.value = null
    showNextDowngradePrompt()
  }
}

async function loadPendingDowngradePrompts() {
  try {
    const list = await api.download.list()
    for (const task of list || []) {
      if (task.status === 'await_confirm' && task.meta?.downgradeOffer?.toQuality) {
        enqueueDowngradePrompt({
          id: task.id,
          name: task.name,
          singer: task.singer,
          downgradeOffer: task.meta.downgradeOffer,
        })
      }
    }
  } catch {}
}

function closeFaultModal() {
  sourceFault.value = null
  faultResult.value = null
}

async function loadSourceFault() {
  try {
    const fault = await api.source.getFault()
    sourceFault.value = fault?.id ? fault : null
  } catch {}
}

async function handleFaultDismiss() {
  faultBusy.value = true
  try {
    await api.source.dismissFault()
    closeFaultModal()
  } catch (e) {
    faultResult.value = { ok: false, text: e.message || '操作失败' }
  } finally {
    faultBusy.value = false
  }
}

async function handleFaultDelete() {
  faultBusy.value = true
  try {
    await api.source.deleteFault()
    closeFaultModal()
  } catch (e) {
    faultResult.value = { ok: false, text: e.message || '删除失败' }
  } finally {
    faultBusy.value = false
  }
}

async function handleFaultReimport() {
  faultBusy.value = true
  try {
    const res = await api.source.reimportFault()
    sourceFault.value = null
    if (res.reimported) {
      faultResult.value = { ok: true, text: `已重新导入音源「${res.name}」，请在设置中重新激活。` }
    } else if (res.hint) {
      faultResult.value = { ok: false, text: res.error ? `${res.hint}（${res.error}）` : res.hint }
    } else {
      closeFaultModal()
    }
  } catch (e) {
    faultResult.value = { ok: false, text: e.message || '重新导入失败' }
  } finally {
    faultBusy.value = false
  }
}

async function persistTheme(next) {
  applyTheme(next)
  try { await api.settings.update({ [THEME_KEY]: theme.value }) } catch {}
}

function toggleTheme() {
  persistTheme(theme.value === 'light' ? 'dark' : 'light')
}

async function handleLogout() {
  disconnectWS()
  await authLogout()
  router.replace('/login')
}

watch([isAuthReady, isSessionValid], ([ready, valid]) => {
  if (!ready) return
  if (valid && getToken()) connectWS()
  else disconnectWS()
}, { immediate: true })

onMounted(() => {
  initPlayer()
  initLibraryUserData(api).catch(() => {})
  loadLibrarySongColumns(api).catch(() => {})
  offLibraryHotReload = initLibraryHotReload(api, { onWS })
  checkForUpdate()
  loadSourceFault()
  loadPendingDowngradePrompts()
  loadPendingDownloadSourcePrompts()
  loadPendingExistFilePrompts()
  offSourceFaultWS = onWS('source.fault', (fault) => {
    sourceFault.value = fault?.id ? fault : null
    faultResult.value = null
  })
  offDowngradeWS = onWS('download:status', (d) => {
    if (d?.status === 'await_confirm' && d.downgradeOffer?.toQuality) {
      enqueueDowngradePrompt(d)
    } else if (d?.status === 'await_source' && d.sourceFallbackOffer?.alternatives?.length) {
      enqueueDownloadSourcePrompt(d)
    } else if (d?.status === 'await_exist' && d.existFileOffer?.filePath) {
      // 批量延后：不中途弹窗；单曲立即询问
      if (!d.deferredExist) enqueueExistFilePrompt(d)
    } else if (d?.id && d.status !== 'await_confirm') {
      if (downgradePrompt.value?.id === d.id) {
        downgradePrompt.value = null
        showNextDowngradePrompt()
      } else {
        const idx = downgradeQueue.findIndex(q => q.id === d.id)
        if (idx >= 0) downgradeQueue.splice(idx, 1)
      }
      if (d.status !== 'await_source' && downloadSourcePrompt.value?.id === d.id) {
        downloadSourcePrompt.value = null
        showNextDownloadSourcePrompt()
      }
      if (d.status !== 'await_exist') {
        if (existFilePrompt.value?.id === d.id) {
          existFilePrompt.value = null
          showNextExistFilePrompt()
        } else {
          const eidx = existFileQueue.findIndex(q => q.id === d.id)
          if (eidx >= 0) existFileQueue.splice(eidx, 1)
        }
      }
    }
  })
  offExistSummaryWS = onWS('download:exist-summary', (d) => {
    showExistSummary(d)
  })
  offDownloadSourceWS = onWS('download:source-switched', (d) => {
    if (d?.toName) {
      notifySourceSwitch({
        switched: true,
        fromName: d.fromName,
        name: d.toName,
      })
    }
  })
  api.paths.list().then((res) => {
    setupBanner.value = Boolean(res.setup?.needsPathConfig)
  }).catch(() => {})
  api.settings.get().then((s) => {
    if (s?.[THEME_KEY] || s?.[COLOR_SCHEME_KEY] || s?.[CUSTOM_COLOR_KEY]) {
      applyTheme(s?.[THEME_KEY] || theme.value, {
        color: s?.[COLOR_SCHEME_KEY],
        customHex: s?.[CUSTOM_COLOR_KEY],
      })
    }
    applySourceFallbackMode(s?.[SOURCE_FALLBACK_MODE_KEY])
  }).catch(() => {})
})

onUnmounted(() => {
  offSourceFaultWS?.()
  offDowngradeWS?.()
  offDownloadSourceWS?.()
  offExistSummaryWS?.()
  offLibraryHotReload?.()
})
</script>

<style scoped>
.app {
  display: flex;
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--bg);
  width: 100%;
  overflow-x: hidden;
}

.public-page {
  flex: 1;
  width: 100%;
  min-width: 0;
  align-self: stretch;
}

.auth-splash {
  flex: 1;
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: radial-gradient(circle at 50% 0%, rgba(240, 112, 24, 0.14), transparent 52%), var(--bg);
  color: var(--text-secondary);
  font-size: 15px;
}
.auth-splash-logo {
  width: 56px;
  height: 56px;
}

.sidebar {
  width: var(--sidebar-width);
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-light);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  position: fixed;
  top: 0;
  left: 0;
  height: 100vh;
  height: 100dvh;
  z-index: 100;
}

.logo {
  padding: 24px 20px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.logo-img {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  object-fit: cover;
  flex-shrink: 0;
}
.logo h1 { font-size: 16px; font-weight: 700; line-height: 1.2; }
.logo-sub { font-size: 11px; color: var(--lemon); opacity: 0.85; }

.nav-section { padding: 0 12px; margin-bottom: 8px; }
.nav-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 8px 10px 6px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: var(--radius);
  color: var(--text-secondary);
  transition: all 0.15s;
  margin-bottom: 2px;
  position: relative;
  font-size: 14px;
}
.nav-item:hover { background: var(--bg-hover); color: var(--text); }
.nav-item.active {
  background: var(--accent-muted);
  color: var(--accent);
  font-weight: 500;
}
.nav-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 18px;
  background: var(--accent);
  border-radius: 0 2px 2px 0;
}
.nav-item svg { width: 18px; height: 18px; flex-shrink: 0; opacity: 0.85; }
.nav-item.active svg { opacity: 1; }
.nav-update-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--lemon);
  margin-left: auto;
  flex-shrink: 0;
  box-shadow: 0 0 0 2px var(--bg-sidebar);
}

.sidebar-footer {
  margin-top: auto;
  padding: 16px 20px;
  border-top: 1px solid var(--border-light);
}
.user-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
  padding: 8px 10px;
  border-radius: var(--radius);
  background: var(--bg-elevated);
}
.user-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-decoration: none;
  flex: 1;
  border-radius: calc(var(--radius) - 2px);
  padding: 2px 4px;
  margin: -2px -4px;
  transition: background 0.15s;
}
.user-info:hover {
  background: var(--bg-hover);
}
.user-name {
  font-size: 13px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.user-role {
  font-size: 11px;
  color: var(--text-muted);
}
.logout-btn {
  flex-shrink: 0;
}
.theme-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin-bottom: 12px;
  padding: 8px 10px;
  border-radius: var(--radius);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 13px;
}
.theme-toggle:hover { background: var(--bg-hover); color: var(--text); }
.theme-toggle svg { width: 16px; height: 16px; flex-shrink: 0; }
.ws-status {
  font-size: 12px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 8px;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--error);
  flex-shrink: 0;
}
.ws-status.online .dot { background: var(--success); }

.content {
  flex: 1;
  margin-left: var(--sidebar-width);
  padding: 28px 32px 88px;
  overflow-y: auto;
  overflow-x: hidden;
  min-width: 0;
  min-height: 100vh;
  min-height: 100dvh;
  width: calc(100% - var(--sidebar-width));
  max-width: calc(100% - var(--sidebar-width));
  position: relative;
}
.route-loading-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  z-index: 60;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  animation: route-bar-slide 0.9s ease-in-out infinite;
  pointer-events: none;
}
.route-skeleton {
  position: relative;
  z-index: 40;
}
@keyframes route-bar-slide {
  0% { transform: translateX(-100%); opacity: 0.4; }
  50% { opacity: 1; }
  100% { transform: translateX(100%); opacity: 0.4; }
}
.content-fixed {
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.content-fixed > * {
  flex: 1;
  min-height: 0;
}

.app-notice-stack {
  position: fixed;
  z-index: 200;
  top: 28px;
  left: calc(var(--sidebar-width) + 32px);
  right: 220px;
  min-height: 44px;
  height: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  pointer-events: none;
}
.app-notice-stack > .app-notice {
  pointer-events: auto;
  margin: 0;
  width: max-content;
  max-width: min(360px, 100%);
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.35;
  gap: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  animation: app-notice-in 0.2s ease-out;
}
.app-notice-stack .btn-ghost.btn-sm {
  padding: 2px 8px;
  font-size: 11px;
  min-height: 0;
}
@keyframes app-notice-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.setup-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
  text-align: center;
  padding: 8px 12px;
  max-width: min(440px, calc(100vw - 32px));
  border-radius: 8px;
  background: rgba(255, 193, 7, 0.12);
  border: 1px solid rgba(255, 193, 7, 0.35);
  color: var(--text);
  font-size: 12px;
  line-height: 1.35;
}
.setup-banner strong { color: #ffc107; font-size: 12px; }
.setup-link {
  color: var(--accent);
  text-decoration: none;
  white-space: nowrap;
  font-size: 12px;
}
.setup-link:hover { text-decoration: underline; }

.playlist-pick-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
  background: rgba(99, 102, 241, 0.12);
  border: 1px solid rgba(99, 102, 241, 0.35);
  color: var(--text);
}

.tag-match-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
  background: rgba(108, 158, 255, 0.1);
  border: 1px solid rgba(108, 158, 255, 0.28);
  color: var(--text-secondary);
}
.tag-match-banner.success {
  background: rgba(34, 197, 94, 0.1);
  border-color: rgba(34, 197, 94, 0.28);
}
.tag-match-banner.error {
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.28);
}

.mobile-topbar { display: none; }
.mobile-tabbar { display: none; }

@media (max-width: 768px) {
  .app {
    flex-direction: column;
  }

  .sidebar { display: none; }

  .content {
    margin-left: 0;
    padding: calc(52px + env(safe-area-inset-top, 0px)) 14px calc(var(--player-height) + var(--mobile-nav-height) + 20px + env(safe-area-inset-bottom, 0px));
    min-height: auto;
    width: 100%;
    max-width: 100%;
  }

  .mobile-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 110;
    height: calc(52px + env(safe-area-inset-top, 0px));
    padding: env(safe-area-inset-top, 0px) 12px 0 14px;
    background: var(--bg-nav);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border-light);
  }
  .mobile-brand {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font-size: 15px;
    font-weight: 650;
    color: var(--text);
  }
  .mobile-brand span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mobile-brand-icon {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    object-fit: cover;
    flex-shrink: 0;
  }
  .mobile-theme-btn {
    width: 38px;
    height: 38px;
    border: none;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: var(--bg-elevated);
    color: var(--text);
    cursor: pointer;
    padding: 0;
    line-height: 0;
  }
  .mobile-theme-btn .theme-icon,
  .mobile-theme-btn svg {
    width: 22px !important;
    height: 22px !important;
    min-width: 22px;
    min-height: 22px;
    display: block;
    flex-shrink: 0;
  }
  .mobile-theme-btn:hover {
    background: var(--bg-hover);
  }
  .mobile-theme-btn:active {
    transform: scale(0.94);
  }

  .content-fixed {
    height: auto;
    min-height: calc(100dvh - var(--player-height) - var(--mobile-nav-height));
    overflow: visible;
    display: block;
  }
  .content-fixed > * {
    flex: none;
    min-height: auto;
  }

  .app-notice-stack {
    top: calc(52px + env(safe-area-inset-top, 0px) + 6px);
    left: 14px;
    right: 14px;
    height: auto;
    min-height: 36px;
  }

  .setup-banner {
    font-size: 12px;
  }
  .setup-link {
    width: auto;
  }

  .mobile-tabbar {
    display: flex;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 120;
    height: calc(var(--mobile-nav-height) + env(safe-area-inset-bottom, 0px));
    padding: 0 4px env(safe-area-inset-bottom, 0px);
    background: var(--bg-nav);
    backdrop-filter: blur(12px);
    border-top: 1px solid var(--border-light);
    justify-content: space-around;
    align-items: stretch;
  }

  .tab-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    color: var(--text-muted);
    font-size: 10px;
    text-decoration: none;
    position: relative;
    min-width: 0;
    padding: 6px 2px;
    transition: transform 0.12s ease, opacity 0.12s ease, color 0.15s ease;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
  }
  .tab-item:active {
    transform: scale(0.9);
    opacity: 0.65;
  }
  .tab-item svg {
    width: 22px;
    height: 22px;
  }
  .tab-item.active {
    color: var(--accent);
  }
  .tab-dot {
    position: absolute;
    top: 6px;
    right: calc(50% - 14px);
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--lemon);
  }
}

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.source-fault-modal {
  width: min(480px, 100%);
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}

.source-fault-modal h3 {
  margin: 0 0 12px;
  font-size: 18px;
  color: var(--error);
}

.fault-desc {
  margin: 0 0 12px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.fault-error {
  margin-bottom: 16px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(244, 67, 54, 0.1);
  border: 1px solid rgba(244, 67, 54, 0.25);
  font-size: 13px;
  line-height: 1.4;
  color: var(--text);
  word-break: break-word;
}

.fault-result {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--error);
}
.fault-result.ok { color: var(--success); }

.fault-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.fault-settings-btn {
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.downgrade-modal {
  width: min(440px, 100%);
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}
.downgrade-modal h3 {
  margin: 0 0 12px;
  font-size: 18px;
  color: var(--text);
}
.downgrade-desc {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 1.55;
  color: var(--text-secondary);
}
.downgrade-desc strong {
  color: var(--accent);
  font-weight: 650;
}
.downgrade-reason {
  margin: 10px 0 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-muted);
  word-break: break-word;
}
.downgrade-reason-label {
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 4px;
  font-weight: 600;
}
.downgrade-hint {
  margin: 0 0 16px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--accent-muted);
  border: 1px solid var(--brand-border-soft);
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-secondary);
}
.downgrade-hint p {
  margin: 0 0 8px;
}
.downgrade-hint p:last-child {
  margin-bottom: 0;
}
.downgrade-hint strong {
  color: var(--text);
}
.downgrade-hint em {
  color: var(--accent);
  font-style: normal;
  font-weight: 650;
}
.downgrade-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  flex-wrap: wrap;
  margin-top: 8px;
}

.source-switch-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
  background: var(--accent-muted);
  border: 1px solid var(--brand-border-soft);
  color: var(--text-secondary);
}

.source-fallback-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 12px 0 4px;
}

.source-fallback-btn {
  width: 100%;
  justify-content: center;
}

.library-hot-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.28);
  color: var(--text-secondary);
}
</style>
