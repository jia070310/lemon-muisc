<template>
  <div class="tag-page">
    <div class="page-header">
      <div>
        <div class="page-title">标签编辑</div>
        <div class="page-subtitle">批量编辑本地音乐元数据、封面与歌词；「匹配缺失 / 匹配选中」会自动保存到文件</div>
      </div>
      <div class="header-actions">
        <button class="btn-primary btn-sm" @click="saveAll" :disabled="!hasChanges || saving">
          {{ saving ? '保存中...' : '保存全部修改' }}
        </button>
      </div>
    </div>

    <div class="tag-layout">
      <!-- 左侧：文件目录 / 按歌手 -->
      <aside class="dir-panel card">
        <div class="panel-title">
          <div class="panel-tabs">
            <button
              type="button"
              class="panel-tab"
              :class="{ active: browseMode === 'dir' }"
              @click="switchBrowseMode('dir')"
            >文件目录</button>
            <button
              type="button"
              class="panel-tab"
              :class="{ active: browseMode === 'artist' }"
              @click="switchBrowseMode('artist')"
            >按歌手</button>
          </div>
        </div>

        <template v-if="browseMode === 'dir'">
          <p class="dir-hint">展开文件夹浏览；点击文件夹仅加载该层音频。路径在「设置 → 文件路径」中管理。</p>
          <div class="dir-tree">
            <template v-for="row in visibleTreeRows" :key="row.path">
              <div
                class="tree-row"
                :class="{ active: activeDir === row.path, loading: row.loading }"
                :style="{ paddingLeft: `${8 + row.depth * 14}px` }"
              >
                <button
                  class="tree-toggle"
                  :class="{ invisible: row.loaded && !row.hasChildren }"
                  :disabled="row.loading"
                  @click.stop="toggleTreeNode(row.path)"
                  :title="row.expanded ? '收起' : '展开'"
                >
                  <span v-if="row.loading" class="tree-spin" />
                  <svg
                    v-else
                    viewBox="0 0 24 24"
                    width="12"
                    height="12"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <polyline v-if="row.expanded" points="6 9 12 15 18 9" />
                    <polyline v-else points="9 18 15 12 9 6" />
                  </svg>
                </button>
                <span class="tree-folder" @click="selectFolder(row.path)">
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 7v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z" />
                  </svg>
                </span>
                <span class="tree-label" :title="row.path" @click="selectFolder(row.path)">{{ row.name }}</span>
                <span v-if="scanning && activeDir === row.path" class="dir-status">加载中</span>
              </div>
            </template>
            <div v-if="!dirs.length" class="dir-empty">请先在设置中添加文件路径</div>
          </div>
        </template>

        <template v-else>
          <p class="dir-hint">选择一位歌手，加载该歌手的全部歌曲进行编辑。</p>
          <div class="artist-tree">
            <div v-if="!artistList.length" class="dir-empty">音乐库暂无歌曲</div>
            <template v-else>
              <div
                v-for="artist in pagedArtistList"
                :key="artist.id"
                class="artist-row"
                :class="{ active: activeArtist === artist.name }"
                @click="selectArtist(artist)"
              >
                <span class="artist-avatar" :class="{ 'has-cover': artist.cover }">
                  <CoverArt v-if="artist.cover" :src="artist.cover" />
                  <template v-else>{{ artistInitial(artist.name) }}</template>
                </span>
                <span class="tree-label" :title="artist.name">{{ artist.name }}</span>
                <span class="artist-count">{{ artist.trackCount }} 首</span>
              </div>
              <div v-if="totalArtistPages > 1" class="artist-pager">
                <button
                  type="button"
                  class="pager-btn"
                  :disabled="artistPage <= 1"
                  title="上一页"
                  @click="artistPage--"
                >‹</button>
                <span class="pager-info">{{ artistPage }} / {{ totalArtistPages }}</span>
                <button
                  type="button"
                  class="pager-btn"
                  :disabled="artistPage >= totalArtistPages"
                  title="下一页"
                  @click="artistPage++"
                >›</button>
              </div>
            </template>
          </div>
        </template>
      </aside>

      <!-- 中间：文件列表 -->
      <section class="file-panel card">
        <div class="file-toolbar">
          <ClearableInput
            v-model="filterText"
            variant="plain"
            input-class="filter-input"
            class="filter-input-wrap"
            placeholder="按文件名过滤..."
          />
          <div class="file-toolbar-info">
            <span v-if="loadingMeta" class="meta-progress">
              读取标签 {{ metaProgress.done }}/{{ metaProgress.total }}
              <button class="btn-ghost btn-sm meta-stop" @click="cancelMetaLoad">停止</button>
            </span>
            <span v-if="matching" class="meta-progress match-progress" :title="matchProgress.current">
              {{ matchPaused ? '已暂停' : '匹配并保存' }}
              {{ matchProgress.done }}/{{ matchProgress.total }}<template v-if="matchProgress.current"> · {{ matchProgress.current }}</template>
              <button
                v-if="!matchPaused"
                class="btn-ghost btn-sm meta-stop"
                type="button"
                @click="pauseTagMatch"
              >暂停</button>
              <button
                v-else
                class="btn-ghost btn-sm meta-stop"
                type="button"
                @click="resumeTagMatch"
              >继续</button>
              <button class="btn-ghost btn-sm meta-stop" type="button" @click="stopTagMatch">停止</button>
            </span>
            <span v-if="tagChecking" class="meta-progress match-progress" :title="tagCheckProgress.current">
              {{ tagCheckPaused ? '检测已暂停' : '手动检测' }}
              {{ tagCheckProgress.done }}/{{ tagCheckProgress.total }}<template v-if="tagCheckProgress.current"> · {{ tagCheckProgress.current }}</template>
              <button
                v-if="!tagCheckPaused"
                class="btn-ghost btn-sm meta-stop"
                type="button"
                @click="pauseManualTagCheck"
              >暂停</button>
              <button
                v-else
                class="btn-ghost btn-sm meta-stop"
                type="button"
                @click="resumeManualTagCheck"
              >继续</button>
              <button class="btn-ghost btn-sm meta-stop" type="button" @click="stopManualTagCheck">停止</button>
            </span>
          </div>
          <div class="file-toolbar-meta">
            <span class="file-count">
              {{ displayedFiles.length }} / {{ files.length }}
              <template v-if="missingFilesCount"> · 缺失 {{ missingFilesCount }}</template>
            </span>
            <AppSelect
              v-model="missingFilter"
              :options="missingFilterOptions"
              size="sm"
              title="缺失筛选"
            />
            <label class="check-all">
              <input type="checkbox" v-model="selectAll" @change="toggleAll" /> 全选
            </label>
          </div>
          <div class="file-toolbar-actions">
            <button
              v-if="browseMode === 'dir'"
              class="btn-ghost btn-sm"
              :disabled="!activeDir || scanning || loadingMeta"
              @click="scanSubdirsRecursive"
            >
              含子目录扫描
            </button>
            <button class="btn-ghost btn-sm" :disabled="!displayedFiles.length" @click="playAllVisible">
              试听全部
            </button>
            <button class="btn-ghost btn-sm" :disabled="!missingFilesCount || matching || tagChecking" @click="selectMissingFiles">
              选中缺失
            </button>
            <button class="btn-ghost btn-sm" :disabled="!missingFilesCount || matching || tagChecking" @click="autoMatchMissing">
              {{ matching ? '匹配中...' : `匹配缺失 (${missingMatchCount})` }}
            </button>
            <button class="btn-ghost btn-sm" :disabled="!selectedFiles.length || matching || tagChecking" @click="autoMatchSelected">
              {{ matching ? '匹配中...' : `匹配选中 (${selectedFiles.length})` }}
            </button>
            <button
              class="btn-ghost btn-sm"
              :disabled="!selectedFiles.length || matching || tagChecking"
              title="按文件名搜索并为勾选的文件重写标签/封面/歌词，直接保存到磁盘"
              @click="autoRematchSelectedByFilename"
            >
              {{ matching ? '匹配中...' : `按文件名重设 (${selectedFiles.length})` }}
            </button>
            <button
              class="btn-ghost btn-sm"
              :disabled="tagChecking || matching || (!selectedFiles.length && !editingFile)"
              title="按文件名搜索，检测内嵌标签是否与网络结果一致"
              @click="runManualTagCheckSelected"
            >
              {{ tagChecking ? '检测中...' : '手动检测' }}
            </button>
            <AppSelect
              v-model="fetchSource"
              :options="sourceOptions"
              size="sm"
              title="自动匹配音源"
            />
          </div>
        </div>
        <div v-if="(matching && matchProgress.total) || (tagChecking && tagCheckProgress.total)" class="match-progress-bar">
          <div
            class="match-progress-fill"
            :style="{ width: (matching ? matchPercent : tagCheckPercent) + '%' }"
          />
        </div>

        <template v-if="displayedFiles.length">
        <div class="table-wrap desktop-file-table" v-if="!isCompactLayout">
          <table>
            <thead>
              <tr>
                <th class="col-check"></th>
                <th>文件名</th>
                <th>标题</th>
                <th class="col-artist">歌手</th>
                <th class="col-album">专辑</th>
                <th class="col-flag">封面</th>
                <th class="col-flag">歌词</th>
                <th class="col-play"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="f in displayedFiles" :key="f.filePath"
                :class="{
                  modified: f._modified,
                  active: editingFile?.filePath === f.filePath,
                  selected: f._selected,
                  playing: isPlayingFile(f),
                  'row-missing': isFileMissing(f, 'any'),
                }"
                @click="openEdit(f)"
              >
                <td @click.stop><input type="checkbox" v-model="f._selected" /></td>
                <td class="cell-file" :title="f.filePath">
                  <span class="file-cell-inner">
                    <span class="file-cover-wrap" aria-hidden="true">
                      <CoverArt :src="listCoverSrc(f)" loading="lazy" />
                    </span>
                    <span class="file-name-text">{{ f.fileName }}</span>
                  </span>
                </td>
                <td class="cell-text" :class="{ 'cell-suspect': f._checkMismatch?.title }">{{ f.title || '-' }}</td>
                <td class="cell-text col-artist" :class="{ 'cell-suspect': f._checkMismatch?.artist }">{{ f.artist || '-' }}</td>
                <td class="cell-text col-album" :class="{ 'cell-missing': isTagFieldMissing(f, 'album'), 'cell-suspect': f._checkMismatch?.album }">{{ f.album || '-' }}</td>
                <td class="col-flag" :class="{ 'cell-missing': isTagFieldMissing(f, 'cover') }">{{ f.hasPicture ? '✓' : '-' }}</td>
                <td class="col-flag" :class="{ 'cell-missing': isTagFieldMissing(f, 'lyric') }">{{ f.hasLyrics ? '✓' : '-' }}</td>
                <td class="col-play" @click.stop>
                  <button
                    class="play-btn"
                    :title="isPlayingFile(f) && !isPaused ? '暂停' : '试听'"
                    @click="togglePlayFile(f)"
                  >
                    <svg v-if="isPlayingFile(f) && !isPaused" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                    <svg v-else-if="loadingPlay === fileTrackId(f)" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" class="spin"><circle cx="12" cy="12" r="10" stroke-dasharray="50" stroke-dashoffset="20"/></svg>
                    <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                  </button>
                  <button
                    class="queue-add-btn"
                    :class="{ added: isFileInQueue(f) }"
                    :title="isFileInQueue(f) ? '已在试听列表' : '加入试听列表'"
                    @click="addFileToQueue(f)"
                  >
                    <svg v-if="isFileInQueue(f)" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                    <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="mobile-file-list" v-else>
          <div
            v-for="f in displayedFiles"
            :key="'m-' + f.filePath"
            class="mobile-file-row"
            :class="{
              modified: f._modified,
              active: editingFile?.filePath === f.filePath,
              selected: f._selected,
              playing: isPlayingFile(f),
              'row-missing': isFileMissing(f, 'any'),
            }"
            @click="openEdit(f)"
          >
            <label class="mobile-file-check" @click.stop>
              <input type="checkbox" v-model="f._selected" />
            </label>
            <div class="mobile-file-cover" aria-hidden="true">
              <CoverArt :src="listCoverSrc(f)" loading="lazy" />
            </div>
            <div class="mobile-file-meta">
              <div class="mobile-file-name" :title="f.filePath">{{ f.fileName }}</div>
              <div class="mobile-file-sub" :class="{ 'text-suspect': f._checkMismatch?.title || f._checkMismatch?.artist }">
                {{ f.title || f.parsedTitle || '无标题' }}
                <span>·</span>
                {{ f.artist || f.parsedArtist || '未知歌手' }}
              </div>
              <div class="mobile-file-flags">
                <span :class="{ miss: isTagFieldMissing(f, 'album') }">专辑{{ f.album ? '✓' : '—' }}</span>
                <span :class="{ miss: isTagFieldMissing(f, 'cover') }">封面{{ f.hasPicture ? '✓' : '—' }}</span>
                <span :class="{ miss: isTagFieldMissing(f, 'lyric') }">歌词{{ f.hasLyrics ? '✓' : '—' }}</span>
              </div>
            </div>
            <div class="mobile-file-actions" @click.stop>
              <button
                class="play-btn"
                :title="isPlayingFile(f) && !isPaused ? '暂停' : '试听'"
                @click="togglePlayFile(f)"
              >
                <svg v-if="isPlayingFile(f) && !isPaused" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                <svg v-else-if="loadingPlay === fileTrackId(f)" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" class="spin"><circle cx="12" cy="12" r="10" stroke-dasharray="50" stroke-dashoffset="20"/></svg>
                <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
              </button>
              <button
                class="queue-add-btn"
                :class="{ added: isFileInQueue(f) }"
                :title="isFileInQueue(f) ? '已在试听列表' : '加入试听列表'"
                @click="addFileToQueue(f)"
              >
                <svg v-if="isFileInQueue(f)" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
            </div>
          </div>
        </div>
        </template>
        <div v-else-if="scanning" class="empty">{{ browseMode === 'artist' ? '正在加载歌手歌曲...' : '正在加载文件夹...' }}</div>
        <div v-else-if="files.length && missingFilter !== 'all'" class="empty">当前筛选条件下没有缺失文件</div>
        <div v-else class="empty">{{ browseMode === 'artist' ? '在左侧选择一位歌手，加载其全部歌曲进行编辑' : '在左侧展开并选择文件夹，加载该层音频文件' }}</div>
      </section>

      <div
        v-if="showMobileEditSheet"
        class="edit-sheet-backdrop"
        @click="closeMobileEdit"
      />

      <!-- 右侧：编辑面板（桌面常驻；窄屏/手机为底部抽屉） -->
      <aside class="edit-panel card" :class="{ 'sheet-open': showMobileEditSheet }">
        <div class="panel-title">
          {{ editPanelTitle }}
          <div class="panel-title-actions">
            <button
              v-if="!isBatchMode && editingFile && (editForm || loadingDetail)"
              class="btn-ghost btn-sm play-inline"
              @click="togglePlayFile(editingFile)"
              :title="isPlayingFile(editingFile) && !isPaused ? '暂停' : '试听当前文件'"
            >
              {{ isPlayingFile(editingFile) && !isPaused ? '暂停' : '试听' }}
            </button>
            <button
              v-if="showMobileEditSheet"
              type="button"
              class="btn-icon edit-sheet-close"
              title="关闭"
              @click="closeMobileEdit"
            >×</button>
          </div>
        </div>

        <div v-if="loadingDetail" class="detail-loading">正在读取文件内置信息...</div>

        <div v-else-if="editForm" class="edit-form">
          <div class="field-toolbar meta-fetch-toolbar">
            <div class="split-btn">
              <button class="btn-primary btn-sm" @click="openFetchModal('meta')" :disabled="fetchLoading || tagChecking">
                {{ fetchLoading ? '获取中...' : '网络获取信息' }}
              </button>
              <AppSelect
                v-model="fetchSource"
                :options="sourceOptions"
                size="sm"
                variant="attached-end"
                title="选择音源"
              />
            </div>
            <button
              class="btn-ghost btn-sm"
              :disabled="!editingFile || tagChecking || fetchLoading"
              title="按文件名（歌手-歌名 / 歌名-歌手）搜索，对比内嵌标签是否正确"
              @click="runManualTagCheck"
            >
              {{ tagChecking ? '检测中...' : '手动检测' }}
            </button>
          </div>

          <div v-if="tagCheckResult" class="tag-check-banner" :class="tagCheckResult.ok ? 'is-ok' : 'is-bad'">
            <template v-if="tagCheckResult.ok">
              检测通过：内嵌信息与按文件名搜索到的结果一致
            </template>
            <template v-else-if="tagCheckResult.reason === 'parse'">
              无法从文件名解析歌手/歌名，请手动核对
            </template>
            <template v-else-if="tagCheckResult.reason === 'no-match'">
              按文件名未搜到可靠结果，请换音源或手动搜索
            </template>
            <template v-else>
              <div class="tag-check-title">标签可能不正确（按文件名搜索对比）</div>
              <div class="tag-check-suggest">
                <span v-if="tagCheckResult.suggested?.title">歌名建议：{{ tagCheckResult.suggested.title }}</span>
                <span v-if="tagCheckResult.suggested?.artist">歌手建议：{{ tagCheckResult.suggested.artist }}</span>
                <span v-if="tagCheckResult.suggested?.album">专辑建议：{{ tagCheckResult.suggested.album }}</span>
                <span>将同时更新封面与歌词</span>
              </div>
              <button
                type="button"
                class="btn-primary btn-sm"
                :disabled="tagCheckApplying"
                @click="applyAllCheckSuggestions"
              >{{ tagCheckApplying ? '获取封面/歌词…' : '全部采用建议' }}</button>
            </template>
          </div>

          <label :class="{ 'field-suspect': isFieldSuspect('title') }">
            <span class="field-label-row">
              标题
              <button
                v-if="isFieldSuspect('title') && tagCheckResult?.suggested?.title"
                type="button"
                class="btn-ghost btn-xs suspect-apply"
                @click="applyCheckSuggestion('title')"
              >采用建议</button>
            </span>
            <input v-model="editForm.title" @input="onSuspectFieldInput('title')" />
            <span v-if="isFieldSuspect('title') && tagCheckResult?.suggested?.title" class="suspect-tip">
              建议：{{ tagCheckResult.suggested.title }}
            </span>
          </label>
          <label :class="{ 'field-suspect': isFieldSuspect('artist') }">
            <span class="field-label-row">
              歌手
              <button
                v-if="isFieldSuspect('artist') && tagCheckResult?.suggested?.artist"
                type="button"
                class="btn-ghost btn-xs suspect-apply"
                @click="applyCheckSuggestion('artist')"
              >采用建议</button>
            </span>
            <input
              v-model="editForm.artist"
              placeholder="多歌手用 / 分隔，如：周杰伦 / 费玉清"
              @input="onSuspectFieldInput('artist')"
            />
            <span v-if="isFieldSuspect('artist') && tagCheckResult?.suggested?.artist" class="suspect-tip">
              建议：{{ tagCheckResult.suggested.artist }}
            </span>
            <span class="field-hint">多歌手用「 / 」分隔；FLAC 写入多值，其它格式写展示串</span>
          </label>
          <label :class="{ 'field-suspect': isFieldSuspect('album') }">
            <span class="field-label-row">
              专辑
              <button
                v-if="isFieldSuspect('album') && tagCheckResult?.suggested?.album"
                type="button"
                class="btn-ghost btn-xs suspect-apply"
                @click="applyCheckSuggestion('album')"
              >采用建议</button>
            </span>
            <input v-model="editForm.album" @input="onSuspectFieldInput('album')" />
            <span v-if="isFieldSuspect('album') && tagCheckResult?.suggested?.album" class="suspect-tip">
              建议：{{ tagCheckResult.suggested.album }}
            </span>
          </label>
          <label>年份<input v-model="editForm.year" @input="markModified" /></label>
          <label>风格<input v-model="editForm.genre" @input="markModified" /></label>
          <label>描述<input v-model="editForm.comment" @input="markModified" /></label>

          <label class="field-block">封面
            <div class="field-toolbar">
              <div class="split-btn">
                <button class="btn-primary btn-sm" @click="openFetchModal('cover')" :disabled="fetchLoading">
                  {{ fetchLoading ? '获取中...' : '网络获取信息' }}
                </button>
                <AppSelect
                  v-model="fetchSource"
                  :options="sourceOptions"
                  size="sm"
                  variant="attached-end"
                  title="选择音源"
                />
              </div>
            </div>
            <div class="cover-box">
              <img v-if="editForm.pictureBase64" :src="editForm.pictureBase64" alt="cover" />
              <img v-else-if="editForm.picUrl" :src="editForm.picUrl" alt="cover" referrerpolicy="no-referrer" />
              <div v-else class="cover-placeholder">无封面</div>
            </div>
            <input type="file" accept="image/*" @change="onCoverUpload" />
            <input v-model="editForm.picUrl" placeholder="或输入封面 URL" @input="markModified" />
          </label>

          <label class="field-block">歌词
            <div class="field-toolbar">
              <div class="split-btn">
                <button class="btn-primary btn-sm" @click="openFetchModal('lyric')" :disabled="fetchLoading">
                  {{ fetchLoading ? '获取中...' : '网络获取信息' }}
                </button>
                <AppSelect
                  v-model="fetchSource"
                  :options="sourceOptions"
                  size="sm"
                  variant="attached-end"
                  title="选择音源"
                />
              </div>
            </div>
            <textarea v-model="editForm.lyric" rows="8" @input="markModified" placeholder="LRC 歌词内容"></textarea>
          </label>
        </div>

        <div v-else class="edit-empty">
          <p>点击中间列表中的歌曲，在此编辑标题、歌手、专辑、封面与歌词。</p>
        </div>

        <div v-if="editForm && !loadingDetail" class="edit-actions">
          <button class="btn-primary" @click="saveCurrent" :disabled="saving" title="只写入当前正在编辑的这一首">
            {{ saving ? '保存中...' : '保存当前到文件' }}
          </button>
          <button
            class="btn-ghost"
            @click="applyToFiles"
            :disabled="!editForm"
            :title="isBatchMode
              ? `把当前表单复制到选中的 ${selectedFiles.length} 个文件（仅列表，需再点顶部「保存全部修改」写盘）`
              : '仅更新列表显示，不会写入磁盘'"
          >
            应用到{{ isBatchMode ? `选中(${selectedFiles.length})` : '当前' }}
          </button>
        </div>
      </aside>
    </div>

    <div v-if="toast" class="toast" :class="toast.type">{{ toast.text }}</div>

    <!-- 网络获取信息弹窗 -->
    <div class="modal-overlay" v-if="showFetchModal" @click.self="closeFetchModal">
      <div class="fetch-modal">
        <div class="fetch-header">
          <h3>{{ fetchIntentLabel }} · {{ fetchSourceLabel }}</h3>
          <button class="btn-icon" @click="closeFetchModal">×</button>
        </div>

        <div class="fetch-search">
          <label class="search-field">
            <span>歌手</span>
            <ClearableInput v-model="fetchArtist" variant="plain" placeholder="歌手名" @enter="doFetchSearch" />
          </label>
          <button
            type="button"
            class="btn-ghost btn-sm fetch-swap-btn"
            title="对调歌手与歌名"
            @click="swapFetchArtistTitle"
          >对调</button>
          <label class="search-field">
            <span>歌名</span>
            <ClearableInput v-model="fetchTitle" variant="plain" placeholder="歌曲名" @enter="doFetchSearch" />
          </label>
          <button class="btn-primary btn-sm search-btn" @click="doFetchSearch" :disabled="fetchLoading">
            {{ fetchLoading ? '搜索中...' : '搜索' }}
          </button>
        </div>

        <div class="fetch-body">
          <div class="fetch-list">
            <div v-if="!fetchResults.length && !fetchLoading" class="fetch-empty">暂无结果，请调整歌手或歌名后重试</div>
            <div
              v-for="(item, i) in fetchResults" :key="i"
              :class="['fetch-item', { active: fetchPreview?.id === item.id && fetchPreview?.source === item.source }]"
              @click="previewFetchItem(item)"
            >
              <img v-if="fetchIntent === 'cover' && item.picUrl" :src="item.picUrl" class="fetch-thumb" alt="" />
              <div v-else-if="item.picUrl" class="fetch-thumb"><img :src="item.picUrl" alt="" /></div>
              <div v-else class="fetch-thumb placeholder">♪</div>
              <div class="fetch-item-info">
                <div class="fetch-item-name">{{ item.name }}</div>
                <div class="fetch-item-meta">{{ item.singer }} · {{ item.album || item.albumName || '-' }}</div>
                <div class="fetch-item-score">匹配度 {{ item._score }}</div>
              </div>
            </div>
          </div>

          <div class="fetch-preview" v-if="fetchPreviewMeta">
            <div class="preview-info">
              <p><strong>标题</strong> {{ fetchPreviewMeta.title || fetchPreview?.name || '-' }}</p>
              <p><strong>歌手</strong> {{ fetchPreviewMeta.artist || fetchPreview?.singer || '-' }}</p>
              <p><strong>专辑</strong> {{ fetchPreviewMeta.album || '-' }}</p>
              <p v-if="fetchIntent !== 'cover' && fetchIntent !== 'lyric' || fetchPreviewMeta.year">
                <strong>年份</strong> {{ fetchPreviewMeta.year || '-' }}
              </p>
              <p v-if="fetchIntent !== 'cover' && fetchIntent !== 'lyric' || fetchPreviewMeta.genre">
                <strong>风格</strong> {{ fetchPreviewMeta.genre || '-' }}
              </p>
              <p v-if="fetchIntent === 'meta' && fetchPreviewMeta.comment">
                <strong>描述</strong> {{ fetchPreviewMeta.comment }}
              </p>
            </div>

            <template v-if="fetchIntent === 'cover'">
              <div class="preview-cover large">
                <img v-if="fetchPreviewMeta.pic || fetchPreview?.picUrl" :src="fetchPreviewMeta.pic || fetchPreview?.picUrl" alt="cover" />
                <div v-else class="cover-placeholder">无封面</div>
              </div>
            </template>

            <template v-else>
              <div class="preview-lyric">
                <div class="preview-lyric-title">歌词预览</div>
                <pre>{{ fetchPreviewMeta.lyric ? fetchPreviewMeta.lyric.slice(0, 800) : '暂无歌词' }}{{ fetchPreviewMeta.lyric?.length > 800 ? '...' : '' }}</pre>
              </div>
            </template>
          </div>
          <div class="fetch-preview empty" v-else>
            <p>请从左侧选择一条结果查看{{ fetchPreviewEmptyHint }}</p>
          </div>
        </div>

        <div class="fetch-footer">
          <button class="btn-ghost" @click="closeFetchModal">取消</button>
          <button
            class="btn-primary"
            @click="confirmFetchApply"
            :disabled="!fetchPreviewMeta || !canConfirmFetch"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineOptions({ name: 'Tag' })
