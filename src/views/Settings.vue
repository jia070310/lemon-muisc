<template>
  <div class="settings-page">
    <aside class="settings-nav">
      <h2 class="nav-title">设置</h2>
      <p class="nav-sub">个性化您的音乐体验</p>
      <button
        v-for="tab in tabs" :key="tab.id"
        :class="['nav-tab', { active: activeTab === tab.id }]"
        @click="activeTab = tab.id"
      >{{ tab.label }}</button>
    </aside>

    <main class="settings-panel card">
      <h3 class="panel-title">{{ currentTab.label }}</h3>

      <!-- 我的账号 -->
      <div v-if="activeTab === 'account'" class="panel-body account-panel-body">
        <div class="account-layout">
          <section class="account-section card-inner">
            <div class="block-label">基本信息</div>
            <div class="account-info-row">
              <span class="account-info-key">用户名</span>
              <code class="account-info-val">{{ currentAuthUser?.username }}</code>
            </div>
            <div class="account-info-row">
              <span class="account-info-key">角色</span>
              <span class="account-info-val">{{ currentAuthUser?.role === 'admin' ? '管理员' : '普通用户' }}</span>
            </div>
            <label class="field-inline account-field">
              <span>显示名称</span>
              <input v-model="accountForm.displayName" placeholder="在界面中显示的名称" />
            </label>
            <div class="account-actions">
              <button class="btn-primary btn-sm" type="button" :disabled="accountSaving" @click="saveAccountProfile">
                {{ accountSaving ? '保存中…' : '保存名称' }}
              </button>
            </div>
          </section>

          <section class="account-section card-inner">
            <div class="block-label">邮箱</div>
            <p class="account-tip">绑定邮箱后可接收验证邮件，并使用「忘记密码」找回账号。</p>
            <div v-if="currentAuthUser?.email" class="account-email-status">
              <span>{{ currentAuthUser.email }}</span>
              <span :class="['email-badge', currentAuthUser.emailVerified ? 'verified' : 'pending']">
                {{ currentAuthUser.emailVerified ? '已验证' : '未验证' }}
              </span>
            </div>
            <label class="field-inline account-field">
              <span>{{ currentAuthUser?.email ? '更换邮箱' : '绑定邮箱' }}</span>
              <input
                v-model="accountForm.email"
                type="email"
                name="account-email"
                class="account-email-input"
                autocomplete="email"
                inputmode="email"
                autocapitalize="off"
                spellcheck="false"
                :readonly="emailInputReadonly"
                placeholder="请输入邮箱，如 name@example.com"
                @focus="onAccountEmailFocus"
              />
            </label>
            <div class="account-actions">
              <button class="btn-primary btn-sm" type="button" :disabled="emailBinding" @click="bindAccountEmail">
                {{ emailBinding ? '提交中…' : (currentAuthUser?.email ? '更新邮箱' : '绑定邮箱') }}
              </button>
              <button
                v-if="currentAuthUser?.email && !currentAuthUser?.emailVerified"
                class="btn-ghost btn-sm"
                type="button"
                :disabled="resendingVerify"
                @click="resendAccountVerification"
              >
                {{ resendingVerify ? '发送中…' : '重发验证邮件' }}
              </button>
            </div>
          </section>

          <section class="account-section card-inner">
            <div class="block-label">修改密码</div>
            <label class="field-inline account-field">
              <span>当前密码</span>
              <input v-model="accountForm.oldPassword" type="password" autocomplete="current-password" />
            </label>
            <label class="field-inline account-field">
              <span>新密码</span>
              <input v-model="accountForm.newPassword" type="password" autocomplete="new-password" placeholder="至少 6 位" />
            </label>
            <label class="field-inline account-field">
              <span>确认新密码</span>
              <input v-model="accountForm.confirmPassword" type="password" autocomplete="new-password" />
            </label>
            <div class="account-actions">
              <button class="btn-primary btn-sm" type="button" :disabled="passwordChanging" @click="changeAccountPassword">
                {{ passwordChanging ? '修改中…' : '修改密码' }}
              </button>
            </div>
          </section>
        </div>
      </div>

      <!-- 文件路径 -->
      <div v-if="activeTab === 'paths'" class="panel-body paths-panel-body">
        <div v-if="isAdminUser && needsPathSetup" class="setup-alert">
          <strong>尚未配置数据目录</strong>
          <p>请到飞牛「应用设置 → <b>访问权限</b>」用文件夹选择器添加音乐库与下载目录（会自动授权），保存后停用再启用应用。也可在「运行设置」填写绝对路径。</p>
        </div>
        <div v-else-if="isAdminUser" class="config-summary card-inner">
          <div class="block-label">已配置的数据目录</div>
          <div class="summary-row">
            <span class="summary-key">音乐库</span>
            <code class="summary-val">{{ mountInfo?.music?.host || '未设置' }}</code>
          </div>
          <div class="summary-row">
            <span class="summary-key">下载</span>
            <code class="summary-val">{{ mountInfo?.downloads?.host || '未设置' }}</code>
          </div>
          <div class="summary-row" v-if="mountProbeText">
            <span class="summary-key">探测</span>
            <span class="summary-val">{{ mountProbeText }}</span>
          </div>
          <p class="summary-tip">修改路径：飞牛应用设置 → 运行设置（或访问权限授权两个文件夹）→ 保存后停用再启用。</p>
        </div>

        <div class="paths-layout">
          <section v-if="isAdminUser" class="paths-section paths-section-block">
            <h4 class="paths-section-title">音乐库</h4>
            <div class="setting-item setting-item-flat">
              <div class="setting-item-info">
                <div class="setting-item-label">音乐库路径</div>
                <div class="setting-item-desc">
                  用于音乐库、标签编辑等扫描本地歌曲，可添加一个或多个目录。请使用 NAS 绝对路径（如 <code>/vol1/1000/Music</code>），同一物理目录只会保留一条。
                  {{ fnosAvailable ? '点击「选择文件夹」会调用系统文件管理器。' : '' }}
                </div>
              </div>
              <div class="setting-item-action">
                <button v-if="fnosAvailable" class="btn-primary btn-sm" @click="browseAddPath" :disabled="pickingFolder">
                  {{ pickingFolder ? '选择中...' : '选择文件夹' }}
                </button>
                <button v-else class="btn-primary btn-sm" @click="addPath">添加路径</button>
              </div>
            </div>

            <div v-if="musicPaths.length" class="paths-library-panel card-inner">
              <div class="setting-item setting-item-path-row">
                <div class="setting-item-info">
                  <div class="setting-item-label">音乐库扫描概况</div>
                  <p v-if="libraryStatsLoading" class="setting-item-desc">正在统计各目录下的音频文件…</p>
                  <template v-else-if="libraryStats">
                    <p class="setting-item-desc">
                      共 <strong>{{ libraryStats.musicDirs }}</strong> 个根目录，
                      合计 <strong>{{ libraryStats.totalTracks }}</strong> 首歌曲
                      <span v-if="libraryStats.musicDirs > 1">（多目录重复文件已去重）</span>。
                      可在下方目录树中勾选要扫描的文件夹（含子目录），不必扫描整个根目录。
                    </p>
                    <p v-if="downloadPath && musicPaths.includes(downloadPath)" class="library-stats-warn">
                      提示：下载目录与音乐库目录相同，每次下载的新歌也会出现在音乐库中。
                    </p>
                  </template>
                  <p v-else class="setting-item-desc">点击右侧按钮刷新各目录下的歌曲统计。</p>
                </div>
                <div class="setting-item-action">
                  <button type="button" class="btn-ghost btn-sm" :disabled="libraryStatsLoading" @click="loadLibraryStats">
                    {{ libraryStatsLoading ? '统计中…' : '刷新统计' }}
                  </button>
                </div>
              </div>

              <div class="setting-item setting-item-path-row">
                <div class="setting-item-info">
                  <div class="setting-item-label">
                    自动扫描范围
                    <span class="setting-item-label-hint">（后台扫描，关闭网页/App 不影响，歌曲热更新）</span>
                  </div>
                  <div class="setting-item-desc">
                    进入音乐库时，后台自动扫描并刷新元数据。
                    <template v-if="scanAutoMode === 'all'">当前为所有已添加目录。</template>
                    <template v-else>当前为目录列表中勾选「自动」的目录。</template>
                  </div>
                </div>
                <div class="setting-item-action">
                  <AppSelect
                    v-model="scanAutoMode"
                    :options="scanAutoModeOptions"
                    size="sm"
                    min-width="168px"
                    @change="saveScanSettings"
                  />
                </div>
              </div>

              <div class="setting-item setting-item-path-row setting-item-path-row-last">
                <div class="setting-item-info">
                  <div class="setting-item-label">手动扫描</div>
                  <div class="setting-item-desc">立即扫描目录列表中勾选「手动」的目录</div>
                </div>
                <div class="setting-item-action path-scan-toolbar">
                  <button
                    type="button"
                    class="btn-ghost btn-sm"
                    :disabled="!manualScanDirs.length || dirScanBusy"
                    @click="scanSelectedDirs"
                  >
                    {{ dirScanBusy ? '扫描中…' : `扫描选中 (${manualScanDirs.length})` }}
                  </button>
                  <button
                    type="button"
                    class="btn-ghost btn-sm"
                    :disabled="dirScanBusy"
                    @click="scanAllMusicDirs"
                  >
                    {{ dirScanBusy ? '扫描中…' : '扫描全部' }}
                  </button>
                </div>
              </div>
            </div>

            <div v-if="musicPaths.length" class="path-block scan-dir-block" :class="{ 'has-auto-col': scanAutoMode === 'selected' }">
              <div class="block-label">扫描目录</div>
              <p v-if="scanAutoMode === 'selected'" class="path-block-hint">
                展开目录树后勾选要扫描的文件夹。「手动」勾选后立即扫描；「自动」勾选后，进入音乐库时会自动刷新该文件夹。
              </p>
              <p v-else class="path-block-hint">
                展开目录树后勾选要扫描的文件夹。「手动」勾选后立即扫描；自动扫描范围为所有根目录，进入音乐库时会全部刷新。
              </p>

              <div v-if="editingPath" class="path-row path-row-edit card-inner">
                <input v-model="editPathValue" class="path-input path-edit-input" @keydown.enter="saveEditPath(editingPath)" />
                <button v-if="fnosAvailable" class="btn-sm btn-ghost" @click="browseEditPath(editingPath)" :disabled="pickingFolder">浏览</button>
                <button class="btn-sm btn-primary" @click="saveEditPath(editingPath)">保存</button>
                <button class="btn-sm btn-ghost" @click="cancelEditPath">取消</button>
              </div>

              <div class="scan-tree-head">
                <span class="path-col-check" title="勾选后用于手动扫描">手动</span>
                <span v-if="scanAutoMode === 'selected'" class="path-col-auto" title="勾选后进入音乐库时自动扫描">自动</span>
                <span class="path-col-tree">目录</span>
                <span class="path-col-actions">操作</span>
              </div>

              <div class="scan-dir-tree">
                <template v-for="row in visibleScanTreeRows" :key="row.path">
                  <div class="scan-tree-row" :class="{ loading: row.loading }" :style="{ paddingLeft: `${4 + row.depth * 14}px` }">
                    <label class="path-col-check path-check" @click.stop>
                      <input
                        type="checkbox"
                        :checked="isManualScanChecked(row.path)"
                        @change="toggleManualScanDir(row.path)"
                      />
                    </label>
                    <label v-if="scanAutoMode === 'selected'" class="path-col-auto path-auto-check" @click.stop>
                      <input
                        type="checkbox"
                        :checked="isAutoScanChecked(row.path)"
                        @change="toggleAutoScanDir(row.path)"
                      />
                    </label>
                    <button
                      type="button"
                      class="tree-toggle"
                      :class="{ invisible: row.loaded && !row.hasChildren }"
                      @click.stop="toggleScanTreeNode(row.path)"
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
                    <span class="tree-folder" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 7v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z" />
                      </svg>
                    </span>
                    <span class="scan-tree-label" :title="row.path">{{ row.depth === 0 ? row.path : row.name }}</span>
                    <div class="path-col-actions scan-tree-actions">
                      <button class="btn-sm btn-ghost" :disabled="dirScanBusy" @click="scanOneDir(row.path)">扫描</button>
                      <template v-if="row.isRoot">
                        <button v-if="fnosAvailable" class="btn-sm btn-ghost" @click="browseReplacePath(row.path)" :disabled="pickingFolder">浏览</button>
                        <button class="btn-sm btn-ghost" @click="startEditPath(row.path)">修改</button>
                        <button class="btn-sm btn-danger" @click="removePath(row.path)">移除</button>
                      </template>
                    </div>
                  </div>
                </template>
              </div>
            </div>
            <div v-else class="empty-hint">暂无音乐库目录，请添加或选择路径</div>

            <div v-if="!fnosAvailable" class="path-manual">
              <input v-model="newPath" placeholder="手动输入音乐库绝对路径，如 /vol1/1000/Music" class="path-input" @keydown.enter="addPath" />
              <button class="btn-primary btn-sm" @click="addPath">添加</button>
            </div>
          </section>

          <section class="paths-section paths-section-block">
            <h4 class="paths-section-title">下载保存</h4>
            <p class="source-tip download-path-tip">
              可使用管理员配置的共用目录，也可为当前账号设置专属目录（默认在共用目录下按用户名建子文件夹）。
            </p>

            <div class="setting-item setting-item-flat">
              <div class="setting-item-info">
                <div class="setting-item-label">下载目录模式</div>
                <div class="setting-item-desc">共用：所有用户同一目录；个人：仅当前账号，按用户名独立存储</div>
              </div>
              <div class="setting-item-action">
                <AppSelect
                  v-model="downloadPathMode"
                  :options="downloadPathModeOptions"
                  min-width="160px"
                  @change="onDownloadPathModeChange"
                />
              </div>
            </div>

            <div class="path-block">
              <div class="block-label">共用下载目录{{ isAdminUser ? '' : '（只读）' }}</div>
              <div class="path-row path-row-static path-row-download">
                <template v-if="isAdminUser && editingDownload">
                  <input v-model="editDownloadValue" class="path-input" @keydown.enter="saveDownloadPathEdit" />
                  <button class="btn-sm btn-primary" @click="saveDownloadPathEdit">保存</button>
                  <button class="btn-sm btn-ghost" @click="cancelDownloadEdit">取消</button>
                </template>
                <template v-else>
                  <span class="path-text path-col-path" :title="sharedDownloadPath">{{ sharedDownloadPath || '未设置' }}</span>
                  <div class="path-actions">
                    <button v-if="isAdminUser && !fnosAvailable" class="btn-sm btn-ghost" @click="startDownloadEdit">修改</button>
                    <button
                      v-if="isAdminUser && fnosAvailable"
                      class="btn-sm btn-primary"
                      @click="browseDownloadPath"
                      :disabled="pickingFolder"
                    >{{ pickingFolder ? '选择中...' : '选择' }}</button>
                  </div>
                </template>
              </div>
            </div>

            <div v-if="isAdminUser && !fnosAvailable" class="path-manual path-manual-download">
              <input v-model="newDownloadPath" placeholder="手动输入共用下载目录绝对路径" class="path-input" @keydown.enter="setDownloadPathManual" />
              <button class="btn-primary btn-sm" @click="setDownloadPathManual">应用共用路径</button>
            </div>

            <div v-if="downloadPathMode === 'personal'" class="path-block" style="margin-top: 12px">
              <div class="block-label">我的专属下载目录</div>
              <div class="path-row path-row-static path-row-download">
                <template v-if="editingPersonalDownload">
                  <input v-model="editPersonalDownloadValue" class="path-input" @keydown.enter="savePersonalDownloadEdit" />
                  <button class="btn-sm btn-primary" @click="savePersonalDownloadEdit">保存</button>
                  <button class="btn-sm btn-ghost" @click="cancelPersonalDownloadEdit">取消</button>
                </template>
                <template v-else>
                  <span class="path-text path-col-path" :title="personalDownloadPath">{{ personalDownloadPath || '未设置' }}</span>
                  <div class="path-actions">
                    <button v-if="!fnosAvailable" class="btn-sm btn-ghost" @click="startPersonalDownloadEdit">修改</button>
                    <button
                      v-if="fnosAvailable"
                      class="btn-sm btn-primary"
                      @click="browsePersonalDownloadPath"
                      :disabled="pickingFolder"
                    >{{ pickingFolder ? '选择中...' : '选择' }}</button>
                  </div>
                </template>
              </div>
              <div v-if="!fnosAvailable" class="path-manual path-manual-download" style="margin-top: 8px">
                <input v-model="newPersonalDownloadPath" placeholder="手动输入个人下载目录，如 /vol1/1000/Music/用户名" class="path-input" @keydown.enter="setPersonalDownloadManual" />
                <button class="btn-primary btn-sm" @click="setPersonalDownloadManual">应用个人路径</button>
              </div>
            </div>

            <div class="path-block" style="margin-top: 12px">
              <div class="block-label">当前生效目录</div>
              <div class="path-row path-row-static">
                <span class="path-text path-col-path" :title="downloadPath">{{ downloadPath || '未设置' }}</span>
              </div>
            </div>
          </section>
        </div>
      </div>

      <!-- 音源管理 -->
      <div v-if="activeTab === 'source'" class="panel-body">
        <p v-if="isAdminUser" class="source-tip">支持同时激活多个音源（落雪兼容 / 澜音原生 .js）。每个账号的激活状态相互独立；试听 / 下载时按平台匹配，同一平台有多个音源时优先使用最近激活的。</p>
        <p v-else class="source-tip">音源脚本由管理员导入。你可以自行激活或停用音源，状态仅对自己生效，不影响其他用户。</p>
        <div v-if="isAdminUser" class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">音源切换方式</div>
            <div class="setting-item-desc">当前音源无法播放或下载时的处理方式</div>
          </div>
          <div class="setting-item-action">
            <AppSelect
              v-model="settings[SOURCE_FALLBACK_MODE_KEY]"
              :options="sourceFallbackOptions"
              min-width="180px"
              @change="saveSourceFallbackMode"
            />
          </div>
        </div>
        <div class="source-list" v-if="sourceList.length">
          <div v-for="s in sourceList" :key="s.id" class="source-item" :class="{ active: isSourceActive(s.id) }">
            <div class="source-info">
              <span class="source-name">{{ s.name }}</span>
              <span class="source-meta">{{ s.author || '未知作者' }} · v{{ s.version || '?' }}{{ isSourceActive(s.id) ? ' · 已激活' : '' }}</span>
            </div>
            <div class="source-actions">
              <button v-if="!isSourceActive(s.id)" class="btn-sm btn-primary" @click="activateSource(s.id)">激活</button>
              <button v-else class="btn-sm btn-ghost" @click="deactivateSource(s.id)">停用</button>
              <button v-if="isAdminUser" class="btn-sm btn-danger" @click="removeSource(s.id)">删除</button>
            </div>
          </div>
        </div>
        <div v-else class="empty-hint">暂未导入音源</div>

        <div v-if="isAdminUser" class="import-tabs">
          <button :class="['pill-tab', { active: importMode === 'file' }]" @click="importMode = 'file'">本地导入</button>
          <button :class="['pill-tab', { active: importMode === 'url' }]" @click="importMode = 'url'">在线导入</button>
        </div>
        <div class="import-area" v-if="isAdminUser && importMode === 'file'">
          <input type="file" ref="fileInput" accept=".js" @change="importFile" style="display:none" />
          <button class="btn-primary btn-sm" @click="$refs.fileInput.click()">选择文件</button>
          <span class="hint">支持落雪兼容与澜音（CeruMusic）原生 .js 音源</span>
        </div>
        <div class="import-area" v-else-if="isAdminUser">
          <input v-model="importUrl" placeholder="输入音源脚本链接" class="url-input" />
          <button class="btn-primary btn-sm" @click="importFromUrl" :disabled="importingUrl">
            {{ importingUrl ? '导入中...' : '导入' }}
          </button>
        </div>

        <div class="playlist-sync-settings card-inner">
          <h4 class="paths-section-title playlist-sync-title">网络歌单自动更新</h4>
          <div class="setting-item setting-item-compact">
            <div class="setting-item-info">
              <div class="setting-item-label">检查间隔</div>
              <div class="setting-item-desc">打开应用时，若距上次更新已超过设定天数，将自动检查网络歌单是否有新增歌曲</div>
            </div>
            <AppSelect
              v-model="settings[PLAYLIST_REMOTE_SYNC_DAYS_KEY]"
              :options="playlistRemoteSyncOptions"
              size="sm"
              min-width="140px"
              @change="savePlaylistRemoteSyncDays"
            />
          </div>
        </div>
      </div>

      <!-- 风格样式 -->
      <div v-if="activeTab === 'appearance'" class="panel-body">
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">界面明暗</div>
            <div class="setting-item-desc">深色夜间模式或浅色日间模式</div>
          </div>
          <div class="setting-item-action">
            <AppSelect
              v-model="settings['ui.theme']"
              :options="themeOptions"
              min-width="180px"
              @change="saveTheme"
            />
          </div>
        </div>
        <div class="setting-item setting-item-stack">
          <div class="setting-item-info">
            <div class="setting-item-label">风格配色</div>
            <div class="setting-item-desc">切换按钮、标签、播放控件等强调色，深浅模式均生效</div>
          </div>
          <div class="color-scheme-grid">
            <button
              v-for="item in COLOR_SCHEME_OPTIONS"
              :key="item.id"
              type="button"
              class="color-scheme-btn"
              :class="{ active: settings[COLOR_SCHEME_KEY] === item.id }"
              @click="selectColorScheme(item.id)"
            >
              <span
                v-if="item.id !== 'custom'"
                class="color-swatch"
                :style="{ background: item.preview }"
              />
              <span
                v-else
                class="color-swatch color-swatch-custom"
                :style="{ background: customPreview }"
              />
              <span class="color-label">{{ item.label }}</span>
            </button>
          </div>
          <div v-if="settings[COLOR_SCHEME_KEY] === 'custom'" class="custom-color-panel">
            <label class="custom-color-label">
              <span>主色选择</span>
              <input
                type="color"
                class="custom-color-input"
                :value="customPreview"
                @input="onCustomColorInput"
              />
            </label>
            <input
              type="text"
              class="custom-color-hex"
              :value="customPreview"
              maxlength="7"
              spellcheck="false"
              placeholder="#f07018"
              @change="onCustomColorHex"
              @keydown.enter="onCustomColorHex"
            />
            <p class="custom-color-hint">将自动根据主色生成按钮渐变与光晕效果</p>
          </div>
        </div>
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">音乐库歌曲列数</div>
            <div class="setting-item-desc">音乐库「歌曲」页网格列数，默认两列；窄屏下会自动减少列数</div>
          </div>
          <div class="setting-item-action">
            <AppSelect
              v-model="settings[LIBRARY_SONG_COLUMNS_KEY]"
              :options="librarySongColumnsOptions"
              min-width="140px"
              @change="saveLibrarySongColumns"
            />
          </div>
        </div>
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">封面样式</div>
            <div class="setting-item-desc">播放栏封面显示方式</div>
          </div>
          <div class="setting-item-action">
            <AppSelect
              v-model="settings['player.coverStyle']"
              :options="coverStyleOptions"
              min-width="180px"
              @change="saveSetting('player.coverStyle')"
            />
          </div>
        </div>
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">音频可视化</div>
            <div class="setting-item-desc">开启后，播放栏与全屏页将显示频谱动效。频谱需通过 Web Audio 分析音频，开启后无法在后台或锁屏时继续播放；关闭本选项后将自动切换为原生播放，支持后台与锁屏续播（部分手机浏览器仍可能受系统限制）</div>
          </div>
          <label class="toggle">
            <input type="checkbox" :checked="settings['player.visualizer'] === 'true'" @change="toggleVisualizerSetting" />
            <span class="slider"></span>
          </label>
        </div>
      </div>

      <!-- 下载设置 -->
      <div v-if="activeTab === 'download'" class="panel-body">
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">保存路径</div>
            <div class="setting-item-desc">
              下载文件的默认保存目录。可在「文件路径」中单独配置，与音乐库目录无关。
            </div>
          </div>
          <div class="setting-item-action path-readonly">
            <code class="download-path-code">{{ downloadPath || '未设置' }}</code>
            <button type="button" class="btn-sm btn-ghost" @click="activeTab = 'paths'">去修改</button>
          </div>
        </div>
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">文件名格式</div>
            <div class="setting-item-desc">下载文件的命名规则</div>
          </div>
          <div class="setting-item-action">
            <AppSelect
              v-model="settings['download.fileName']"
              :options="fileNameOptions"
              min-width="200px"
              @change="saveSetting('download.fileName')"
            />
          </div>
        </div>
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">最大并发</div>
            <div class="setting-item-desc">同时下载的任务数量</div>
          </div>
          <div class="setting-item-action">
            <AppSelect
              v-model="settings['download.maxDownloadNum']"
              :options="maxDownloadOptions"
              min-width="100px"
              @change="saveSetting('download.maxDownloadNum')"
            />
          </div>
        </div>
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">同名文件处理</div>
            <div class="setting-item-desc">按文件名（忽略扩展名）检测本地已有文件；询问时会显示本地音质</div>
          </div>
          <div class="setting-item-action">
            <AppSelect
              v-model="settings['download.existFileMode']"
              :options="existFileModeOptions"
              min-width="140px"
              @change="saveExistFileMode"
            />
          </div>
        </div>
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">下载分组</div>
            <div class="setting-item-desc">在下载目录下创建子文件夹；按歌手时多位歌手取第一位；歌手/专辑为两级目录</div>
          </div>
          <div class="setting-item-action">
            <AppSelect
              v-model="settings[DOWNLOAD_GROUP_BY_KEY]"
              :options="downloadGroupOptions"
              min-width="180px"
              @change="saveDownloadGroupBy"
            />
          </div>
        </div>
      </div>

      <!-- 内嵌数据 -->
      <div v-if="activeTab === 'embed'" class="panel-body">
        <div class="setting-item" v-for="item in embedItems" :key="item.key">
          <div class="setting-item-info">
            <div class="setting-item-label">{{ item.label }}</div>
            <div class="setting-item-desc">{{ item.desc }}</div>
          </div>
          <label class="toggle"><input type="checkbox" :checked="settings[item.key] === 'true'" @change="toggleSetting(item.key)" /><span class="slider"></span></label>
        </div>
      </div>

      <!-- 歌词文件 -->
      <div v-if="activeTab === 'lrc'" class="panel-body">
        <div class="setting-item" v-for="item in lrcToggleItems" :key="item.key">
          <div class="setting-item-info">
            <div class="setting-item-label">{{ item.label }}</div>
            <div class="setting-item-desc">{{ item.desc }}</div>
          </div>
          <label class="toggle"><input type="checkbox" :checked="settings[item.key] === 'true'" @change="toggleSetting(item.key)" /><span class="slider"></span></label>
        </div>
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">歌词编码</div>
            <div class="setting-item-desc">独立歌词文件的字符编码</div>
          </div>
          <div class="setting-item-action">
            <AppSelect
              v-model="settings['download.lrcFormat']"
              :options="lrcFormatOptions"
              min-width="120px"
              @change="saveSetting('download.lrcFormat')"
            />
          </div>
        </div>
      </div>

      <!-- 用户管理 -->
      <div v-if="activeTab === 'users'" class="panel-body users-panel-body">
        <p class="source-tip">仅管理员可创建与管理账号。普通用户无法自助注册。</p>
        <form class="user-create-form" @submit.prevent="createManagedUser">
          <label class="field-inline">
            <span>用户名</span>
            <input v-model="newUser.username" required placeholder="新用户名" />
          </label>
          <label class="field-inline">
            <span>显示名称</span>
            <input v-model="newUser.displayName" placeholder="可选" />
          </label>
          <label class="field-inline">
            <span>密码</span>
            <input v-model="newUser.password" type="password" required placeholder="至少 6 位" />
          </label>
          <label class="field-inline">
            <span>邮箱</span>
            <input v-model="newUser.email" type="email" placeholder="可选，用于找回密码" />
          </label>
          <label class="field-inline">
            <span>角色</span>
            <AppSelect v-model="newUser.role" :options="userRoleOptions" min-width="120px" />
          </label>
          <button class="btn-primary btn-sm" type="submit" :disabled="creatingUser">
            {{ creatingUser ? '创建中…' : '创建用户' }}
          </button>
        </form>

        <div v-if="managedUsers.length" class="user-table">
          <div class="user-table-head">
            <span>用户</span>
            <span>邮箱</span>
            <span>角色</span>
            <span>操作</span>
          </div>
          <div v-for="u in managedUsers" :key="u.id" class="user-table-row">
            <template v-if="editingUserId === u.id">
              <div class="user-edit-fields">
                <label class="field-inline">
                  <span>显示名称</span>
                  <input v-model="editUserForm.displayName" />
                </label>
                <label class="field-inline">
                  <span>邮箱</span>
                  <input v-model="editUserForm.email" type="email" placeholder="留空表示清除" />
                </label>
                <label class="field-inline">
                  <span>角色</span>
                  <AppSelect v-model="editUserForm.role" :options="userRoleOptions" min-width="120px" />
                </label>
              </div>
              <div class="user-row-actions">
                <button class="btn-sm btn-primary" type="button" :disabled="userUpdating" @click="saveManagedUserEdit">保存</button>
                <button class="btn-sm btn-ghost" type="button" @click="cancelManagedUserEdit">取消</button>
              </div>
            </template>
            <template v-else>
              <div class="user-cell-name">
                <div class="user-row-name">{{ u.displayName || u.username }}</div>
                <div class="user-row-meta">@{{ u.username }}</div>
              </div>
              <div class="user-cell-email">
                <span v-if="u.email">{{ u.email }}</span>
                <span v-else class="text-muted">未绑定</span>
                <span v-if="u.email" :class="['email-badge', u.emailVerified ? 'verified' : 'pending']">
                  {{ u.emailVerified ? '已验证' : '未验证' }}
                </span>
              </div>
              <div class="user-cell-role">{{ u.role === 'admin' ? '管理员' : '普通用户' }}</div>
              <div class="user-row-actions">
                <button class="btn-sm btn-ghost" type="button" @click="startManagedUserEdit(u)">编辑</button>
                <button class="btn-sm btn-ghost" type="button" @click="openResetPasswordModal(u)">重置密码</button>
                <button class="btn-sm btn-danger" type="button" :disabled="u.id === currentAuthUser?.id" @click="confirmDeleteUser(u)">删除</button>
              </div>
            </template>
          </div>
        </div>
        <div v-else class="empty-hint">暂无用户</div>
      </div>

      <!-- 邮件服务 -->
      <div v-if="activeTab === 'mail'" class="panel-body">
        <p class="source-tip">配置 SMTP 后，用户可通过邮箱验证与「忘记密码」找回账号。QQ/163 邮箱需使用授权码而非登录密码。</p>
        <MailConfigGuide />
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">启用邮件</div>
          </div>
          <label class="toggle">
            <input type="checkbox" :checked="settings['mail.enabled'] === 'true'" @change="toggleMailEnabled" />
            <span class="slider"></span>
          </label>
        </div>
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">SMTP 服务器</div>
          </div>
          <input v-model="settings['mail.smtp.host']" class="path-input" placeholder="smtp.qq.com" @change="saveSetting('mail.smtp.host')" />
        </div>
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">端口</div>
          </div>
          <input v-model="settings['mail.smtp.port']" class="path-input" type="number" placeholder="465" @change="saveSetting('mail.smtp.port')" />
        </div>
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">发件人地址</div>
            <div class="setting-item-desc">需与 SMTP 账号一致或已授权</div>
          </div>
          <input v-model="settings['mail.from']" class="path-input" placeholder="柠檬音乐 &lt;music@example.com&gt;" @change="saveSetting('mail.from')" />
        </div>
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">SMTP 用户名</div>
          </div>
          <input v-model="settings['mail.smtp.user']" class="path-input" @change="saveSetting('mail.smtp.user')" />
        </div>
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">SMTP 密码 / 授权码</div>
          </div>
          <input v-model="mailPasswordInput" type="password" class="path-input" placeholder="留空则不修改" @change="saveMailPassword" />
        </div>
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">应用访问地址</div>
            <div class="setting-item-desc">邮件中重置/验证链接的前缀，如 https://nas.example.com:7983</div>
          </div>
          <input v-model="settings['mail.appUrl']" class="path-input" placeholder="留空则自动识别" @change="saveSetting('mail.appUrl')" />
        </div>
        <div class="mail-test-row">
          <input v-model="mailTestTo" class="path-input" placeholder="测试收件邮箱" />
          <button class="btn-primary btn-sm" type="button" :disabled="mailTesting" @click="sendTestMail">
            {{ mailTesting ? '发送中…' : '发送测试邮件' }}
          </button>
        </div>
      </div>
    </main>

    <div v-if="toast" class="toast" :class="toast.type">{{ toast.text }}</div>

    <!-- 重置密码弹窗 -->
    <div v-if="resetPasswordUser" class="modal-overlay" @click.self="closeResetPasswordModal">
      <div class="modal-card">
        <h4 class="modal-title">重置密码</h4>
        <p class="modal-desc">为「{{ resetPasswordUser.displayName || resetPasswordUser.username }}」设置新密码</p>
        <label class="field-inline account-field">
          <span>新密码</span>
          <input v-model="resetPasswordForm.password" type="password" placeholder="至少 6 位" @keydown.enter="submitResetPassword" />
        </label>
        <label class="field-inline account-field">
          <span>确认密码</span>
          <input v-model="resetPasswordForm.confirm" type="password" @keydown.enter="submitResetPassword" />
        </label>
        <div class="modal-actions">
          <button class="btn-ghost btn-sm" type="button" @click="closeResetPasswordModal">取消</button>
          <button class="btn-primary btn-sm" type="button" :disabled="resetPasswordSaving" @click="submitResetPassword">
            {{ resetPasswordSaving ? '保存中…' : '确认重置' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 删除用户确认 -->
    <div v-if="deleteConfirmUser" class="modal-overlay" @click.self="deleteConfirmUser = null">
      <div class="modal-card">
        <h4 class="modal-title">删除用户</h4>
        <p class="modal-desc">确定删除用户「{{ deleteConfirmUser.displayName || deleteConfirmUser.username }}」？此操作不可恢复。</p>
        <div class="modal-actions">
          <button class="btn-ghost btn-sm" type="button" @click="deleteConfirmUser = null">取消</button>
          <button class="btn-danger btn-sm" type="button" :disabled="deletingUser" @click="submitDeleteUser">
            {{ deletingUser ? '删除中…' : '确认删除' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineOptions({ name: 'Settings' })
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api.js'
import { loadCoverStyle, loadPlayerSettings } from '../stores/player.js'
import { scanLibrary, libraryScanning, PLAYLIST_REMOTE_SYNC_DAYS_KEY, setPlaylistRemoteSyncDays, getPlaylistRemoteSyncDays, LIBRARY_SONG_COLUMNS_KEY, setLibrarySongColumns, normalizeLibrarySongColumns } from '../stores/library.js'
import { reloadSearchSources } from '../stores/search.js'
import { reloadDiscoverSources } from '../stores/discover.js'
import { applySourceFallbackMode, SOURCE_FALLBACK_MODE_KEY } from '../stores/sourceFallback.js'
import { isAdmin as isAdminUser, currentUser as currentAuthUser, patchLocalUser } from '../utils/auth.js'
import { canPickFolder, pickFolder } from '../utils/fnos.js'
import { applyTheme, theme as currentTheme, THEME_KEY, COLOR_SCHEME_KEY, CUSTOM_COLOR_KEY, COLOR_SCHEME_OPTIONS, applyColorScheme, setCustomColor, normalizeHex, colorScheme as currentColorScheme, customColor as currentCustomColor } from '../utils/theme.js'
import AppSelect from '../components/AppSelect.vue'
import MailConfigGuide from '../components/MailConfigGuide.vue'
import { applyDirToggle, isDirChecked, isDirPathUnder, normalizeDirPath } from '../utils/dirTreeExpand.js'

const route = useRoute()

const themeOptions = [
  { value: 'dark', label: '深色' },
  { value: 'light', label: '浅色' },
]
const coverStyleOptions = [
  { value: 'disc', label: '圆形（播放时旋转）' },
  { value: 'card', label: '圆角方形（固定不转）' },
]
const fileNameOptions = [
  { value: '{name} - {singer}', label: '歌名 - 歌手' },
  { value: '{singer} - {name}', label: '歌手 - 歌名' },
  { value: '{name}', label: '仅歌名' },
]
const maxDownloadOptions = Array.from({ length: 6 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}))
const downloadGroupOptions = [
  { value: 'none', label: '不分组' },
  { value: 'artist', label: '按歌手' },
  { value: 'album', label: '按专辑' },
  { value: 'artist-album', label: '按歌手/专辑' },
]
const existFileModeOptions = [
  { value: 'ask', label: '询问确认' },
  { value: 'skip', label: '自动跳过' },
  { value: 'overwrite', label: '直接覆盖' },
]
const librarySongColumnsOptions = [
  { value: '2', label: '两列' },
  { value: '3', label: '三列' },
  { value: '4', label: '四列' },
]
const DOWNLOAD_GROUP_BY_KEY = 'download.savePathGroupBy'
const lrcFormatOptions = [
  { value: 'utf8', label: 'UTF-8' },
  { value: 'gbk', label: 'GBK' },
]
const sourceFallbackOptions = [
  { value: 'auto', label: '自动切换（默认）' },
  { value: 'ask', label: '切换前询问' },
]
const userRoleOptions = [
  { value: 'user', label: '普通用户' },
  { value: 'admin', label: '管理员' },
]
const managedUsers = ref([])
const creatingUser = ref(false)
const editingUserId = ref(null)
const userUpdating = ref(false)
const editUserForm = reactive({ displayName: '', email: '', role: 'user' })
const resetPasswordUser = ref(null)
const resetPasswordForm = reactive({ password: '', confirm: '' })
const resetPasswordSaving = ref(false)
const deleteConfirmUser = ref(null)
const deletingUser = ref(false)
const accountSaving = ref(false)
const emailBinding = ref(false)
const resendingVerify = ref(false)
const passwordChanging = ref(false)
const emailInputReadonly = ref(true)
const accountForm = reactive({
  displayName: '',
  email: '',
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
})
const newUser = reactive({
  username: '',
  displayName: '',
  email: '',
  password: '',
  role: 'user',
})
const mailPasswordInput = ref('')
const mailTestTo = ref('')
const mailTesting = ref(false)

const settings = reactive({})
const sourceList = ref([])
const activeSourceIds = ref([])
const fileInput = ref(null)
const toast = ref(null)
const importMode = ref('file')
const importUrl = ref('')
const importingUrl = ref(false)
const musicPaths = ref([])
const downloadPath = ref('')
const sharedDownloadPath = ref('')
const personalDownloadPath = ref('')
const downloadPathMode = ref('shared')
const newPath = ref('')
const newDownloadPath = ref('')
const newPersonalDownloadPath = ref('')
const editingPath = ref('')
const editPathValue = ref('')
const editingDownload = ref(false)
const editDownloadValue = ref('')
const editingPersonalDownload = ref(false)
const editPersonalDownloadValue = ref('')
const downloadPathModeOptions = [
  { value: 'shared', label: '共用目录' },
  { value: 'personal', label: '我的专属目录' },
]
const fnosAvailable = ref(false)
const pickingFolder = ref(false)
const editFromPicker = ref(false)
const activeTab = ref('paths')
const needsPathSetup = ref(false)
const mountInfo = ref(null)
const mountProbeText = ref('')
const libraryStats = ref(null)
const libraryStatsLoading = ref(false)
const scanAutoMode = ref('all')
const autoScanDirs = ref([])
const manualScanDirs = ref([])
const scanTreeCache = ref({})
const scanExpandedPaths = ref(new Set())
const libraryDirScanning = ref(false)
/** @type {Map<string, Promise<void>>} */
const scanTreeLoaders = new Map()

function folderDisplayName(dirPath, depth) {
  if (!dirPath) return ''
  const parts = String(dirPath).replace(/\\/g, '/').split('/').filter(Boolean)
  if (depth === 0) return parts[parts.length - 1] || dirPath
  return parts[parts.length - 1] || dirPath
}

function getScanTreeEntry(dirPath) {
  const key = normalizeDirPath(dirPath)
  return scanTreeCache.value[key] || scanTreeCache.value[dirPath] || { dirs: [], loaded: false, loading: false }
}

function getLoadedScanChildren(dirPath) {
  return getScanTreeEntry(dirPath).dirs || []
}

function isManualScanChecked(dirPath) {
  return isDirChecked(dirPath, manualScanDirs.value)
}

function isAutoScanChecked(dirPath) {
  return isDirChecked(dirPath, autoScanDirs.value)
}

const visibleScanTreeRows = computed(() => {
  const rows = []
  const visit = (dirPath, depth) => {
    const cached = getScanTreeEntry(dirPath)
    const expanded = scanExpandedPaths.value.has(normalizeDirPath(dirPath)) || scanExpandedPaths.value.has(dirPath)
    rows.push({
      path: dirPath,
      name: folderDisplayName(dirPath, depth),
      depth,
      expanded,
      loading: cached.loading,
      loaded: cached.loaded,
      hasChildren: !cached.loaded || cached.dirs.length > 0,
      isRoot: depth === 0,
    })
    if (expanded && cached.loaded) {
      for (const child of cached.dirs) visit(child.path, depth + 1)
    }
  }
  for (const root of musicPaths.value) visit(root, 0)
  return rows
})

async function ensureScanTreeChildren(dirPath) {
  const key = normalizeDirPath(dirPath)
  const cached = getScanTreeEntry(dirPath)
  if (cached.loaded) return
  const pending = scanTreeLoaders.get(key)
  if (pending) {
    await pending
    return
  }

  const promise = (async () => {
    scanTreeCache.value = {
      ...scanTreeCache.value,
      [key]: { ...cached, loading: true },
    }
    try {
      const res = await api.tag.listDir(dirPath)
      const data = res.data || {}
      scanTreeCache.value = {
        ...scanTreeCache.value,
        [key]: {
          dirs: data.dirs || [],
          loaded: true,
          loading: false,
        },
      }
    } catch (e) {
      scanTreeCache.value = {
        ...scanTreeCache.value,
        [key]: { dirs: [], loaded: true, loading: false },
      }
      showToast(e.message, 'error')
    }
  })()

  scanTreeLoaders.set(key, promise)
  try {
    await promise
  } finally {
    scanTreeLoaders.delete(key)
  }
}

function initScanTreeExpansion() {
  if (!musicPaths.value.length) {
    scanTreeCache.value = {}
    scanTreeLoaders.clear()
    scanExpandedPaths.value = new Set()
    return
  }

  const roots = musicPaths.value.map(normalizeDirPath)
  const hasCache = roots.some((root) => getScanTreeEntry(root).loaded || getScanTreeEntry(root).loading)
  if (hasCache && scanExpandedPaths.value.size) return

  scanTreeCache.value = {}
  scanTreeLoaders.clear()
  scanExpandedPaths.value = new Set(roots)
  void (async () => {
    for (const root of musicPaths.value) {
      await ensureScanTreeChildren(root)
      const children = getLoadedScanChildren(root)
      const next = new Set([...scanExpandedPaths.value].map(normalizeDirPath))
      for (const child of children) next.add(normalizeDirPath(child.path))
      scanExpandedPaths.value = next
      for (const child of children) ensureScanTreeChildren(child.path)
    }
  })()
}

async function toggleScanTreeNode(dirPath) {
  const key = normalizeDirPath(dirPath)
  const next = new Set([...scanExpandedPaths.value].map(normalizeDirPath))
  if (next.has(key)) {
    next.delete(key)
    scanExpandedPaths.value = next
    return
  }
  next.add(key)
  scanExpandedPaths.value = next
  await ensureScanTreeChildren(dirPath)
}

function pruneScanDirSelections() {
  const keep = (dirPath) => {
    const norm = normalizeDirPath(dirPath)
    return musicPaths.value.some((root) => {
      const r = normalizeDirPath(root)
      return norm === r || isDirPathUnder(norm, r)
    })
  }
  const nextManual = manualScanDirs.value.filter(keep)
  if (nextManual.length !== manualScanDirs.value.length) manualScanDirs.value = nextManual
  const nextAuto = autoScanDirs.value.filter(keep)
  if (nextAuto.length !== autoScanDirs.value.length) {
    autoScanDirs.value = nextAuto
    saveScanSettings()
  }
}

function expandScanTreeNode(dirPath) {
  const key = normalizeDirPath(dirPath)
  const next = new Set([...scanExpandedPaths.value].map(normalizeDirPath))
  next.add(key)
  scanExpandedPaths.value = next
  ensureScanTreeChildren(dirPath)
}

function toggleManualScanDir(dirPath) {
  const checking = !isDirChecked(dirPath, manualScanDirs.value)
  manualScanDirs.value = applyDirToggle(manualScanDirs.value, dirPath, getLoadedScanChildren)
  if (checking) expandScanTreeNode(dirPath)
}

function toggleAutoScanDir(dirPath) {
  const checking = !isDirChecked(dirPath, autoScanDirs.value)
  autoScanDirs.value = applyDirToggle(autoScanDirs.value, dirPath, getLoadedScanChildren)
  if (checking) expandScanTreeNode(dirPath)
  saveScanSettings()
}

const dirScanBusy = computed(() => libraryDirScanning.value || libraryScanning.value)
const scanAutoModeOptions = [
  { value: 'all', label: '所有目录' },
  { value: 'selected', label: '勾选的自动目录' },
]
const playlistRemoteSyncOptions = [
  { value: '0', label: '关闭' },
  { value: '1', label: '每 1 天' },
  { value: '3', label: '每 3 天' },
  { value: '7', label: '每 7 天' },
]
let customColorSaveTimer = 0

function parseActiveIds(raw) {
  if (Array.isArray(raw)) return raw.filter(Boolean)
  if (raw == null || raw === '') return []
  const s = String(raw).trim()
  if (!s) return []
  try {
    const parsed = JSON.parse(s)
    if (Array.isArray(parsed)) return parsed.filter(Boolean)
  } catch {}
  return [s]
}

function isSourceActive(id) {
  return activeSourceIds.value.includes(id)
}

const tabs = computed(() => {
  const all = [
    { id: 'account', label: '我的账号' },
    { id: 'paths', label: '文件路径' },
    { id: 'source', label: '音源管理' },
    { id: 'appearance', label: '风格样式' },
    { id: 'download', label: '下载设置' },
    { id: 'embed', label: '内嵌数据' },
    { id: 'lrc', label: '歌词文件' },
    { id: 'users', label: '用户管理' },
    { id: 'mail', label: '邮件服务' },
  ]
  if (isAdminUser.value) return all
  return all.filter(t => ['account', 'paths', 'source', 'appearance'].includes(t.id))
})

const embedItems = [
  { key: 'download.isEmbedPic', label: '内嵌封面', desc: '将封面写入音频文件' },
  { key: 'download.isEmbedLyric', label: '内嵌歌词', desc: '将歌词写入音频文件' },
  { key: 'download.isEmbedLyricT', label: '内嵌翻译歌词', desc: '写入翻译版歌词' },
  { key: 'download.isEmbedLyricR', label: '内嵌罗马音歌词', desc: '写入罗马音歌词' },
]

const lrcToggleItems = [
  { key: 'download.isDownloadLrc', label: '下载歌词文件', desc: '在下载目录保存同名 .lrc 文件' },
  { key: 'download.isDownloadTLrc', label: '下载翻译歌词', desc: '写入 .lrc 时附带翻译' },
  { key: 'download.isDownloadRLrc', label: '下载罗马音歌词', desc: '写入 .lrc 时附带罗马音' },
]

const currentTab = computed(() => tabs.value.find(t => t.id === activeTab.value) || tabs.value[0])
const customPreview = computed(() => normalizeHex(settings[CUSTOM_COLOR_KEY] || currentCustomColor.value))

watch(currentTheme, (v) => {
  settings[THEME_KEY] = v
})

watch(currentColorScheme, (v) => {
  settings[COLOR_SCHEME_KEY] = v
})

watch(tabs, (list) => {
  if (!list.some(t => t.id === activeTab.value)) {
    activeTab.value = list[0]?.id || 'account'
  }
}, { immediate: true })

watch(activeTab, async (tab) => {
  if (tab === 'paths' && musicPaths.value.length) {
    loadLibraryStats()
    await loadScanSettings()
    initScanTreeExpansion()
  }
  if (tab === 'users') loadManagedUsers()
  if (tab === 'account') loadAccountInfo()
})

watch(musicPaths, () => {
  pruneScanDirSelections()
  if (activeTab.value === 'paths') {
    scanTreeCache.value = {}
    scanTreeLoaders.clear()
    initScanTreeExpansion()
  }
}, { deep: true })

function syncAccountFormFromUser() {
  accountForm.displayName = currentAuthUser.value?.displayName || currentAuthUser.value?.username || ''
  accountForm.email = ''
  accountForm.oldPassword = ''
  accountForm.newPassword = ''
  accountForm.confirmPassword = ''
}

function onAccountEmailFocus() {
  emailInputReadonly.value = false
  if (currentAuthUser.value?.email) return
  const username = String(currentAuthUser.value?.username || '').trim()
  if (username && accountForm.email.trim() === username) {
    accountForm.email = ''
  }
}

async function loadAccountInfo() {
  emailInputReadonly.value = true
  syncAccountFormFromUser()
  try {
    const res = await api.auth.me()
    if (res.user) patchLocalUser(res.user)
    syncAccountFormFromUser()
  } catch {}
}

async function saveAccountProfile() {
  const name = accountForm.displayName.trim()
  if (!name) {
    showToast('显示名称不能为空', 'error')
    return
  }
  accountSaving.value = true
  try {
    const res = await api.auth.updateProfile(name)
    if (res.user) patchLocalUser(res.user)
    showToast('已保存', 'success')
  } catch (e) {
    showToast(e.message || '保存失败', 'error')
  } finally {
    accountSaving.value = false
  }
}

async function bindAccountEmail() {
  const email = accountForm.email.trim()
  if (!email) {
    showToast('请输入邮箱地址', 'error')
    return
  }
  emailBinding.value = true
  try {
    const res = await api.auth.bindEmail(email)
    if (res.user) patchLocalUser(res.user)
    accountForm.email = ''
    showToast(res.verificationSent ? '验证邮件已发送，请查收' : '邮箱已绑定', 'success')
  } catch (e) {
    showToast(e.message || '绑定失败', 'error')
  } finally {
    emailBinding.value = false
  }
}

async function resendAccountVerification() {
  resendingVerify.value = true
  try {
    await api.auth.resendVerification()
    showToast('验证邮件已发送', 'success')
  } catch (e) {
    showToast(e.message || '发送失败', 'error')
  } finally {
    resendingVerify.value = false
  }
}

async function changeAccountPassword() {
  if (!accountForm.oldPassword || !accountForm.newPassword) {
    showToast('请填写当前密码和新密码', 'error')
    return
  }
  if (accountForm.newPassword.length < 6) {
    showToast('新密码至少 6 位', 'error')
    return
  }
  if (accountForm.newPassword !== accountForm.confirmPassword) {
    showToast('两次输入的新密码不一致', 'error')
    return
  }
  passwordChanging.value = true
  try {
    await api.auth.changePassword(accountForm.oldPassword, accountForm.newPassword)
    accountForm.oldPassword = ''
    accountForm.newPassword = ''
    accountForm.confirmPassword = ''
    showToast('密码已修改', 'success')
  } catch (e) {
    showToast(e.message || '修改失败', 'error')
  } finally {
    passwordChanging.value = false
  }
}

async function loadManagedUsers() {
  if (!isAdminUser.value) return
  try {
    const res = await api.auth.listUsers()
    managedUsers.value = res.users || []
  } catch {
    managedUsers.value = []
  }
}

async function createManagedUser() {
  creatingUser.value = true
  try {
    await api.auth.createUser({
      username: newUser.username,
      password: newUser.password,
      displayName: newUser.displayName || newUser.username,
      email: newUser.email,
      role: newUser.role,
    })
    newUser.username = ''
    newUser.displayName = ''
    newUser.email = ''
    newUser.password = ''
    newUser.role = 'user'
    await loadManagedUsers()
    showToast('用户已创建', 'success')
  } catch (e) {
    showToast(e.message || '创建失败', 'error')
  } finally {
    creatingUser.value = false
  }
}

async function resetManagedUserPassword(user) {
  openResetPasswordModal(user)
}

function openResetPasswordModal(user) {
  resetPasswordUser.value = user
  resetPasswordForm.password = ''
  resetPasswordForm.confirm = ''
}

function closeResetPasswordModal() {
  resetPasswordUser.value = null
}

async function submitResetPassword() {
  if (!resetPasswordUser.value) return
  if (!resetPasswordForm.password || resetPasswordForm.password.length < 6) {
    showToast('密码至少 6 位', 'error')
    return
  }
  if (resetPasswordForm.password !== resetPasswordForm.confirm) {
    showToast('两次输入的密码不一致', 'error')
    return
  }
  resetPasswordSaving.value = true
  try {
    await api.auth.resetUserPassword(resetPasswordUser.value.id, resetPasswordForm.password)
    closeResetPasswordModal()
    showToast('密码已重置', 'success')
  } catch (e) {
    showToast(e.message || '重置失败', 'error')
  } finally {
    resetPasswordSaving.value = false
  }
}

function startManagedUserEdit(user) {
  editingUserId.value = user.id
  editUserForm.displayName = user.displayName || user.username
  editUserForm.email = user.email || ''
  editUserForm.role = user.role || 'user'
}

function cancelManagedUserEdit() {
  editingUserId.value = null
}

async function saveManagedUserEdit() {
  if (!editingUserId.value) return
  userUpdating.value = true
  try {
    const res = await api.auth.updateUser(editingUserId.value, {
      displayName: editUserForm.displayName.trim(),
      email: editUserForm.email.trim(),
      role: editUserForm.role,
    })
    const idx = managedUsers.value.findIndex(u => u.id === editingUserId.value)
    if (idx >= 0 && res.user) managedUsers.value[idx] = res.user
    if (editingUserId.value === currentAuthUser.value?.id && res.user) {
      patchLocalUser(res.user)
    }
    editingUserId.value = null
    showToast('已保存', 'success')
  } catch (e) {
    showToast(e.message || '保存失败', 'error')
  } finally {
    userUpdating.value = false
  }
}

function confirmDeleteUser(user) {
  deleteConfirmUser.value = user
}

async function submitDeleteUser() {
  if (!deleteConfirmUser.value) return
  deletingUser.value = true
  try {
    await api.auth.deleteUser(deleteConfirmUser.value.id)
    deleteConfirmUser.value = null
    await loadManagedUsers()
    showToast('用户已删除', 'success')
  } catch (e) {
    showToast(e.message || '删除失败', 'error')
  } finally {
    deletingUser.value = false
  }
}

async function deleteManagedUser(user) {
  confirmDeleteUser(user)
}

async function loadScanSettings() {
  try {
    const res = await api.library.scanSettings.get()
    scanAutoMode.value = res.data?.autoMode || 'all'
    autoScanDirs.value = res.data?.autoDirs || []
  } catch {}
}

async function saveScanSettings() {
  try {
    const res = await api.library.scanSettings.save({
      autoMode: scanAutoMode.value,
      autoDirs: autoScanDirs.value,
    })
    autoScanDirs.value = res.data?.autoDirs || []
    showToast('扫描设置已保存', 'success')
  } catch (e) {
    showToast(e.message || '保存失败', 'error')
  }
}


async function runDirScan(dirs, { scanAll = false } = {}) {
  if (libraryDirScanning.value) return
  libraryDirScanning.value = true
  try {
    await scanLibrary(api, {
      force: true,
      dirs: scanAll ? null : dirs,
      scanAll,
      onError: (msg) => showToast(msg, 'error'),
      onComplete: () => loadLibraryStats(),
    })
    const label = scanAll
      ? '已开始手动扫描全部目录'
      : `已开始手动扫描 ${dirs.length} 个目录`
    showToast(label, 'success')
  } catch (e) {
    showToast(e.message || '扫描失败', 'error')
  } finally {
    libraryDirScanning.value = false
  }
}

function scanOneDir(dirPath) {
  runDirScan([dirPath])
}

function scanSelectedDirs() {
  if (!manualScanDirs.value.length) return
  runDirScan([...manualScanDirs.value])
}

function scanAllMusicDirs() {
  runDirScan(null, { scanAll: true })
}

async function loadLibraryStats() {
  if (!musicPaths.value.length) {
    libraryStats.value = null
    return
  }
  libraryStatsLoading.value = true
  try {
    const res = await api.paths.stats()
    libraryStats.value = res.data || null
  } catch {
    libraryStats.value = null
  } finally {
    libraryStatsLoading.value = false
  }
}

watch(() => route.query.tab, (tab) => {
  const id = String(tab || '').trim()
  if (id && tabs.value.some(t => t.id === id)) activeTab.value = id
})

onMounted(async () => {
  const tabFromQuery = String(route.query.tab || '').trim()
  if (tabFromQuery && tabs.value.some(t => t.id === tabFromQuery)) {
    activeTab.value = tabFromQuery
  }
  try {
    fnosAvailable.value = await canPickFolder()
  } catch {}
  try {
    const s = await api.settings.get()
    Object.assign(settings, s)
    activeSourceIds.value = parseActiveIds(settings['source.active'])
    if (!settings['player.coverStyle']) settings['player.coverStyle'] = 'disc'
    if (settings['player.visualizer'] == null) settings['player.visualizer'] = 'true'
    if (!settings[THEME_KEY]) settings[THEME_KEY] = currentTheme.value
    if (!settings[COLOR_SCHEME_KEY]) settings[COLOR_SCHEME_KEY] = currentColorScheme.value
    if (!settings[CUSTOM_COLOR_KEY]) settings[CUSTOM_COLOR_KEY] = currentCustomColor.value
    if (!settings[SOURCE_FALLBACK_MODE_KEY]) settings[SOURCE_FALLBACK_MODE_KEY] = 'auto'
    applySourceFallbackMode(settings[SOURCE_FALLBACK_MODE_KEY])
    if (!settings[DOWNLOAD_GROUP_BY_KEY]) {
      settings[DOWNLOAD_GROUP_BY_KEY] = settings['download.isSavePathGroupByListName'] === 'true' ? 'album' : 'none'
    }
    if (!['ask', 'skip', 'overwrite'].includes(settings['download.existFileMode'])) {
      settings['download.existFileMode'] = settings['download.skipExistFile'] === 'false' ? 'overwrite' : 'ask'
    }
    settings[LIBRARY_SONG_COLUMNS_KEY] = String(normalizeLibrarySongColumns(settings[LIBRARY_SONG_COLUMNS_KEY]))
    setLibrarySongColumns(settings[LIBRARY_SONG_COLUMNS_KEY])
    if (settings[PLAYLIST_REMOTE_SYNC_DAYS_KEY] == null) {
      settings[PLAYLIST_REMOTE_SYNC_DAYS_KEY] = String(getPlaylistRemoteSyncDays())
    } else {
      setPlaylistRemoteSyncDays(settings[PLAYLIST_REMOTE_SYNC_DAYS_KEY])
    }
    applyTheme(settings[THEME_KEY], {
      color: settings[COLOR_SCHEME_KEY],
      customHex: settings[CUSTOM_COLOR_KEY],
    })
  } catch {}
  try {
    sourceList.value = await api.source.list()
    const fromList = sourceList.value.filter(s => s.active).map(s => s.id)
    if (fromList.length) activeSourceIds.value = fromList
  } catch {}
  await loadPaths()
})

async function loadPaths() {
  try {
    const res = await api.paths.list()
    musicPaths.value = res.musicPaths || res.data || []
    applyDownloadPathInfo(res)
    needsPathSetup.value = Boolean(res.setup?.needsPathConfig)
    mountInfo.value = res.setup?.mountInfo || null
    const mp = res.setup?.musicProbe
    const musicLabel = '音乐库'
    if (res.setup?.mountLooksEmpty) {
      mountProbeText.value = '警告：音乐库目录是空的。请到「运行设置」确认路径并停用后重新启用。'
    } else if (mp?.readable) {
      mountProbeText.value = `探测 ${musicLabel}：共 ${mp.entryCount} 项，音频 ${mp.audioCount} 个`
    } else if (mp?.error) {
      mountProbeText.value = `探测 ${musicLabel} 失败：${mp.error}`
    } else {
      mountProbeText.value = ''
    }
    await loadLibraryStats()
    await loadScanSettings()
    initScanTreeExpansion()
  } catch {}
}

async function addPath(fromPicker = false) {
  const val = newPath.value.trim()
  if (!val) return
  try {
    const res = await api.paths.add(val, fromPicker)
    musicPaths.value = res.musicPaths || res.data || []
    applyDownloadPathInfo(res)
    newPath.value = ''
    showToast(fromPicker ? '音乐库路径已添加' : '音乐库路径已添加', 'success')
    await loadLibraryStats()
  } catch (e) {
    showToast(e.message, 'error')
  }
}

async function browseAddPath() {
  pickingFolder.value = true
  try {
    const path = await pickFolder({ title: '选择音乐文件夹' })
    if (!path) return
    newPath.value = path
    await addPath(true)
  } catch (e) {
    if (e.message && !e.message.includes('未选择')) showToast(e.message, 'error')
  } finally {
    pickingFolder.value = false
  }
}

async function browseReplacePath(oldPath) {
  pickingFolder.value = true
  try {
    const path = await pickFolder({ title: '选择新文件夹' })
    if (!path) return
    const res = await api.paths.update(oldPath, path, true)
    musicPaths.value = res.musicPaths || res.data || []
    applyDownloadPathInfo(res)
    showToast('路径已更新', 'success')
    await loadLibraryStats()
  } catch (e) {
    if (e.message && !e.message.includes('未选择')) showToast(e.message, 'error')
  } finally {
    pickingFolder.value = false
  }
}

async function browseEditPath(oldPath) {
  pickingFolder.value = true
  try {
    const path = await pickFolder({ title: '选择新文件夹' })
    if (!path) return
    editPathValue.value = path
    editFromPicker.value = true
  } catch (e) {
    if (e.message && !e.message.includes('未选择')) showToast(e.message, 'error')
  } finally {
    pickingFolder.value = false
  }
}

function startEditPath(p) {
  editingPath.value = p
  editPathValue.value = p
  editFromPicker.value = false
}

function cancelEditPath() {
  editingPath.value = ''
  editPathValue.value = ''
  editFromPicker.value = false
}

async function saveEditPath(oldPath) {
  const val = editPathValue.value.trim()
  if (!val || val === oldPath) {
    cancelEditPath()
    return
  }
  try {
    const res = await api.paths.update(oldPath, val, editFromPicker.value)
    musicPaths.value = res.musicPaths || res.data || []
    applyDownloadPathInfo(res)
    cancelEditPath()
    showToast('路径已更新', 'success')
    await loadLibraryStats()
  } catch (e) {
    showToast(e.message, 'error')
  }
}

async function removePath(dirPath) {
  try {
    const res = await api.paths.remove(dirPath)
    musicPaths.value = res.musicPaths || res.data || []
    applyDownloadPathInfo(res)
    showToast('音乐库路径已删除', 'success')
    await loadLibraryStats()
  } catch (e) {
    showToast(e.message, 'error')
  }
}

function startDownloadEdit() {
  editingDownload.value = true
  editDownloadValue.value = sharedDownloadPath.value || downloadPath.value
}

function cancelDownloadEdit() {
  editingDownload.value = false
  editDownloadValue.value = ''
}

function applyDownloadPathInfo(res = {}) {
  downloadPath.value = res.downloadPath || ''
  sharedDownloadPath.value = res.sharedDownloadPath || res.downloadPath || ''
  personalDownloadPath.value = res.personalDownloadPath || ''
  downloadPathMode.value = res.downloadPathMode === 'personal' ? 'personal' : 'shared'
}

async function onDownloadPathModeChange() {
  try {
    const res = await api.paths.setDownloadMode(downloadPathMode.value)
    applyDownloadPathInfo(res)
    showToast(downloadPathMode.value === 'personal' ? '已切换为专属下载目录' : '已切换为共用下载目录', 'success')
  } catch (e) {
    showToast(e.message || '切换失败', 'error')
    await loadPaths()
  }
}

function startPersonalDownloadEdit() {
  editingPersonalDownload.value = true
  editPersonalDownloadValue.value = personalDownloadPath.value
}

function cancelPersonalDownloadEdit() {
  editingPersonalDownload.value = false
  editPersonalDownloadValue.value = ''
}

async function savePersonalDownloadEdit() {
  const val = editPersonalDownloadValue.value.trim()
  if (!val) return
  try {
    const res = await api.paths.setPersonalDownload(val, false, true)
    applyDownloadPathInfo(res)
    cancelPersonalDownloadEdit()
    showToast('个人下载路径已更新', 'success')
  } catch (e) {
    showToast(e.message, 'error')
  }
}

async function setPersonalDownloadManual() {
  const val = newPersonalDownloadPath.value.trim()
  if (!val) return
  try {
    const res = await api.paths.setPersonalDownload(val, false, true)
    applyDownloadPathInfo(res)
    newPersonalDownloadPath.value = ''
    showToast('个人下载路径已更新', 'success')
  } catch (e) {
    showToast(e.message, 'error')
  }
}

async function browsePersonalDownloadPath() {
  pickingFolder.value = true
  try {
    const path = await pickFolder({ title: '选择我的专属下载目录' })
    if (!path) return
    const res = await api.paths.setPersonalDownload(path, true, true)
    applyDownloadPathInfo(res)
    showToast('个人下载路径已更新', 'success')
  } catch (e) {
    if (e.message && !e.message.includes('未选择')) showToast(e.message, 'error')
  } finally {
    pickingFolder.value = false
  }
}

async function saveDownloadPathEdit() {
  const val = editDownloadValue.value.trim()
  if (!val) return
  try {
    const res = await api.paths.setDownload(val, false)
    applyDownloadPathInfo(res)
    cancelDownloadEdit()
    showToast('共用下载路径已更新', 'success')
  } catch (e) {
    showToast(e.message, 'error')
  }
}

async function setDownloadPathManual() {
  const val = newDownloadPath.value.trim()
  if (!val) return
  try {
    const res = await api.paths.setDownload(val, false)
    applyDownloadPathInfo(res)
    newDownloadPath.value = ''
    showToast('共用下载路径已更新', 'success')
  } catch (e) {
    showToast(e.message, 'error')
  }
}

async function browseDownloadPath() {
  pickingFolder.value = true
  try {
    const path = await pickFolder({ title: '选择共用下载保存目录' })
    if (!path) return
    const res = await api.paths.setDownload(path, true)
    applyDownloadPathInfo(res)
    showToast('共用下载路径已更新', 'success')
  } catch (e) {
    if (e.message && !e.message.includes('未选择')) showToast(e.message, 'error')
  } finally {
    pickingFolder.value = false
  }
}

async function saveSourceFallbackMode() {
  if (!settings[SOURCE_FALLBACK_MODE_KEY]) settings[SOURCE_FALLBACK_MODE_KEY] = 'auto'
  applySourceFallbackMode(settings[SOURCE_FALLBACK_MODE_KEY])
  await saveSetting(SOURCE_FALLBACK_MODE_KEY)
}

async function saveDownloadGroupBy() {
  const mode = settings[DOWNLOAD_GROUP_BY_KEY] || 'none'
  settings['download.isSavePathGroupByListName'] = mode === 'album' ? 'true' : 'false'
  try {
    await api.settings.update({
      [DOWNLOAD_GROUP_BY_KEY]: mode,
      'download.isSavePathGroupByListName': settings['download.isSavePathGroupByListName'],
    })
  } catch (e) {
    showToast(e.message, 'error')
  }
}

async function saveExistFileMode() {
  const mode = ['ask', 'skip', 'overwrite'].includes(settings['download.existFileMode'])
    ? settings['download.existFileMode']
    : 'ask'
  settings['download.existFileMode'] = mode
  // 同步旧开关，兼容尚未升级的逻辑
  settings['download.skipExistFile'] = mode === 'overwrite' ? 'false' : 'true'
  try {
    await api.settings.update({
      'download.existFileMode': mode,
      'download.skipExistFile': settings['download.skipExistFile'],
    })
  } catch (e) {
    showToast(e.message, 'error')
  }
}

async function saveLibrarySongColumns() {
  const cols = String(normalizeLibrarySongColumns(settings[LIBRARY_SONG_COLUMNS_KEY]))
  settings[LIBRARY_SONG_COLUMNS_KEY] = cols
  setLibrarySongColumns(cols)
  try {
    await api.settings.update({ [LIBRARY_SONG_COLUMNS_KEY]: cols })
  } catch (e) {
    showToast(e.message, 'error')
  }
}

async function savePlaylistRemoteSyncDays() {
  const days = setPlaylistRemoteSyncDays(settings[PLAYLIST_REMOTE_SYNC_DAYS_KEY])
  settings[PLAYLIST_REMOTE_SYNC_DAYS_KEY] = String(days)
  try {
    await api.settings.update({ [PLAYLIST_REMOTE_SYNC_DAYS_KEY]: String(days) })
    showToast('已保存', 'success')
  } catch (e) {
    showToast(e.message || '保存失败', 'error')
  }
}

async function saveSetting(key) {
  try {
    await api.settings.update({ [key]: settings[key] })
    if (key === 'player.coverStyle') loadCoverStyle()
    if (key === 'player.visualizer') loadPlayerSettings()
    if (key === THEME_KEY) {
      applyTheme(settings[key], {
        color: settings[COLOR_SCHEME_KEY],
        customHex: settings[CUSTOM_COLOR_KEY],
      })
    }
    if (key === COLOR_SCHEME_KEY) {
      applyColorScheme(settings[key], settings[THEME_KEY], { customHex: settings[CUSTOM_COLOR_KEY] })
    }
  } catch (e) { showToast(e.message, 'error') }
}

async function toggleMailEnabled(e) {
  settings['mail.enabled'] = e.target.checked ? 'true' : 'false'
  await saveSetting('mail.enabled')
}

async function saveMailPassword() {
  if (!mailPasswordInput.value) return
  try {
    await api.settings.update({ 'mail.smtp.pass': mailPasswordInput.value })
    mailPasswordInput.value = ''
    showToast('SMTP 密码已保存', 'success')
  } catch (e) {
    showToast(e.message, 'error')
  }
}

async function sendTestMail() {
  if (!mailTestTo.value) {
    showToast('请填写测试收件邮箱', 'error')
    return
  }
  mailTesting.value = true
  try {
    await api.settings.update({
      'mail.enabled': settings['mail.enabled'],
      'mail.smtp.host': settings['mail.smtp.host'],
      'mail.smtp.port': settings['mail.smtp.port'],
      'mail.smtp.user': settings['mail.smtp.user'],
      'mail.from': settings['mail.from'],
      'mail.appUrl': settings['mail.appUrl'],
      ...(mailPasswordInput.value ? { 'mail.smtp.pass': mailPasswordInput.value } : {}),
    })
    const res = await api.auth.testMail(mailTestTo.value)
    showToast(res.message || '测试邮件已发送', 'success')
  } catch (e) {
    showToast(e.message, 'error')
  } finally {
    mailTesting.value = false
  }
}

async function saveTheme() {
  applyTheme(settings[THEME_KEY], {
    color: settings[COLOR_SCHEME_KEY],
    customHex: settings[CUSTOM_COLOR_KEY],
  })
  await saveSetting(THEME_KEY)
}

async function selectColorScheme(id) {
  if (settings[COLOR_SCHEME_KEY] === id && id !== 'custom') return
  settings[COLOR_SCHEME_KEY] = id
  const payload = { [COLOR_SCHEME_KEY]: id }
  if (id === 'custom') {
    const hex = normalizeHex(settings[CUSTOM_COLOR_KEY] || currentCustomColor.value)
    settings[CUSTOM_COLOR_KEY] = hex
    applyColorScheme('custom', settings[THEME_KEY], { customHex: hex })
    payload[CUSTOM_COLOR_KEY] = hex
  } else {
    applyColorScheme(id, settings[THEME_KEY])
  }
  try {
    await api.settings.update(payload)
  } catch (e) {
    showToast(e.message, 'error')
  }
}

async function updateCustomColor(hex, { debounceSave = false } = {}) {
  const normalized = normalizeHex(hex)
  settings[CUSTOM_COLOR_KEY] = normalized
  setCustomColor(normalized)
  if (settings[COLOR_SCHEME_KEY] !== 'custom') {
    settings[COLOR_SCHEME_KEY] = 'custom'
  }
  applyColorScheme('custom', settings[THEME_KEY], { customHex: normalized })

  const save = async () => {
    try {
      await api.settings.update({
        [COLOR_SCHEME_KEY]: 'custom',
        [CUSTOM_COLOR_KEY]: normalized,
      })
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  if (debounceSave) {
    clearTimeout(customColorSaveTimer)
    customColorSaveTimer = setTimeout(save, 400)
    return
  }
  clearTimeout(customColorSaveTimer)
  await save()
}

function onCustomColorInput(e) {
  updateCustomColor(e.target.value, { debounceSave: true })
}

function onCustomColorHex(e) {
  updateCustomColor(e.target.value)
}

function toggleSetting(key) {
  settings[key] = settings[key] === 'true' ? 'false' : 'true'
  saveSetting(key)
}

async function toggleVisualizerSetting() {
  settings['player.visualizer'] = settings['player.visualizer'] === 'true' ? 'false' : 'true'
  try {
    await api.settings.update({ 'player.visualizer': settings['player.visualizer'] })
    await loadPlayerSettings()
  } catch (e) {
    showToast(e.message, 'error')
  }
}

async function importFile(e) {
  const file = e.target.files?.[0]
  if (!file) return
  try {
    const res = await api.source.importFile(file)
    if (res.error) throw new Error(res.error)
    showToast(`导入成功: ${res.name || file.name}`, 'success')
    sourceList.value = await api.source.list()
  } catch (e) {
    showToast(e.message, 'error')
  }
  e.target.value = ''
}

async function importFromUrl() {
  if (!importUrl.value.trim()) return
  importingUrl.value = true
  try {
    const res = await api.source.importUrl(importUrl.value.trim())
    if (res.error) throw new Error(res.error)
    showToast(`导入成功: ${res.name}`, 'success')
    sourceList.value = await api.source.list()
    importUrl.value = ''
  } catch (e) {
    showToast(e.message, 'error')
  } finally {
    importingUrl.value = false
  }
}

async function refreshPlatformTabs() {
  await Promise.all([
    reloadSearchSources(api),
    reloadDiscoverSources(api),
  ])
}

async function activateSource(id) {
  try {
    const res = await api.source.activate(id)
    if (Array.isArray(res?.activeIds)) {
      activeSourceIds.value = res.activeIds
    } else if (!activeSourceIds.value.includes(id)) {
      activeSourceIds.value = [...activeSourceIds.value, id]
    }
    sourceList.value = sourceList.value.map(s => ({
      ...s,
      active: activeSourceIds.value.includes(s.id),
    }))
    showToast('音源已激活', 'success')
    await refreshPlatformTabs()
  } catch (e) {
    showToast(e.message, 'error')
  }
}

async function deactivateSource(id) {
  try {
    const res = await api.source.deactivate(id)
    if (Array.isArray(res?.activeIds)) {
      activeSourceIds.value = res.activeIds
    } else {
      activeSourceIds.value = activeSourceIds.value.filter(x => x !== id)
    }
    sourceList.value = sourceList.value.map(s => ({
      ...s,
      active: activeSourceIds.value.includes(s.id),
    }))
    showToast('音源已停用', 'success')
    await refreshPlatformTabs()
  } catch (e) {
    showToast(e.message, 'error')
  }
}

async function removeSource(id) {
  try {
    await api.source.remove(id)
    sourceList.value = sourceList.value.filter(s => s.id !== id)
    activeSourceIds.value = activeSourceIds.value.filter(x => x !== id)
    showToast('已删除', 'success')
    await refreshPlatformTabs()
  } catch (e) {
    showToast(e.message, 'error')
  }
}

function showToast(text, type = 'info') {
  toast.value = { text, type }
  setTimeout(() => { toast.value = null }, 3000)
}
</script>

<style scoped>
.settings-page {
  display: flex;
  gap: 24px;
  width: 100%;
  max-width: none;
  min-height: calc(100vh - 160px);
  align-items: flex-start;
}

.settings-nav {
  width: 200px;
  flex-shrink: 0;
  position: sticky;
  top: 0;
}
.nav-title { font-size: 22px; font-weight: 600; margin-bottom: 4px; }
.nav-sub { font-size: 12px; color: var(--text-muted); margin-bottom: 20px; line-height: 1.5; }

.nav-tab {
  display: block;
  width: 100%;
  text-align: left;
  padding: 9px 12px;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  margin-bottom: 2px;
  position: relative;
  transition: all 0.15s;
}
.nav-tab:hover { background: var(--bg-hover); color: var(--text); }
.nav-tab.active {
  background: var(--accent-muted);
  color: var(--accent);
  font-weight: 500;
}
.nav-tab.active::before {
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

.settings-panel { flex: 1; min-width: 0; padding: 24px 28px; width: 100%; }
.panel-title { font-size: 18px; font-weight: 600; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--border-light); }
.panel-body { display: flex; flex-direction: column; gap: 16px; }

.paths-panel-body { gap: 20px; }
.paths-layout {
  display: flex;
  flex-direction: column;
  gap: 28px;
}
.paths-section {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.paths-section-block {
  padding: 16px 18px;
  border-radius: 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
}
.paths-section-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}
.paths-library-panel {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 4px 14px;
  border-radius: 10px;
  background: var(--bg-card, var(--bg));
  border: 1px solid var(--border-light);
}
.setting-item-path-row {
  align-items: flex-start;
  padding: 14px 0;
  border-bottom: 1px solid var(--border-light);
  background: transparent;
}
.setting-item-path-row-last {
  border-bottom: none;
  padding-bottom: 10px;
}
.setting-item-path-row .setting-item-action {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.setting-item-path-row .path-scan-toolbar {
  margin-top: 0;
}
.setting-item-flat {
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--bg-card, var(--bg));
  border: 1px solid var(--border-light);
  border-bottom: 1px solid var(--border-light);
}

.setup-alert {
  margin-bottom: 16px;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(255, 193, 7, 0.1);
  border: 1px solid rgba(255, 193, 7, 0.3);
  font-size: 13px;
  line-height: 1.6;
}
.setup-alert strong { color: #ffc107; }
.setup-alert p { margin: 6px 0 0; color: var(--text-muted); }
.setup-alert-sub { margin-top: 8px !important; font-size: 12px; }
.config-summary {
  margin-bottom: 16px;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(108, 158, 255, 0.08);
  border: 1px solid rgba(108, 158, 255, 0.25);
  font-size: 13px;
  line-height: 1.6;
}
.summary-row {
  display: flex;
  gap: 12px;
  align-items: baseline;
  margin-top: 6px;
  flex-wrap: wrap;
}
.summary-key {
  color: var(--text-muted);
  min-width: 120px;
  font-size: 12px;
}
.summary-val {
  font-size: 12px;
  word-break: break-all;
}
.summary-tip {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}
.setup-hint {
  margin-bottom: 16px;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid var(--border-light);
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.6;
}
.setup-hint code { font-size: 11px; }

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 16px 0;
  border-bottom: 1px solid var(--border-light);
}
.setting-item:last-child { border-bottom: none; }
.setting-item-info { flex: 1; min-width: 0; }
.setting-item-label { font-size: 14px; font-weight: 500; margin-bottom: 2px; }
.setting-item-label-hint { font-weight: 400; color: var(--text-muted); font-size: 12px; }
.setting-item-desc { font-size: 12px; color: var(--text-muted); line-height: 1.5; }
.setting-item-action { flex-shrink: 0; }
.setting-item-action .app-select {
  min-width: 180px;
  max-width: min(280px, 38vw);
}

.path-block { margin-top: 0; }
.path-block .path-row:not(.path-row-head):not(.path-row-static) {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) 88px auto;
  align-items: center;
  gap: 8px;
}
.path-block.has-auto-col .path-row:not(.path-row-head):not(.path-row-static) {
  grid-template-columns: 36px 44px minmax(0, 1fr) 88px auto;
}
.path-block .path-row-head {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) 88px auto;
  align-items: center;
  gap: 8px;
}
.path-block.has-auto-col .path-row-head {
  grid-template-columns: 36px 44px minmax(0, 1fr) 88px auto;
}
.path-row-head .path-col-actions,
.path-row-head .path-col-count {
  text-align: right;
}
.path-col-count {
  flex-shrink: 0;
  text-align: right;
  font-size: 11px;
  color: var(--text-muted);
}
.path-row-download {
  display: flex;
  align-items: center;
  gap: 8px;
}
.path-edit-input {
  grid-column: 1 / -1;
}
.path-block-hint {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
}
.scan-dir-block {
  margin-top: 4px;
}
.scan-tree-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px 6px;
  font-size: 11px;
  color: var(--text-muted);
}
.scan-dir-tree {
  max-height: 360px;
  overflow-y: auto;
  border: 1px solid var(--border-light);
  border-radius: var(--radius);
  padding: 4px;
  background: var(--bg-elevated);
}
.scan-tree-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 8px;
  min-width: 0;
}
.scan-tree-row:hover { background: var(--bg-hover); }
.scan-tree-row.loading { opacity: 0.85; }
.scan-tree-label {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.scan-tree-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.path-row-edit {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
  padding: 10px 12px;
}
.path-col-tree { flex: 1; min-width: 0; }
.scan-tree-head .path-col-tree { padding-left: 36px; }
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
}
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.path-scan-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}
.path-row-head {
  background: transparent;
  padding: 2px 14px 4px;
  margin-bottom: 0;
  font-size: 11px;
  color: var(--text-muted);
}
.path-col-check {
  width: 32px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.path-col-auto {
  width: 44px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-muted);
}
.path-col-path { flex: 1; min-width: 0; }
.path-col-actions { flex-shrink: 0; }
.path-check input,
.path-auto-check input {
  margin: 0;
  cursor: pointer;
}
.path-auto-check {
  cursor: pointer;
  user-select: none;
}
.library-stats-warn {
  margin: 8px 0 0;
  font-size: 12px;
  color: #f59e0b;
  line-height: 1.5;
}
.path-count-badge {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
  border-radius: 999px;
  padding: 2px 8px;
  white-space: nowrap;
}
.path-section-divider {
  margin: 20px 0 8px;
  border-top: 1px solid var(--border-light);
}
.path-row-static { background: var(--bg-elevated); }
.path-manual-download { margin-top: 8px; padding-top: 0; border-top: none; }
.path-readonly {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  max-width: 100%;
}
.download-path-code {
  font-size: 12px;
  word-break: break-all;
  text-align: right;
  max-width: 360px;
}
.block-label { font-size: 12px; color: var(--text-muted); margin-bottom: 8px; }
.path-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: var(--radius);
  background: var(--bg-input);
  margin-bottom: 6px;
}
.path-text { min-width: 0; font-size: 13px; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.path-actions { display: flex; gap: 6px; flex-shrink: 0; }
.path-manual { display: flex; gap: 8px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-light); }
.path-input { flex: 1; min-width: 0; font-size: 13px; }
.empty-hint { font-size: 13px; color: var(--text-muted); padding: 12px 0; }

