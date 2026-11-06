<template>
  <div ref="settingsPageRef" class="settings-page">
    <div class="settings-head">
      <h2>设置</h2>
      <p class="settings-desc">按使用场景整理的偏好设置</p>
    </div>
    <div class="settings-shell">
    <div ref="settingsNavRef" class="settings-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="settings-tab"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >{{ tab.label }}</button>
    </div>

    <main ref="settingsPanelRef" class="settings-panel">

      <!-- 账号管理 -->
      <div v-if="activeTab === 'account'" class="panel-body account-panel-body">
        <section class="account-zone">
          <header class="account-zone-head">
            <div>
              <h4 class="account-zone-title">本账号</h4>
              <p class="account-zone-desc">资料、改密和备份都只作用于当前登录用户。</p>
            </div>
            <span class="account-role-pill" :class="currentAuthUser?.role === 'admin' ? 'admin' : 'user'">
              {{ currentAuthUser?.role === 'admin' ? '管理员' : '普通用户' }}
            </span>
          </header>
          <div class="account-zone-grid">
            <div class="account-block">
              <div class="account-block-title">资料</div>
              <label class="field-inline account-field">
                <span>用户名</span>
                <input v-model="accountForm.username" placeholder="登录用的账号名" />
              </label>
              <label class="field-inline account-field">
                <span>显示名称</span>
                <input v-model="accountForm.displayName" placeholder="在界面中显示的名称" />
              </label>
              <div class="account-actions">
                <button class="btn-primary btn-sm" type="button" :disabled="accountSaving" @click="saveAccountProfile">
                  {{ accountSaving ? '保存中…' : '保存资料' }}
                </button>
              </div>
            </div>
            <div class="account-block">
              <div class="account-block-title">修改密码</div>
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
            </div>
            <div class="account-block">
              <div class="account-block-title">备份与迁移</div>
              <p class="account-block-desc">导出或导入本账号的歌单、收藏、最近播放与个人界面设置。</p>
              <div class="account-actions">
                <button class="btn-primary btn-sm" type="button" :disabled="backupBusy" @click="exportBackup">
                  {{ backupBusy ? '处理中…' : '导出备份' }}
                </button>
                <button class="btn-ghost btn-sm" type="button" :disabled="backupBusy" @click="triggerImportBackup">导入备份</button>
                <input ref="backupFileInput" type="file" accept="application/json,.json" style="display:none" @change="onImportBackupFile" />
              </div>
              <div class="setting-item account-backup-merge">
                <div class="setting-item-info">
                  <div class="setting-item-label">合并导入歌单</div>
                  <div class="setting-item-desc">默认覆盖同账号数据；开启后按歌单 ID 合并，不整表覆盖</div>
                </div>
                <label class="toggle">
                  <input v-model="backupMerge" type="checkbox" />
                  <span class="slider"></span>
                </label>
              </div>
            </div>
          </div>
        </section>

        <section v-if="isAdminUser" class="account-zone account-zone-admin">
          <header class="account-zone-head">
            <div>
              <h4 class="account-zone-title">用户管理</h4>
              <p class="account-zone-desc">创建普通账号或管理员；可指定路径权限，以及是否允许普通用户使用下载功能。</p>
            </div>
          </header>
          <div class="account-block">
            <div class="account-block-title">新建用户</div>
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
                <span>角色</span>
                <AppSelect v-model="newUser.role" :options="userRoleOptions" min-width="120px" />
              </label>
              <label class="field-inline">
                <span>路径权限</span>
                <AppSelect v-model="newUser.downloadPathPolicy" :options="downloadPathPolicyOptions" min-width="200px" />
              </label>
              <label class="field-inline" v-if="newUser.role !== 'admin'">
                <span>允许下载</span>
                <AppSelect v-model="newUser.allowDownload" :options="allowDownloadOptions" min-width="120px" />
              </label>
              <button class="btn-primary btn-sm" type="submit" :disabled="creatingUser">
                {{ creatingUser ? '创建中…' : '创建用户' }}
              </button>
            </form>
          </div>
          <div class="account-block">
            <div class="account-block-title">用户列表</div>
            <div v-if="managedUsers.length" class="user-table user-table-with-path user-table-with-download">
              <div class="user-table-head">
                <span>用户</span>
                <span>角色</span>
                <span>路径权限</span>
                <span>下载</span>
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
                      <span>角色</span>
                      <AppSelect v-model="editUserForm.role" :options="userRoleOptions" min-width="120px" @change="onEditUserRoleChange" />
                    </label>
                    <label class="field-inline">
                      <span>下载目录</span>
                      <AppSelect v-model="editUserForm.downloadPathPolicy" :options="downloadPathPolicyOptions" min-width="180px" />
                    </label>
                    <label class="field-inline" v-if="editUserForm.role !== 'admin'">
                      <span>允许下载</span>
                      <AppSelect v-model="editUserForm.allowDownload" :options="allowDownloadOptions" min-width="120px" />
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
                  <div class="user-cell-role">{{ u.role === 'admin' ? '管理员' : '普通用户' }}</div>
                  <div class="user-cell-path-policy">{{ downloadPathPolicyLabel(u.downloadPathPolicy) }}</div>
                  <div class="user-cell-download">{{ downloadAllowedLabel(u) }}</div>
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
        </section>
      </div>
      <div v-if="activeTab === 'paths'" class="panel-body paths-panel-body">
        <div v-if="isAdminUser" class="paths-top-row">
          <section class="paths-section paths-section-block">
            <header class="paths-zone-head">
              <div>
                <h4 class="paths-section-title">数据目录</h4>
                <p class="paths-zone-desc">{{ pathsRuntimeIsContainer ? '容器内挂载点：音乐库 /music，下载 /downloads。改映射请编辑 docker-compose 后重启容器。' : '应用实际读写的 NAS 挂载点。改路径请到飞牛应用设置保存后，停用再启用。' }}</p>
              </div>
            </header>
            <div v-if="needsPathSetup" class="setup-alert">
              <strong>尚未配置数据目录</strong>
              <p v-if="pathsRuntimeIsContainer">请把宿主机音乐目录挂载到容器 <b>/music</b>，下载目录挂到 <b>/downloads</b>（见 docker-compose），重启后再扫描音乐库。也可在下方手动添加音乐库路径。</p>
              <p v-else>请到飞牛「应用设置 → <b>访问权限</b>」用文件夹选择器添加音乐库与下载目录（会自动授权）。也可在「运行设置」填写绝对路径。</p>
            </div>
            <div v-else class="paths-inner">
              <div class="summary-row">
                <span class="summary-key">音乐库</span>
                <code class="summary-val">{{ mountInfo?.music?.host || (pathsRuntimeIsContainer ? '/music' : '未设置') }}</code>
              </div>
              <div class="summary-row">
                <span class="summary-key">下载</span>
                <code class="summary-val">{{ mountInfo?.downloads?.host || (pathsRuntimeIsContainer ? '/downloads' : '未设置') }}</code>
              </div>
              <div class="summary-row" v-if="mountProbeText">
                <span class="summary-key">探测</span>
                <span class="summary-val">{{ mountProbeText }}</span>
              </div>
              <p v-if="pathsRuntimeIsContainer" class="summary-tip">Docker：修改宿主机卷映射后重启容器。下方「音乐库路径」用于扫描，默认已包含 /music。</p>
              <p v-else class="summary-tip">飞牛应用设置 → 运行设置（或访问权限授权两个文件夹）→ 保存后停用再启用。</p>
            </div>
          </section>

          <section class="paths-section paths-section-block">
            <header class="paths-zone-head">
              <div>
                <h4 class="paths-section-title">ffmpeg</h4>
                <p class="paths-zone-desc">APE / DSD（DSF、DFF）试听与情绪分析按需使用。装包不会下载；有系统自带时一般无需操作。</p>
              </div>
            </header>
            <div class="paths-inner">
              <ol class="ffmpeg-steps">
                <li class="done">应用安装时不下载 ffmpeg</li>
                <li :class="{ done: ffmpegStatus.source === 'system' || (ffmpegStatus.enabled && ffmpegStatus.source === 'system') }">
                  优先用系统自带（有则相关功能直接可用）
                </li>
                <li :class="{ done: ffmpegStatus.source === 'managed', active: ffmpegInstall.running && ffmpegInstall.phase === 'download' }">
                  系统没有、又要用到相关功能时，再点下方准备便携版
                </li>
              </ol>
              <div class="summary-row">
                <span class="summary-key">状态</span>
                <span class="summary-val" :class="ffmpegStatusClass">{{ ffmpegStatusLabel }}</span>
              </div>
              <div v-if="ffmpegStatus.path" class="summary-row">
                <span class="summary-key">路径</span>
                <code class="summary-val">{{ ffmpegStatus.path }}</code>
              </div>
              <div v-if="ffmpegStatus.source && ffmpegStatus.source !== 'none'" class="summary-row">
                <span class="summary-key">来源</span>
                <span class="summary-val">{{ ffmpegStatus.source === 'system' ? '系统自带（优先）' : '应用便携版（回退）' }}</span>
              </div>
              <div v-if="ffmpegInstall.running || ffmpegInstall.phase === 'error'" class="ffmpeg-progress-block">
                <div class="ffmpeg-progress-bar">
                  <div class="ffmpeg-progress-fill" :style="{ width: `${ffmpegInstall.progress || 0}%` }" />
                </div>
                <p class="ffmpeg-progress-text">{{ ffmpegInstall.message || '处理中…' }}</p>
              </div>
              <div class="ffmpeg-actions">
                <button
                  type="button"
                  class="btn-primary btn-sm"
                  :disabled="ffmpegBusy || ffmpegInstall.running"
                  @click="installFfmpeg"
                >
                  {{
                    ffmpegInstall.running || ffmpegBusy === 'install'
                      ? '准备中…'
                      : ffmpegStatus.enabled
                        ? '重新检测 / 准备'
                        : '检测并准备 ffmpeg'
                  }}
                </button>
                <button
                  type="button"
                  class="btn-ghost btn-sm"
                  :disabled="ffmpegBusy || ffmpegInstall.running"
                  @click="detectFfmpeg"
                >
                  {{ ffmpegBusy === 'detect' ? '检测中…' : '仅检测' }}
                </button>
                <button
                  v-if="ffmpegStatus.enabled && !ffmpegStatus.settingDisabled"
                  type="button"
                  class="btn-ghost btn-sm"
                  :disabled="ffmpegBusy || ffmpegInstall.running"
                  @click="disableFfmpeg"
                >
                  {{ ffmpegBusy === 'disable' ? '停用中…' : '停用相关功能' }}
                </button>
              </div>
            </div>
          </section>
        </div>

        <div class="paths-layout">
          <section class="paths-section paths-section-block">
            <header class="paths-zone-head">
              <div>
                <h4 class="paths-section-title">路径权限</h4>
                <p class="paths-zone-desc">{{ downloadPathPolicyTip }}</p>
              </div>
            </header>

            <div v-if="canChooseDownloadPath" class="setting-item setting-item-flat">
              <div class="setting-item-info">
                <div class="setting-item-label">使用哪套路径</div>
                <div class="setting-item-desc">管理员路径：与管理员共用音乐库与下载目录；专属路径：仅本账号的音乐库与下载目录</div>
              </div>
              <div class="setting-item-action">
                <AppSelect
                  v-model="downloadPathMode"
                  :options="downloadPathModeOptions"
                  min-width="180px"
                  @change="onDownloadPathModeChange"
                />
              </div>
            </div>
            <div v-else class="setting-item setting-item-flat">
              <div class="setting-item-info">
                <div class="setting-item-label">当前路径策略</div>
                <div class="setting-item-desc">{{ downloadPathPolicyLockedDesc }}</div>
              </div>
              <div class="setting-item-action path-policy-locked">
                {{ downloadPathMode === 'personal' ? '专属路径' : '管理员路径' }}
              </div>
            </div>
          </section>

          <section v-if="isAdminUser" class="paths-section paths-section-block">
            <header class="paths-zone-head">
              <div>
                <h4 class="paths-section-title">音乐库（管理员共用）</h4>
                <p class="paths-zone-desc">供选择「管理员路径」的用户使用。请填 NAS 绝对路径（如 <code>/vol1/1000/Music</code>）。</p>
              </div>
            </header>
            <div class="setting-item setting-item-flat">
              <div class="setting-item-info">
                <div class="setting-item-label">共用音乐库路径</div>
                <div class="setting-item-desc">
                  {{ fnosAvailable ? '点击「选择文件夹」会调用系统文件管理器。' : '点击「添加路径」输入目录。' }}
                </div>
              </div>
              <div class="setting-item-action">
                <button v-if="fnosAvailable" class="btn-primary btn-sm" @click="browseAddPath" :disabled="pickingFolder">
                  {{ pickingFolder ? '选择中...' : '选择文件夹' }}
                </button>
                <button v-else class="btn-primary btn-sm" @click="promptAddPath">添加路径</button>
              </div>
            </div>

            <div v-if="musicPaths.length" class="paths-library-panel paths-inner">
              <div class="paths-inner-title">扫描与热更新</div>
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
                    <p v-if="sharedDownloadPath && sharedMusicPaths.includes(sharedDownloadPath)" class="library-stats-warn">
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
                    音乐库热更新
                    <span class="setting-item-label-hint">（低性能设备建议关闭）</span>
                  </div>
                  <div class="setting-item-desc">
                    开启后：后台定时轻量比对目录列表，发现增减才扫标签并热更新；打开网页只读索引，不触发全盘扫描。
                    关闭后仅保留缓存与手动扫描，可进一步减轻 NAS / 弱设备 IO。
                  </div>
                </div>
                <div class="setting-item-action">
                  <label class="toggle">
                    <input v-model="scanWatchEnabled" type="checkbox" @change="saveScanSettings" />
                    <span class="slider"></span>
                  </label>
                </div>
              </div>

              <div class="setting-item setting-item-path-row">
                <div class="setting-item-info">
                  <div class="setting-item-label">热更新间隔</div>
                  <div class="setting-item-desc">仅后台定时监测生效。默认 5 分钟；无变化时只比对文件名列表，不逐个 stat 音频。大曲库可再加大。</div>
                </div>
                <div class="setting-item-action">
                  <AppSelect
                    v-model="scanWatchIntervalSec"
                    :options="scanWatchIntervalOptions"
                    size="sm"
                    min-width="140px"
                    :disabled="!scanWatchEnabled"
                    @change="saveScanSettings"
                  />
                </div>
              </div>

              <div class="setting-item setting-item-path-row">
                <div class="setting-item-info">
                  <div class="setting-item-label">
                    自动扫描范围
                    <span class="setting-item-label-hint">（热更新 / 手动扫描范围）</span>
                  </div>
                  <div class="setting-item-desc">
                    热更新与进入音乐库时的增量检查使用此范围；也可在下方目录树勾选「自动」。
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
                  <div class="setting-item-desc">立即扫描目录列表中勾选「手动」的目录（热更新关闭时仍可用）</div>
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

            <div v-if="musicPaths.length" class="paths-inner path-block scan-dir-block" :class="{ 'has-auto-col': scanAutoMode === 'selected' }">
              <div class="paths-inner-title">扫描目录</div>
              <p v-if="scanAutoMode === 'selected'" class="path-block-hint">
                展开目录树后勾选要扫描的文件夹。「手动」勾选后立即扫描；「自动」勾选后，进入音乐库与后台监测会刷新该文件夹。
              </p>
              <p v-else class="path-block-hint">
                展开目录树后勾选要扫描的文件夹。「手动」勾选后立即扫描；自动扫描范围为所有根目录。
              </p>

              <div v-if="editingPath" class="path-row path-row-edit card-inner">
                <input v-model="editPathValue" class="path-input path-edit-input" @keydown.enter="saveEditPath(editingPath)" />
                <button v-if="fnosAvailable" class="btn-sm btn-ghost" @click="browseEditPath(editingPath)" :disabled="pickingFolder">浏览</button>
                <button class="btn-sm btn-primary" @click="saveEditPath(editingPath)">保存</button>
                <button class="btn-sm btn-ghost" @click="cancelEditPath">取消</button>
              </div>

              <div class="scan-tree-head">
                <span class="path-col-check" title="勾选后用于手动扫描">手动</span>
                <span v-if="scanAutoMode === 'selected'" class="path-col-auto" title="勾选后进入音乐库与后台监测会自动扫描">自动</span>
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
                      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
            <div v-else class="empty-hint">暂无共用音乐库目录，请添加或选择路径</div>
          </section>

          <section
            v-if="showPersonalMusicSection"
            class="paths-section paths-section-block"
          >
            <header class="paths-zone-head">
              <div>
                <h4 class="paths-section-title">{{ isAdminUser ? '我的专属音乐库' : '音乐库（专属）' }}</h4>
                <p class="paths-zone-desc">当前账号使用专属路径：在此配置仅自己可见的音乐库目录。</p>
              </div>
            </header>
            <div class="setting-item setting-item-flat">
              <div class="setting-item-info">
                <div class="setting-item-label">专属音乐库路径</div>
                <div class="setting-item-desc">
                  可添加一个或多个目录。{{ fnosAvailable ? '点击「选择文件夹」选择。' : '点击「添加路径」输入。' }}
                </div>
              </div>
              <div class="setting-item-action">
                <button v-if="fnosAvailable" class="btn-primary btn-sm" @click="browseAddPersonalPath" :disabled="pickingFolder">
                  {{ pickingFolder ? '选择中...' : '选择文件夹' }}
                </button>
                <button v-else class="btn-primary btn-sm" @click="promptAddPersonalPath">添加路径</button>
              </div>
            </div>
            <div v-if="personalMusicPaths.length" class="path-list paths-inner">
              <div v-for="p in personalMusicPaths" :key="p" class="path-row">
                <code class="path-code" :title="p">{{ p }}</code>
                <div class="path-col-actions">
                  <button v-if="fnosAvailable" class="btn-sm btn-ghost" @click="browseReplacePersonalPath(p)" :disabled="pickingFolder">浏览</button>
                  <button class="btn-sm btn-danger" @click="removePersonalPath(p)">移除</button>
                </div>
              </div>
            </div>
            <div v-else class="empty-hint">尚未添加专属音乐库目录</div>
          </section>

          <section
            v-if="!isAdminUser && downloadPathMode === 'shared'"
            class="paths-section paths-section-block"
          >
            <header class="paths-zone-head">
              <div>
                <h4 class="paths-section-title">音乐库（管理员）</h4>
                <p class="paths-zone-desc">当前使用管理员配置的共用音乐库（只读）。</p>
              </div>
            </header>
            <div v-if="sharedMusicPaths.length" class="path-list paths-inner">
              <div v-for="p in sharedMusicPaths" :key="p" class="path-row">
                <code class="path-code" :title="p">{{ p }}</code>
              </div>
            </div>
            <div v-else class="empty-hint">管理员尚未配置共用音乐库</div>
          </section>

          <section class="paths-section paths-section-block">
            <header class="paths-zone-head">
              <div>
                <h4 class="paths-section-title">下载保存</h4>
                <p class="paths-zone-desc">下载文件写入的目录。当前生效路径由上方路径权限决定。</p>
              </div>
            </header>

            <div class="setting-item setting-item-flat">
              <div class="setting-item-info">
                <div class="setting-item-label">管理员下载目录{{ isAdminUser ? '' : '（只读）' }}</div>
                <div class="setting-item-desc path-desc-mono" :title="sharedDownloadPath">
                  {{ sharedDownloadPath || '未设置' }}
                </div>
              </div>
              <div v-if="isAdminUser" class="setting-item-action">
                <button
                  v-if="fnosAvailable"
                  type="button"
                  class="btn-primary btn-sm"
                  :disabled="pickingFolder"
                  @click="browseDownloadPath"
                >
                  {{ pickingFolder ? '选择中…' : '选择文件夹' }}
                </button>
                <button
                  v-else
                  type="button"
                  class="btn-primary btn-sm"
                  @click="promptEditSharedDownload"
                >
                  修改
                </button>
              </div>
            </div>

            <div v-if="downloadPathMode === 'personal'" class="setting-item setting-item-flat">
              <div class="setting-item-info">
                <div class="setting-item-label">我的专属下载目录</div>
                <div class="setting-item-desc path-desc-mono" :title="personalDownloadPath">
                  {{ personalDownloadPath || '未设置（将使用管理员下载目录下的用户名子文件夹）' }}
                </div>
              </div>
              <div class="setting-item-action">
                <button
                  v-if="fnosAvailable"
                  type="button"
                  class="btn-primary btn-sm"
                  :disabled="pickingFolder"
                  @click="browsePersonalDownloadPath"
                >
                  {{ pickingFolder ? '选择中…' : '选择文件夹' }}
                </button>
                <button
                  v-else
                  type="button"
                  class="btn-primary btn-sm"
                  @click="promptEditPersonalDownload"
                >
                  修改
                </button>
              </div>
            </div>

            <div class="setting-item setting-item-flat">
              <div class="setting-item-info">
                <div class="setting-item-label">当前生效下载目录</div>
                <div class="setting-item-desc path-desc-mono" :title="downloadPath">
                  {{ downloadPath || '未设置' }}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <!-- 音源管理 -->
      <div v-if="activeTab === 'source'" class="panel-body">
        <p v-if="isAdminUser" class="source-tip">支持同时激活多个音源（落雪 / 澜音 / MusicFree / BakaMusic）。每个账号的激活状态相互独立；点「平台」可单独开关该音源支持的平台。若某平台近期多为试听片段，会自动关闭该音源对它的解析。试听 / 下载顺序：当前音源先穷尽其可用平台，再按激活列表切换下一个音源继续查找。</p>
        <p v-else class="source-tip">音源脚本由管理员导入。你可以自行激活或停用音源，并点「平台」单独开关各平台（仅对自己生效）。某平台被检测为多为试听时会自动关闭解析。试听 / 下载按「当前源各平台 → 下一激活源各平台」查找；列表旁的健康标注来自本机近期播放/下载。</p>
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

        <div v-if="sourceList.length" class="source-batch-toolbar">
          <label class="source-select-all">
            <input
              type="checkbox"
              :checked="allSourcesSelected"
              :indeterminate="someSourcesSelected && !allSourcesSelected"
              @change="toggleSelectAllSources"
            />
            全选
          </label>
          <span class="hint">已选 {{ selectedSourceIds.length }}</span>
          <button
            class="btn-sm btn-primary"
            type="button"
            :disabled="!!sourceBatchBusy || !selectedSourceIds.length"
            @click="batchActivateSources"
          >{{ sourceBatchBusy === 'activate' ? '启用中…' : '批量启用' }}</button>
          <button
            class="btn-sm btn-ghost"
            type="button"
            :disabled="!!sourceBatchBusy || !selectedSourceIds.length"
            @click="batchDeactivateSources"
          >{{ sourceBatchBusy === 'deactivate' ? '停用中…' : '批量停用' }}</button>
          <button
            v-if="isAdminUser"
            class="btn-sm btn-danger"
            type="button"
            :disabled="!!sourceBatchBusy || !selectedSourceIds.length"
            @click="batchRemoveSources"
          >{{ sourceBatchBusy === 'delete' ? '删除中…' : '批量删除' }}</button>
        </div>

        <div v-if="isAdminUser" class="source-admin-toolbar">
          <button
            class="btn-ghost btn-sm"
            type="button"
            :disabled="checkingSourceUpdates || sourceUpdatingAll || !sourceList.length"
            @click="checkSourceUpdates"
          >{{ checkingSourceUpdates ? '检查中…' : '检查音源更新' }}</button>
          <button
            v-if="isAdminUser"
            class="btn-ghost btn-sm"
            type="button"
            :disabled="exportingAllSources || !sourceList.length"
            @click="exportAllSources"
          >{{ exportingAllSources ? '导出中…' : '导出全部音源' }}</button>
          <button
            v-if="outdatedSourceCount"
            class="btn-primary btn-sm"
            type="button"
            :disabled="checkingSourceUpdates || sourceUpdatingAll || Boolean(sourceUpdatingId)"
            @click="applyAllSourceUpdates"
          >{{ sourceUpdatingAll ? '全部更新中…' : `全部更新 (${outdatedSourceCount})` }}</button>
          <span v-if="sourceUpdateSummary" class="hint">{{ sourceUpdateSummary }}</span>
        </div>

        <div class="source-list" v-if="sourceDisplayRows.length">
          <div
            v-for="row in sourceDisplayRows"
            :key="row.id"
            class="source-item"
            :class="{
              active: isDisplayRowActive(row),
              selected: isDisplayRowSelected(row),
              unhealthy: displayRowUnhealthy(row),
              'health-mixed': displayRowHealthLevel(row) === 'mixed',
              'health-preview': displayRowHealthLevel(row) === 'preview',
              'platform-open': expandedSourceId === row.id,
              'is-source-group': row.type === 'group',
            }"
          >
            <div class="source-item-main">
              <label class="source-check" @click.stop>
                <input
                  type="checkbox"
                  :checked="isDisplayRowSelected(row)"
                  @change="toggleDisplayRowSelected(row)"
                />
              </label>
              <div class="source-info">
                <div class="source-name-row">
                  <span class="source-name">{{ row.name }}</span>
                  <span v-if="row.type === 'group'" class="source-group-badge" :title="`含 ${row.members.length} 个平台插件`">合集</span>
                  <span
                    v-if="displayRowHealthBadge(row)"
                    class="source-health-badge"
                    :class="displayRowHealthLevel(row) === 'mixed' ? 'mixed' : 'preview'"
                    :title="displayRowHealthTip(row)"
                  >{{ displayRowHealthBadge(row) }}</span>
                  <span
                    v-if="displayRowCanUpdate(row)"
                    class="source-update-badge"
                    :title="displayRowUpdateTip(row)"
                  >有更新</span>
                </div>
                <span class="source-meta">{{ displayRowMeta(row) }}</span>
                <span v-if="displayRowUpdateLog(row)" class="source-update-log">{{ displayRowUpdateLog(row) }}</span>
                <span v-if="displayRowHealthTip(row)" class="source-health-tip">{{ displayRowHealthTip(row) }}</span>
                <span v-if="displayRowAutoCloseNotice(row)" class="source-autoclose-tip">{{ displayRowAutoCloseNotice(row) }}</span>
              </div>
              <div class="source-actions">
                <div class="source-platform-wrap" :class="{ open: expandedSourceId === row.id }">
                  <button
                    type="button"
                    class="source-expand-btn"
                    :class="{ expanded: expandedSourceId === row.id }"
                    :data-source-plat="row.id"
                    :aria-expanded="expandedSourceId === row.id"
                    :title="expandedSourceId === row.id ? '收起平台开关' : '展开平台开关'"
                    @click.stop="toggleSourcePlatformPanel(row.id)"
                  >
                    <span>平台</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                </div>
                <button v-if="displayRowUnhealthy(row) || displayRowAutoCloseNotice(row)" class="btn-sm btn-ghost" @click="dismissDisplayRowHealth(row)">知道了</button>
                <button
                  v-if="isAdminUser && displayRowCanUpdate(row)"
                  class="btn-sm btn-primary"
                  :disabled="isDisplayRowBusy(row) || sourceUpdatingAll || checkingSourceUpdates"
                  @click="applyDisplayRowUpdate(row)"
                >{{ isDisplayRowUpdating(row) ? '更新中…' : '更新' }}</button>
                <button
                  v-if="!isDisplayRowActive(row)"
                  type="button"
                  class="btn-sm btn-primary"
                  :disabled="isDisplayRowBusy(row) || !!sourceBatchBusy || importingUrl || importingFiles"
                  @click.stop="activateDisplayRow(row)"
                >{{ isDisplayRowBusy(row) ? '激活中…' : '激活' }}</button>
                <button
                  v-else
                  type="button"
                  class="btn-sm btn-ghost"
                  :disabled="isDisplayRowBusy(row) || !!sourceBatchBusy"
                  @click.stop="deactivateDisplayRow(row)"
                >{{ isDisplayRowBusy(row) ? '停用中…' : (isDisplayRowPartial(row) ? '全部停用' : '停用') }}</button>
                <button
                  v-if="isAdminUser"
                  class="btn-sm btn-ghost"
                  type="button"
                  :title="row.type === 'group'
                    ? `将合集内 ${row.members.length} 个平台插件保存到下载目录「音源导出」`
                    : '保存到下载目录下的「音源导出」文件夹'"
                  :disabled="isDisplayRowBusy(row) || !!exportingSourceId"
                  @click.stop="exportDisplayRow(row)"
                >{{ exportingSourceId === row.id ? '导出中…' : '导出' }}</button>
                <button
                  v-if="isAdminUser"
                  type="button"
                  class="btn-sm btn-danger"
                  :disabled="isDisplayRowBusy(row) || !!sourceBatchBusy || importingUrl || importingFiles"
                  @click.stop="removeDisplayRow(row)"
                >删除</button>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="empty-hint">暂未导入音源</div>

        <div v-if="isAdminUser" class="import-tabs">
          <button :class="['pill-tab', { active: importMode === 'file' }]" @click="importMode = 'file'">本地导入</button>
          <button :class="['pill-tab', { active: importMode === 'url' }]" @click="importMode = 'url'">在线导入</button>
        </div>
        <div class="import-area" v-if="isAdminUser && importMode === 'file'">
          <input type="file" ref="fileInput" accept=".js,text/javascript" multiple @change="importFile" style="display:none" />
          <button class="btn-primary btn-sm" :disabled="importingFiles" @click="$refs.fileInput.click()">
            {{ importingFilesLabel }}
          </button>
          <span class="hint">可多选 .js；支持落雪、澜音（CeruMusic），以及 MusicFree / BakaMusic 插件</span>
        </div>
        <div class="import-area import-area-url" v-else-if="isAdminUser">
          <textarea
            v-model="importUrl"
            class="url-input url-textarea"
            rows="3"
            placeholder="输入 .js 直链或 MusicFree plugins.json，多个用逗号或换行分隔"
          />
          <button class="btn-primary btn-sm" @click="importFromUrl" :disabled="importingUrl">
            {{ importingUrlLabel }}
          </button>
          <span class="hint">多个地址可用逗号或换行分开；GitHub 失败会自动换镜像。plugins.json 会展开为其中的插件脚本</span>
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

      <!-- 标签管理 -->
      <div v-if="activeTab === 'tag'" class="panel-body">
        <p class="source-tip">控制文件管理中的标签刮削 / 匹配行为，以及播放时自动补全缺失标签。可与「文件管理 → 编辑标签」配合使用。</p>
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">标签匹配并发</div>
            <div class="setting-item-desc">按文件名批量匹配 / 重设时同时处理的文件数。越高越快，过高可能被音源限流</div>
          </div>
          <div class="setting-item-action">
            <AppSelect
              v-model="settings['tag.matchConcurrency']"
              :options="tagMatchConcurrencyOptions"
              min-width="100px"
              @change="saveTagMatchConcurrency"
            />
          </div>
        </div>
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">匹配参考文件夹名</div>
            <div class="setting-item-desc">批量刮削时把父文件夹名当作专辑提示（如演唱会目录），减少刮成录音室专辑</div>
          </div>
          <div class="setting-item-action">
            <label class="toggle">
              <input
                type="checkbox"
                :checked="settings['tag.matchPreferFolderAlbum'] !== 'false'"
                @change="toggleTagMatchFlag('tag.matchPreferFolderAlbum', $event)"
              />
              <span class="slider"></span>
            </label>
          </div>
        </div>
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">仅补全缺失标签</div>
              <div class="setting-item-desc">「补全缺失」只写入本地为空的字段。「整理标签」在下拉窗勾选字段后覆盖写入。</div>
          </div>
          <div class="setting-item-action">
            <label class="toggle">
              <input
                type="checkbox"
                :checked="settings['tag.matchFillMissingOnly'] !== 'false'"
                @change="toggleTagMatchFlag('tag.matchFillMissingOnly', $event)"
              />
              <span class="slider"></span>
            </label>
          </div>
        </div>
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">过滤不符的网络歌手</div>
            <div class="setting-item-desc">结果歌手需与本地标签或路径中的歌手相关，避免刮成无关网络艺人</div>
          </div>
          <div class="setting-item-action">
            <label class="toggle">
              <input
                type="checkbox"
                :checked="settings['tag.matchRejectForeignArtist'] !== 'false'"
                @change="toggleTagMatchFlag('tag.matchRejectForeignArtist', $event)"
              />
              <span class="slider"></span>
            </label>
          </div>
        </div>
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">播放自动匹配</div>
            <div class="setting-item-desc">播放本地音乐时，若文件标签缺失（无专辑 / 封面 / 歌词等），自动联网匹配并保存到文件</div>
          </div>
          <div class="setting-item-action">
            <label class="toggle">
              <input
                type="checkbox"
                :checked="settings[AUTO_MATCH_ON_PLAY_KEY] === 'true'"
                @change="toggleAutoMatchOnPlay"
              />
              <span class="slider"></span>
            </label>
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
        <div class="setting-item setting-item-stack">
          <div class="setting-item-info">
            <div class="setting-item-label">歌词颜色</div>
            <div class="setting-item-desc">全屏歌词的文字色与高亮色；逐字扫光使用高亮色</div>
          </div>
          <div class="color-scheme-grid">
            <button
              v-for="item in LYRIC_COLOR_PRESETS"
              :key="item.id"
              type="button"
              class="color-scheme-btn"
              :class="{ active: settings[LYRIC_PRESET_KEY] === item.id }"
              @click="selectLyricColorPreset(item.id)"
            >
              <span class="lyric-swatch-pair">
                <span
                  class="lyric-swatch"
                  :style="{ background: item.id === 'custom' ? lyricTextPreview : item.text }"
                />
                <span
                  class="lyric-swatch lyric-swatch-hl"
                  :style="{ background: item.id === 'custom' ? lyricHighlightPreview : item.highlight }"
                />
              </span>
              <span class="color-label">{{ item.label }}</span>
            </button>
          </div>
          <div
            class="lyric-color-preview"
            :style="{ '--lyric-text': lyricTextPreview, '--lyric-highlight': lyricHighlightPreview }"
          >
            <span class="lyric-preview-idle">未唱到的字</span>
            <span class="lyric-preview-hl">正在唱的字</span>
          </div>
          <div v-if="settings[LYRIC_PRESET_KEY] === 'custom'" class="custom-color-panel lyric-custom-panel">
            <label class="custom-color-label">
              <span>文字颜色</span>
              <input
                type="color"
                class="custom-color-input"
                :value="lyricTextPreview"
                @input="onLyricTextColorInput"
              />
            </label>
            <input
              type="text"
              class="custom-color-hex"
              :value="lyricTextPreview"
              maxlength="7"
              spellcheck="false"
              placeholder="#ffffff"
              @change="onLyricTextColorHex"
              @keydown.enter="onLyricTextColorHex"
            />
            <label class="custom-color-label">
              <span>高亮颜色</span>
              <input
                type="color"
                class="custom-color-input"
                :value="lyricHighlightPreview"
                @input="onLyricHighlightColorInput"
              />
            </label>
            <input
              type="text"
              class="custom-color-hex"
              :value="lyricHighlightPreview"
              maxlength="7"
              spellcheck="false"
              placeholder="#ffffff"
              @change="onLyricHighlightColorHex"
              @keydown.enter="onLyricHighlightColorHex"
            />
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
            <div class="setting-item-desc">开启后，播放栏与全屏页将显示频谱动效。频谱依赖 Web Audio，锁屏/切到后台时容易无声。关闭后走原生播放，便于后台续播；手机端或桌面 PWA 切到后台时也会临时改走原生。部分系统仍可能限制后台音频</div>
          </div>
          <label class="toggle">
            <input type="checkbox" :checked="settings['player.visualizer'] === 'true'" @change="toggleVisualizerSetting" />
            <span class="slider"></span>
          </label>
        </div>
      </div>

      <!-- 试听 / 下载 -->
      <div v-if="activeTab === 'download'" class="panel-body">
        <div class="settings-group-title">试听</div>
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">试听音质</div>
            <div class="setting-item-desc">在线试听优先使用的音质。查找顺序：当前音源先试各平台同档 → 再换其它激活音源各平台 → 仍没有再降档。本地文件不受影响</div>
          </div>
          <div class="setting-item-action">
            <AppSelect
              v-model="settings[PLAY_QUALITY_KEY]"
              :options="playQualityOptions"
              min-width="160px"
              @change="savePlayQuality"
            />
          </div>
        </div>
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">跨平台补源</div>
            <div class="setting-item-desc">开启后：每个激活音源会先在当前平台取链，再搜其它平台同名曲尝试同档；该音源各平台都失败后再换下一个激活音源。关闭则只在当前曲目平台上轮换音源。试听与下载共用</div>
          </div>
          <label class="toggle">
            <input type="checkbox" :checked="settings['download.isUseOtherSource'] !== 'false'" @change="toggleCrossPlatformSupplement" />
            <span class="slider"></span>
          </label>
        </div>
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">本地转码（弱网 / 车机）</div>
            <div class="setting-item-desc">
              开启：本地 FLAC 等先在 NAS 转成约 128kbps AAC 再播，并预热下一首；在线试听也会压到 128k，适合无线 CarPlay / 弱网。
              通过局域网 IP / localhost 访问时，本地歌曲仍直出原文件（不转码），外网或域名远程访问时才转码。
              关闭：始终直出原文件，不自动转码；播不动时会提示网络不佳并建议开转码，连播时自动跳下一曲。
              APE / DSF / DFF（DSD）浏览器无法直出，始终转码播放，不受本开关影响。
              开启后会关闭音频可视化。需要可用的 ffmpeg。iPhone/iPad 默认开启。
            </div>
          </div>
          <label class="toggle">
            <input type="checkbox" :checked="settings['player.smoothStream'] !== 'false'" @change="toggleSmoothStreamSetting" />
            <span class="slider"></span>
          </label>
        </div>
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">本机试听缓存</div>
            <div class="setting-item-desc">
              仅缓存在当前浏览器（与服务端发现页/封面等预缓存完全独立，互不影响）。
              成功试听后写入本机；下次同曲、同音质（含是否转码）直接本地播，省流量。
              音质或转码开关不一致会重新拉取。{{ audioCacheStatsText }}
            </div>
          </div>
          <label class="toggle">
            <input
              type="checkbox"
              :checked="settings[AUDIO_CACHE_ENABLED_KEY] !== 'false'"
              @change="toggleAudioCacheSetting"
            />
            <span class="slider"></span>
          </label>
        </div>
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">本机试听缓存上限</div>
            <div class="setting-item-desc">只限制本机浏览器占用；不改变 NAS 上服务端磁盘缓存大小。超出按最久未用淘汰</div>
          </div>
          <div class="setting-item-action">
            <AppSelect
              v-model="settings[AUDIO_CACHE_MAX_MB_KEY]"
              :options="audioCacheMaxMbOptions"
              min-width="140px"
              :disabled="settings[AUDIO_CACHE_ENABLED_KEY] === 'false'"
              @change="saveAudioCacheMaxMB"
            />
          </div>
        </div>
        <div class="setting-item">
          <div class="setting-item-info">
            <div class="setting-item-label">清空本机试听缓存</div>
            <div class="setting-item-desc">只删本机浏览器里的试听音频，不会清服务端发现页/封面预缓存</div>
          </div>
          <div class="setting-item-action">
            <button type="button" class="btn-ghost btn-sm" :disabled="audioCacheClearing" @click="clearAudioCacheAction">
              {{ audioCacheClearing ? '清理中…' : '清空' }}
            </button>
          </div>
        </div>
        <template v-if="isAdminUser">
          <div class="settings-group-title">下载</div>
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
              <div class="setting-item-desc">按文件名（忽略扩展名）检测本地已有文件；询问时会显示本地音质。「仍下载」会与其它格式并存，不删已有 FLAC/MP3 等</div>
            </div>
            <div class="setting-item-action">
              <AppSelect
                v-model="settings['download.existFileMode']"
                :options="existFileModeOptions"
                min-width="160px"
                @change="saveExistFileMode"
              />
            </div>
          </div>
          <div class="setting-item">
            <div class="setting-item-info">
              <div class="setting-item-label">下载分组</div>
              <div class="setting-item-desc">在下载目录下创建子文件夹；按歌手时多位歌手归档到「群星 (Various Artists)」；歌手/专辑为两级目录。专辑名为空或「未知专辑」时不单独建专辑文件夹（落到歌手目录或下载根）。请把「下载目录」设在分组根（如 download），不要选进已生成的专辑/歌手子文件夹，否则容易一层层套娃</div>
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
          <div class="setting-item">
            <div class="setting-item-info">
              <div class="setting-item-label">大批量下载：每批数量</div>
              <div class="setting-item-desc">歌单、批量勾选、音质升级、专辑检测默认一次入队多少首；可在确认窗临时修改。一次过多可能触发音源风控</div>
            </div>
            <div class="setting-item-action">
              <AppSelect
                v-model="settings['download.playlistBatchSize']"
                :options="playlistBatchSizeOptions"
                min-width="120px"
                @change="saveSetting('download.playlistBatchSize')"
              />
            </div>
          </div>
          <div class="setting-item">
            <div class="setting-item-info">
              <div class="setting-item-label">大批量下载：间隔</div>
              <div class="setting-item-desc">下一批自动入队的等待时间。等待期间可查看剩余、立即继续或取消后续批次</div>
            </div>
            <div class="setting-item-action">
              <AppSelect
                v-model="settings['download.playlistIntervalHours']"
                :options="playlistIntervalOptions"
                min-width="120px"
                @change="saveSetting('download.playlistIntervalHours')"
              />
            </div>
          </div>
          <div class="settings-group-title">写入文件</div>
          <div class="setting-item" v-for="item in embedItems" :key="item.key">
            <div class="setting-item-info">
              <div class="setting-item-label">{{ item.label }}</div>
              <div class="setting-item-desc">{{ item.desc }}</div>
            </div>
            <label class="toggle"><input type="checkbox" :checked="settings[item.key] === 'true'" @change="toggleSetting(item.key)" /><span class="slider"></span></label>
          </div>
          <div class="settings-group-title">歌词文件</div>
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
        </template>
      </div>
    </main>
    </div>

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

    <Teleport to="body">
      <div
        v-if="expandedDisplayRow"
        class="source-platform-popover"
        role="dialog"
        :aria-label="`${expandedDisplayRow.name} 平台开关`"
        :style="platformPopoverStyle"
        @click.stop
      >
        <div class="platform-popover-head">
          <div class="platform-popover-title-row">
            <div class="platform-popover-title">{{ expandedDisplayRow.type === 'group' ? '合集平台' : '平台解析' }}</div>
            <div class="platform-switch-actions">
              <button type="button" class="plat-link plat-link-on" @click="setDisplayRowPlatformsAll(expandedDisplayRow, true)">全启用</button>
              <button type="button" class="plat-link plat-link-off" @click="setDisplayRowPlatformsAll(expandedDisplayRow, false)">全关闭</button>
            </div>
          </div>
          <p class="platform-switch-tip">
            {{ expandedDisplayRow.type === 'group'
              ? '关闭后，该合集下对应平台插件不再参与解析（仅对本账号生效）。'
              : '关闭后，该音源不再解析对应平台歌曲（仅对本账号生效）。' }}
          </p>
        </div>
        <div class="platform-switch-list">
          <div v-for="p in platformOptionsForDisplayRow(expandedDisplayRow)" :key="p.id" class="platform-switch-item">
            <div class="platform-switch-left">
              <span class="platform-badge" :class="p.badgeClass || `plat-${p.id}`">{{ p.short }}</span>
              <div class="platform-switch-meta">
                <div class="platform-switch-name">
                  {{ p.label }}
                  <span v-if="p.code" class="platform-code">{{ p.code }}</span>
                </div>
                <div
                  class="platform-switch-status"
                  :class="{ on: isDisplayPlatformOn(expandedDisplayRow, p), auto: isDisplayPlatformAutoClosed(expandedDisplayRow, p) }"
                >
                  {{ displayPlatformStatus(expandedDisplayRow, p) }}
                </div>
              </div>
            </div>
            <label class="toggle">
              <input
                type="checkbox"
                :checked="isDisplayPlatformOn(expandedDisplayRow, p)"
                @change="toggleDisplayPlatform(expandedDisplayRow, p, $event.target.checked)"
              />
              <span class="slider"></span>
            </label>
          </div>
          <p v-if="!platformOptionsForDisplayRow(expandedDisplayRow).length" class="platform-switch-tip">
            暂无平台声明；合集音源请先激活，或检查插件是否已导入完整。
          </p>
        </div>
      </div>
    </Teleport>

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
import { ref, reactive, computed, onMounted, onActivated, onUnmounted, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api.js'
import {
  loadCoverStyle,
  loadPlayerSettings,
  setAutoMatchOnPlay,
  PLAYER_AUTO_MATCH_ON_PLAY_KEY,
  PLAYER_PLAY_QUALITY_KEY,
  PLAYER_SMOOTH_STREAM_KEY,
  PLAYER_AUDIO_CACHE_ENABLED_KEY,
  PLAYER_AUDIO_CACHE_MAX_MB_KEY,
  AUDIO_CACHE_MAX_MB_OPTIONS,
  PLAY_QUALITY_OPTIONS,
  normalizePlayQuality,
  getAudioCacheStats,
  clearAudioCache,
  formatCacheBytes,
} from '../stores/player.js'
import { scanLibrary, libraryScanning, PLAYLIST_REMOTE_SYNC_DAYS_KEY, setPlaylistRemoteSyncDays, getPlaylistRemoteSyncDays, LIBRARY_SONG_COLUMNS_KEY, setLibrarySongColumns, normalizeLibrarySongColumns, setLibraryHotUpdateEnabled } from '../stores/library.js'
import { reloadSearchSources } from '../stores/search.js'
import { reloadDiscoverSources } from '../stores/discover.js'
import { applySourceFallbackMode, SOURCE_FALLBACK_MODE_KEY } from '../stores/sourceFallback.js'
import { isAdmin as isAdminUser, currentUser as currentAuthUser, patchLocalUser } from '../utils/auth.js'
import { canPickFolder, pickFolder } from '../utils/fnos.js'
import { appAlert, appConfirm, appPrompt } from '../stores/appDialog.js'
import { applyTheme, theme as currentTheme, THEME_KEY, COLOR_SCHEME_KEY, CUSTOM_COLOR_KEY, COLOR_SCHEME_OPTIONS, applyColorScheme, setCustomColor, normalizeHex, colorScheme as currentColorScheme, customColor as currentCustomColor } from '../utils/theme.js'
import {
  LYRIC_COLOR_PRESETS,
  LYRIC_PRESET_KEY,
  LYRIC_TEXT_KEY,
  LYRIC_HIGHLIGHT_KEY,
  applyLyricColors,
  lyricColorPreset as currentLyricPreset,
  lyricTextColor as currentLyricTextColor,
  lyricHighlightColor as currentLyricHighlightColor,
} from '../utils/lyricColors.js'
import AppSelect from '../components/AppSelect.vue'
import { applyDirToggle, isDirChecked, isDirPathUnder, normalizeDirPath } from '../utils/dirTreeExpand.js'
import {
  PLATFORM_ORDER,
  PLATFORM_LABELS,
  ENABLED_PLATFORMS_KEY,
  parseSourcePlatformMap,
  serializeSourcePlatformMap,
  platformsOfSource,
  orderPlatformKeys,
} from '../utils/platforms.js'
import {
  buildSourceDisplayRows,
  memberPlatformLabel,
  rowMemberIds,
  isRowPartiallyActive,
  isRowAnyActive,
} from '../utils/sourceFamily.js'

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
const playlistBatchSizeOptions = [50, 100, 200, 300, 500, 1000].map((n) => ({
  value: String(n),
  label: `${n} 首`,
}))
const playlistIntervalOptions = [
  { value: '1', label: '1 小时' },
  { value: '3', label: '3 小时' },
  { value: '6', label: '6 小时' },
  { value: '12', label: '12 小时' },
  { value: '24', label: '1 天' },
  { value: '48', label: '2 天' },
]
const playQualityOptions = PLAY_QUALITY_OPTIONS
const PLAY_QUALITY_KEY = PLAYER_PLAY_QUALITY_KEY
const AUDIO_CACHE_ENABLED_KEY = PLAYER_AUDIO_CACHE_ENABLED_KEY
const AUDIO_CACHE_MAX_MB_KEY = PLAYER_AUDIO_CACHE_MAX_MB_KEY
const audioCacheMaxMbOptions = AUDIO_CACHE_MAX_MB_OPTIONS
const audioCacheStatsText = ref('用量加载中…')
const audioCacheClearing = ref(false)
const tagMatchConcurrencyOptions = Array.from({ length: 6 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1} 路`,
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
  { value: 'overwrite', label: '下载并并存' },
]
const librarySongColumnsOptions = [
  { value: '2', label: '两列' },
  { value: '3', label: '三列' },
  { value: '4', label: '四列' },
]
const DOWNLOAD_GROUP_BY_KEY = 'download.savePathGroupBy'
const AUTO_MATCH_ON_PLAY_KEY = PLAYER_AUTO_MATCH_ON_PLAY_KEY
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
const editUserForm = reactive({ displayName: '', role: 'user', downloadPathPolicy: 'choose', allowDownload: 'true' })
const allowDownloadOptions = [
  { value: 'true', label: '允许' },
  { value: 'false', label: '禁止' },
]
const resetPasswordUser = ref(null)
const resetPasswordForm = reactive({ password: '', confirm: '' })
const resetPasswordSaving = ref(false)
const deleteConfirmUser = ref(null)
const deletingUser = ref(false)
const accountSaving = ref(false)
const backupBusy = ref(false)
const backupMerge = ref(false)
const backupFileInput = ref(null)
const passwordChanging = ref(false)
const accountForm = reactive({
  username: '',
  displayName: '',
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
})
const newUser = reactive({
  username: '',
  displayName: '',
  password: '',
  role: 'user',
  downloadPathPolicy: 'choose',
  allowDownload: 'true',
})

const settings = reactive({})
const sourceList = ref([])
const activeSourceIds = ref([])
const fileInput = ref(null)
const toast = ref(null)
const importMode = ref('file')
const importUrl = ref('')
const importingUrl = ref(false)
const importingFiles = ref(false)
const importElapsedSec = ref(0)
let importElapsedTimer = 0

function startImportElapsed() {
  importElapsedSec.value = 0
  if (importElapsedTimer) clearInterval(importElapsedTimer)
  importElapsedTimer = window.setInterval(() => {
    importElapsedSec.value += 1
  }, 1000)
}

function stopImportElapsed() {
  if (importElapsedTimer) {
    clearInterval(importElapsedTimer)
    importElapsedTimer = 0
  }
  importElapsedSec.value = 0
}

function formatImportWait(sec) {
  const n = Math.max(0, Number(sec) || 0)
  if (n < 60) return `导入中 ${n}s`
  const m = Math.floor(n / 60)
  const s = n % 60
  return `导入中 ${m}:${String(s).padStart(2, '0')}`
}

const importingUrlLabel = computed(() => (
  importingUrl.value ? formatImportWait(importElapsedSec.value) : '导入'
))
const importingFilesLabel = computed(() => (
  importingFiles.value ? formatImportWait(importElapsedSec.value) : '选择文件'
))
const checkingSourceUpdates = ref(false)
const sourceUpdatingId = ref('')
const sourceUpdatingAll = ref(false)
const sourceUpdateMap = ref({})
const sourceUpdateSummary = ref('')
function sourceCanApplyUpdate(id) {
  const u = sourceUpdateMap.value[id]
  return Boolean(u?.hasUpdate && /^https?:\/\//i.test(String(u.updateUrl || '')))
}

const outdatedSourceCount = computed(() =>
  sourceList.value.filter((s) => sourceCanApplyUpdate(s.id)).length,
)
const selectedSourceIds = ref([])
const sourceBatchBusy = ref('')
const sourceDisplayRows = computed(() => buildSourceDisplayRows(sourceList.value))
const allSourcesSelected = computed(() => {
  const ids = sourceList.value.map((s) => s.id)
  return ids.length > 0 && ids.every((id) => selectedSourceIds.value.includes(id))
})
const someSourcesSelected = computed(() => selectedSourceIds.value.length > 0)

function isSourceSelected(id) {
  return selectedSourceIds.value.includes(id)
}

function toggleSourceSelected(id) {
  if (!id) return
  if (selectedSourceIds.value.includes(id)) {
    selectedSourceIds.value = selectedSourceIds.value.filter((x) => x !== id)
  } else {
    selectedSourceIds.value = [...selectedSourceIds.value, id]
  }
}

function isDisplayRowSelected(row) {
  const ids = rowMemberIds(row)
  return ids.length > 0 && ids.every((id) => selectedSourceIds.value.includes(id))
}

function toggleDisplayRowSelected(row) {
  const ids = rowMemberIds(row)
  if (!ids.length) return
  if (isDisplayRowSelected(row)) {
    const drop = new Set(ids)
    selectedSourceIds.value = selectedSourceIds.value.filter((id) => !drop.has(id))
  } else {
    selectedSourceIds.value = [...new Set([...selectedSourceIds.value, ...ids])]
  }
}

function toggleSelectAllSources(ev) {
  selectedSourceIds.value = ev.target.checked ? sourceList.value.map((s) => s.id) : []
}
/** 正在激活/停用的音源 id，避免无反馈空等像卡死 */
const sourceBusyId = ref('')
const exportingSourceId = ref('')
const exportingAllSources = ref(false)
const PLATFORM_SHORT = {
  tx: 'QQ', wy: '云', kw: '酷', kg: '狗', mg: '咪',
  qs: '汽', bili: 'B', ytb: 'YT', xm: '喜',
}
/** @type {import('vue').Ref<Record<string, string[]>>} */
const sourcePlatformMap = ref({})
const expandedSourceId = ref('')
const platformPopoverStyle = ref({})
const expandedDisplayRow = computed(() => (
  sourceDisplayRows.value.find((row) => row.id === expandedSourceId.value) || null
))
/** @deprecated 兼容旧引用：展开合集时取 primary */
const expandedSource = computed(() => expandedDisplayRow.value?.primary || null)

function activeIdsSnapshot() {
  return activeSourceIds.value
}

function isDisplayRowActive(row) {
  return isRowAnyActive(row, activeIdsSnapshot())
}

function isDisplayRowPartial(row) {
  return isRowPartiallyActive(row, activeIdsSnapshot())
}

function isDisplayRowBusy(row) {
  const busy = sourceBusyId.value
  if (!busy) return false
  if (busy === row?.id) return true
  return rowMemberIds(row).includes(busy)
}

function isDisplayRowUpdating(row) {
  const id = sourceUpdatingId.value
  if (!id) return false
  return id === row?.id || rowMemberIds(row).includes(id)
}

function displayRowMeta(row) {
  const parts = []
  if (row?.author) parts.push(row.author)
  if (row?.version) parts.push(`v${row.version}`)
  if (row?.type === 'group') {
    const total = row.members?.length || 0
    const on = (row.members || []).filter((m) => isSourceActive(m.id)).length
    parts.push(total ? `平台 ${on}/${total}` : '合集')
  } else if (row?.primary) {
    parts.push(sourcePlatformSummary(row.primary))
  }
  return parts.filter(Boolean).join(' · ')
}

function displayRowHealthLevel(row) {
  const levels = (row?.members || []).map((m) => m?.health?.level).filter(Boolean)
  if (levels.includes('mixed')) return 'mixed'
  if (levels.includes('preview') && levels.some((l) => l !== 'preview' && l !== 'unknown')) return 'mixed'
  if (levels.includes('preview')) return 'preview'
  return ''
}

function displayRowUnhealthy(row) {
  return (row?.members || []).some((m) => m?.health?.unhealthy)
}

function displayRowHealthBadge(row) {
  if (!displayRowUnhealthy(row)) return ''
  const level = displayRowHealthLevel(row)
  if (level === 'mixed') return '部分平台试听'
  const badge = (row?.members || []).find((m) => m?.health?.badge)?.health?.badge
  return badge || (level === 'preview' ? '多为试听' : '')
}

function displayRowHealthTip(row) {
  if (!displayRowUnhealthy(row)) return ''
  const tips = (row?.members || [])
    .map((m) => m?.health?.tip)
    .filter(Boolean)
  return [...new Set(tips)].join('；')
}

function displayRowAutoCloseNotice(row) {
  const names = []
  for (const m of row?.members || []) {
    for (const p of autoClosedList(m)) {
      const label = p.label || memberPlatformLabel(m) || p.id
      if (label) names.push(label)
    }
  }
  if (!names.length) return ''
  return `${[...new Set(names)].join('、')} 为试听源，已自动关闭平台解析`
}

function displayRowCanUpdate(row) {
  return rowMemberIds(row).some((id) => sourceCanApplyUpdate(id))
}

function displayRowUpdateTip(row) {
  for (const id of rowMemberIds(row)) {
    const tip = sourceUpdateTip(id)
    if (tip) return tip
  }
  return ''
}

function displayRowUpdateLog(row) {
  for (const id of rowMemberIds(row)) {
    const log = sourceUpdateMap.value[id]?.log
    if (log) return log
  }
  return ''
}

async function activateDisplayRow(row) {
  const ids = rowMemberIds(row).filter((id) => !isSourceActive(id))
  if (!ids.length) return
  if (ids.length === 1 && row.type === 'solo') {
    await activateSource(ids[0])
    return
  }
  if (sourceBusyId.value || sourceBatchBusy.value) {
    if (sourceBusyId.value !== row.id) showToast('请等待当前音源操作完成', 'info')
    return
  }
  sourceBusyId.value = row.id
  sourceBatchBusy.value = 'activate'
  try {
    const res = await api.source.activateBatch(ids)
    if (Array.isArray(res?.activeIds)) syncActiveIdsFromServer(res.activeIds)
    const okMap = new Map((res.results || []).map((r) => [r.id, r]))
    sourceList.value = sourceList.value.map((s) => {
      const hit = okMap.get(s.id)
      return {
        ...s,
        active: activeSourceIds.value.includes(s.id),
        sources: hit?.sources || s.sources,
        name: hit?.name || s.name,
      }
    })
    sourcePlatformMap.value = mergeDeclaredPlatformsIntoMap(sourcePlatformMap.value)
    schedulePersistEnabledPlatforms()
    const failed = res.errors?.length || 0
    if (failed && res.results?.length) showToast(`已激活部分平台，失败 ${failed} 个`, 'error')
    else if (failed) showToast(res.errors[0]?.error || '激活失败', 'error')
    else showToast(row.type === 'group' ? `已激活「${row.name}」` : '音源已激活', 'success')
  } catch (e) {
    showToast(e.message || '激活失败', 'error')
  } finally {
    sourceBusyId.value = ''
    sourceBatchBusy.value = ''
  }
  refreshPlatformTabsLater()
}

async function deactivateDisplayRow(row) {
  const ids = rowMemberIds(row).filter((id) => isSourceActive(id))
  if (!ids.length) return
  if (ids.length === 1 && row.type === 'solo') {
    await deactivateSource(ids[0])
    return
  }
  if (sourceBusyId.value || sourceBatchBusy.value) {
    showToast('请等待当前音源操作完成', 'info')
    return
  }
  sourceBusyId.value = row.id
  sourceBatchBusy.value = 'deactivate'
  try {
    const res = await api.source.deactivateBatch(ids)
    if (Array.isArray(res?.activeIds)) syncActiveIdsFromServer(res.activeIds)
    else syncActiveIdsFromServer(activeSourceIds.value.filter((id) => !ids.includes(id)))
    showToast(row.type === 'group' ? `已停用「${row.name}」` : '音源已停用', 'success')
  } catch (e) {
    showToast(e.message || '停用失败', 'error')
  } finally {
    sourceBusyId.value = ''
    sourceBatchBusy.value = ''
  }
  refreshPlatformTabsLater()
}

async function removeDisplayRow(row) {
  const ids = rowMemberIds(row)
  if (!ids.length || !isAdminUser.value) return
  if (row.type === 'solo') {
    await removeSource(ids[0])
    return
  }
  const ok = await appConfirm({
    title: '删除合集音源',
    message: `确定删除「${row.name}」？将移除其中 ${ids.length} 个平台插件，此操作不可恢复。`,
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  if (sourceBatchBusy.value) return
  sourceBatchBusy.value = 'delete'
  sourceBusyId.value = row.id
  try {
    const res = await api.source.removeBatch(ids)
    const deleted = new Set(res.deleted || ids)
    sourceList.value = sourceList.value.filter((s) => !deleted.has(s.id))
    if (Array.isArray(res.activeIds)) activeSourceIds.value = res.activeIds
    else activeSourceIds.value = activeSourceIds.value.filter((id) => !deleted.has(id))
    dropSelectedSourceIds([...deleted])
    if (expandedSourceId.value === row.id) expandedSourceId.value = ''
    const nextMap = { ...sourcePlatformMap.value }
    let mapChanged = false
    for (const id of deleted) {
      if (Object.prototype.hasOwnProperty.call(nextMap, id)) {
        delete nextMap[id]
        mapChanged = true
      }
    }
    if (mapChanged) {
      sourcePlatformMap.value = nextMap
      schedulePersistEnabledPlatforms()
    }
    showToast(`已删除「${row.name}」`, 'success')
    await refreshPlatformTabs()
  } catch (e) {
    showToast(e.message || '删除失败', 'error')
  } finally {
    sourceBusyId.value = ''
    sourceBatchBusy.value = ''
  }
}

async function dismissDisplayRowHealth(row) {
  const targets = (row?.members || []).filter((m) => m?.health?.unhealthy || autoClosedList(m).length)
  if (!targets.length) return
  try {
    for (const m of targets) {
      await api.source.dismissHealth(m.id)
    }
    const cleared = new Set(targets.map((m) => m.id))
    sourceList.value = sourceList.value.map((item) => (
      cleared.has(item.id)
        ? { ...item, health: item.health ? { ...item.health, unhealthy: false, tip: '', badge: '', autoClosedPlatforms: [] } : null }
        : item
    ))
    showToast('已关闭该音源健康提示', 'info')
  } catch (e) {
    showToast(e.message || '操作失败', 'error')
  }
}

async function applyDisplayRowUpdate(row) {
  const targets = (row?.members || []).filter((m) => sourceCanApplyUpdate(m.id))
  if (!targets.length || sourceUpdatingId.value || sourceUpdatingAll.value) return
  if (targets.length === 1) {
    await applySourceUpdate(targets[0])
    return
  }
  sourceUpdatingId.value = row.id
  let okCount = 0
  try {
    for (const m of targets) {
      const id = m.id
      const hint = sourceUpdateMap.value[id]
      try {
        const res = await api.source.updateSource(id, hint?.updateUrl || '')
        if (res.error) throw new Error(res.error)
        markSourceUpdated(id)
        okCount += 1
      } catch {
        /* 继续更新其余平台插件 */
      }
    }
    sourceList.value = await api.source.list()
    showToast(okCount ? `已更新 ${okCount} 个平台插件` : '更新失败', okCount ? 'success' : 'error')
  } finally {
    sourceUpdatingId.value = ''
  }
}

function platformOptionsForDisplayRow(row) {
  if (!row) return []
  if (row.type !== 'group') return platformOptionsForSource(row.primary)
  return (row.members || []).map((m) => {
    const plats = platformsOfSource(m)
    const platformId = plats[0] || ''
    const label = memberPlatformLabel(m)
    const short = PLATFORM_SHORT[platformId] || String(label).slice(0, 1) || '?'
    return {
      id: m.id,
      memberId: m.id,
      platformId,
      label,
      short,
      code: platformId || undefined,
      badgeClass: platformId ? `plat-${platformId}` : 'plat-generic',
    }
  })
}

function isDisplayPlatformOn(row, p) {
  if (!row || !p) return false
  if (row.type === 'group') {
    const mid = p.memberId || p.id
    if (!isSourceActive(mid)) return false
    const m = (row.members || []).find((x) => x.id === mid)
    if (!m) return false
    const plats = platformsOfSource(m)
    if (!plats.length) return true
    if (p.platformId) return isSourcePlatformOn(mid, p.platformId)
    return plats.some((id) => isSourcePlatformOn(mid, id))
  }
  return isSourcePlatformOn(row.primary.id, p.id)
}

function isDisplayPlatformAutoClosed(row, p) {
  if (row?.type === 'group') {
    const m = (row.members || []).find((x) => x.id === (p.memberId || p.id))
    if (!m) return false
    if (p.platformId) return isAutoClosedPlatform(m, p.platformId)
    return autoClosedList(m).length > 0 && !isSourceActive(m.id)
  }
  return isAutoClosedPlatform(row.primary, p.id)
}

function displayPlatformStatus(row, p) {
  if (isDisplayPlatformOn(row, p)) return '允许解析'
  if (isDisplayPlatformAutoClosed(row, p)) return '试听源，已自动关闭'
  if (row?.type === 'group' && !isSourceActive(p.memberId || p.id)) return '未激活'
  return '已关闭'
}

async function toggleDisplayPlatform(row, p, on) {
  if (!row || !p) return
  if (row.type === 'group') {
    const mid = p.memberId || p.id
    const m = (row.members || []).find((x) => x.id === mid)
    if (!m) return
    if (on) {
      if (!isSourceActive(mid)) await activateSource(mid)
      const plats = platformsOfSource(m)
      const pid = p.platformId || plats[0]
      if (pid) toggleSourcePlatform(m, pid, true)
    } else if (isSourceActive(mid)) {
      await deactivateSource(mid)
    }
    return
  }
  toggleSourcePlatform(row.primary, p.id, on)
}

async function setDisplayRowPlatformsAll(row, on) {
  if (!row) return
  if (row.type === 'group') {
    if (on) await activateDisplayRow(row)
    else await deactivateDisplayRow(row)
    return
  }
  setSourcePlatformsAll(row.primary, on)
}

const settingsPageRef = ref(null)
const settingsPanelRef = ref(null)
const settingsNavRef = ref(null)
let platformSaveTimer = 0

/** 进入设置页时从页头显示（含 keep-alive 再进入、外层 .content 残留滚动） */
function scrollSettingsToTop() {
  nextTick(() => {
    requestAnimationFrame(() => {
      settingsPanelRef.value?.scrollTo?.({ top: 0, left: 0 })
      settingsNavRef.value?.scrollTo?.({ top: 0, left: 0 })
      let node = settingsPageRef.value
      while (node) {
        if (node.scrollTop > 0) node.scrollTop = 0
        node = node.parentElement
      }
      try {
        window.scrollTo(0, 0)
      } catch {}
    })
  })
}
const musicPaths = ref([])
const sharedMusicPaths = ref([])
const personalMusicPaths = ref([])
const downloadPath = ref('')
const sharedDownloadPath = ref('')
const personalDownloadPath = ref('')
const downloadPathMode = ref('shared')
const downloadPathPolicy = ref('choose')
const canChooseDownloadPath = ref(true)
const newPath = ref('')
const editingPath = ref('')
const editPathValue = ref('')
const editFromPicker = ref(false)
const downloadPathModeOptions = [
  { value: 'shared', label: '管理员路径' },
  { value: 'personal', label: '专属路径' },
]
const downloadPathPolicyOptions = [
  { value: 'shared', label: '使用管理员路径' },
  { value: 'personal', label: '使用专属路径' },
  { value: 'choose', label: '允许用户自行选择' },
]
const showPersonalMusicSection = computed(() => downloadPathMode.value === 'personal')
const fnosAvailable = ref(false)
const pickingFolder = ref(false)
const activeTab = ref('paths')
const needsPathSetup = ref(false)
const pathsRuntimeIsContainer = ref(false)
const mountInfo = ref(null)
const mountProbeText = ref('')
const ffmpegStatus = ref({
  available: false,
  path: '',
  enabled: false,
  settingEnabled: false,
  settingDisabled: false,
  source: 'none',
  installHint: '',
  steps: [],
})
const ffmpegInstall = ref({
  phase: 'idle',
  progress: 0,
  message: '',
  error: '',
  running: false,
})
const ffmpegBusy = ref('')
let ffmpegPollTimer = 0
const ffmpegStatusLabel = computed(() => {
  if (ffmpegInstall.value.running) return ffmpegInstall.value.message || '准备中…'
  if (ffmpegInstall.value.phase === 'error') return ffmpegInstall.value.error || '准备失败'
  if (ffmpegStatus.value.settingDisabled) return '已停用相关功能'
  if (ffmpegStatus.value.enabled) {
    if (ffmpegStatus.value.source === 'system') return '可用 · 系统自带'
    if (ffmpegStatus.value.source === 'managed') return '可用 · 便携版回退'
    return '可用'
  }
  return '未就绪（不用 APE / DSD / 情绪分析可忽略；要用时再点「检测并准备」）'
})
const ffmpegStatusClass = computed(() => {
  if (ffmpegInstall.value.phase === 'error') return 'ffmpeg-bad'
  if (ffmpegStatus.value.settingDisabled) return 'ffmpeg-warn'
  if (ffmpegStatus.value.enabled) return 'ffmpeg-ok'
  if (ffmpegInstall.value.running) return 'ffmpeg-warn'
  return 'ffmpeg-bad'
})
const libraryStats = ref(null)
const libraryStatsLoading = ref(false)
const scanAutoMode = ref('all')
const autoScanDirs = ref([])
const scanWatchEnabled = ref(true)
const scanWatchIntervalSec = ref(300)
const scanWatchIntervalOptions = [
  { value: 60, label: '1 分钟' },
  { value: 120, label: '2 分钟' },
  { value: 300, label: '5 分钟（推荐）' },
  { value: 600, label: '10 分钟' },
  { value: 900, label: '15 分钟' },
  { value: 1800, label: '30 分钟' },
  { value: 3600, label: '60 分钟' },
]
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
    { id: 'account', label: '账号管理' },
    { id: 'paths', label: '文件路径' },
    { id: 'source', label: '音源管理' },
    { id: 'tag', label: '标签管理' },
    { id: 'appearance', label: '风格样式' },
    { id: 'download', label: '试听下载' },
  ]
  return all
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

function resolveSettingsTab(id) {
  const aliases = { users: 'account', mail: 'account', embed: 'download', lrc: 'download' }
  const mapped = aliases[id] || id
  if (mapped && tabs.value.some(t => t.id === mapped)) return mapped
  return ''
}
const customPreview = computed(() => normalizeHex(settings[CUSTOM_COLOR_KEY] || currentCustomColor.value))
const lyricTextPreview = computed(() => {
  const presetId = settings[LYRIC_PRESET_KEY]
  const preset = LYRIC_COLOR_PRESETS.find((p) => p.id === presetId)
  if (preset && preset.id !== 'custom' && preset.text) return preset.text
  return normalizeHex(settings[LYRIC_TEXT_KEY] || currentLyricTextColor.value, '#ffffff')
})
const lyricHighlightPreview = computed(() => {
  const presetId = settings[LYRIC_PRESET_KEY]
  const preset = LYRIC_COLOR_PRESETS.find((p) => p.id === presetId)
  if (preset && preset.id !== 'custom' && preset.highlight) return preset.highlight
  return normalizeHex(settings[LYRIC_HIGHLIGHT_KEY] || currentLyricHighlightColor.value, '#ffffff')
})

watch(currentTheme, (v) => {
  settings[THEME_KEY] = v
})

watch(currentColorScheme, (v) => {
  settings[COLOR_SCHEME_KEY] = v
})

watch(currentLyricPreset, (v) => {
  settings[LYRIC_PRESET_KEY] = v
})
watch(currentLyricTextColor, (v) => {
  settings[LYRIC_TEXT_KEY] = v
})
watch(currentLyricHighlightColor, (v) => {
  settings[LYRIC_HIGHLIGHT_KEY] = v
})

watch(tabs, (list) => {
  if (!list.some(t => t.id === activeTab.value)) {
    activeTab.value = list[0]?.id || 'account'
  }
}, { immediate: true })

watch(activeTab, async (tab) => {
  settingsPanelRef.value?.scrollTo?.({ top: 0, left: 0 })
  closeSourcePlatformPanel()
  if (tab === 'paths' && musicPaths.value.length) {
    loadLibraryStats()
    await loadScanSettings()
    initScanTreeExpansion()
  }
  if (tab === 'paths' && isAdminUser.value) loadFfmpegStatus()
  if (tab === 'account') {
    loadAccountInfo()
    if (isAdminUser.value) loadManagedUsers()
  }
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
  accountForm.username = currentAuthUser.value?.username || ''
  accountForm.displayName = currentAuthUser.value?.displayName || currentAuthUser.value?.username || ''
  accountForm.oldPassword = ''
  accountForm.newPassword = ''
  accountForm.confirmPassword = ''
}

async function loadAccountInfo() {
  syncAccountFormFromUser()
  try {
    const res = await api.auth.me()
    if (res.user) patchLocalUser(res.user)
    syncAccountFormFromUser()
  } catch {}
}

async function saveAccountProfile() {
  const username = accountForm.username.trim()
  const name = accountForm.displayName.trim()
  if (!username) {
    showToast('用户名不能为空', 'error')
    return
  }
  if (!name) {
    showToast('显示名称不能为空', 'error')
    return
  }
  accountSaving.value = true
  try {
    const res = await api.auth.updateProfile({ username, displayName: name })
    if (res.user) patchLocalUser(res.user)
    showToast('已保存', 'success')
  } catch (e) {
    showToast(e.message || '保存失败', 'error')
  } finally {
    accountSaving.value = false
  }
}

async function exportBackup() {
  if (backupBusy.value) return
  backupBusy.value = true
  try {
    const res = await api.backup.export()
    const payload = res?.data || res
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `lemon-music-backup-${stamp}.json`
    a.click()
    URL.revokeObjectURL(url)
    showToast('备份已导出', 'success')
  } catch (e) {
    showToast(e.message || '导出失败', 'error')
  } finally {
    backupBusy.value = false
  }
}

function triggerImportBackup() {
  backupFileInput.value?.click()
}

async function onImportBackupFile(ev) {
  const file = ev.target?.files?.[0]
  if (ev.target) ev.target.value = ''
  if (!file || backupBusy.value) return
  backupBusy.value = true
  try {
    const text = await file.text()
    const parsed = JSON.parse(text)
    const mode = backupMerge.value ? 'merge' : 'replace'
    const res = await api.backup.import(parsed, mode)
    const imported = res?.imported || {}
    const parts = [
      `歌单 ${imported.playlists || 0}`,
      `收藏 ${imported.favorites || 0}`,
      `设置 ${imported.settings || 0}`,
    ]
    if (imported.sources) parts.push(`音源 ${imported.sources}`)
    if (imported.podcasts) parts.push(`播客 ${imported.podcasts}`)
    showToast(`导入完成：${parts.join('、')}`, 'success')
    if (imported.sources) {
      reloadSearchSources()
      reloadDiscoverSources()
    }
  } catch (e) {
    showToast(e.message || '导入失败', 'error')
  } finally {
    backupBusy.value = false
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
      role: newUser.role,
      downloadPathPolicy: newUser.downloadPathPolicy || 'choose',
      allowDownload: newUser.role === 'admin' ? true : newUser.allowDownload !== 'false',
    })
    newUser.username = ''
    newUser.displayName = ''
    newUser.password = ''
    newUser.role = 'user'
    newUser.downloadPathPolicy = 'choose'
    newUser.allowDownload = 'true'
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
  editUserForm.role = user.role || 'user'
  editUserForm.downloadPathPolicy = ['shared', 'personal', 'choose'].includes(user.downloadPathPolicy)
    ? user.downloadPathPolicy
    : 'choose'
  editUserForm.allowDownload = user.role === 'admin' || !(user.allowDownload === false || user.downloadAllowed === false)
    ? 'true'
    : 'false'
}

function cancelManagedUserEdit() {
  editingUserId.value = null
}

function downloadAllowedLabel(user) {
  if (user?.role === 'admin') return '始终允许'
  if (user?.allowDownload === false || user?.downloadAllowed === false) return '禁止'
  return '允许'
}

const LAST_ADMIN_ROLE_TIP = '不能修改为普通用户，已经没有其他管理员账号'

function adminUserCount() {
  return managedUsers.value.filter(u => u.role === 'admin').length
}

function wouldLeaveNoAdmin(userId, nextRole) {
  const user = managedUsers.value.find(u => u.id === userId)
  if (!user) return false
  return user.role === 'admin' && nextRole !== 'admin' && adminUserCount() <= 1
}

function onEditUserRoleChange(role) {
  if (!wouldLeaveNoAdmin(editingUserId.value, role)) return
  editUserForm.role = 'admin'
  showToast(LAST_ADMIN_ROLE_TIP, 'error')
}

async function saveManagedUserEdit() {
  if (!editingUserId.value) return
  if (wouldLeaveNoAdmin(editingUserId.value, editUserForm.role)) {
    editUserForm.role = 'admin'
    showToast(LAST_ADMIN_ROLE_TIP, 'error')
    return
  }
  userUpdating.value = true
  try {
    const res = await api.auth.updateUser(editingUserId.value, {
      displayName: editUserForm.displayName.trim(),
      role: editUserForm.role,
      downloadPathPolicy: editUserForm.downloadPathPolicy,
      allowDownload: editUserForm.role === 'admin' ? true : editUserForm.allowDownload !== 'false',
    })
    const idx = managedUsers.value.findIndex(u => u.id === editingUserId.value)
    if (idx >= 0 && res.user) managedUsers.value[idx] = res.user
    if (editingUserId.value === currentAuthUser.value?.id && res.user) {
      patchLocalUser(res.user)
      await loadPaths()
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
  if (user?.role === 'admin' && adminUserCount() <= 1) {
    showToast('不能删除，已经没有其他管理员账号', 'error')
    return
  }
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
    scanWatchEnabled.value = res.data?.watchEnabled !== false
    setLibraryHotUpdateEnabled(scanWatchEnabled.value)
    const interval = Number(res.data?.watchIntervalSec)
    scanWatchIntervalSec.value = Number.isFinite(interval) ? interval : 300
  } catch {}
}

async function saveScanSettings() {
  try {
    const res = await api.library.scanSettings.save({
      autoMode: scanAutoMode.value,
      autoDirs: autoScanDirs.value,
      watchEnabled: scanWatchEnabled.value,
      watchIntervalSec: Number(scanWatchIntervalSec.value) || 300,
    })
    autoScanDirs.value = res.data?.autoDirs || []
    scanWatchEnabled.value = res.data?.watchEnabled !== false
    setLibraryHotUpdateEnabled(scanWatchEnabled.value)
    const interval = Number(res.data?.watchIntervalSec)
    if (Number.isFinite(interval)) scanWatchIntervalSec.value = interval
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
  const id = resolveSettingsTab(String(tab || '').trim())
  if (id) activeTab.value = id
})

onMounted(async () => {
  scrollSettingsToTop()
  const tabFromQuery = resolveSettingsTab(String(route.query.tab || '').trim())
  if (tabFromQuery) {
    activeTab.value = tabFromQuery
  }
  try {
    fnosAvailable.value = await canPickFolder()
  } catch {}
  try {
    const s = await api.settings.get()
    Object.assign(settings, s)
    activeSourceIds.value = parseActiveIds(settings['source.active'])
    if (!settings['tag.matchConcurrency']) settings['tag.matchConcurrency'] = '3'
    else settings['tag.matchConcurrency'] = String(Math.min(6, Math.max(1, parseInt(settings['tag.matchConcurrency'], 10) || 3)))
    if (settings['tag.matchPreferFolderAlbum'] == null) settings['tag.matchPreferFolderAlbum'] = 'true'
    if (settings['tag.matchFillMissingOnly'] == null) settings['tag.matchFillMissingOnly'] = 'true'
    if (settings['tag.matchRejectForeignArtist'] == null) settings['tag.matchRejectForeignArtist'] = 'true'
    if (!settings['player.coverStyle']) settings['player.coverStyle'] = 'disc'
    if (settings['player.visualizer'] == null) settings['player.visualizer'] = 'true'
    if (settings[PLAYER_SMOOTH_STREAM_KEY] == null) {
      // 与播放器一致：iOS 默认开，并写入设置避免开关状态漂移
      try {
        const { isIosLikeDevice } = await import('../utils/device.js')
        settings[PLAYER_SMOOTH_STREAM_KEY] = isIosLikeDevice() ? 'true' : 'false'
      } catch {
        settings[PLAYER_SMOOTH_STREAM_KEY] = 'false'
      }
      try {
        await api.settings.update({ [PLAYER_SMOOTH_STREAM_KEY]: settings[PLAYER_SMOOTH_STREAM_KEY] })
      } catch {}
    }
    if (settings[AUDIO_CACHE_ENABLED_KEY] == null) settings[AUDIO_CACHE_ENABLED_KEY] = 'true'
    const allowedMb = audioCacheMaxMbOptions.map((o) => o.value)
    if (!allowedMb.includes(String(settings[AUDIO_CACHE_MAX_MB_KEY] || ''))) {
      settings[AUDIO_CACHE_MAX_MB_KEY] = '512'
    }
    settings[PLAY_QUALITY_KEY] = normalizePlayQuality(settings[PLAY_QUALITY_KEY])
    refreshAudioCacheStats()
    if (settings['download.isUseOtherSource'] == null) settings['download.isUseOtherSource'] = 'true'
    if (!settings[THEME_KEY]) settings[THEME_KEY] = currentTheme.value
    if (!settings[COLOR_SCHEME_KEY]) settings[COLOR_SCHEME_KEY] = currentColorScheme.value
    if (!settings[CUSTOM_COLOR_KEY]) settings[CUSTOM_COLOR_KEY] = currentCustomColor.value
    if (!settings[LYRIC_PRESET_KEY]) settings[LYRIC_PRESET_KEY] = currentLyricPreset.value
    if (!settings[LYRIC_TEXT_KEY]) settings[LYRIC_TEXT_KEY] = currentLyricTextColor.value
    if (!settings[LYRIC_HIGHLIGHT_KEY]) settings[LYRIC_HIGHLIGHT_KEY] = currentLyricHighlightColor.value
    if (!settings[SOURCE_FALLBACK_MODE_KEY]) settings[SOURCE_FALLBACK_MODE_KEY] = 'auto'
    applySourceFallbackMode(settings[SOURCE_FALLBACK_MODE_KEY])
    syncEnabledPlatformsFromSettings()
    setAutoMatchOnPlay(settings[AUTO_MATCH_ON_PLAY_KEY] === 'true')
    if (!settings[DOWNLOAD_GROUP_BY_KEY]) {
      settings[DOWNLOAD_GROUP_BY_KEY] = settings['download.isSavePathGroupByListName'] === 'true' ? 'album' : 'none'
    }
    if (!settings['download.playlistBatchSize'] || !['50', '100', '200', '300', '500', '1000'].includes(String(settings['download.playlistBatchSize']))) {
      settings['download.playlistBatchSize'] = '50'
    }
    if (!settings['download.playlistIntervalHours']) settings['download.playlistIntervalHours'] = '24'
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
    applyLyricColors({
      preset: settings[LYRIC_PRESET_KEY],
      text: settings[LYRIC_TEXT_KEY],
      highlight: settings[LYRIC_HIGHLIGHT_KEY],
    })
  } catch {}
  try {
    sourceList.value = await api.source.list()
    // 始终以列表的 active 为准（含全部未激活 → 清空），避免本地残留导致「停用」点了没变化
    activeSourceIds.value = sourceList.value.filter((s) => s.active).map((s) => s.id)
    settings['source.active'] = activeSourceIds.value.length
      ? JSON.stringify(activeSourceIds.value)
      : '[]'
  } catch {}
  // 音源列表就绪后再同步，便于把旧版全局平台开关摊到各音源
  const hadGlobalPlatforms = Array.isArray(parseSourcePlatformMap(settings[ENABLED_PLATFORMS_KEY]).__global__)
  const platformsBefore = settings[ENABLED_PLATFORMS_KEY]
  syncEnabledPlatformsFromSettings()
  if (
    !sourcePlatformMap.value.__global__
    && sourceList.value.length
    && (hadGlobalPlatforms || settings[ENABLED_PLATFORMS_KEY] !== platformsBefore)
  ) {
    persistEnabledPlatforms().catch(() => {})
  }
  await loadPaths()
  if (isAdminUser.value) loadFfmpegStatus()
  document.addEventListener('click', onSourcePlatformDocClick)
  document.addEventListener('keydown', onSourcePlatformKeydown)
  window.addEventListener('resize', onPlatformPopoverReposition)
  window.addEventListener('scroll', onPlatformPopoverScroll, true)
})

onActivated(() => {
  scrollSettingsToTop()
})

onUnmounted(() => {
  stopFfmpegPoll()
  stopImportElapsed()
  clearTimeout(customColorSaveTimer)
  clearTimeout(lyricColorSaveTimer)
  if (platformSaveTimer) clearTimeout(platformSaveTimer)
  document.removeEventListener('click', onSourcePlatformDocClick)
  document.removeEventListener('keydown', onSourcePlatformKeydown)
  window.removeEventListener('resize', onPlatformPopoverReposition)
  window.removeEventListener('scroll', onPlatformPopoverScroll, true)
})

async function applyFfmpegStatus(res) {
  ffmpegStatus.value = {
    available: Boolean(res?.available),
    path: res?.path || '',
    enabled: Boolean(res?.enabled),
    settingEnabled: Boolean(res?.settingEnabled),
    settingDisabled: Boolean(res?.settingDisabled),
    source: res?.source || 'none',
    installHint: res?.installHint || '',
    steps: Array.isArray(res?.steps) ? res.steps : ffmpegStatus.value.steps,
  }
  if (res?.install) {
    ffmpegInstall.value = {
      phase: res.install.phase || 'idle',
      progress: Number(res.install.progress) || 0,
      message: res.install.message || '',
      error: res.install.error || '',
      running: Boolean(res.install.running),
    }
  }
}

function stopFfmpegPoll() {
  if (ffmpegPollTimer) {
    clearInterval(ffmpegPollTimer)
    ffmpegPollTimer = 0
  }
}

function startFfmpegPoll() {
  stopFfmpegPoll()
  ffmpegPollTimer = setInterval(async () => {
    try {
      const res = await api.settings.ffmpegStatus()
      await applyFfmpegStatus(res)
      if (!res?.install?.running) {
        stopFfmpegPoll()
        ffmpegBusy.value = ''
        if (res?.install?.phase === 'done' || res?.enabled) {
          showToast(res?.source === 'system' ? '已使用系统自带 ffmpeg' : 'ffmpeg 已就绪', 'success')
        } else if (res?.install?.phase === 'error') {
          showToast(res.install.error || '准备失败', 'error')
        }
      }
    } catch {}
  }, 1000)
}

async function loadFfmpegStatus() {
  try {
    const res = await api.settings.ffmpegStatus()
    await applyFfmpegStatus(res)
    if (res?.install?.running) {
      ffmpegBusy.value = 'install'
      startFfmpegPoll()
    }
  } catch {}
}

async function detectFfmpeg() {
  ffmpegBusy.value = 'detect'
  try {
    const res = await api.settings.ffmpegDetect()
    await applyFfmpegStatus(res)
    if (res.available) {
      showToast(res.enabled ? '已检测到 ffmpeg，且功能已启用' : '已检测到 ffmpeg，可点击「安装并启用」完成启用', 'success')
    } else {
      showToast('仍未检测到，请点击「安装并启用 ffmpeg」自动下载', 'info')
    }
  } catch (e) {
    showToast(e.message || '检测失败', 'error')
  } finally {
    ffmpegBusy.value = ''
  }
}

async function installFfmpeg() {
  ffmpegBusy.value = 'install'
  try {
    const res = await api.settings.ffmpegInstall()
    await applyFfmpegStatus(res)
    startFfmpegPoll()
  } catch (e) {
    showToast(e.message || '无法开始准备', 'error')
    ffmpegBusy.value = ''
    await loadFfmpegStatus()
  }
}

async function disableFfmpeg() {
  ffmpegBusy.value = 'disable'
  try {
    const res = await api.settings.ffmpegDisable()
    await applyFfmpegStatus(res)
    showToast('已停用 ffmpeg 相关功能', 'info')
  } catch (e) {
    showToast(e.message || '停用失败', 'error')
  } finally {
    ffmpegBusy.value = ''
  }
}

async function loadPaths() {
  try {
    const res = await api.paths.list()
    applyPathsInfo(res)
    needsPathSetup.value = Boolean(res.setup?.needsPathConfig)
    pathsRuntimeIsContainer.value = Boolean(res.setup?.isContainer)
    mountInfo.value = res.setup?.mountInfo || null
    const mp = res.setup?.musicProbe
    const musicLabel = '音乐库'
    if (res.setup?.mountLooksEmpty) {
      mountProbeText.value = pathsRuntimeIsContainer.value
        ? '警告：容器内 /music 是空的。请把宿主机歌曲目录挂到 /music 后重启容器。'
        : '警告：音乐库目录是空的。请到「运行设置」确认路径并停用后重新启用。'
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
  // 模板里若写成 @click="addPath" 会把 MouseEvent 当成 fromPicker；统一成布尔
  const viaPicker = fromPicker === true
  const val = newPath.value.trim()
  if (!val) {
    showToast('请先输入音乐库绝对路径', 'info')
    return
  }
  try {
    const res = await api.paths.add(val, viaPicker)
    applyPathsInfo(res)
    newPath.value = ''
    showToast('音乐库路径已添加', 'success')
    await loadLibraryStats()
    await loadScanSettings()
    initScanTreeExpansion()
  } catch (e) {
    showToast(e.message, 'error')
  }
}

/** 无飞牛选目录能力时：弹窗输入路径 */
async function promptAddPath() {
  const val = await appPrompt({
    title: '添加音乐库路径',
    message: '请输入 NAS 上的绝对路径（同一物理目录只会保留一条）',
    inputLabel: '目录路径',
    placeholder: '/vol1/1000/Music',
    defaultValue: newPath.value || '',
    confirmText: '添加',
  })
  if (val == null) return
  const trimmed = String(val).trim()
  if (!trimmed) {
    showToast('请输入路径', 'info')
    return
  }
  newPath.value = trimmed
  await addPath(false)
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
    applyPathsInfo(res)
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
    applyPathsInfo(res)
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
    applyPathsInfo(res)
    showToast('音乐库路径已删除', 'success')
    await loadLibraryStats()
  } catch (e) {
    showToast(e.message, 'error')
  }
}

function applyPathsInfo(res = {}) {
  sharedMusicPaths.value = Array.isArray(res.sharedMusicPaths) ? res.sharedMusicPaths : []
  personalMusicPaths.value = Array.isArray(res.personalMusicPaths) ? res.personalMusicPaths : []
  // 管理员扫描面板始终操作共用库；普通用户 musicPaths 为当前生效路径
  if (isAdminUser.value) {
    musicPaths.value = sharedMusicPaths.value
  } else {
    musicPaths.value = res.musicPaths || res.data || []
  }
  applyDownloadPathInfo(res)
}

function applyDownloadPathInfo(res = {}) {
  downloadPath.value = res.downloadPath || ''
  sharedDownloadPath.value = res.sharedDownloadPath || res.downloadPath || ''
  personalDownloadPath.value = res.personalDownloadPath || ''
  downloadPathMode.value = res.downloadPathMode === 'personal' ? 'personal' : 'shared'
  downloadPathPolicy.value = ['shared', 'personal', 'choose'].includes(res.downloadPathPolicy)
    ? res.downloadPathPolicy
    : 'choose'
  canChooseDownloadPath.value = res.canChooseDownloadPath !== false && downloadPathPolicy.value === 'choose'
}

function downloadPathPolicyLabel(policy) {
  const hit = downloadPathPolicyOptions.find((o) => o.value === policy)
  return hit?.label || '允许用户自行选择'
}

const downloadPathPolicyTip = computed(() => {
  if (downloadPathPolicy.value === 'shared') {
    return '管理员已指定本账号使用管理员路径：音乐库与下载目录均与管理员共用，无法自行切换。'
  }
  if (downloadPathPolicy.value === 'personal') {
    return '管理员已指定本账号使用专属路径：请自行配置音乐库与下载目录（下载默认在管理员下载目录下按用户名建子文件夹）。'
  }
  return '可选择「管理员路径」（共用音乐库与下载目录）或「专属路径」（仅本账号）。管理员可在「用户管理」中锁定策略。'
})

const downloadPathPolicyLockedDesc = computed(() => {
  if (downloadPathPolicy.value === 'personal') {
    return '策略由管理员锁定为「专属路径」，如需改回管理员路径或开放自选请联系管理员。'
  }
  return '策略由管理员锁定为「管理员路径」，如需专属路径或开放自选请联系管理员。'
})

async function onDownloadPathModeChange() {
  try {
    const res = await api.paths.setDownloadMode(downloadPathMode.value)
    applyPathsInfo(res)
    showToast(downloadPathMode.value === 'personal' ? '已切换为专属路径' : '已切换为管理员路径', 'success')
    await loadLibraryStats()
    initScanTreeExpansion()
  } catch (e) {
    showToast(e.message || '切换失败', 'error')
    await loadPaths()
  }
}

async function addPersonalPath(fromPicker = false) {
  const viaPicker = fromPicker === true
  const val = newPath.value.trim()
  if (!val) {
    showToast('请先输入专属音乐库绝对路径', 'info')
    return
  }
  try {
    const res = await api.paths.add(val, viaPicker, 'personal')
    applyPathsInfo(res)
    newPath.value = ''
    showToast('专属音乐库路径已添加', 'success')
  } catch (e) {
    showToast(e.message, 'error')
  }
}

async function promptAddPersonalPath() {
  const val = await appPrompt({
    title: '添加专属音乐库路径',
    message: '请输入仅本账号可见的音乐库绝对路径',
    inputLabel: '目录路径',
    placeholder: '/vol1/1000/Music/我的',
    defaultValue: '',
    confirmText: '添加',
  })
  if (val == null) return
  const trimmed = String(val).trim()
  if (!trimmed) {
    showToast('请输入路径', 'info')
    return
  }
  newPath.value = trimmed
  await addPersonalPath(false)
}

async function browseAddPersonalPath() {
  pickingFolder.value = true
  try {
    const path = await pickFolder({ title: '选择专属音乐文件夹' })
    if (!path) return
    newPath.value = path
    await addPersonalPath(true)
  } catch (e) {
    if (e.message && !e.message.includes('未选择')) showToast(e.message, 'error')
  } finally {
    pickingFolder.value = false
  }
}

async function browseReplacePersonalPath(oldPath) {
  pickingFolder.value = true
  try {
    const path = await pickFolder({ title: '选择新的专属文件夹' })
    if (!path) return
    const res = await api.paths.update(oldPath, path, true, 'personal')
    applyPathsInfo(res)
    showToast('专属路径已更新', 'success')
  } catch (e) {
    if (e.message && !e.message.includes('未选择')) showToast(e.message, 'error')
  } finally {
    pickingFolder.value = false
  }
}

async function removePersonalPath(dirPath) {
  try {
    const res = await api.paths.remove(dirPath, 'personal')
    applyPathsInfo(res)
    showToast('专属音乐库路径已删除', 'success')
  } catch (e) {
    showToast(e.message, 'error')
  }
}

async function applySharedDownloadPath(path, fromPicker = false) {
  const val = String(path || '').trim()
  if (!val) {
    showToast('请输入管理员下载目录路径', 'info')
    return
  }
  try {
    const res = await api.paths.setDownload(val, fromPicker === true)
    applyPathsInfo(res)
    showToast('管理员下载路径已更新', 'success')
  } catch (e) {
    showToast(e.message, 'error')
  }
}

async function promptEditSharedDownload() {
  const val = await appPrompt({
    title: '修改管理员下载目录',
    message: '请输入 NAS 绝对路径',
    inputLabel: '目录路径',
    placeholder: '/vol1/1000/Music/Download',
    defaultValue: sharedDownloadPath.value || '',
    confirmText: '保存',
  })
  if (val == null) return
  await applySharedDownloadPath(val, false)
}

async function browseDownloadPath() {
  pickingFolder.value = true
  try {
    const path = await pickFolder({ title: '选择管理员下载保存目录' })
    if (!path) return
    await applySharedDownloadPath(path, true)
  } catch (e) {
    if (e.message && !e.message.includes('未选择')) showToast(e.message, 'error')
  } finally {
    pickingFolder.value = false
  }
}

async function applyPersonalDownloadPath(path, fromPicker = false) {
  const val = String(path || '').trim()
  if (!val) {
    showToast('请输入个人下载目录路径', 'info')
    return
  }
  try {
    const res = await api.paths.setPersonalDownload(val, fromPicker === true, true)
    applyPathsInfo(res)
    showToast('个人下载路径已更新', 'success')
  } catch (e) {
    showToast(e.message, 'error')
  }
}

async function promptEditPersonalDownload() {
  const val = await appPrompt({
    title: '修改专属下载目录',
    message: '请输入当前账号的专属下载目录（绝对路径）',
    inputLabel: '目录路径',
    placeholder: '/vol1/1000/Music/用户名',
    defaultValue: personalDownloadPath.value || '',
    confirmText: '保存',
  })
  if (val == null) return
  await applyPersonalDownloadPath(val, false)
}

async function browsePersonalDownloadPath() {
  pickingFolder.value = true
  try {
    const path = await pickFolder({ title: '选择我的专属下载目录' })
    if (!path) return
    await applyPersonalDownloadPath(path, true)
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

async function saveTagMatchConcurrency() {
  const n = Math.min(6, Math.max(1, parseInt(settings['tag.matchConcurrency'], 10) || 3))
  settings['tag.matchConcurrency'] = String(n)
  await saveSetting('tag.matchConcurrency')
}

async function toggleTagMatchFlag(key, event) {
  const next = event?.target?.checked ? 'true' : 'false'
  settings[key] = next
  try {
    await api.settings.update({ [key]: next })
    showToast('已保存', 'success')
  } catch (e) {
    showToast(e.message || '保存失败', 'error')
  }
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
    if (key === PLAYER_SMOOTH_STREAM_KEY) loadPlayerSettings()
    if (key === PLAY_QUALITY_KEY) loadPlayerSettings()
    if (key === AUDIO_CACHE_ENABLED_KEY || key === AUDIO_CACHE_MAX_MB_KEY) loadPlayerSettings()
    if (key === 'download.isUseOtherSource') loadPlayerSettings()
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

async function savePlayQuality() {
  settings[PLAY_QUALITY_KEY] = normalizePlayQuality(settings[PLAY_QUALITY_KEY])
  await saveSetting(PLAY_QUALITY_KEY)
}

async function toggleCrossPlatformSupplement(e) {
  settings['download.isUseOtherSource'] = e.target.checked ? 'true' : 'false'
  await saveSetting('download.isUseOtherSource')
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

let lyricColorSaveTimer = 0

async function persistLyricColors(payload) {
  settings[LYRIC_PRESET_KEY] = payload.preset
  settings[LYRIC_TEXT_KEY] = payload.text
  settings[LYRIC_HIGHLIGHT_KEY] = payload.highlight
  try {
    await api.settings.update({
      [LYRIC_PRESET_KEY]: payload.preset,
      [LYRIC_TEXT_KEY]: payload.text,
      [LYRIC_HIGHLIGHT_KEY]: payload.highlight,
    })
  } catch (e) {
    showToast(e.message, 'error')
  }
}

async function selectLyricColorPreset(id) {
  if (settings[LYRIC_PRESET_KEY] === id && id !== 'custom') return
  const applied = applyLyricColors({
    preset: id,
    text: settings[LYRIC_TEXT_KEY],
    highlight: settings[LYRIC_HIGHLIGHT_KEY],
  })
  await persistLyricColors(applied)
}

async function updateLyricCustomColor(which, hex, { debounceSave = false } = {}) {
  const nextText = which === 'text' ? hex : settings[LYRIC_TEXT_KEY]
  const nextHighlight = which === 'highlight' ? hex : settings[LYRIC_HIGHLIGHT_KEY]
  const applied = applyLyricColors({
    preset: 'custom',
    text: nextText,
    highlight: nextHighlight,
  })
  settings[LYRIC_PRESET_KEY] = applied.preset
  settings[LYRIC_TEXT_KEY] = applied.text
  settings[LYRIC_HIGHLIGHT_KEY] = applied.highlight
  const save = () => persistLyricColors(applied)
  if (debounceSave) {
    clearTimeout(lyricColorSaveTimer)
    lyricColorSaveTimer = setTimeout(save, 400)
    return
  }
  clearTimeout(lyricColorSaveTimer)
  await save()
}

function onLyricTextColorInput(e) {
  updateLyricCustomColor('text', e.target.value, { debounceSave: true })
}

function onLyricTextColorHex(e) {
  updateLyricCustomColor('text', e.target.value)
}

function onLyricHighlightColorInput(e) {
  updateLyricCustomColor('highlight', e.target.value, { debounceSave: true })
}

function onLyricHighlightColorHex(e) {
  updateLyricCustomColor('highlight', e.target.value)
}

function toggleSetting(key) {
  settings[key] = settings[key] === 'true' ? 'false' : 'true'
  saveSetting(key)
}

/** 播放自动匹配开关：保存到服务端并同步播放器运行时状态 */
async function toggleAutoMatchOnPlay() {
  const next = settings[AUTO_MATCH_ON_PLAY_KEY] === 'true' ? 'false' : 'true'
  settings[AUTO_MATCH_ON_PLAY_KEY] = next
  setAutoMatchOnPlay(next === 'true')
  try {
    await api.settings.update({ [AUTO_MATCH_ON_PLAY_KEY]: next })
  } catch (e) {
    showToast(e.message, 'error')
  }
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

async function toggleSmoothStreamSetting() {
  const currentlyOn = settings[PLAYER_SMOOTH_STREAM_KEY] !== 'false'
  const turningOn = currentlyOn === false
  settings[PLAYER_SMOOTH_STREAM_KEY] = turningOn ? 'true' : 'false'
  try {
    const patch = { [PLAYER_SMOOTH_STREAM_KEY]: settings[PLAYER_SMOOTH_STREAM_KEY] }
    if (turningOn) {
      settings['player.visualizer'] = 'false'
      patch['player.visualizer'] = 'false'
    }
    await api.settings.update(patch)
    await loadPlayerSettings()
    showToast(
      turningOn
        ? '已开启本地转码：弱网下转 128k AAC，并已关闭音频可视化'
        : '已关闭本地转码：始终直出原文件；播不动会提示并可跳下一曲',
      'success',
    )
  } catch (e) {
    showToast(e.message, 'error')
  }
}

async function refreshAudioCacheStats() {
  try {
    const s = await getAudioCacheStats()
    if (!s?.supported) {
      audioCacheStatsText.value = '当前环境不支持本地音频缓存（需 HTTPS / 安全上下文）'
      return
    }
    audioCacheStatsText.value = `已用 ${formatCacheBytes(s.totalBytes)} / ${formatCacheBytes(s.maxBytes)} · ${s.count} 首`
  } catch {
    audioCacheStatsText.value = ''
  }
}

async function toggleAudioCacheSetting() {
  const currentlyOn = settings[AUDIO_CACHE_ENABLED_KEY] !== 'false'
  settings[AUDIO_CACHE_ENABLED_KEY] = currentlyOn ? 'false' : 'true'
  try {
    await api.settings.update({ [AUDIO_CACHE_ENABLED_KEY]: settings[AUDIO_CACHE_ENABLED_KEY] })
    await loadPlayerSettings()
    await refreshAudioCacheStats()
    showToast(
      settings[AUDIO_CACHE_ENABLED_KEY] !== 'false' ? '已开启本机试听缓存' : '已关闭本机试听缓存',
      'success',
    )
  } catch (e) {
    showToast(e.message, 'error')
  }
}

async function saveAudioCacheMaxMB() {
  const allowed = audioCacheMaxMbOptions.map((o) => o.value)
  if (!allowed.includes(String(settings[AUDIO_CACHE_MAX_MB_KEY] || ''))) {
    settings[AUDIO_CACHE_MAX_MB_KEY] = '512'
  }
  await saveSetting(AUDIO_CACHE_MAX_MB_KEY)
  await refreshAudioCacheStats()
  showToast(`本机试听缓存上限已设为 ${settings[AUDIO_CACHE_MAX_MB_KEY]} MB`, 'success')
}

async function clearAudioCacheAction() {
  if (audioCacheClearing.value) return
  audioCacheClearing.value = true
  try {
    await clearAudioCache()
    await refreshAudioCacheStats()
    showToast('已清空本机试听缓存（服务端缓存未动）', 'success')
  } catch (e) {
    showToast(e.message || '清空失败', 'error')
  } finally {
    audioCacheClearing.value = false
  }
}

function splitImportUrls(text) {
  return String(text || '')
    .split(/[\n,;，；]+/)
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\//i.test(u))
}

function sourceUpdateTip(id) {
  const u = sourceUpdateMap.value[id]
  if (!u?.hasUpdate) return ''
  if (u.remoteVersion) return `远程 v${u.remoteVersion}（当前 v${u.currentVersion || '?'}）`
  if (u.log) return u.log
  if (u.updateUrl) return `可从更新地址拉取新脚本`
  return '检测到可更新脚本'
}

function markSourceUpdated(id) {
  const next = { ...sourceUpdateMap.value }
  delete next[id]
  sourceUpdateMap.value = next
  const left = Object.values(next).filter((u) => u.hasUpdate).length
  sourceUpdateSummary.value = left ? `仍有 ${left} 个可更新` : ''
}

async function applySourceUpdate(source, { silent = false } = {}) {
  const id = source?.id || source
  if (!id || sourceUpdatingId.value) return { ok: false }
  sourceUpdatingId.value = id
  try {
    const hint = sourceUpdateMap.value[id]
    const res = await api.source.updateSource(id, hint?.updateUrl || '')
    if (res.error) throw new Error(res.error)
    if (!silent) {
      showToast(
        res.reloadError
          ? `已更新 ${res.name}，请手动重新激活`
          : `已更新 ${res.name}${res.version ? ` → v${res.version}` : ''}`,
        res.reloadError ? 'warning' : 'success',
      )
    }
    markSourceUpdated(id)
    if (!silent) sourceList.value = await api.source.list()
    return { ok: true, res }
  } catch (err) {
    if (!silent) showToast(err.message || '更新失败', 'error')
    return { ok: false, error: err.message || '更新失败' }
  } finally {
    sourceUpdatingId.value = ''
  }
}

async function applyAllSourceUpdates() {
  const targets = sourceList.value.filter((s) => sourceCanApplyUpdate(s.id))
  if (!targets.length || sourceUpdatingAll.value) return
  sourceUpdatingAll.value = true
  let okCount = 0
  const failed = []
  try {
    for (const s of targets) {
      const result = await applySourceUpdate(s, { silent: true })
      if (result.ok) okCount += 1
      else failed.push(`${s.name}：${result.error || '失败'}`)
    }
    sourceList.value = await api.source.list()
    if (failed.length && okCount) {
      showToast(`已更新 ${okCount} 个，失败 ${failed.length} 个`, 'warning')
    } else if (failed.length) {
      showToast(failed[0], 'error')
    } else {
      showToast(`已更新 ${okCount} 个音源`, 'success')
    }
  } finally {
    sourceUpdatingAll.value = false
  }
}

async function importFile(e) {
  const files = [...(e.target.files || [])]
  if (!files.length || importingFiles.value) return
  importingFiles.value = true
  startImportElapsed()
  try {
    const res = await api.source.importFile(files)
    if (res.error) throw new Error(res.error)
    if (res.batch) {
      const fail = res.failed || 0
      showToast(
        fail
          ? `已导入 ${res.imported} 个，失败 ${fail} 个（需点「激活」）`
          : `已导入 ${res.imported} 个音源（需点「激活」）`,
        fail ? 'warning' : 'success',
      )
    } else {
      showToast(`导入成功: ${res.name || files[0].name}（需点「激活」）`, 'success')
    }
    sourceList.value = await api.source.list()
  } catch (err) {
    showToast(err.message, 'error')
  } finally {
    importingFiles.value = false
    stopImportElapsed()
    e.target.value = ''
  }
}

async function importFromUrl() {
  const urls = splitImportUrls(importUrl.value)
  if (!urls.length || importingUrl.value) {
    if (!urls.length && importUrl.value.trim()) showToast('请填写有效的 http(s) 直链', 'error')
    return
  }
  importingUrl.value = true
  startImportElapsed()
  try {
    const res = await api.source.importUrl(urls.length === 1 ? urls[0] : urls)
    if (res.error) throw new Error(res.error)
    if (res.batch) {
      const fail = res.failed || 0
      showToast(
        fail
          ? `已导入 ${res.imported} 个，失败 ${fail} 个（需点「激活」）`
          : `已导入 ${res.imported} 个音源（需点「激活」）`,
        fail ? 'warning' : 'success',
      )
    } else {
      showToast(`导入成功: ${res.name}（需点「激活」后才能搜索/播放）`, 'success')
    }
    importUrl.value = ''
    try {
      sourceList.value = await api.source.list()
    } catch {}
  } catch (err) {
    showToast(err.message || '导入失败', 'error')
  } finally {
    importingUrl.value = false
    stopImportElapsed()
  }
}

async function checkSourceUpdates() {
  if (checkingSourceUpdates.value) return
  checkingSourceUpdates.value = true
  sourceUpdateSummary.value = ''
  try {
    const res = await api.source.checkUpdates()
    if (res.error) throw new Error(res.error)
    const map = {}
    for (const u of res.updates || []) {
      map[u.id] = u
    }
    sourceUpdateMap.value = map
    const n = res.outdated || 0
    sourceUpdateSummary.value = n
      ? `发现 ${n} 个可更新`
      : `已检查 ${res.checked || 0} 个，均已是最新`
    showToast(sourceUpdateSummary.value, n ? 'warning' : 'success')
  } catch (err) {
    showToast(err.message || '检查更新失败', 'error')
  } finally {
    checkingSourceUpdates.value = false
  }
}

async function refreshPlatformTabs() {
  await Promise.all([
    reloadSearchSources(api),
    reloadDiscoverSources(api),
  ])
}

function syncActiveIdsFromServer(ids) {
  const next = Array.isArray(ids) ? [...new Set(ids.map(String).filter(Boolean))] : []
  activeSourceIds.value = next
  settings['source.active'] = next.length ? JSON.stringify(next) : '[]'
  sourceList.value = sourceList.value.map((s) => ({
    ...s,
    active: next.includes(s.id),
  }))
}

function refreshPlatformTabsLater() {
  refreshPlatformTabs().catch(() => {})
}

function syncEnabledPlatformsFromSettings() {
  const map = parseSourcePlatformMap(settings[ENABLED_PLATFORMS_KEY])
  // 旧版全局数组 → 摊到当前已导入的每个音源（列表未就绪时先保留 __global__）
  if (Array.isArray(map.__global__) && sourceList.value.length) {
    const global = map.__global__
    for (const s of sourceList.value) {
      if (!Object.prototype.hasOwnProperty.call(map, s.id)) {
        map[s.id] = platformsOfSource(s).filter((k) => global.includes(k))
      }
    }
    delete map.__global__
  }
  sourcePlatformMap.value = mergeDeclaredPlatformsIntoMap(map)
  // 仍有 __global__ 时先不覆盖 settings，避免列表加载前把旧配置冲掉
  if (!sourcePlatformMap.value.__global__) {
    settings[ENABLED_PLATFORMS_KEY] = serializeSourcePlatformMap(sourcePlatformMap.value)
  }
}

/** 脚本新声明的非内置平台（汽水/B站等）默认打开；内置五家仍尊重用户已保存开关 */
function mergeDeclaredPlatformsIntoMap(map) {
  const next = { ...map }
  for (const s of sourceList.value) {
    if (!s?.id) continue
    const declared = platformsOfSource(s)
    const extra = declared.filter((k) => !PLATFORM_ORDER.includes(k))
    if (!extra.length) continue
    if (!Object.prototype.hasOwnProperty.call(next, s.id)) {
      next[s.id] = [...declared]
      continue
    }
    const cur = new Set(next[s.id] || [])
    let changed = false
    for (const k of extra) {
      if (!cur.has(k)) {
        cur.add(k)
        changed = true
      }
    }
    if (changed) next[s.id] = orderPlatformKeys([...cur])
  }
  return next
}

function ensureSourcePlatformEntry(source) {
  const id = source?.id
  if (!id) return platformsOfSource(source)
  const map = sourcePlatformMap.value
  if (Object.prototype.hasOwnProperty.call(map, id)) {
    return map[id]
  }
  const defaults = platformsOfSource(source)
  sourcePlatformMap.value = { ...map, [id]: [...defaults] }
  return defaults
}

function platformOptionsForSource(source) {
  return platformsOfSource(source).map((id) => ({
    id,
    label: PLATFORM_LABELS[id] || id,
    short: PLATFORM_SHORT[id] || id.slice(0, 1).toUpperCase(),
  }))
}

function isSourcePlatformOn(sourceId, platformId) {
  const list = sourcePlatformMap.value[sourceId]
  if (list) return list.includes(platformId)
  const s = sourceList.value.find((row) => row.id === sourceId)
  return platformsOfSource(s || {}).includes(platformId)
}

function autoClosedList(source) {
  const list = source?.health?.autoClosedPlatforms
  return Array.isArray(list) ? list : []
}

function autoClosedNotice(source) {
  const names = autoClosedList(source).map((p) => p.label || p.id).filter(Boolean)
  if (!names.length) return ''
  return `${names.join('、')} 为试听源，已自动关闭平台解析`
}

function isAutoClosedPlatform(source, platformId) {
  return autoClosedList(source).some((p) => p.id === platformId) && !isSourcePlatformOn(source.id, platformId)
}

function platformSwitchStatus(source, platformId) {
  if (isSourcePlatformOn(source.id, platformId)) return '允许解析'
  if (isAutoClosedPlatform(source, platformId)) return '试听源，已自动关闭'
  return '已关闭'
}

function clearLocalAutoClosed(sourceId, platformIds = null) {
  sourceList.value = sourceList.value.map((row) => {
    if (row.id !== sourceId || !row.health) return row
    const prev = Array.isArray(row.health.autoClosedPlatforms) ? row.health.autoClosedPlatforms : []
    const next = platformIds
      ? prev.filter((p) => !platformIds.includes(p.id))
      : []
    return { ...row, health: { ...row.health, autoClosedPlatforms: next } }
  })
}

function sourcePlatformSummary(source) {
  const all = platformsOfSource(source)
  if (!all.length) return '无平台'
  const on = all.filter((k) => isSourcePlatformOn(source.id, k))
  if (on.length === all.length) return `平台 ${on.length}/${all.length}`
  if (!on.length) return '平台已全部关闭'
  return `平台 ${on.length}/${all.length}`
}

function closeSourcePlatformPanel() {
  expandedSourceId.value = ''
  platformPopoverStyle.value = {}
}

function placePlatformPopover() {
  const id = expandedSourceId.value
  if (!id) return
  const btn = document.querySelector(`[data-source-plat="${CSS.escape(id)}"]`)
  if (!btn) return
  const r = btn.getBoundingClientRect()
  const mobile = window.innerWidth <= 768
  const width = mobile
    ? Math.min(260, window.innerWidth - 28)
    : Math.min(360, Math.max(280, window.innerWidth - 16))
  let left = r.right - width
  if (left < 8) left = 8
  if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8)
  const maxH = mobile
    ? Math.min(280, window.innerHeight * 0.46)
    : Math.min(420, window.innerHeight * 0.7)
  let top = r.bottom + 6
  if (top + 160 > window.innerHeight) {
    top = Math.max(8, r.top - 6 - Math.min(maxH, window.innerHeight - 16))
  }
  platformPopoverStyle.value = {
    position: 'fixed',
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    width: `${Math.round(width)}px`,
    maxHeight: `${Math.round(maxH)}px`,
    zIndex: 12050,
  }
}

function toggleSourcePlatformPanel(sourceId) {
  expandedSourceId.value = expandedSourceId.value === sourceId ? '' : sourceId
  if (!expandedSourceId.value) {
    platformPopoverStyle.value = {}
    return
  }
  const display = sourceDisplayRows.value.find((row) => row.id === sourceId)
  if (display) {
    for (const m of display.members || []) ensureSourcePlatformEntry(m)
  } else {
    const s = sourceList.value.find((row) => row.id === sourceId)
    if (s) ensureSourcePlatformEntry(s)
  }
  nextTick(() => placePlatformPopover())
}

function onPlatformPopoverReposition() {
  if (expandedSourceId.value) placePlatformPopover()
}

function onPlatformPopoverScroll(event) {
  if (!expandedSourceId.value) return
  if (event.target?.closest?.('.source-platform-popover')) return
  closeSourcePlatformPanel()
}

function onSourcePlatformDocClick(event) {
  if (!expandedSourceId.value) return
  if (event.target?.closest?.('.source-platform-wrap')) return
  if (event.target?.closest?.('.source-platform-popover')) return
  closeSourcePlatformPanel()
}

function onSourcePlatformKeydown(event) {
  if (event.key === 'Escape' && expandedSourceId.value) closeSourcePlatformPanel()
}

async function persistEnabledPlatforms() {
  const payload = serializeSourcePlatformMap(sourcePlatformMap.value)
  settings[ENABLED_PLATFORMS_KEY] = payload
  try {
    await api.settings.update({ [ENABLED_PLATFORMS_KEY]: payload })
    await refreshPlatformTabs()
    loadPlayerSettings()
    try {
      sourceList.value = await api.source.list()
    } catch {}
  } catch (e) {
    showToast(e.message || '保存失败', 'error')
    syncEnabledPlatformsFromSettings()
  }
}

function schedulePersistEnabledPlatforms() {
  if (platformSaveTimer) clearTimeout(platformSaveTimer)
  platformSaveTimer = setTimeout(() => {
    platformSaveTimer = 0
    persistEnabledPlatforms()
  }, 200)
}

function toggleSourcePlatform(source, platformId, on) {
  const id = source.id
  const base = ensureSourcePlatformEntry(source)
  const next = new Set(base)
  if (on) next.add(platformId)
  else next.delete(platformId)
  sourcePlatformMap.value = {
    ...sourcePlatformMap.value,
    [id]: orderPlatformKeys([...next]),
  }
  if (on) clearLocalAutoClosed(id, [platformId])
  schedulePersistEnabledPlatforms()
}

function setSourcePlatformsAll(source, on) {
  const id = source.id
  const all = platformsOfSource(source)
  sourcePlatformMap.value = {
    ...sourcePlatformMap.value,
    [id]: on ? [...all] : [],
  }
  if (on) clearLocalAutoClosed(id)
  schedulePersistEnabledPlatforms()
}

async function activateSource(id) {
  if (!id) return
  if (sourceBusyId.value) {
    if (sourceBusyId.value === id) return
    showToast('请等待当前音源操作完成', 'info')
    return
  }
  if (sourceBatchBusy.value) {
    showToast('批量操作进行中，请稍候', 'info')
    return
  }
  sourceBusyId.value = id
  try {
    const res = await api.source.activate(id)
    if (Array.isArray(res?.activeIds)) {
      syncActiveIdsFromServer(res.activeIds)
    } else if (!activeSourceIds.value.includes(id)) {
      syncActiveIdsFromServer([...activeSourceIds.value, id])
    }
    sourceList.value = sourceList.value.map((s) => (
      s.id === id
        ? { ...s, active: true, sources: res.sources || s.sources }
        : s
    ))
    sourcePlatformMap.value = mergeDeclaredPlatformsIntoMap(sourcePlatformMap.value)
    schedulePersistEnabledPlatforms()
    showToast('音源已激活', 'success')
  } catch (e) {
    showToast(e.message || '激活失败', 'error')
  } finally {
    sourceBusyId.value = ''
  }
  refreshPlatformTabsLater()
}

async function dismissSourceHealth(s) {
  try {
    await api.source.dismissHealth(s.id)
    sourceList.value = sourceList.value.map((row) => (
      row.id === s.id
        ? { ...row, health: row.health ? { ...row.health, unhealthy: false, tip: '', badge: '', autoClosedPlatforms: [] } : null }
        : row
    ))
    showToast('已关闭该音源健康提示', 'info')
  } catch (e) {
    showToast(e.message || '操作失败', 'error')
  }
}

function healthPlatformChips(s) {
  const list = Array.isArray(s?.health?.platforms) ? s.health.platforms : []
  return list.filter((p) => p.level === 'preview' || p.level === 'ok' || p.level === 'watch')
}

function platformHealthSuffix(p) {
  if (p.level === 'preview') return '·试听'
  if (p.level === 'ok') return '·完整'
  return '·观察'
}

function platformHealthTitle(p) {
  const pct = Math.round((p.ratio || 0) * 100)
  return `${p.label}：近 ${p.sampleCount} 次约 ${pct}% 为试听片段`
}

async function deactivateSource(id) {
  if (!id) return
  if (sourceBusyId.value) {
    if (sourceBusyId.value === id) return
    showToast('请等待当前音源操作完成', 'info')
    return
  }
  if (sourceBatchBusy.value) {
    showToast('批量操作进行中，请稍候', 'info')
    return
  }
  sourceBusyId.value = id
  try {
    const res = await api.source.deactivate(id)
    if (Array.isArray(res?.activeIds)) {
      syncActiveIdsFromServer(res.activeIds)
    } else {
      syncActiveIdsFromServer(activeSourceIds.value.filter((x) => x !== id))
    }
    showToast('音源已停用', 'success')
  } catch (e) {
    showToast(e.message || '停用失败', 'error')
  } finally {
    sourceBusyId.value = ''
  }
  refreshPlatformTabsLater()
}

async function exportAllSources() {
  if (exportingAllSources.value) return
  exportingAllSources.value = true
  try {
    const res = await api.source.exportAll()
    const count = res?.payload?.data?.sources?.length || 0
    if (!count) {
      showToast('暂无可导出的音源', 'info')
      return
    }
    downloadJsonFile(res?.filename || 'lemon-sources.json', res.payload)
    showToast(`已导出 ${count} 个音源`, 'success')
  } catch (e) {
    showToast(e.message || '导出失败', 'error')
  } finally {
    exportingAllSources.value = false
  }
}

function downloadJsonFile(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function exportOneSourceScript(sourceId) {
  const res = await api.source.exportScript(sourceId)
  const script = String(res?.script || '')
  if (!script.trim()) throw new Error('该音源没有可导出的脚本')
  if (!res.savedPath) {
    throw new Error(res.saveError || '未能保存到 NAS 目录，请检查设置里的下载路径')
  }
  return res
}

/** 单个脚本或合集（按成员逐个写出 .js）；恢复时用「本地导入」多选即可 */
async function exportDisplayRow(row) {
  const members = (row?.members || []).filter((m) => m?.id)
  if (!members.length || exportingSourceId.value) return
  exportingSourceId.value = row.id
  try {
    const saved = []
    const failures = []
    for (const m of members) {
      try {
        const res = await exportOneSourceScript(m.id)
        saved.push({ name: m.name || res.name || m.id, path: res.savedPath, dir: res.savedDir })
      } catch (e) {
        failures.push(`${m.name || m.id}：${e.message || e}`)
      }
    }
    if (!saved.length) {
      throw new Error(failures[0] || '没有可导出的脚本')
    }
    const dir = saved[0].dir || saved[0].path
    const toastMsg = row.type === 'group'
      ? `已导出「${row.name}」${saved.length} 个插件${failures.length ? `（${failures.length} 个失败）` : ''}`
      : `已保存到 ${saved[0].path}`
    showToast(toastMsg, failures.length ? 'info' : 'success')
    await appAlert({
      title: row.type === 'group' ? '合集音源已导出' : '音源已导出',
      message: row.type === 'group'
        ? `${dir}\n共 ${saved.length} 个 .js${failures.length ? `\n失败 ${failures.length} 个` : ''}`
        : saved[0].path,
      hint: row.type === 'group'
        ? '请到飞牛「文件管理」打开「音源导出」。恢复时在音源管理用「本地导入」多选这些 .js 即可（会重新合成合集）。'
        : '请到飞牛「文件管理」打开该路径。目录名是「音源导出」。',
      confirmText: '知道了',
    })
  } catch (e) {
    showToast(e.message || '导出失败', 'error')
  } finally {
    exportingSourceId.value = ''
  }
}

async function removeSource(id) {
  try {
    await api.source.remove(id)
    sourceList.value = sourceList.value.filter(s => s.id !== id)
    activeSourceIds.value = activeSourceIds.value.filter(x => x !== id)
    selectedSourceIds.value = selectedSourceIds.value.filter((x) => x !== id)
    if (expandedSourceId.value === id) expandedSourceId.value = ''
    if (Object.prototype.hasOwnProperty.call(sourcePlatformMap.value, id)) {
      const next = { ...sourcePlatformMap.value }
      delete next[id]
      sourcePlatformMap.value = next
      schedulePersistEnabledPlatforms()
    }
    showToast('已删除', 'success')
    await refreshPlatformTabs()
  } catch (e) {
    showToast(e.message, 'error')
  }
}

function dropSelectedSourceIds(ids) {
  const drop = new Set(ids)
  selectedSourceIds.value = selectedSourceIds.value.filter((id) => !drop.has(id))
}

async function batchActivateSources() {
  const ids = [...selectedSourceIds.value]
  if (!ids.length || sourceBatchBusy.value) return
  if (sourceBusyId.value) {
    showToast('请等待当前音源操作完成', 'info')
    return
  }
  sourceBatchBusy.value = 'activate'
  try {
    const res = await api.source.activateBatch(ids)
    if (Array.isArray(res?.activeIds)) syncActiveIdsFromServer(res.activeIds)
    const okMap = new Map((res.results || []).map((row) => [row.id, row]))
    sourceList.value = sourceList.value.map((s) => {
      const hit = okMap.get(s.id)
      return {
        ...s,
        active: activeSourceIds.value.includes(s.id),
        sources: hit?.sources || s.sources,
        name: hit?.name || s.name,
      }
    })
    sourcePlatformMap.value = mergeDeclaredPlatformsIntoMap(sourcePlatformMap.value)
    schedulePersistEnabledPlatforms()
    const failed = res.errors?.length || 0
    if (failed && res.results?.length) showToast(`已启用 ${res.results.length} 个，失败 ${failed} 个`, 'error')
    else if (failed) showToast(res.errors[0]?.error || '批量启用失败', 'error')
    else showToast(`已启用 ${ids.length} 个音源`, 'success')
  } catch (e) {
    showToast(e.message || '批量启用失败', 'error')
  } finally {
    sourceBatchBusy.value = ''
  }
  refreshPlatformTabsLater()
}

async function batchDeactivateSources() {
  const ids = [...selectedSourceIds.value]
  if (!ids.length || sourceBatchBusy.value) return
  if (sourceBusyId.value) {
    showToast('请等待当前音源操作完成', 'info')
    return
  }
  sourceBatchBusy.value = 'deactivate'
  try {
    const res = await api.source.deactivateBatch(ids)
    if (Array.isArray(res?.activeIds)) syncActiveIdsFromServer(res.activeIds)
    else syncActiveIdsFromServer(activeSourceIds.value.filter((id) => !ids.includes(id)))
    showToast(`已停用 ${ids.length} 个音源`, 'success')
  } catch (e) {
    showToast(e.message || '批量停用失败', 'error')
  } finally {
    sourceBatchBusy.value = ''
  }
  refreshPlatformTabsLater()
}

async function batchRemoveSources() {
  const ids = [...selectedSourceIds.value]
  if (!ids.length || sourceBatchBusy.value || !isAdminUser.value) return
  const ok = await appConfirm({
    title: '批量删除音源',
    message: `确定删除选中的 ${ids.length} 个音源？此操作不可恢复。`,
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  sourceBatchBusy.value = 'delete'
  try {
    const res = await api.source.removeBatch(ids)
    const deleted = new Set(res.deleted || ids)
    sourceList.value = sourceList.value.filter((s) => !deleted.has(s.id))
    if (Array.isArray(res.activeIds)) activeSourceIds.value = res.activeIds
    else activeSourceIds.value = activeSourceIds.value.filter((id) => !deleted.has(id))
    dropSelectedSourceIds([...deleted])
    if (deleted.has(expandedSourceId.value)) expandedSourceId.value = ''
    const nextMap = { ...sourcePlatformMap.value }
    let mapChanged = false
    for (const id of deleted) {
      if (Object.prototype.hasOwnProperty.call(nextMap, id)) {
        delete nextMap[id]
        mapChanged = true
      }
    }
    if (mapChanged) {
      sourcePlatformMap.value = nextMap
      schedulePersistEnabledPlatforms()
    }
    showToast(`已删除 ${deleted.size} 个音源`, 'success')
    await refreshPlatformTabs()
  } catch (e) {
    showToast(e.message || '批量删除失败', 'error')
  } finally {
    sourceBatchBusy.value = ''
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
  flex-direction: column;
  gap: 0;
  width: 100%;
  max-width: none;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.settings-head {
  flex-shrink: 0;
  margin-bottom: 16px;
}
.settings-head h2 {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 600;
}
.settings-desc {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.settings-shell {
  flex: 1 1 0;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-card);
  overflow: hidden;
}
.settings-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 6px;
  margin: 0;
  padding: 8px 10px 0;
  max-width: 100%;
  min-width: 0;
  flex-shrink: 0;
  background: var(--bg-hover);
  border-bottom: 1px solid var(--border);
}
.settings-tab {
  border: none;
  background: transparent;
  padding: 8px 16px;
  font-size: 13px;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 10px 10px 0 0;
  flex: 0 1 auto;
  white-space: nowrap;
  line-height: 1.3;
}
.settings-tab:hover {
  color: var(--text);
  background: color-mix(in srgb, var(--bg-card) 55%, transparent);
}
.settings-tab.active {
  color: var(--text);
  background: var(--bg-card);
  font-weight: 600;
  margin-bottom: -1px;
  padding-bottom: 9px;
}

.settings-panel {
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: 16px 18px 24px;
  width: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--bg-card);
}
.panel-body { display: flex; flex-direction: column; gap: 16px; }

.paths-panel-body { gap: 18px; }
.paths-top-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  align-items: stretch;
}
.paths-layout {
  display: flex;
  flex-direction: column;
  gap: 18px;
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
.paths-zone-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.paths-section-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}
.paths-zone-desc {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-muted);
}
.paths-zone-desc code {
  font-size: 11px;
}
.paths-inner {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 0;
  padding: 14px;
  border-radius: 10px;
  background: var(--bg-card, var(--bg));
  border: 1px solid var(--border-light);
}
.paths-inner-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 4px;
}
.paths-library-panel {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 10px 14px 4px;
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
/* 覆盖 .setting-item 的 padding:16px 0，避免底色与右侧控件错位 */
.setting-item.setting-item-flat {
  padding: 12px 14px;
  border-bottom: none;
  align-items: center;
}
.setting-item.setting-item-flat .setting-item-action {
  display: flex;
  align-items: center;
  align-self: center;
}
.setting-item.setting-item-flat .setting-item-action .app-select,
.setting-item.setting-item-flat .setting-item-action .btn-sm {
  margin: 0;
}
.path-desc-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  word-break: break-all;
}

.setup-alert {
  margin: 0;
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
.paths-inner > .summary-row:first-child {
  margin-top: 0;
}
.paths-inner .ffmpeg-steps {
  margin-top: 0;
}
.path-list.paths-inner {
  gap: 6px;
  padding: 10px;
}
.path-list.paths-inner .path-row {
  margin-bottom: 0;
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
.ffmpeg-panel {
  margin-top: 0;
}
.ffmpeg-steps {
  margin: 6px 0 10px;
  padding-left: 1.25rem;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.7;
}
.ffmpeg-steps li.done {
  color: #2f9e44;
}
.ffmpeg-steps li.active {
  color: var(--text);
  font-weight: 600;
}
.ffmpeg-progress-block {
  margin-top: 10px;
}
.ffmpeg-progress-bar {
  height: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text) 12%, transparent);
  overflow: hidden;
}
.ffmpeg-progress-fill {
  height: 100%;
  background: var(--accent, #e85d4c);
  transition: width 0.25s ease;
}
.ffmpeg-progress-text {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}
.ffmpeg-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.ffmpeg-ok { color: #2f9e44; font-weight: 600; }
.ffmpeg-warn { color: #e67700; font-weight: 600; }
.ffmpeg-bad { color: #e03131; font-weight: 600; }
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
.settings-group-title {
  margin: 20px 0 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border-light);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}
.panel-body > .settings-group-title:first-child {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}
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
.path-input {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-input, var(--bg));
  color: var(--text);
}
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
.source-platform-wrap {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  z-index: 2;
}
.source-platform-wrap.open {
  z-index: 80;
}
.source-platform-popover {
  position: fixed;
  z-index: 12050;
  overflow: auto;
  margin: 0;
  padding: 12px 14px;
  box-sizing: border-box;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--bg-elevated, var(--bg-card, var(--bg)));
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
  -webkit-overflow-scrolling: touch;
  animation: source-plat-drop 0.16s ease;
}
@keyframes source-plat-drop {
  from {
    transform: translateY(-6px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
.platform-popover-head {
  margin-bottom: 12px;
}
.platform-popover-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
}
.platform-popover-title {
  font-size: 14px;
  font-weight: 650;
  color: var(--text);
}
.platform-switch-tip {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-secondary);
}
.platform-switch-actions {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}
.plat-link {
  border: none;
  background: none;
  padding: 0;
  font-size: 13px;
  cursor: pointer;
}
.plat-link-on { color: #2f9e44; }
.plat-link-off { color: #e03131; }
.plat-link:hover { opacity: 0.85; }
.platform-switch-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.platform-switch-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--bg-elevated, var(--bg-card));
  border: 1px solid var(--border);
}
.platform-switch-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}
.platform-badge {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}
.plat-tx { background: #12b886; }
.plat-wy { background: #e03131; }
.plat-kw { background: #f59f00; }
.plat-kg { background: #1c7ed6; }
.plat-mg { background: #e64980; }
.plat-qs { background: #7048e8; }
.plat-bili { background: #fb7299; }
.plat-generic { background: var(--text-muted, #868e96); }
.platform-switch-meta { min-width: 0; }
.platform-switch-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.platform-code {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  background: var(--bg-hover);
  border-radius: 4px;
  padding: 1px 5px;
}
.platform-switch-status {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-muted);
}
.platform-switch-status.on { color: #2f9e44; }
.platform-switch-status.auto { color: var(--warning, #e6a23c); }

.source-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.source-item {
  display: flex;
  flex-direction: column;
  padding: 12px 14px;
  border-radius: var(--radius);
  background: var(--bg-input);
  border: 1px solid transparent;
  overflow: visible;
}
.source-item-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  overflow: visible;
}
.source-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
  position: relative;
  z-index: 1;
  overflow: visible;
}
.source-item.platform-open {
  z-index: 20;
  position: relative;
}
.source-item.unhealthy { border-color: var(--warning, #e6a23c); }
.source-item.health-mixed { border-color: color-mix(in srgb, var(--accent) 45%, var(--warning, #e6a23c)); }
.source-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.source-expand-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  background: var(--bg-elevated, var(--bg-card));
  border: 1px solid var(--border-light, var(--border));
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}
.source-expand-btn svg {
  width: 14px;
  height: 14px;
  transition: transform 0.2s ease;
}
.source-expand-btn.expanded {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border-light, var(--border)));
  background: var(--accent-muted);
}
.source-expand-btn.expanded svg { transform: rotate(180deg); }
.source-expand-btn:hover {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border-light, var(--border)));
  background: var(--accent-muted);
}
.source-name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.source-name { font-size: 14px; font-weight: 500; }
.source-group-badge {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 999px;
  font-weight: 600;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
}
.source-item.is-source-group .source-name { letter-spacing: 0.01em; }
.source-health-badge {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 999px;
  background: rgba(230, 162, 60, 0.18);
  color: var(--warning, #e6a23c);
}
.source-health-badge.mixed {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent);
}
.source-health-tip {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--warning, #e6a23c);
  line-height: 1.45;
  max-width: 52ch;
}
.source-autoclose-tip {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--warning, #e6a23c);
  line-height: 1.45;
  max-width: 52ch;
}
.source-item.health-mixed .source-health-tip { color: var(--text-secondary); }
.source-health-platforms {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.source-plat-chip {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--text-muted);
  background: var(--bg-elevated, transparent);
}
.source-plat-chip.preview {
  border-color: color-mix(in srgb, var(--warning, #e6a23c) 55%, var(--border));
  color: var(--warning, #e6a23c);
  background: rgba(230, 162, 60, 0.12);
}
.source-plat-chip.ok {
  border-color: color-mix(in srgb, var(--success, #67c23a) 45%, var(--border));
  color: var(--success, #67c23a);
  background: color-mix(in srgb, var(--success, #67c23a) 12%, transparent);
}
.source-plat-chip.watch {
  border-color: var(--border);
  color: var(--text-secondary);
}
.source-meta { font-size: 12px; color: var(--text-muted); }

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

.source-batch-toolbar,
.source-admin-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin: 0 0 12px;
}
.source-select-all,
.source-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
  flex-shrink: 0;
}
.source-check input,
.source-select-all input {
  width: 16px;
  height: 16px;
  accent-color: var(--accent, #3d8bfd);
}
.source-item.selected {
  border-color: color-mix(in srgb, var(--accent, #3d8bfd) 45%, var(--border));
  background: color-mix(in srgb, var(--accent, #3d8bfd) 8%, var(--bg-input));
}
.source-update-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: var(--accent, #3d8bfd);
}
.source-update-log {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}
.import-area { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.import-area-url { align-items: flex-start; }
.url-textarea {
  flex: 1;
  min-width: 220px;
  min-height: 72px;
  resize: vertical;
  font-family: inherit;
}
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
.lyric-swatch-pair {
  display: flex;
  align-items: center;
}
.lyric-swatch {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.18);
}
.lyric-swatch-hl {
  margin-left: -8px;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.18), 0 0 0 2px var(--bg-elevated);
}
.color-scheme-btn.active .lyric-swatch-hl {
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.18), 0 0 0 2px var(--accent-muted);
}
.lyric-color-preview {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 10px;
  padding: 14px 12px;
  border-radius: var(--radius);
  background: #141414;
  border: 1px solid var(--border);
}
.lyric-preview-idle {
  font-size: 16px;
  color: color-mix(in srgb, var(--lyric-text, #fff) 42%, transparent);
}
.lyric-preview-hl {
  font-size: 18px;
  font-weight: 650;
  color: var(--lyric-highlight, #fff);
  text-shadow: 0 0 14px color-mix(in srgb, var(--lyric-highlight, #fff) 40%, transparent);
}
.lyric-custom-panel {
  align-items: center;
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
  z-index: 13000;
  animation: fadeIn 0.2s;
  box-shadow: var(--shadow);
}
.toast.success { background: var(--success); color: #fff; }
.toast.error { background: var(--error); color: #fff; }
.toast.warning { background: var(--warning, #e6a23c); color: #fff; }
.toast.info { background: var(--bg-card); border: 1px solid var(--border); }

@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

@media (max-width: 1100px) {
  .paths-top-row {
    grid-template-columns: 1fr;
  }
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
  .settings-page {
    height: auto;
    min-height: calc(100vh - 160px);
    overflow: visible;
  }
  .settings-head h2 { font-size: 18px; }
  .settings-shell {
    flex: none;
  }
  .settings-tab {
    padding: 8px 12px;
    font-size: 13px;
    border-radius: 9px 9px 0 0;
  }
  .settings-panel {
    overflow: visible;
    padding: 14px 14px 18px;
  }
  .color-scheme-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
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
  .source-item-main { flex-direction: row; flex-wrap: wrap; align-items: flex-start; gap: 10px; }
  .source-info { flex: 1 1 180px; }
  .source-actions { width: 100%; }
  .source-platform-wrap {
    margin-left: auto;
  }
  .source-platform-popover {
    padding: 8px 8px 10px;
  }
  .platform-popover-head {
    margin-bottom: 8px;
  }
  .platform-popover-title {
    font-size: 13px;
  }
  .platform-popover-title-row {
    flex-wrap: nowrap;
    gap: 8px;
    margin-bottom: 4px;
  }
  .platform-popover-title-row .platform-switch-actions {
    margin-left: auto;
  }
  .plat-link {
    font-size: 12px;
  }
  .platform-switch-tip {
    display: none;
  }
  .platform-switch-list {
    gap: 6px;
  }
  .platform-switch-item {
    padding: 6px 8px;
    gap: 8px;
    border-radius: 8px;
  }
  .platform-switch-name {
    font-size: 13px;
  }
  .platform-switch-status {
    font-size: 11px;
  }
  .platform-badge {
    width: 28px;
    height: 28px;
    font-size: 11px;
    border-radius: 8px;
  }
  .platform-switch-name {
    flex-wrap: wrap;
    font-size: 13px;
    gap: 4px;
  }
  .platform-switch-status {
    font-size: 11px;
  }
  .source-platform-popover .toggle {
    flex-shrink: 0;
  }
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
  margin: 0;
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
.user-row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex-shrink: 0;
  justify-content: flex-start;
  align-items: center;
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

.account-panel-body {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-bottom: 8px;
}
.account-zone {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: 16px 18px;
  border-radius: 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
}
.account-zone-admin {
  border-color: color-mix(in srgb, var(--accent, #3d7eff) 28%, var(--border-light));
}
.account-zone-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.account-zone-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}
.account-zone-desc {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-muted);
}
.account-role-pill {
  flex-shrink: 0;
  font-size: 12px;
  line-height: 1;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--border-light);
  color: var(--text-secondary);
  background: var(--bg-card, var(--bg));
}
.account-role-pill.admin {
  color: var(--accent, #3d7eff);
  border-color: color-mix(in srgb, var(--accent, #3d7eff) 35%, var(--border-light));
  background: color-mix(in srgb, var(--accent, #3d7eff) 10%, transparent);
}
.account-zone-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.account-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: 14px;
  border-radius: 10px;
  background: var(--bg-card, var(--bg));
  border: 1px solid var(--border-light);
}
.account-block-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.account-block-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-muted);
}
.account-backup-merge {
  margin: 0;
  padding: 0;
  background: transparent;
  border: 0;
}
.account-field input { width: 100%; min-width: 0; }
.account-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.user-table { display: flex; flex-direction: column; gap: 8px; }
/* 表头与每行是独立 grid：操作列不能用 auto，否则列宽互不相同导致对不齐 */
.user-table-head,
.user-table-row {
  display: grid;
  grid-template-columns: minmax(140px, 1.4fr) 88px minmax(140px, 1.2fr) 88px 228px;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  border-radius: var(--radius);
  box-sizing: border-box;
  width: 100%;
}
.user-table-with-path:not(.user-table-with-download) .user-table-head,
.user-table-with-path:not(.user-table-with-download) .user-table-row {
  grid-template-columns: minmax(140px, 1.4fr) 88px minmax(160px, 1.2fr) 228px;
}
.user-table-head {
  font-size: 12px;
  color: var(--text-muted);
  /* 与行同宽：透明边框占位，避免有边框的行把内容挤窄导致列对不齐 */
  border: 1px solid transparent;
  margin-bottom: -2px;
}
.user-table-row {
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
}
.user-cell-name,
.user-cell-role,
.user-cell-path-policy,
.user-cell-download {
  min-width: 0;
}
.user-cell-role,
.user-cell-path-policy,
.user-cell-download { font-size: 13px; color: var(--text-secondary); }
.path-policy-locked {
  font-size: 13px;
  color: var(--text-secondary);
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--bg-input);
  border: 1px solid var(--border-light);
}
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
@media (max-width: 1100px) {
  .account-zone-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 768px) {
  .account-zone-grid {
    grid-template-columns: 1fr;
  }
  .account-zone-head {
    flex-direction: column;
    align-items: flex-start;
  }
  .user-table-head { display: none; }
  .user-table-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .user-edit-fields { grid-column: auto; }
  .user-row-actions { width: 100%; flex-wrap: wrap; }
}
</style>