import { ref, computed, reactive, onMounted, onBeforeUnmount, watch } from 'vue'
import { api } from '../api.js'
import {
  updateLibraryTracksFromFiles,
  libraryTracks,
  groupArtists,
} from '../stores/library.js'
import { appConfirm } from '../stores/appDialog.js'
import {
  loadingPlay, isPaused, isPlayingItem, playItem, addToQueue, isInQueue,
  refreshPlayingLocalMeta,
} from '../stores/player.js'
import {
  tagMatchRunning,
  tagMatchPaused,
  tagMatchProgress,
  tagMatchPercent,
  tagMatchPatchVersion,
  tagMatchResult,
  startTagMatchBatch,
  pauseTagMatch,
  resumeTagMatch,
  stopTagMatch,
  syncFilesFromMatchPatches,
  saveTagEditorSession,
  tagEditorSession,
  clearTagMatchResult,
} from '../stores/tagMatch.js'
import AppSelect from '../components/AppSelect.vue'
import ClearableInput from '../components/ClearableInput.vue'
import CoverArt from '../components/CoverArt.vue'
import { collectDefaultExpandedPaths } from '../utils/dirTreeExpand.js'
import { resolveSearchArtistTitle, parseFilename } from '../utils/filenameParse.js'
import { withStreamAuth } from '../utils/streamAuth.js'