.source-tip {
  margin: 0 0 14px;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
  background: var(--bg-secondary, var(--surface-2, rgba(0,0,0,0.04)));
  border-radius: 8px;
}
.source-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.source-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-radius: var(--radius);
  background: var(--bg-input);
  border: 1px solid transparent;
}
.source-item.active { border-color: var(--accent); background: var(--accent-muted); }
.source-info { display: flex; flex-direction: column; gap: 2px; }
.source-name { font-size: 14px; font-weight: 500; }
.source-meta { font-size: 12px; color: var(--text-muted); }
.source-actions { display: flex; gap: 6px; }

.import-tabs { display: flex; gap: 6px; margin-bottom: 12px; }
.pill-tab {
  padding: 6px 14px;
  border-radius: var(--radius-pill);
  background: var(--bg-input);
  color: var(--text-secondary);
  font-size: 13px;
  border: 1px solid var(--border);
}
.pill-tab:hover { background: var(--bg-hover); }
.pill-tab.active { color: #fff; }

.import-area { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.url-input { flex: 1; min-width: 200px; }
.hint { font-size: 12px; color: var(--text-muted); }

.toggle {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  cursor: pointer;
  flex-shrink: 0;
}
.toggle input { display: none; }
.slider {
  position: absolute;
  inset: 0;
  background: var(--border);
  border-radius: 24px;
  transition: 0.25s;
}
.slider::before {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  left: 3px;
  bottom: 3px;
  background: #fff;
  border-radius: 50%;
  transition: 0.25s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
}
.toggle input:checked + .slider { background: var(--accent); }
.toggle input:checked + .slider::before { transform: translateX(20px); }

.setting-item-stack {
  flex-direction: column;
  align-items: stretch;
  gap: 14px;
}
.setting-item-stack .setting-item-info { width: 100%; }

.color-scheme-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  width: 100%;
}
.color-scheme-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 8px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  transition: border-color 0.2s, background 0.2s, color 0.2s, box-shadow 0.2s;
}
.color-scheme-btn:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.color-scheme-btn.active {
  border-color: var(--accent);
  background: var(--accent-muted);
  color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}