const sourceOptions = [
  { value: 'tx', label: 'QQ音乐' },
  { value: 'wy', label: '网易云' },
]
const missingFilterOptions = [
  { value: 'all', label: '全部文件' },
  { value: 'any', label: '缺失信息' },
]

const matching = tagMatchRunning
const matchPaused = tagMatchPaused
const matchProgress = tagMatchProgress
const matchPercent = tagMatchPercent
const dirs = ref([])
const activeDir = ref('')
const expandedPaths = ref(new Set())
const treeCache = ref({})
const files = ref([])
const browseMode = ref('dir')
const activeArtist = ref('')
const filterText = ref('')
const missingFilter = ref('all')
const selectAll = ref(false)
const saving = ref(false)
const fetchSource = ref('tx')
const fetchLoading = ref(false)
const fetchResults = ref([])
const fetchPreview = ref(null)
const fetchPreviewMeta = ref(null)
const showFetchModal = ref(false)
const fetchArtist = ref('')
const fetchTitle = ref('')
const fetchIntent = ref('cover')
const editingFile = ref(null)
const editForm = ref(null)
const toast = ref(null)
const scanning = ref(false)
const loadingMeta = ref(false)
const loadingDetail = ref(false)
const metaProgress = ref({ done: 0, total: 0 })
const metaLoadToken = ref(0)
const isCompactLayout = ref(false)
const tagChecking = ref(false)
const tagCheckPaused = ref(false)
const tagCheckStopRequested = ref(false)
const tagCheckProgress = ref({ done: 0, total: 0, current: '' })
const tagCheckPercent = computed(() => {
  const { done, total } = tagCheckProgress.value
  if (!total) return 0
  return Math.min(100, Math.round((done / total) * 100))
})
const tagCheckApplying = ref(false)
const tagCheckResult = ref(null)
let compactMq = null

function sleepMs(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitManualTagCheckGate() {
  while (tagCheckPaused.value && !tagCheckStopRequested.value) {
    await sleepMs(120)
  }
  return tagCheckStopRequested.value
}

function pauseManualTagCheck() {
  if (!tagChecking.value) return
  tagCheckPaused.value = true
}

function resumeManualTagCheck() {
  tagCheckPaused.value = false
}

function stopManualTagCheck() {
  if (!tagChecking.value) return
  tagCheckStopRequested.value = true
  tagCheckPaused.value = false
}

function syncCompactLayout() {
  isCompactLayout.value = Boolean(compactMq?.matches)
}

const showMobileEditSheet = computed(() => (
  isCompactLayout.value
  && Boolean(editingFile.value && (editForm.value || loadingDetail.value))
))

function closeMobileEdit() {
  editingFile.value = null
  editForm.value = null
  loadingDetail.value = false
  tagCheckResult.value = null
}

function folderDisplayName(dirPath, depth) {
  if (!dirPath) return ''
  if (depth === 0) {
    const parts = String(dirPath).replace(/\\/g, '/').split('/').filter(Boolean)
    return parts[parts.length - 1] || dirPath
  }
  const parts = String(dirPath).replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] || dirPath
}

function getTreeEntry(dirPath) {
  return treeCache.value[dirPath] || { dirs: [], loaded: false, loading: false }
}

const visibleTreeRows = computed(() => {
  const rows = []
  const visit = (dirPath, depth) => {
    const cached = getTreeEntry(dirPath)
    const expanded = expandedPaths.value.has(dirPath)
    rows.push({
      path: dirPath,
      name: folderDisplayName(dirPath, depth),
      depth,
      expanded,
      loading: cached.loading,
      loaded: cached.loaded,
      hasChildren: !cached.loaded || cached.dirs.length > 0,
    })
    if (expanded && cached.loaded) {
      for (const child of cached.dirs) visit(child.path, depth + 1)
    }
  }
  for (const root of dirs.value) visit(root, 0)
  return rows
})

/** 按歌手模式：从音乐库曲目分组得到歌手列表 */
const artistList = computed(() => groupArtists(libraryTracks.value))

const artistPage = ref(1)
const artistPageSize = 50
const totalArtistPages = computed(() => Math.max(1, Math.ceil(artistList.value.length / artistPageSize)))
const artistPageStart = computed(() => (artistPage.value - 1) * artistPageSize)
const pagedArtistList = computed(() =>
  artistList.value.slice(artistPageStart.value, artistPageStart.value + artistPageSize)
)

watch(artistList, () => {
  const max = Math.max(1, Math.ceil(artistList.value.length / artistPageSize))
  if (artistPage.value > max) artistPage.value = max
})

function artistInitial(name) {
  const n = String(name || '').trim()
  if (!n) return '?'
  const first = n[0]
  if (/[a-zA-Z]/.test(first)) return first.toUpperCase()
  return first
}

/** 切换左侧浏览模式（文件目录 / 按歌手） */
function switchBrowseMode(mode) {
  if (browseMode.value === mode) return
  if (files.value.length) {
    saveTagEditorSession({
      mode: browseMode.value,
      activeDir: activeDir.value,
      activeArtist: activeArtist.value,
      files: files.value,
    })
  }
  // 保留两模式的浏览位置（activeDir / activeArtist 不重置），仅清空列表与编辑状态
  files.value = []
  editingFile.value = null
  editForm.value = null
  tagCheckResult.value = null
  selectAll.value = false
  browseMode.value = mode
}

/** 点击歌手：把该歌手全部歌曲转换为编辑列表（与选择文件夹一致） */
async function selectArtist(artist) {
  if (!artist?.name || scanning.value) return
  metaLoadToken.value += 1
  loadingMeta.value = false
  const token = metaLoadToken.value
  activeArtist.value = artist.name
  scanning.value = true
  files.value = []
  editingFile.value = null
  editForm.value = null
  tagCheckResult.value = null
  selectAll.value = false

  try {
    const list = (artist.tracks || []).map(t => {
      const filePath = t.filePath || t.localPath
      const ext = (filePath || '').match(/\.([^.]+)$/)?.[1] || ''
      const picFromData = t.picUrl?.startsWith?.('data:')
        ? t.picUrl
        : (t.pictureBase64
          ? (String(t.pictureBase64).startsWith('data:')
            ? t.pictureBase64
            : `data:${t.pictureMime || 'image/jpeg'};base64,${t.pictureBase64}`)
          : '')
      const coverUrl = picFromData || (t.picUrl && !t.picUrl.startsWith('data:') ? t.picUrl : '')
      const item = {
        filePath,
        fileName: t.fileName || (filePath ? String(filePath).replace(/\\/g, '/').split('/').pop() : ''),
        mtime: t.mtime || 0,
        parsedTitle: t.name || '',
        parsedArtist: t.singer || '',
        title: t.title || t.name || '',
        artist: t.singer || '',
        album: t.album || '',
        year: t.year || '',
        genre: t.genre || '',
        comment: t.comment || '',
        lyric: t.lyric || '',
        hasPicture: Boolean(t.hasPicture || t.picUrl || t.img || coverUrl),
        hasLyrics: Boolean(t.lyric || t.hasLyrics),
        pictureBase64: picFromData || '',
        picUrl: coverUrl,
        pictureMime: t.pictureMime || '',
      }
      return item
    })
    if (token !== metaLoadToken.value) return
    files.value = mapListedFiles(list)
    if (!files.value.length) {
      showToast('该歌手暂无歌曲', 'info')
      saveTagEditorSession({
        mode: 'artist',
        activeDir: activeDir.value,
        activeArtist: activeArtist.value,
        files: files.value,
      })
      return
    }
    showToast(`已加载 ${files.value.length} 个文件，正在同步封面/歌词状态...`, 'info')
    saveTagEditorSession({
      mode: 'artist',
      activeDir: activeDir.value,
      activeArtist: activeArtist.value,
      files: files.value,
    })
    loadMetaInBatches(token)
  } catch (e) {
    showToast(e.message, 'error')
  } finally {
    if (token === metaLoadToken.value) scanning.value = false
  }
}

function mapListedFiles(list) {
  return (list || []).map(f => ({
    ...f,
    _selected: false,
    _modified: false,
    _metaLoaded: Boolean(
      f.album || f.genre || f.year || f.comment
      || (f.title && f.title !== f.parsedTitle)
      || (f.artist && f.artist !== f.parsedArtist),
    ),
  }))
}

function cancelMetaLoad() {
  metaLoadToken.value += 1
  loadingMeta.value = false
  showToast('已停止读取标签', 'info')
}

function hasTagText(value) {
  return Boolean(String(value ?? '').trim())
}

const MISSING_FIELDS = ['album', 'cover', 'lyric']

function isTagFieldMissing(f, field) {
  if (!f) return false
  switch (field) {
    case 'album': return !hasTagText(f.album)
    case 'cover': return !f.hasPicture
    case 'lyric': return !f.hasLyrics
    default: return false
  }
}

function isFileMissing(f, mode = missingFilter.value) {
  if (!f || mode === 'all') return false
  if (mode === 'album' || mode === 'cover' || mode === 'lyric') {
    return isTagFieldMissing(f, mode)
  }
  return MISSING_FIELDS.some(field => isTagFieldMissing(f, field))
}

function getMissingMode() {
  return missingFilter.value === 'all' ? 'any' : missingFilter.value
}

const displayedFiles = computed(() => {
  let list = files.value
  if (missingFilter.value !== 'all') {
    list = list.filter(f => isFileMissing(f, missingFilter.value))
  }
  const q = filterText.value.trim().toLowerCase()
  if (q) list = list.filter(f => f.fileName.toLowerCase().includes(q))
  return list
})

const missingFilesCount = computed(() => files.value.filter(f => isFileMissing(f, 'any')).length)

const missingMatchCount = computed(() => {
  const mode = getMissingMode()
  return files.value.filter(f => isFileMissing(f, mode)).length
})

const selectedFiles = computed(() => files.value.filter(f => f._selected))
const isBatchMode = computed(() => selectedFiles.value.length > 1)
const hasChanges = computed(() => files.value.some(f => f._modified))
const fetchSourceLabel = computed(() => fetchSource.value === 'tx' ? 'QQ音乐' : '网易云')
const fetchIntentLabel = computed(() => {
  if (fetchIntent.value === 'cover') return '网络获取封面'
  if (fetchIntent.value === 'lyric') return '网络获取歌词'
  return '网络获取标签'
})
const fetchPreviewEmptyHint = computed(() => {
  if (fetchIntent.value === 'cover') return '封面'
  if (fetchIntent.value === 'lyric') return '歌词'
  return '标签信息'
})
const canConfirmFetch = computed(() => {
  if (!fetchPreviewMeta.value) return false
  const meta = fetchPreviewMeta.value
  if (fetchIntent.value === 'cover') {
    return Boolean(meta.pic || meta.picUrl || fetchPreview.value?.picUrl)
  }
  if (fetchIntent.value === 'lyric') {
    return Boolean(meta.lyric)
  }
  return Boolean(meta.title || meta.artist || meta.album || meta.year || meta.genre || meta.comment)
})
const editPanelTitle = computed(() => {
  if (loadingDetail.value) return '读取文件信息'
  if (!editForm.value) return '标签编辑'
  const name = editingFile.value?.fileName || '当前文件'
  const n = selectedFiles.value.length
  if (n > 1) return `编辑：${name}（已选 ${n} 首）`
  return '单文件编辑'
})

function refreshEditFormFromFile() {
  const f = editingFile.value
  if (!f) return
  editForm.value = {
    title: f.title || '',
    artist: f.artist || '',
    album: f.album || '',
    year: f.year || '',
    genre: f.genre || '',
    comment: f.comment || '',
    lyric: f.lyric || '',
    picUrl: f.picUrl || '',
    pictureBase64: f.pictureBase64 || '',
  }
}

function handleMatchPatchesSync() {
  syncFilesFromMatchPatches(files.value)
  refreshEditFormFromFile()
}

watch(tagMatchPatchVersion, handleMatchPatchesSync)
watch(tagMatchRunning, (running, wasRunning) => {
  if (wasRunning && !running) {
    handleMatchPatchesSync()
    saveTagEditorSession({ mode: browseMode.value, activeDir: activeDir.value, activeArtist: activeArtist.value, files: files.value })
  }
})

watch(tagMatchResult, (result) => {
  if (!result) return
  showToast(result.text, result.type)
  clearTagMatchResult()
})

watch(missingFilter, () => {
  selectAll.value = false
})

onMounted(async () => {
  compactMq = window.matchMedia('(max-width: 1100px)')
  syncCompactLayout()
  if (compactMq.addEventListener) compactMq.addEventListener('change', syncCompactLayout)
  else compactMq.addListener?.(syncCompactLayout)

  await loadDirs()
  await initTreeExpansion()
  const session = tagEditorSession.value
  if (session.files?.length) {
    if (session.mode === 'artist') {
      browseMode.value = 'artist'
      activeArtist.value = session.activeArtist || ''
    } else {
      browseMode.value = 'dir'
      activeDir.value = session.activeDir || ''
    }
    files.value = session.files.map(f => ({ ...f }))
    handleMatchPatchesSync()
  }
})

onBeforeUnmount(() => {
  if (compactMq) {
    if (compactMq.removeEventListener) compactMq.removeEventListener('change', syncCompactLayout)
    else compactMq.removeListener?.(syncCompactLayout)
  }
  if (files.value.length) {
    saveTagEditorSession({ mode: browseMode.value, activeDir: activeDir.value, activeArtist: activeArtist.value, files: files.value })
  }
})

async function loadDirs() {
  try {
    const res = await api.paths.list()
    dirs.value = res.data || []
  } catch {}
}

/** 默认展开一级根目录及其二级子目录（三级及更深保持折叠） */
async function initTreeExpansion() {
  if (!dirs.value.length) return
  treeCache.value = {}
  expandedPaths.value = await collectDefaultExpandedPaths(
    dirs.value,
    getTreeEntry,
    ensureTreeChildren,
  )
}

async function ensureTreeChildren(dirPath) {
  const cached = getTreeEntry(dirPath)
  if (cached.loaded || cached.loading) return
  treeCache.value = {
    ...treeCache.value,
    [dirPath]: { ...cached, loading: true },
  }
  try {
    const res = await api.tag.listDir(dirPath)
    const data = res.data || {}
    treeCache.value = {
      ...treeCache.value,
      [dirPath]: {
        dirs: data.dirs || [],
        loaded: true,
        loading: false,
      },
    }
  } catch (e) {
    treeCache.value = {
      ...treeCache.value,
      [dirPath]: { dirs: [], loaded: true, loading: false },
    }
    showToast(e.message, 'error')
  }
}

async function toggleTreeNode(dirPath) {
  if (expandedPaths.value.has(dirPath)) {
    const next = new Set(expandedPaths.value)
    next.delete(dirPath)
    expandedPaths.value = next
    return
  }
  await ensureTreeChildren(dirPath)
  const next = new Set(expandedPaths.value)
  next.add(dirPath)
  expandedPaths.value = next
}

async function selectFolder(dir) {
  if (scanning.value) return
  metaLoadToken.value += 1
  loadingMeta.value = false
  const token = metaLoadToken.value
  activeDir.value = dir
  scanning.value = true
  files.value = []
  editingFile.value = null
  editForm.value = null
  tagCheckResult.value = null
  selectAll.value = false

  try {
    const res = await api.tag.listDir(dir)
    if (token !== metaLoadToken.value) return

    const data = res.data || {}
    const cached = getTreeEntry(dir)
    if (!cached.loaded) {
      treeCache.value = {
        ...treeCache.value,
        [dir]: {
          dirs: data.dirs || [],
          loaded: true,
          loading: false,
        },
      }
    }

    files.value = mapListedFiles(data.files)
    if (!files.value.length) {
      const subCount = (data.dirs || []).length
      showToast(subCount
        ? '该文件夹没有音频，请展开子文件夹或选择其他目录'
        : '该文件夹为空', 'info')
      saveTagEditorSession({ mode: browseMode.value, activeDir: activeDir.value, activeArtist: activeArtist.value, files: files.value })
      return
    }
    const needTextMeta = files.value.filter(f => !f._metaLoaded)
    const toastText = needTextMeta.length
      ? `已发现 ${files.value.length} 个文件，正在读取标签...`
      : `已加载 ${files.value.length} 个文件，正在同步封面/歌词状态...`
    showToast(toastText, 'info')
    saveTagEditorSession({ mode: browseMode.value, activeDir: activeDir.value, activeArtist: activeArtist.value, files: files.value })
    loadMetaInBatches(token)
  } catch (e) {
    showToast(e.message, 'error')
  } finally {
    if (token === metaLoadToken.value) scanning.value = false
  }
}

async function scanSubdirsRecursive() {
  if (!activeDir.value || scanning.value) return
  metaLoadToken.value += 1
  loadingMeta.value = false
  const token = metaLoadToken.value
  scanning.value = true
  files.value = []
  editingFile.value = null
  editForm.value = null
  tagCheckResult.value = null
  selectAll.value = false

  try {
    const res = await api.tag.scan(activeDir.value, { recursive: true })
    if (token !== metaLoadToken.value) return

    files.value = mapListedFiles(res.data)
    if (!files.value.length) {
      showToast(res.tip || '未发现音频文件', 'error')
      return
    }
    showToast(`已递归扫描 ${files.value.length} 个文件，正在读取标签...`, 'info')
    saveTagEditorSession({ mode: browseMode.value, activeDir: activeDir.value, activeArtist: activeArtist.value, files: files.value })
    loadMetaInBatches(token)
  } catch (e) {
    showToast(e.message, 'error')
  } finally {
    if (token === metaLoadToken.value) scanning.value = false
  }
}

function applyMetaRow(file, item) {
  if (!file || !item?.ok) return false
  const hasPicture = Boolean(item.hasPicture || item.pictureBase64)
  const hasLyrics = Boolean(item.hasLyrics || item.lyric)
  if (!file._metaLoaded) {
    Object.assign(file, {
      title: item.title || file.parsedTitle || file.title,
      artist: item.artist || file.parsedArtist || file.artist,
      album: item.album || '',
      year: item.year || '',
      genre: item.genre || '',
      comment: item.comment || '',
    })
    file._metaLoaded = true
  } else {
    if (item.year) file.year = item.year
    if (item.genre) file.genre = item.genre
    if (item.comment) file.comment = item.comment
  }
  file.hasPicture = hasPicture
  file.hasLyrics = hasLyrics
  return true
}

async function loadMetaInBatches(token) {
  if (!files.value.length) return

  loadingMeta.value = true
  metaProgress.value = { done: 0, total: files.value.length }
  const batchSize = 8

  for (let i = 0; i < files.value.length; i += batchSize) {
    if (token !== metaLoadToken.value) {
      loadingMeta.value = false
      return
    }

    const batch = files.value.slice(i, i + batchSize).map(f => f.filePath)
    try {
      const res = await api.tag.readBatch(batch, true)
      for (const item of res.data || []) {
        const file = files.value.find(f => f.filePath === item.filePath)
        if (!file) continue
        if (!item.ok) {
          console.warn('[tag] read-batch failed:', item.filePath, item.error)
          continue
        }
        applyMetaRow(file, item)
      }
    } catch (e) {
      showToast(`部分标签读取失败：${e.message}`, 'error')
    }

    metaProgress.value.done = Math.min(i + batchSize, files.value.length)
  }

  const failed = files.value.filter(f => !f._metaLoaded)
  if (failed.length && token === metaLoadToken.value) {
    for (let i = 0; i < failed.length; i += 4) {
      if (token !== metaLoadToken.value) {
        loadingMeta.value = false
        return
      }
      const batch = failed.slice(i, i + 4).map(f => f.filePath)
      try {
        const res = await api.tag.readBatch(batch, true)
        for (const item of res.data || []) {
          const file = files.value.find(f => f.filePath === item.filePath)
          applyMetaRow(file, item)
        }
      } catch {}
    }
  }

  if (token === metaLoadToken.value) {
    loadingMeta.value = false
    syncFilesFromMatchPatches(files.value)
    saveTagEditorSession({ mode: browseMode.value, activeDir: activeDir.value, activeArtist: activeArtist.value, files: files.value })
    showToast(`标签读取完成 ${metaProgress.value.done}/${metaProgress.value.total}`, 'success')
  }
}