.color-swatch {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
}
.color-label {
  font-size: 12px;
  line-height: 1.2;
  text-align: center;
}
.color-swatch-custom {
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.35), 0 0 0 1px var(--border);
}
.custom-color-panel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border-radius: var(--radius);
  border: 1px solid var(--border-light);
  background: var(--bg-input);
}
.custom-color-label {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--text-secondary);
}
.custom-color-input {
  width: 44px;
  height: 32px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-card);
  cursor: pointer;
}
.custom-color-hex {
  width: 108px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  text-transform: uppercase;
}
.custom-color-hint {
  width: 100%;
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}

.toast {
  position: fixed;
  bottom: 80px;
  right: 24px;
  padding: 10px 20px;
  border-radius: var(--radius);
  font-size: 14px;
  z-index: 1000;
  animation: fadeIn 0.2s;
  box-shadow: var(--shadow);
}
.toast.success { background: var(--success); color: #fff; }
.toast.error { background: var(--error); color: #fff; }
.toast.info { background: var(--bg-card); border: 1px solid var(--border); }

@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

@media (max-width: 1100px) {
  .setting-item-path-row {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
  .setting-item-path-row .setting-item-action {
    width: 100%;
    justify-content: flex-start;
  }
}

@media (max-width: 768px) {
  .settings-page { flex-direction: column; gap: 12px; }
  .settings-nav {
    width: 100%;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 12px 14px;
    position: sticky;
    top: 0;
    z-index: 5;
    background: var(--bg);
  }
  .nav-title { width: 100%; font-size: 18px; margin-bottom: 0; }
  .nav-sub { width: 100%; margin-bottom: 4px; }
  .nav-tab {
    width: auto;
    display: inline-block;
    padding: 7px 12px;
    font-size: 13px;
    margin-bottom: 0;
  }
  .nav-tab.active::before { display: none; }
  .settings-panel { padding: 16px; }
  .color-scheme-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .panel-title { font-size: 16px; margin-bottom: 14px; padding-bottom: 12px; }
  .setting-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  .setting-item-action { width: 100%; }
  .setting-item-action .app-select {
    width: 100%;
    max-width: none;
    min-width: 0 !important;
  }
  .path-row { flex-wrap: wrap; }
  .path-block .path-row:not(.path-row-head):not(.path-row-static),
  .path-block .path-row-head {
    display: flex;
    flex-wrap: wrap;
  }
  .path-actions { width: 100%; }
  .path-manual { flex-direction: column; }
  .source-item { flex-direction: column; align-items: flex-start; gap: 10px; }
  .source-actions { width: 100%; }
  .import-area { flex-direction: column; align-items: stretch; }
  .url-input { min-width: 0; width: 100%; }
  .toast {
    left: 12px;
    right: 12px;
    bottom: calc(var(--player-height) + var(--mobile-nav-height) + 16px);
  }
}

.user-create-form {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-end;
  margin-bottom: 20px;
}
.field-inline {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}
.field-inline input {
  min-width: 140px;
  padding: 8px 10px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg-input);
  color: var(--text);
}
.user-list { display: flex; flex-direction: column; gap: 10px; }
.user-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: var(--radius);
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
}
.user-row-name { font-size: 14px; color: var(--text); }
.user-row-meta { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.user-row-actions { display: flex; gap: 8px; flex-shrink: 0; }
.mail-test-row {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 16px;
}
.playlist-sync-settings {
  margin-top: 20px;
  padding: 14px 16px;
  border-radius: 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
}
.playlist-sync-title {
  margin-bottom: 12px;
  font-size: 16px;
}

.account-panel-body { padding-bottom: 8px; }
.account-layout {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
  align-items: start;
}
.account-section { display: flex; flex-direction: column; gap: 12px; }
.account-info-row {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
}
.account-info-key { color: var(--text-muted); min-width: 64px; }
.account-info-val { color: var(--text); }
.account-field input { width: 100%; min-width: 0; }
.account-email-input::placeholder {
  color: var(--text-muted);
  opacity: 0.85;
}
.account-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.account-tip { font-size: 12px; color: var(--text-muted); margin: 0; line-height: 1.5; }
.account-email-status {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 13px;
  color: var(--text);
}
.email-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
}
.email-badge.verified {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 40%, transparent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.email-badge.pending {
  color: var(--text-muted);
  background: var(--bg-input);
}
.users-panel-body { padding-bottom: 8px; }
.user-table { display: flex; flex-direction: column; gap: 8px; }
.user-table-head,
.user-table-row {
  display: grid;
  grid-template-columns: minmax(140px, 1.2fr) minmax(160px, 1.4fr) 100px auto;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  border-radius: var(--radius);
}
.user-table-head {
  font-size: 12px;
  color: var(--text-muted);
  padding-bottom: 4px;
}
.user-table-row {
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
}
.user-cell-email {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  font-size: 13px;
  word-break: break-all;
}
.user-cell-role { font-size: 13px; color: var(--text-secondary); }
.user-edit-fields {
  grid-column: 1 / -2;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-end;
}
.text-muted { color: var(--text-muted); font-size: 12px; }
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.modal-card {
  width: min(420px, 100%);
  padding: 20px;
  border-radius: var(--radius-lg);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-lg);
}
.modal-title { margin: 0 0 8px; font-size: 16px; color: var(--text); }
.modal-desc { margin: 0 0 16px; font-size: 13px; color: var(--text-muted); line-height: 1.5; }
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
@media (max-width: 768px) {
  .user-table-head { display: none; }
  .user-table-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .user-edit-fields { grid-column: auto; }
  .user-row-actions { width: 100%; flex-wrap: wrap; }
}
</style>