function toggleAll() {
  displayedFiles.value.forEach(f => { f._selected = selectAll.value })
}

function selectMissingFiles() {
  const mode = getMissingMode()
  const targets = displayedFiles.value.filter(f => isFileMissing(f, mode))
  if (!targets.length) {
    showToast('当前范围内没有缺失文件', 'info')
    return
  }
  files.value.forEach(f => { f._selected = false })
  targets.forEach(f => { f._selected = true })
  selectAll.value = targets.length === displayedFiles.value.length
  showToast(`已选中 ${targets.length} 个缺失文件`, 'success')
}

function runTagMatch(targets) {
  if (!targets.length) return
  if (tagChecking.value) {
    showToast('请先等待或停止手动检测', 'info')
    return
  }
  startTagMatchBatch(
    targets.map(f => ({ filePath: f.filePath, fileName: f.fileName })),
    fetchSource.value,
  ).then((res) => {
    if (res.reason === 'busy') showToast('已有自动匹配任务进行中', 'info')
    else if (res.reason === 'empty') showToast('请先选择要匹配的文件', 'info')
    else handleMatchPatchesSync()
  })
}

function autoMatchMissing() {
  const mode = getMissingMode()
  const targets = files.value.filter(f => isFileMissing(f, mode))
  if (!targets.length) {
    showToast('没有需要匹配的缺失文件', 'info')
    return
  }
  targets.forEach(f => { f._selected = true })
  runTagMatch(targets)
}

/** 按文件名重新搜索，覆盖重写勾选文件的标签/封面/歌词并落盘 */
async function autoRematchSelectedByFilename() {
  const targets = selectedFiles.value
  if (!targets.length) {
    showToast('请先勾选要重设的文件', 'info')
    return
  }
  if (matching.value) {
    showToast('已有自动匹配任务进行中', 'info')
    return
  }
  const srcLabel = sourceOptions.find(o => o.value === fetchSource.value)?.label || fetchSource.value
  const ok = await appConfirm({
    title: '按文件名重设',
    message: `将按文件名重新搜索（音源：${srcLabel}），并为已勾选的 ${targets.length} 个文件重写：\n标题、歌手、专辑、封面、歌词等，并直接保存到磁盘。`,
    hint: '现有标签会被覆盖。确定继续？',
    confirmText: '开始重设',
  })
  if (!ok) return
  runTagMatch(targets)
}

async function openEdit(f) {
  editingFile.value = f
  fetchResults.value = []
  fetchPreview.value = null
  fetchPreviewMeta.value = null
  tagCheckResult.value = f._tagCheckResult || null

  // 自动匹配 / 手动改过但未保存：优先用内存中的结果，避免磁盘旧标签覆盖
  if (f._modified) {
    editForm.value = reactive({
      title: f.title || f.parsedTitle || '',
      artist: f.artist || f.parsedArtist || '',
      album: f.album || '',
      year: f.year ? String(f.year) : '',
      genre: f.genre || '',
      comment: f.comment || '',
      lyric: f.lyric || '',
      pictureBase64: f.pictureBase64 || '',
      picUrl: f.picUrl || '',
    })
    loadingDetail.value = false
    return
  }

  loadingDetail.value = true
  editForm.value = reactive({
    title: f.title || f.parsedTitle || '',
    artist: f.artist || f.parsedArtist || '',
    album: f.album || '',
    year: f.year ? String(f.year) : '',
    genre: f.genre || '',
    comment: f.comment || '',
    lyric: f.lyric || '',
    pictureBase64: f.pictureBase64 || '',
    picUrl: f.picUrl || '',
  })

  try {
    const res = await api.tag.read(f.filePath)
    const meta = res.data || {}
    // 仅回填尚未有值的字段，避免冲掉列表里已有信息
    if (!f._modified) {
      Object.assign(f, {
        title: meta.title || f.title,
        artist: meta.artist || f.artist,
        album: meta.album || f.album,
        year: meta.year || f.year,
        genre: meta.genre || f.genre,
        comment: meta.comment || f.comment,
        lyric: typeof meta.lyric === 'string' ? meta.lyric : (f.lyric || ''),
        pictureBase64: meta.pictureBase64 || f.pictureBase64 || '',
        hasPicture: meta.hasPicture ?? Boolean(meta.pictureBase64 || f.pictureBase64),
        hasLyrics: meta.hasLyrics ?? Boolean(meta.lyric || f.lyric),
      })
      f._detailLoaded = true
      editForm.value = reactive({
        title: f.title || f.parsedTitle || '',
        artist: f.artist || f.parsedArtist || '',
        album: f.album || '',
        year: f.year ? String(f.year) : '',
        genre: f.genre || '',
        comment: f.comment || '',
        lyric: f.lyric || '',
        pictureBase64: f.pictureBase64 || '',
        picUrl: f.picUrl || '',
      })
    }
  } catch (e) {
    showToast(`读取文件详情失败：${e.message}`, 'error')
  } finally {
    loadingDetail.value = false
  }
}

function markModified() {
  if (editingFile.value) editingFile.value._modified = true
}

function normCmpText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s\-–—_～~·・.。,，、'"`‘’“”()（）[\]【】]/g, '')
}

function fieldLikelyMatch(embedded, expected) {
  const a = normCmpText(embedded)
  const b = normCmpText(expected)
  if (!b) return true
  if (!a) return false
  if (a === b) return true
  if (a.includes(b) || b.includes(a)) return true
  return false
}

function isFieldSuspect(field) {
  return Boolean(tagCheckResult.value && !tagCheckResult.value.ok && tagCheckResult.value.mismatches?.[field])
}

function onSuspectFieldInput(field) {
  markModified()
  if (!tagCheckResult.value?.mismatches?.[field]) return
  const suggested = tagCheckResult.value.suggested?.[field]
  if (suggested && fieldLikelyMatch(editForm.value?.[field], suggested)) {
    tagCheckResult.value.mismatches[field] = false
    const stillBad = Object.values(tagCheckResult.value.mismatches).some(Boolean)
    if (!stillBad) {
      tagCheckResult.value = { ...tagCheckResult.value, ok: true, reason: '' }
    }
  }
}

function applyCheckSuggestion(field) {
  if (!editForm.value || !tagCheckResult.value?.suggested?.[field]) return
  editForm.value[field] = tagCheckResult.value.suggested[field]
  if (tagCheckResult.value.mismatches) tagCheckResult.value.mismatches[field] = false
  markModified()
  const stillBad = Object.values(tagCheckResult.value.mismatches || {}).some(Boolean)
  if (!stillBad) {
    tagCheckResult.value = { ...tagCheckResult.value, ok: true, reason: '' }
  }
  if (editingFile.value) {
    editingFile.value[field] = tagCheckResult.value.suggested[field]
    editingFile.value._checkMismatch = { ...(tagCheckResult.value.mismatches || {}) }
    editingFile.value._tagCheckResult = tagCheckResult.value
  }
}

async function applyAllCheckSuggestions() {
  if (!editForm.value || !tagCheckResult.value?.suggested) return
  const match = tagCheckResult.value.match
  if (!match) {
    showToast('缺少匹配结果，请重新检测', 'info')
    return
  }

  tagCheckApplying.value = true
  try {
    const res = await api.tag.matchApply(match, fetchSource.value, [
      'title', 'artist', 'album', 'year', 'genre', 'comment', 'cover', 'lyric',
    ])
    const meta = res.data || {}

    if (meta.title) editForm.value.title = meta.title
    else if (tagCheckResult.value.suggested.title) editForm.value.title = tagCheckResult.value.suggested.title
    if (meta.artist) editForm.value.artist = meta.artist
    else if (tagCheckResult.value.suggested.artist) editForm.value.artist = tagCheckResult.value.suggested.artist
    if (meta.album) editForm.value.album = meta.album
    else if (tagCheckResult.value.suggested.album) editForm.value.album = tagCheckResult.value.suggested.album
    if (meta.year) editForm.value.year = String(meta.year)
    if (meta.genre) editForm.value.genre = meta.genre
    if (meta.comment) editForm.value.comment = meta.comment

    if (meta.pic) {
      editForm.value.pictureBase64 = meta.pic
      editForm.value.picUrl = ''
    } else if (meta.picUrl) {
      editForm.value.picUrl = meta.picUrl
    } else if (match.picUrl) {
      editForm.value.picUrl = match.picUrl
    }

    if (typeof meta.lyric === 'string') {
      editForm.value.lyric = meta.lyric
    }

    if (tagCheckResult.value.mismatches) {
      tagCheckResult.value.mismatches.title = false
      tagCheckResult.value.mismatches.artist = false
      tagCheckResult.value.mismatches.album = false
    }
    markModified()
    tagCheckResult.value = { ...tagCheckResult.value, ok: true, reason: '' }

    if (editingFile.value) {
      const f = editingFile.value
      f._checkMismatch = { title: false, artist: false, album: false }
      f._tagCheckResult = tagCheckResult.value
      f.title = editForm.value.title
      f.artist = editForm.value.artist
      f.album = editForm.value.album
      if (editForm.value.pictureBase64 || editForm.value.picUrl) {
        f.hasPicture = true
        f._coverDirty = true
        if (editForm.value.pictureBase64) f.pictureBase64 = editForm.value.pictureBase64
        if (editForm.value.picUrl) f.picUrl = editForm.value.picUrl
      }
      if (editForm.value.lyric) {
        f.hasLyrics = true
        f.lyric = editForm.value.lyric
      }
    }

    const parts = ['标签']
    if (editForm.value.pictureBase64 || editForm.value.picUrl) parts.push('封面')
    if (editForm.value.lyric) parts.push('歌词')
    showToast(`已采用${parts.join('、')}，记得保存到文件`, 'success')
  } catch (e) {
    showToast(e.message || '获取封面/歌词失败', 'error')
  } finally {
    tagCheckApplying.value = false
  }
}

/**
 * 按文件名搜索（含歌手-歌名 / 歌名-歌手），与内嵌标签对比。
 */
async function inspectFileTagAccuracy(file, formSnapshot = null) {
  const parsed = parseFilename(file.fileName || '')
  if (!parsed.title && !parsed.artist) {
    return { ok: false, reason: 'parse', mismatches: {}, suggested: {}, parsed }
  }

  const res = await api.tag.match(file.fileName, fetchSource.value)
  const matches = res.data || []
  if (!matches.length) {
    return { ok: false, reason: 'no-match', mismatches: {}, suggested: {}, parsed }
  }

  const best = matches[0]
  const suggested = {
    title: String(best.name || '').trim(),
    artist: String(best.singer || '').trim(),
    album: String(best.album || best.albumName || '').trim(),
  }

  const current = formSnapshot || {
    title: file.title || '',
    artist: file.artist || '',
    album: file.album || '',
  }

  const mismatches = {
    title: !fieldLikelyMatch(current.title, suggested.title),
    artist: !fieldLikelyMatch(current.artist, suggested.artist),
    album: suggested.album ? !fieldLikelyMatch(current.album, suggested.album) : false,
  }

  // 内嵌标题与文件名两侧都不像，且搜索结果贴近文件名 → 强化标题错误
  const titleFitsFilename = fieldLikelyMatch(current.title, parsed.title)
    || (parsed.swapped && fieldLikelyMatch(current.title, parsed.swapped.title))
  const suggestFitsFilename = fieldLikelyMatch(suggested.title, parsed.title)
    || (parsed.swapped && fieldLikelyMatch(suggested.title, parsed.swapped.title))
  if (!titleFitsFilename && suggestFitsFilename && suggested.title) {
    mismatches.title = true
  }

  const hasMismatch = mismatches.title || mismatches.artist || mismatches.album
  return {
    ok: !hasMismatch,
    reason: hasMismatch ? 'mismatch' : '',
    mismatches,
    suggested,
    match: best,
    parsed,
  }
}

function applyInspectResultToFile(file, result) {
  file._checkMismatch = { ...(result.mismatches || {}) }
  file._checkSuggested = { ...(result.suggested || {}) }
  file._tagCheckResult = result
}

async function runManualTagCheck() {
  const f = editingFile.value
  if (!f || !editForm.value) {
    showToast('请先选择要检测的文件', 'info')
    return
  }
  if (tagChecking.value) {
    showToast('检测进行中', 'info')
    return
  }
  if (matching.value) {
    showToast('请先等待或停止匹配任务', 'info')
    return
  }
  tagChecking.value = true
  tagCheckPaused.value = false
  tagCheckStopRequested.value = false
  tagCheckProgress.value = { done: 0, total: 1, current: f.fileName || '' }
  try {
    const result = await inspectFileTagAccuracy(f, {
      title: editForm.value.title,
      artist: editForm.value.artist,
      album: editForm.value.album,
    })
    if (tagCheckStopRequested.value) {
      showToast('已停止检测', 'info')
      return
    }
    tagCheckResult.value = result
    applyInspectResultToFile(f, result)
    tagCheckProgress.value = { done: 1, total: 1, current: f.fileName || '' }
    if (result.reason === 'parse') showToast('无法从文件名解析歌手/歌名', 'info')
    else if (result.reason === 'no-match') showToast('按文件名未搜到结果，可换音源重试', 'info')
    else if (result.ok) showToast('检测通过：标签与搜索结果一致', 'success')
    else showToast('发现不正确标签，已标黄，可按建议修改', 'info')
  } catch (e) {
    showToast(e.message || '检测失败', 'error')
  } finally {
    tagChecking.value = false
    tagCheckPaused.value = false
    tagCheckStopRequested.value = false
    tagCheckProgress.value = { done: 0, total: 0, current: '' }
  }
}

async function runManualTagCheckSelected() {
  if (editingFile.value && editForm.value && !selectedFiles.value.length) {
    await runManualTagCheck()
    return
  }
  const targets = selectedFiles.value.length
    ? selectedFiles.value
    : (editingFile.value ? [editingFile.value] : [])
  if (!targets.length) {
    showToast('请先选择要检测的文件', 'info')
    return
  }
  if (tagChecking.value) {
    showToast('检测进行中', 'info')
    return
  }
  if (matching.value) {
    showToast('请先等待或停止匹配任务', 'info')
    return
  }
  tagChecking.value = true
  tagCheckPaused.value = false
  tagCheckStopRequested.value = false
  tagCheckProgress.value = { done: 0, total: targets.length, current: '' }
  let bad = 0
  let good = 0
  let skip = 0
  let done = 0
  try {
    for (const f of targets) {
      if (await waitManualTagCheckGate()) break
      tagCheckProgress.value = {
        done,
        total: targets.length,
        current: f.fileName || '',
      }
      const snapshot = (editingFile.value?.filePath === f.filePath && editForm.value)
        ? {
            title: editForm.value.title,
            artist: editForm.value.artist,
            album: editForm.value.album,
          }
        : null
      const result = await inspectFileTagAccuracy(f, snapshot)
      if (tagCheckStopRequested.value) break
      applyInspectResultToFile(f, result)
      if (editingFile.value?.filePath === f.filePath) tagCheckResult.value = result
      if (result.reason === 'parse' || result.reason === 'no-match') skip += 1
      else if (result.ok) good += 1
      else bad += 1
      done += 1
      tagCheckProgress.value = {
        done,
        total: targets.length,
        current: f.fileName || '',
      }
    }
    if (tagCheckStopRequested.value) {
      showToast(`已停止检测（${done}/${targets.length}）：不正确 ${bad}，通过 ${good}`, 'info')
    } else if (bad) showToast(`检测完成：${bad} 首标签可能不正确，${good} 首通过`, 'info')
    else if (good) showToast(`检测完成：${good} 首通过` + (skip ? `，${skip} 首无法判定` : ''), 'success')
    else showToast(`检测完成：${skip} 首无法判定（文件名或搜索）`, 'info')
  } catch (e) {
    showToast(e.message || '检测失败', 'error')
  } finally {
    tagChecking.value = false
    tagCheckPaused.value = false
    tagCheckStopRequested.value = false
    tagCheckProgress.value = { done: 0, total: 0, current: '' }
  }
}

function buildMetaFromForm() {
  const m = {
    title: editForm.value.title,
    artist: editForm.value.artist,
    album: editForm.value.album,
    year: editForm.value.year,
    genre: editForm.value.genre,
    comment: editForm.value.comment,
    lyric: editForm.value.lyric,
  }
  if (editForm.value.pictureBase64) m.pic = editForm.value.pictureBase64
  else if (editForm.value.picUrl) m.picUrl = editForm.value.picUrl
  return m
}

function applyMetaToFile(f, meta) {
  if (meta.title) f.title = meta.title
  if (meta.artist) f.artist = meta.artist
  if (meta.album) f.album = meta.album
  if (meta.year) f.year = meta.year
  if (meta.genre) f.genre = meta.genre
  if (meta.comment) f.comment = meta.comment
  if (meta.lyric) f.lyric = meta.lyric
  if (meta.pic) {
    f.pictureBase64 = meta.pic
  }
  if (meta.picUrl) {
    f.picUrl = meta.picUrl
  }
  f.hasPicture = Boolean(f.pictureBase64 || f.picUrl || f.hasPicture)
  f.hasLyrics = Boolean(f.lyric)
  f._modified = true
}

/** 仅把表单同步到当前正在编辑的那一首，绝不波及其他选中项 */
function syncFormToEditingFile() {
  if (!editForm.value || !editingFile.value) return
  const meta = buildMetaFromForm()
  applyMetaToFile(editingFile.value, meta)
  if (editingFile.value._coverDirty || meta.pic || meta.picUrl) {
    editingFile.value._coverDirty = true
  }
}

async function applyToFiles({ silent = false } = {}) {
  if (!editForm.value) return

  // 多选时：必须明确「应用到选中」，并二次确认，防止误把同一首歌信息刷到全部文件
  if (isBatchMode.value) {
    const n = selectedFiles.value.length
    const title = String(editForm.value.title || '').trim() || '(空标题)'
    const ok = await appConfirm({
      title: '应用到选中文件',
      message: `确定把当前编辑内容应用到选中的 ${n} 个文件？\n\n将统一写入标题「${title}」等字段。\n若这些文件不是同一首歌，请点「取消」。`,
      hint: '此步只更新列表，还需再点顶部「保存全部修改」才会写进磁盘。',
      confirmText: '应用到选中',
    })
    if (!ok) return

    const meta = buildMetaFromForm()
    const coverDirty = Boolean(editingFile.value?._coverDirty || meta.pic || meta.picUrl)
    selectedFiles.value.forEach((f) => {
      applyMetaToFile(f, meta)
      if (coverDirty) f._coverDirty = true
    })
    if (!silent) {
      showToast(`已应用到 ${n} 个文件的列表显示。请确认无误后再点「保存全部修改」写入磁盘`, 'info')
    }
    return
  }

  syncFormToEditingFile()
  if (!silent) showToast('已更新当前文件的列表显示，尚未写入磁盘', 'info')
}

async function saveCurrent() {
  // 右侧主按钮：永远只保存「当前编辑」这一首，避免全选时误伤
  if (editForm.value) syncFormToEditingFile()

  const target = editingFile.value
  if (!target?._modified) {
    showToast('当前文件没有需要保存的修改', 'info')
    return
  }

  const othersSelected = selectedFiles.value.length > 1
  if (othersSelected) {
    showToast(`仅保存当前这一首。若要统一改选中的 ${selectedFiles.value.length} 首，请先点「应用到选中」再点顶部「保存全部修改」`, 'info')
  }

  saving.value = true
  try {
    const meta = {
      title: target.title,
      artist: target.artist,
      album: target.album,
      year: target.year,
      genre: target.genre,
      comment: target.comment,
      lyric: target.lyric,
    }
    if (target._coverDirty) {
      if (target.pictureBase64) meta.pic = target.pictureBase64
      else if (target.picUrl) meta.picUrl = target.picUrl
      else meta.clearPicture = true
    }
    const res = await api.tag.writeBatch([{ filePath: target.filePath, meta }])
    const rows = res.data || []
    const row = rows[0]
    if (row?.ok) {
      target._modified = false
      target._coverDirty = false
      target._coverRev = Date.now()
      await refreshPlayerAfterSave([target])
      showToast('已保存当前文件', 'success')
    } else {
      showToast(row?.error || '保存失败', 'error')
    }
  } catch (e) {
    showToast(e.message, 'error')
  } finally {
    saving.value = false
  }
}

async function saveAll() {
  // 顶部「保存全部」：只落盘各自已标记修改的文件，不会用当前表单覆盖其它文件
  if (editForm.value) syncFormToEditingFile()
  const modified = files.value.filter(f => f._modified)
  if (!modified.length) {
    showToast('没有需要保存的文件', 'info')
    return
  }

  if (modified.length > 1) {
    const sameTitle = modified.every(f => f.title === modified[0].title && f.artist === modified[0].artist)
    if (sameTitle) {
      const ok = await appConfirm({
        title: '确认批量保存',
        message: `即将把 ${modified.length} 个文件写入磁盘，且它们的标题/歌手相同（「${modified[0].title || ''}」/「${modified[0].artist || ''}」）。\n\n若这是误操作（例如全选后误点应用），请取消并逐个恢复。`,
        hint: '确定保存到磁盘？',
        confirmText: '保存全部',
        danger: true,
      })
      if (!ok) return
    }
  }

  saving.value = true
  try {
    const payload = modified.map(f => {
      const meta = {
        title: f.title,
        artist: f.artist,
        album: f.album,
        year: f.year,
        genre: f.genre,
        comment: f.comment,
        lyric: f.lyric,
      }
      if (f._coverDirty) {
        if (f.pictureBase64) meta.pic = f.pictureBase64
        else if (f.picUrl) meta.picUrl = f.picUrl
        else meta.clearPicture = true
      }
      return { filePath: f.filePath, meta }
    })
    const res = await api.tag.writeBatch(payload)
    const rows = res.data || []
    const ok = rows.filter(r => r.ok).length
    const fail = rows.filter(r => !r.ok)
    modified.forEach(f => {
      if (rows.some(r => r.filePath === f.filePath && r.ok)) {
        f._modified = false
        f._coverDirty = false
        f._coverRev = Date.now()
      }
    })
    await refreshPlayerAfterSave(modified.filter(f => !f._modified))
    if (fail.length) {
      const tip = fail[0]?.error || '写入失败'
      showToast(`已保存 ${ok}/${modified.length}，失败 ${fail.length}：${tip}`, ok ? 'info' : 'error')
    } else {
      showToast(`已保存 ${ok}/${modified.length} 个文件`, 'success')
    }
  } catch (e) {
    showToast(e.message, 'error')
  } finally {
    saving.value = false
  }
}

async function openFetchModal(intent) {
  if (!editForm.value) return
  fetchIntent.value = intent
  showFetchModal.value = true
  fetchResults.value = []
  fetchPreview.value = null
  fetchPreviewMeta.value = null

  const f = editingFile.value
  const resolved = resolveSearchArtistTitle({
    artist: editForm.value?.artist || '',
    title: editForm.value?.title || '',
    fileName: f?.fileName || '',
    parsedArtist: f?.parsedArtist || '',
    parsedTitle: f?.parsedTitle || '',
  })
  fetchArtist.value = resolved.artist
  fetchTitle.value = resolved.title

  if (fetchArtist.value || fetchTitle.value) await doFetchSearch()
}

function swapFetchArtistTitle() {
  const a = fetchArtist.value
  fetchArtist.value = fetchTitle.value
  fetchTitle.value = a
}

function closeFetchModal() {
  showFetchModal.value = false
  fetchPreview.value = null
  fetchPreviewMeta.value = null
}

async function doFetchSearch() {
  const artist = fetchArtist.value.trim()
  const title = fetchTitle.value.trim()
  if (!artist && !title) {
    showToast('请至少填写歌手或歌名', 'info')
    return
  }
  fetchLoading.value = true
  fetchPreview.value = null
  fetchPreviewMeta.value = null
  try {
    const res = await api.tag.match({ artist, title }, fetchSource.value)
    fetchResults.value = res.data || []
    if (!fetchResults.value.length) showToast('未找到匹配结果', 'info')
    else if (fetchResults.value.length === 1) await previewFetchItem(fetchResults.value[0])
  } catch (e) {
    showToast(e.message, 'error')
  } finally {
    fetchLoading.value = false
  }
}

function fetchFieldsForIntent(intent) {
  if (intent === 'cover') return ['cover', 'title', 'artist', 'album', 'year', 'genre', 'comment']
  if (intent === 'lyric') return ['lyric', 'title', 'artist', 'album', 'year', 'genre', 'comment']
  return ['title', 'artist', 'album', 'year', 'genre', 'comment']
}

async function previewFetchItem(item) {
  fetchPreview.value = item
  fetchPreviewMeta.value = null
  try {
    const res = await api.tag.matchApply(item, fetchSource.value, fetchFieldsForIntent(fetchIntent.value))
    fetchPreviewMeta.value = res.data
  } catch (e) {
    showToast(e.message, 'error')
  }
}

function applyFetchedMetaToForm(meta) {
  if (!meta || !editForm.value) return
  if (meta.title) editForm.value.title = meta.title
  if (meta.artist) editForm.value.artist = meta.artist
  if (meta.album) editForm.value.album = meta.album
  if (meta.year) editForm.value.year = String(meta.year)
  if (meta.genre) editForm.value.genre = meta.genre
  if (meta.comment) editForm.value.comment = meta.comment
  if (fetchIntent.value === 'cover') {
    if (meta.pic) editForm.value.pictureBase64 = meta.pic
    else if (meta.picUrl) editForm.value.picUrl = meta.picUrl
    else if (fetchPreview.value?.picUrl) editForm.value.picUrl = fetchPreview.value.picUrl
    if (editingFile.value) editingFile.value._coverDirty = true
  } else if (fetchIntent.value === 'lyric' && meta.lyric) {
    editForm.value.lyric = meta.lyric
  }
}

function confirmFetchApply() {
  const meta = fetchPreviewMeta.value
  if (!meta || !editForm.value || !canConfirmFetch.value) return

  applyFetchedMetaToForm(meta)
  // 同步到当前文件行，封面变更需带上 _coverDirty
  if (editingFile.value) {
    applyMetaToFile(editingFile.value, buildMetaFromForm())
    if (fetchIntent.value === 'cover') editingFile.value._coverDirty = true
  } else {
    markModified()
  }
  closeFetchModal()
  const toastMap = {
    cover: '已应用封面与标签信息',
    lyric: '已应用歌词与标签信息',
    meta: '已应用网络标签信息',
  }
  showToast(toastMap[fetchIntent.value] || '已应用网络信息', 'success')
}

function autoMatchSelected() {
  if (!selectedFiles.value.length) return
  runTagMatch(selectedFiles.value)
}

function fileMetaForPlayerRefresh(f) {
  return {
    title: f.title,
    artist: f.artist,
    album: f.album,
    lyric: f.lyric,
    pictureBase64: f.pictureBase64,
    picUrl: f.picUrl,
    hasPicture: f.hasPicture,
    hasLyrics: f.hasLyrics,
  }
}

async function refreshPlayerAfterSave(targets) {
  updateLibraryTracksFromFiles(targets)
  for (const f of targets) {
    await refreshPlayingLocalMeta(f.filePath, fileMetaForPlayerRefresh(f))
  }
}

function listCoverSrc(f) {
  if (!f) return ''
  if (f.pictureBase64) {
    return String(f.pictureBase64).startsWith('data:')
      ? f.pictureBase64
      : `data:${f.pictureMime || 'image/jpeg'};base64,${f.pictureBase64}`
  }
  if (f.picUrl) return f.picUrl
  if (f.hasPicture && f.filePath) {
    const bust = f._coverRev || f._metaRev || ''
    const q = bust ? `&v=${encodeURIComponent(bust)}` : ''
    return withStreamAuth(`/api/tag/cover?path=${encodeURIComponent(f.filePath)}${q}`)
  }
  return ''
}

function fileToTrack(f) {
  const picFromData = f.pictureBase64
    ? (String(f.pictureBase64).startsWith('data:')
      ? f.pictureBase64
      : `data:${f.pictureMime || 'image/jpeg'};base64,${f.pictureBase64}`)
    : ''
  const pic = picFromData || (f.hasPicture && f.filePath
    ? `/api/tag/cover?path=${encodeURIComponent(f.filePath)}`
    : (f.picUrl || ''))
  const name = f.title || f.parsedTitle || f.fileName?.replace(/\.[^.]+$/, '') || '未知歌曲'
  const singer = f.artist || f.parsedArtist || '未知歌手'
  return {
    id: `local_${f.filePath}`,
    name,
    singer,
    source: 'local',
    album: f.album || '',
    picUrl: pic,
    img: pic,
    localPath: f.filePath,
    lyric: f.lyric || '',
    hasPicture: Boolean(f.hasPicture || pic),
    hasLyrics: Boolean(f.lyric),
  }
}

function fileTrackId(f) {
  return fileToTrack(f).id
}

function isPlayingFile(f) {
  return isPlayingItem(fileToTrack(f))
}

function isFileInQueue(f) {
  const track = fileToTrack(f)
  return isInQueue(track, 'local')
}

async function togglePlayFile(f) {
  if (!f?.filePath) return
  try {
    // 若正在编辑该文件且已读出封面/歌词，优先用编辑表单数据
    let track = fileToTrack(f)
    if (editingFile.value?.filePath === f.filePath && editForm.value) {
      track = {
        ...track,
        name: editForm.value.title || track.name,
        singer: editForm.value.artist || track.singer,
        album: editForm.value.album || track.album,
        picUrl: editForm.value.pictureBase64 || editForm.value.picUrl || track.picUrl,
        lyric: editForm.value.lyric || track.lyric,
      }
    }
    await playItem(track, 'local')
  } catch (e) {
    showToast(e.message || '试听失败', 'error')
  }
}

function addFileToQueue(f) {
  if (!f?.filePath) return
  const track = fileToTrack(f)
  if (isInQueue(track, 'local')) {
    showToast('已在试听列表', 'info')
    return
  }
  addToQueue(track, 'local')
  showToast(`已加入列表: ${track.name}`, 'success')
}

async function playAllVisible() {
  const list = displayedFiles.value
  if (!list.length) {
    showToast('没有可试听的文件', 'info')
    return
  }
  for (const f of list) addToQueue(fileToTrack(f), 'local')
  try {
    await playItem(fileToTrack(list[0]), 'local')
    showToast(`开始试听，共 ${list.length} 首`, 'success')
  } catch (e) {
    showToast(e.message || '试听失败', 'error')
  }
}

function onCoverUpload(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    editForm.value.pictureBase64 = reader.result
    if (editingFile.value) {
      editingFile.value.pictureBase64 = reader.result
      editingFile.value._coverDirty = true
      editingFile.value.hasPicture = true
    }
    markModified()
  }
  reader.readAsDataURL(file)
  e.target.value = ''
}

function showToast(text, type = 'info') {
  toast.value = { text, type }
  setTimeout(() => { toast.value = null }, 3000)
}
</script>

<style scoped>
.tag-page {
  width: 100%;
  max-width: none;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 16px;
  flex-shrink: 0;
}
.page-header .page-subtitle { margin-bottom: 0; }

.tag-layout {
  display: grid;
  grid-template-columns: minmax(200px, 240px) minmax(0, 1fr) minmax(300px, 380px);
  gap: 16px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.dir-panel, .edit-panel {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow: hidden;
}
.edit-panel {
  min-width: 300px;
}
.edit-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 28px 16px;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.65;
  border: 1px dashed var(--border-light);
  border-radius: var(--radius);
  background: var(--bg-elevated);
  min-height: 160px;
}
.edit-empty p {
  margin: 0;
  max-width: 220px;
}

.file-panel {
  padding: 16px;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.panel-title-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.play-inline { flex-shrink: 0; }
.edit-sheet-close {
  font-size: 22px;
  line-height: 1;
  padding: 2px 6px;
  cursor: pointer;
}
.edit-sheet-close:hover { color: var(--text); }
.edit-sheet-backdrop {
  display: none;
}
.dir-hint { font-size: 11px; color: var(--text-muted); margin-bottom: 8px; line-height: 1.4; flex-shrink: 0; }

.panel-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-pill);
  flex-shrink: 0;
}
.panel-tab {
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1;
  padding: 5px 12px;
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.panel-tab:hover { color: var(--text); }
.panel-tab.active {
  background: var(--accent);
  color: #fff;
  font-weight: 500;
}

.artist-tree {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}
.artist-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--radius);
  cursor: pointer;
  min-width: 0;
}
.artist-row:hover { background: var(--bg-hover); }
.artist-row.active {
  background: var(--accent-soft);
  color: var(--accent);
}
.artist-avatar {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-muted);
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
}
.artist-avatar :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.artist-count {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
}

.artist-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 0 4px;
  flex-shrink: 0;
}
.pager-btn {
  min-width: 26px;
  height: 26px;
  padding: 0 6px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius);
  background: var(--bg-card, var(--bg-elevated));
  color: var(--text);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}
.pager-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.pager-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.pager-info {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
}

.dir-add { display: flex; gap: 6px; }
.dir-add input { flex: 1; min-width: 0; font-size: 12px; }

.dir-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}
.dir-tree {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}
.tree-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-radius: var(--radius);
  cursor: default;
  min-width: 0;
}
.tree-row:hover { background: var(--bg-hover); }
.tree-row.active {
  background: var(--accent-soft);
  color: var(--accent);
}
.tree-row.loading { opacity: 0.85; }
.tree-toggle {
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
}
.tree-toggle.invisible { visibility: hidden; pointer-events: none; }
.tree-toggle:disabled { cursor: default; }
.tree-spin {
  width: 10px;
  height: 10px;
  border: 2px solid var(--border-light);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.tree-folder {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  cursor: pointer;
}
.tree-row.active .tree-folder {
  color: var(--accent);
}
.tree-label {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.meta-stop {
  margin-left: 6px;
  padding: 0 6px;
  font-size: 11px;
  line-height: 1.4;
}
.dir-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 10px;
  border-radius: var(--radius);
  cursor: pointer;
  background: transparent;
  font-size: 12px;
  border: 1px solid transparent;
  position: relative;
  transition: all 0.15s;
}
.dir-item:hover { background: var(--bg-hover); }
.dir-item.active {
  background: var(--accent-muted);
  border-color: transparent;
  color: var(--accent);
}
.dir-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 16px;
  background: var(--accent);
  border-radius: 0 2px 2px 0;
}
.dir-path { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dir-status { font-size: 11px; color: var(--accent); flex-shrink: 0; }
.dir-item.scanning { opacity: 0.85; }
.dir-empty { font-size: 12px; color: var(--text-muted); padding: 8px; }
.btn-icon { background: none; border: none; color: var(--text-muted); font-size: 16px; padding: 0 4px; }

.file-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
  flex-shrink: 0;
  min-width: 0;
}
.filter-input-wrap {
  flex: 0 1 160px;
  width: auto;
  min-width: 120px;
  overflow: visible;
}
.filter-input {
  width: 100%;
  min-width: 0;
  font-size: 13px;
  border-radius: var(--radius-pill);
  padding: 6px 14px;
  text-overflow: clip;
}
.file-toolbar-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.file-toolbar-meta .file-count {
  font-size: 12px;
  color: var(--text-muted);
  flex-shrink: 0;
  white-space: nowrap;
}
.file-toolbar-info {
  flex: 1 1 80px;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  overflow: hidden;
  padding-right: 4px;
}
.file-toolbar-info .meta-progress {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 auto;
  flex-wrap: wrap;
  min-width: 0;
  justify-content: flex-end;
}
.file-toolbar-actions .btn-ghost,
.file-toolbar-meta .check-all,
.file-toolbar-meta :deep(.app-select),
.file-toolbar-actions :deep(.app-select) {
  flex-shrink: 0;
  white-space: nowrap;
}
.meta-progress {
  font-size: 12px;
  color: var(--accent);
}
.match-progress {
  max-width: none;
}
.match-progress-bar {
  height: 3px;
  margin: 0 0 8px;
  background: var(--border-light);
  border-radius: 999px;
  overflow: hidden;
}
.match-progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: inherit;
  transition: width 0.2s ease;
}
.check-all {
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.table-wrap {
  overflow: auto;
  flex: 1;
  min-height: 0;
  overscroll-behavior: contain;
}

table { width: 100%; border-collapse: collapse; font-size: 13px; }
thead th {
  text-align: left;
  padding: 10px 8px;
  color: var(--text-muted);
  font-weight: 500;
  font-size: 12px;
  border-bottom: 1px solid var(--border-light);
  white-space: nowrap;
  background: var(--bg-elevated);
}
tbody td { padding: 8px 8px; border-bottom: 1px solid var(--border-light); }
tbody tr { cursor: pointer; transition: background 0.15s; }
tbody tr:hover { background: var(--bg-hover); }
tbody tr.modified { background: var(--accent-muted); }
tbody tr.active { background: var(--accent-muted); }
tbody tr.selected td:first-child { background: color-mix(in srgb, var(--accent) 8%, transparent); }

tbody tr.playing { background: var(--accent-muted); }
tbody tr.row-missing td.cell-missing,
tbody tr td.cell-missing {
  color: #f59e0b;
}

.col-check { width: 32px; }
.col-play {
  width: 72px;
  white-space: nowrap;
  text-align: right;
  position: sticky;
  right: 0;
  background: var(--bg-elevated);
  z-index: 1;
  box-shadow: -6px 0 8px -6px rgba(0, 0, 0, 0.25);
}
tbody tr .col-play {
  background: var(--bg-card, var(--bg-elevated));
}
tbody tr:hover .col-play,
tbody tr.active .col-play,
tbody tr.modified .col-play,
tbody tr.playing .col-play {
  background: var(--bg-hover);
}
tbody tr.active .col-play,
tbody tr.modified .col-play,
tbody tr.playing .col-play {
  background: var(--accent-muted);
}
.play-btn,
.queue-add-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-secondary);
  vertical-align: middle;
  margin-right: 4px;
}
.play-btn:hover,
.queue-add-btn:hover {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-muted);
}
.queue-add-btn.added {
  color: var(--success);
  border-color: var(--success);
  background: rgba(52, 199, 89, 0.1);
}
tr.playing .play-btn,
.mobile-file-row.playing .play-btn {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-muted);
}

.mobile-file-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid var(--border-light);
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--bg-card, var(--bg-elevated));
}
.mobile-file-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-light);
  cursor: pointer;
  min-width: 0;
}
.mobile-file-row:last-child { border-bottom: none; }
.mobile-file-row:hover,
.mobile-file-row.active,
.mobile-file-row.modified,
.mobile-file-row.playing {
  background: var(--bg-hover);
}
.mobile-file-row.active,
.mobile-file-row.modified,
.mobile-file-row.playing {
  background: var(--accent-muted);
}
.mobile-file-check {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}
.mobile-file-cover {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-elevated, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--border-light, rgba(255, 255, 255, 0.08));
}
.mobile-file-meta {
  flex: 1;
  min-width: 0;
}
.mobile-file-name {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mobile-file-sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mobile-file-sub span { margin: 0 4px; opacity: 0.6; }
.mobile-file-flags {
  margin-top: 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 11px;
  color: var(--text-muted);
}
.mobile-file-flags .miss { color: #f59e0b; }
.mobile-file-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
.mobile-file-actions .play-btn,
.mobile-file-actions .queue-add-btn {
  width: 34px;
  height: 34px;
  margin-right: 0;
}
.spin { animation: tag-spin 0.8s linear infinite; }
@keyframes tag-spin { to { transform: rotate(360deg); } }

.cell-file {
  max-width: 220px;
  color: var(--text-secondary);
  font-size: 12px;
}
.file-cell-inner {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.file-cover-wrap {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg-elevated, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--border-light, rgba(255, 255, 255, 0.08));
}
.file-name-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cell-text { max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.edit-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}
.edit-form label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}
.edit-form input, .edit-form textarea, .edit-form select {
  font-size: 13px;
}

.cover-box {
  width: 100px;
  height: 100px;
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--bg-input);
  margin-bottom: 4px;
}
.cover-box img { width: 100%; height: 100%; object-fit: cover; }
.cover-placeholder {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; color: var(--text-muted);
}

.field-block { gap: 6px !important; }
.field-toolbar { display: flex; align-items: center; margin-bottom: 4px; }
.meta-fetch-toolbar {
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.split-btn { display: flex; align-items: stretch; gap: 0; }
.split-btn .btn-primary { border-radius: var(--radius) 0 0 var(--radius); }
.split-btn .app-select { flex-shrink: 0; }

.tag-check-banner {
  padding: 10px 12px;
  border-radius: var(--radius);
  font-size: 12px;
  line-height: 1.5;
  margin-bottom: 4px;
}
.tag-check-banner.is-ok {
  background: rgba(52, 199, 89, 0.12);
  border: 1px solid rgba(52, 199, 89, 0.35);
  color: var(--success, #34c759);
}
.tag-check-banner.is-bad {
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.45);
  color: #f59e0b;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}
.tag-check-title { font-weight: 600; }
.tag-check-suggest {
  display: flex;
  flex-direction: column;
  gap: 2px;
  opacity: 0.95;
}
.field-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.btn-xs {
  padding: 2px 8px;
  font-size: 11px;
  line-height: 1.4;
}
.field-suspect input,
.field-suspect textarea {
  border-color: #f59e0b !important;
  background: rgba(245, 158, 11, 0.08);
  box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.2);
}
.field-suspect .suspect-tip {
  font-size: 11px;
  color: #f59e0b;
  margin-top: 2px;
}
.field-hint {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
  line-height: 1.4;
}
.cell-suspect {
  color: #f59e0b !important;
  font-weight: 600;
}
.text-suspect {
  color: #f59e0b !important;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 20px;
}
.fetch-modal {
  width: min(920px, 100%);
  max-height: 85vh;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: var(--shadow);
}
.fetch-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-elevated);
}
.fetch-header h3 { font-size: 15px; font-weight: 600; margin: 0; }
.fetch-search {
  display: flex;
  gap: 10px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-light);
  align-items: flex-end;
  flex-wrap: wrap;
  background: var(--bg-card);
}
.search-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 140px;
}
.search-field span { font-size: 12px; color: var(--text-muted); }
.fetch-swap-btn {
  flex-shrink: 0;
  padding: 8px 10px;
  white-space: nowrap;
}
.search-field :deep(input) {
  font-size: 13px;
  border-radius: var(--radius);
}
.search-btn { flex-shrink: 0; margin-bottom: 1px; border-radius: var(--radius); }
.fetch-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 360px;
  max-height: calc(85vh - 120px);
  overflow: hidden;
}
.fetch-list {
  overflow-y: auto;
  border-right: 1px solid var(--border-light);
  padding: 8px;
  background: var(--bg-card);
}
.fetch-empty {
  padding: 24px 12px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}
.fetch-item {
  display: flex;
  gap: 10px;
  padding: 8px;
  border-radius: var(--radius);
  cursor: pointer;
  margin-bottom: 4px;
}
.fetch-item:hover { background: var(--bg-hover); }
.fetch-item.active { background: var(--accent-muted); border: 1px solid var(--accent); }
.fetch-thumb {
  width: 48px;
  height: 48px;
  border-radius: var(--radius);
  object-fit: cover;
  flex-shrink: 0;
  background: var(--bg-input);
  overflow: hidden;
}
.fetch-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.fetch-thumb.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: var(--text-muted);
}
.fetch-item-info { min-width: 0; flex: 1; }
.fetch-item-name { font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fetch-item-meta { font-size: 11px; color: var(--text-muted); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fetch-item-score { font-size: 11px; color: var(--accent); margin-top: 2px; }

.fetch-preview {
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.fetch-preview.empty {
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 13px;
}
.preview-cover {
  width: 140px;
  height: 140px;
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--bg-input);
  align-self: center;
}
.preview-cover img { width: 100%; height: 100%; object-fit: cover; }
.preview-info p { font-size: 13px; margin: 4px 0; }
.preview-lyric-title { font-size: 12px; color: var(--text-muted); margin-bottom: 4px; }
.preview-cover.large {
  width: 200px;
  height: 200px;
}
.preview-lyric pre {
  font-size: 11px;
  line-height: 1.5;
  max-height: 280px;
  overflow-y: auto;
  background: var(--bg-input);
  padding: 8px;
  border-radius: var(--radius);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}
.fetch-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--border-light);
  background: var(--bg-elevated);
}

.edit-actions { display: flex; gap: 8px; margin-top: 8px; flex-shrink: 0; }

.detail-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 13px;
  padding: 24px 0;
}

.empty {
  text-align: center;
  padding: 40px 0;
  color: var(--text-muted);
  font-size: 13px;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  padding: 10px 20px;
  border-radius: var(--radius);
  font-size: 14px;
  z-index: 1000;
}
.toast.success { background: var(--success); color: #fff; }
.toast.error { background: var(--error); color: #fff; }
.toast.info { background: var(--bg-card); border: 1px solid var(--border); }

/* 中等宽度：收窄三栏，工具栏可换行，操作列粘滞可见 */
@media (max-width: 1360px) {
  .tag-layout {
    grid-template-columns: minmax(160px, 200px) minmax(0, 1fr) minmax(260px, 300px);
    gap: 12px;
  }
  .edit-panel { min-width: 0; }
  .col-album { display: none; }
  .file-toolbar-actions {
    flex: 1 1 100%;
    justify-content: flex-start;
  }
}

@media (max-width: 1100px) {
  .tag-page { height: auto; max-height: none; overflow: visible; }
  .tag-layout {
    grid-template-columns: 1fr;
    overflow: visible;
    min-height: auto;
    gap: 12px;
  }
  .dir-panel, .file-panel {
    overflow: visible;
    min-height: auto;
  }
  .dir-tree { max-height: 180px; }
  .desktop-file-table { display: none; }

  /* 窄屏：编辑区改为底部抽屉，避免滚到屏外「看不到」 */
  .edit-sheet-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 1250;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
  }
  .edit-panel {
    display: none;
    order: unset;
    min-width: 0;
    overflow: hidden;
  }
  .edit-panel.sheet-open {
    display: flex;
    position: fixed;
    left: 0;
    right: 0;
    bottom: var(--player-height, 64px);
    z-index: 1260;
    width: 100%;
    max-height: min(88dvh, calc(100dvh - var(--player-height, 64px) - 8px));
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    border-left: none;
    border-top: 1px solid var(--border-light);
    box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.35);
    padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  }
  .edit-panel.sheet-open .edit-form {
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .edit-empty { display: none; }

  .fetch-body { grid-template-columns: 1fr; }
  .fetch-list { border-right: none; border-bottom: 1px solid var(--border); max-height: 220px; }
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
  .header-actions {
    display: flex;
    width: 100%;
  }
  .header-actions .btn-primary {
    width: 100%;
  }
  .file-toolbar {
    gap: 6px;
  }
  .filter-input-wrap {
    flex: 1 1 100%;
    min-width: 0;
  }
  .file-toolbar-info {
    flex: 1 1 auto;
    justify-content: flex-start;
    order: 2;
  }
  .file-toolbar-meta {
    flex: 1 1 auto;
    order: 3;
  }
  .file-toolbar-actions {
    order: 4;
  }
  .file-toolbar-actions .btn-ghost {
    flex: 1 1 calc(50% - 6px);
    min-width: 0;
    justify-content: center;
  }
  .edit-panel.sheet-open {
    bottom: calc(var(--player-height) + var(--mobile-nav-height));
    max-height: min(85dvh, calc(100dvh - var(--player-height) - var(--mobile-nav-height) - 8px));
  }
  .edit-form {
    display: flex;
    flex-direction: column;
  }
  .edit-form label {
    flex-direction: column;
    align-items: stretch;
  }
  .edit-actions {
    flex-wrap: wrap;
  }
  .edit-actions button {
    flex: 1;
  }
  .toast {
    left: 12px;
    right: 12px;
    bottom: calc(var(--player-height) + var(--mobile-nav-height) + 16px);
  }
}
</style>
