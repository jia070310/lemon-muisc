#!/bin/bash
# 原生运行时：依赖飞牛应用中心「Node.js v22」(nodejs_v22)
#
# 官方文档（打包运行时环境）：
#   manifest: install_dep_apps=nodejs_v22
#   脚本中:   export PATH=/var/apps/nodejs_v22/target/bin:$PATH
# 依赖由应用中心按 install_dep_apps 自动安装；第三方脚本不应再调 appcenter-cli install
#（已安装时再 install 会卡在 downloading 0%，见 issue #27）。

STORE_NODE_APP="nodejs_v22"

# 应用代码目录（打包进 FPK 的 dist/server）
app_root() {
  if [ -f "${TRIM_APPDEST}/server/index.js" ]; then
    echo "${TRIM_APPDEST}"
    return 0
  fi
  if [ -f "${TRIM_APPDEST}/app/server/index.js" ]; then
    echo "${TRIM_APPDEST}/app"
    return 0
  fi
  if [ -f "${TRIM_APPDEST}/bundle/server/index.js" ]; then
    echo "${TRIM_APPDEST}/bundle"
    return 0
  fi
  echo "${TRIM_APPDEST}"
}

# 文档约定：/var/apps/nodejs_v22/target/bin ；并扫描各卷实际目录
store_node_bin_dirs() {
  local d resolved
  echo "/var/apps/nodejs_v22/target/bin"
  echo "/var/apps/nodejs_v22/bin"
  if [ -e "/var/apps/nodejs_v22/target" ]; then
    resolved="$(readlink -f /var/apps/nodejs_v22/target 2>/dev/null || true)"
    [ -n "${resolved}" ] && echo "${resolved}/bin"
  fi
  for d in /vol*/@appcenter/nodejs_v22/bin \
           /vol*/@appcenter/nodejs_v22/target/bin \
           /usr/local/apps/@appcenter/nodejs_v22/bin \
           /usr/local/apps/@appcenter/nodejs_v22/target/bin
  do
    [ -d "${d}" ] && echo "${d}"
  done
}

store_node_candidates() {
  local d
  while IFS= read -r d; do
    [ -n "${d}" ] && echo "${d}/node"
  done <<EOF
$(store_node_bin_dirs)
EOF
}

# 官方写法：export PATH=/var/apps/nodejs_v22/target/bin:$PATH
prepend_store_node_path() {
  local d
  while IFS= read -r d; do
    [ -z "${d}" ] && continue
    if [ -x "${d}/node" ] || [ -f "${d}/node" ]; then
      case ":${PATH}:" in
        *":${d}:"*) ;;
        *) export PATH="${d}:${PATH}" ;;
      esac
      return 0
    fi
  done <<EOF
$(store_node_bin_dirs)
EOF
  return 1
}

resolve_node_bin() {
  local p
  prepend_store_node_path || true
  while IFS= read -r p; do
    [ -z "${p}" ] && continue
    if { [ -x "${p}" ] || [ -f "${p}" ]; } && "${p}" -v >/dev/null 2>&1; then
      echo "${p}"
      return 0
    fi
  done <<EOF
$(store_node_candidates)
EOF
  if command -v node >/dev/null 2>&1 && node -v >/dev/null 2>&1; then
    command -v node
    return 0
  fi
  return 1
}

resolve_npm_bin() {
  local node_bin npm_bin dir
  node_bin="$(resolve_node_bin)" || return 1
  prepend_store_node_path || true
  dir="$(cd "$(dirname "${node_bin}")" 2>/dev/null && pwd -P 2>/dev/null || dirname "${node_bin}")"
  for npm_bin in "${dir}/npm" "$(dirname "${dir}")/lib/node_modules/npm/bin/npm-cli.js"; do
    [ -e "${npm_bin}" ] || continue
    if "${npm_bin}" -v >/dev/null 2>&1; then
      echo "${npm_bin}"
      return 0
    fi
    if "${node_bin}" "${npm_bin}" -v >/dev/null 2>&1; then
      echo "${npm_bin}"
      return 0
    fi
  done
  if command -v npm >/dev/null 2>&1 && npm -v >/dev/null 2>&1; then
    command -v npm
    return 0
  fi
  return 1
}

is_node_ready() {
  resolve_node_bin >/dev/null 2>&1
}

is_store_node_ready() {
  is_node_ready
}

#
# 与 1.2.14 / 飞牛文档一致：只检查 Node 是否可用。
# 依赖安装交给 manifest install_dep_apps=nodejs_v22，禁止 appcenter-cli install。
#
ensure_store_node() {
  local log_file="${TRIM_PKGVAR}/log/runtime-install.log"
  local node_bin
  mkdir -p "${TRIM_PKGVAR}/log" 2>/dev/null || true

  prepend_store_node_path || true
  if node_bin="$(resolve_node_bin)"; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 使用商店 Node: ${node_bin} ($("${node_bin}" -v 2>/dev/null))" >> "${log_file}"
    return 0
  fi

  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 未找到 nodejs_v22（已查 /var/apps/nodejs_v22/target/bin 与各卷 @appcenter）" >> "${log_file}"
  store_node_candidates >> "${log_file}" 2>/dev/null || true
  return 1
}

# 兼容旧调用名：不再长时间等待 / 不再触发商店 install
wait_for_store_dependencies() {
  ensure_store_node
}

try_trigger_store_nodejs_install() {
  return 0
}

nudge_store_nodejs_if_missing() {
  return 0
}

store_nodejs_dir_present() {
  if [ -d "/var/apps/nodejs_v22" ] || [ -d "/var/apps/nodejs_v22/target" ]; then
    return 0
  fi
  local d
  for d in /vol*/@appcenter/nodejs_v22 /usr/local/apps/@appcenter/nodejs_v22; do
    [ -d "${d}" ] && return 0
  done
  return 1
}

store_ui() {
  local msg="$1"
  if [ -n "${TRIM_TEMP_LOGFILE:-}" ]; then
    echo "${msg}" > "${TRIM_TEMP_LOGFILE}" 2>/dev/null || true
  fi
}

#
# 飞牛安装回调常以受限用户跑脚本：默认 HOME=/home/xxx 无写权限 → npm 卡死/EACCES，
# 应用中心进度会一直停在约 55%。缓存必须落到应用可写目录。
#
prepare_npm_env() {
  local cache_root="${TRIM_PKGVAR}/npm"
  mkdir -p "${cache_root}/cache" "${cache_root}/tmp" "${cache_root}/home" 2>/dev/null || true
  export HOME="${cache_root}/home"
  export npm_config_cache="${cache_root}/cache"
  export npm_config_tmp="${cache_root}/tmp"
  export npm_config_registry="https://registry.npmmirror.com"
  export npm_config_disturl="https://npmmirror.com/mirrors/node"
  export npm_config_fetch_timeout=120000
  export npm_config_fetch_retries=3
  export npm_config_better_sqlite3_binary_host="https://npmmirror.com/mirrors/better-sqlite3"
  export npm_config_fund=false
  export npm_config_audit=false
  export npm_config_update_notifier=false
}

update_npm_ui() {
  local msg="$1"
  if [ -n "${TRIM_TEMP_LOGFILE:-}" ]; then
    echo "${msg}" > "${TRIM_TEMP_LOGFILE}" 2>/dev/null || true
  fi
}

# 后台心跳：安装进度条停在 55% 时至少刷新文案，避免像「卡死」
npm_progress_heartbeat() {
  local pid="$1"
  local phase="$2"
  local n=0
  while kill -0 "${pid}" 2>/dev/null; do
    n=$((n + 1))
    update_npm_ui "正在${phase}依赖（npm，约 ${n}0 秒）… 国内源 npmmirror，请耐心等待"
    sleep 10
  done
}

run_npm_with_timeout() {
  local npm_bin="$1"
  shift
  local log_file="$1"
  shift
  local timeout_sec="${NPM_INSTALL_TIMEOUT_SEC:-900}"
  local rc=0

  if command -v timeout >/dev/null 2>&1; then
    timeout "${timeout_sec}" "${npm_bin}" "$@" >> "${log_file}" 2>&1
    rc=$?
    if [ "${rc}" -eq 124 ]; then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] npm 超时（${timeout_sec}s）: $*" >> "${log_file}"
    fi
    return "${rc}"
  fi

  "${npm_bin}" "$@" >> "${log_file}" 2>&1
}

# 若缺少 better-sqlite3 原生库，在 NAS 上用商店 Node 重建（走 prebuild 或本地编译）
# 注意：FPK 内置的 prebuilds 可能含 darwin-*；不可用 find 第一个 .node 当成功
ensure_better_sqlite3_native() {
  local root npm_bin log_file binding arch plat
  root="$(app_root)"
  log_file="${TRIM_PKGVAR}/log/npm-install.log"
  mkdir -p "${TRIM_PKGVAR}/log" 2>/dev/null || true

  plat="$(uname -s 2>/dev/null | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m 2>/dev/null)"
  case "${arch}" in
    x86_64|amd64) arch="x64" ;;
    aarch64|arm64) arch="arm64" ;;
  esac

  binding=""
  if [ -d "${root}/node_modules/better-sqlite3" ]; then
    # 优先当前平台 prebuild
    binding="$(find "${root}/node_modules/better-sqlite3" -path "*prebuilds/${plat}-${arch}*" -name '*.node' 2>/dev/null | head -n 1 || true)"
    if [ -z "${binding}" ]; then
      binding="$(find "${root}/node_modules/better-sqlite3" -name '*.node' 2>/dev/null | grep -v darwin | grep -v win32 | head -n 1 || true)"
    fi
  fi
  if [ -n "${binding}" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] better-sqlite3 native ok: ${binding}" >> "${log_file}"
    return 0
  fi

  npm_bin="$(resolve_npm_bin)" || {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] better-sqlite3: 无可用 npm，跳过重建（启用时再试）" >> "${log_file}"
    return 1
  }
  prepend_store_node_path || true
  prepare_npm_env
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] rebuilding better-sqlite3 for ${plat}-${arch}…" >> "${log_file}"
  update_npm_ui "正在重建 better-sqlite3 原生模块…"
  (
    cd "${root}" || exit 1
    run_npm_with_timeout "${npm_bin}" "${log_file}" rebuild better-sqlite3 \
      || run_npm_with_timeout "${npm_bin}" "${log_file}" install better-sqlite3 --omit=dev --omit=optional
  ) || true

  binding="$(find "${root}/node_modules/better-sqlite3" -path "*prebuilds/${plat}-${arch}*" -name '*.node' 2>/dev/null | head -n 1 || true)"
  if [ -z "${binding}" ]; then
    binding="$(find "${root}/node_modules/better-sqlite3/build" -name '*.node' 2>/dev/null | head -n 1 || true)"
  fi
  if [ -n "${binding}" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] better-sqlite3 rebuilt: ${binding}" >> "${log_file}"
    return 0
  fi
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] better-sqlite3 native still missing" >> "${log_file}"
  return 1
}

# 放行服务端口：Docker 映射常自动通外网；原生进程需主机防火墙/双栈
open_service_port() {
  local port="${1:-7983}"
  local log_file="${TRIM_PKGVAR}/log/app.log"
  mkdir -p "${TRIM_PKGVAR}/log" 2>/dev/null || true

  # 尽力放行（飞牛若用自研防火墙，仍建议在「控制面板→防火墙」加一条入站允许 TCP 7983）
  if command -v iptables >/dev/null 2>&1; then
    iptables -C INPUT -p tcp --dport "${port}" -j ACCEPT 2>/dev/null \
      || iptables -I INPUT -p tcp --dport "${port}" -j ACCEPT 2>/dev/null || true
  fi
  if command -v ip6tables >/dev/null 2>&1; then
    ip6tables -C INPUT -p tcp --dport "${port}" -j ACCEPT 2>/dev/null \
      || ip6tables -I INPUT -p tcp --dport "${port}" -j ACCEPT 2>/dev/null || true
  fi
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] open_service_port ${port} attempted" >> "${log_file}" 2>/dev/null || true
}

# 兼容旧名
install_node_runtime() {
  ensure_store_node
}

deps_fingerprint() {
  local root="$1"
  # 仅用 deps.rev：发版改 package 版本号不会误触发重装；改 npm 依赖时手动 +1
  if [ -f "${root}/deps.rev" ]; then
    tr -d ' \t\r\n' < "${root}/deps.rev"
    return 0
  fi
  if [ -f "${root}/package-lock.json" ]; then
    cksum "${root}/package-lock.json" 2>/dev/null | awk '{print $1"-"$2}'
    return 0
  fi
  if [ -f "${root}/package.json" ]; then
    cksum "${root}/package.json" 2>/dev/null | awk '{print $1"-"$2}'
    return 0
  fi
  echo "none"
}

# 依赖落在数据目录：飞牛升级会替换 TRIM_APPDEST，APP 内 node_modules 会被清掉
persist_modules_dir() {
  echo "${TRIM_PKGVAR}/runtime/node_modules"
}

has_core_modules() {
  local base="$1"
  [ -d "${base}/express" ] && [ -d "${base}/better-sqlite3" ]
}

# 把 APP 目录下的 node_modules 接到持久目录（软链优先，失败则复制）
attach_persist_modules() {
  local root persist log_file
  root="$(app_root)"
  persist="$(persist_modules_dir)"
  log_file="${TRIM_PKGVAR}/log/npm-install.log"
  mkdir -p "${TRIM_PKGVAR}/runtime" "${TRIM_PKGVAR}/log" 2>/dev/null || true

  # FPK 内置 / 旧版装在 APP 内：迁入持久目录
  if has_core_modules "${root}/node_modules" && ! has_core_modules "${persist}"; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 迁移 node_modules → ${persist}" >> "${log_file}"
    rm -rf "${persist}" 2>/dev/null || true
    if mv "${root}/node_modules" "${persist}" 2>/dev/null; then
      :
    else
      mkdir -p "${persist}" 2>/dev/null || true
      cp -a "${root}/node_modules/." "${persist}/" 2>/dev/null || true
      rm -rf "${root}/node_modules" 2>/dev/null || true
    fi
  fi

  if ! has_core_modules "${persist}"; then
    return 1
  fi

  # APP 侧挂接：软链 → 硬拷（部分卷不支持软链）
  if [ -L "${root}/node_modules" ]; then
    local cur
    cur="$(readlink "${root}/node_modules" 2>/dev/null || true)"
    if [ "${cur}" = "${persist}" ]; then
      return 0
    fi
    rm -f "${root}/node_modules" 2>/dev/null || true
  elif [ -d "${root}/node_modules" ]; then
    # 已是实体目录且齐全：仍迁到持久区再挂接，避免下次升级丢失
    if has_core_modules "${root}/node_modules" && [ "${root}/node_modules" != "${persist}" ]; then
      if ! has_core_modules "${persist}"; then
        rm -rf "${persist}" 2>/dev/null || true
        mv "${root}/node_modules" "${persist}" 2>/dev/null \
          || { mkdir -p "${persist}"; cp -a "${root}/node_modules/." "${persist}/"; rm -rf "${root}/node_modules"; }
      else
        rm -rf "${root}/node_modules" 2>/dev/null || true
      fi
    else
      rm -rf "${root}/node_modules" 2>/dev/null || true
    fi
  fi

  if ln -sfn "${persist}" "${root}/node_modules" 2>/dev/null; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] node_modules → ${persist} (symlink)" >> "${log_file}"
    return 0
  fi
  mkdir -p "${root}/node_modules" 2>/dev/null || true
  cp -a "${persist}/." "${root}/node_modules/" 2>/dev/null || true
  if has_core_modules "${root}/node_modules"; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] node_modules 已从持久目录复制到 APP" >> "${log_file}"
    return 0
  fi
  return 1
}

# 升级前尽量把旧 APP 依赖先塞进数据目录（upgrade_init 调用）
stash_node_modules_before_upgrade() {
  local root persist log_file
  root="$(app_root)"
  persist="$(persist_modules_dir)"
  log_file="${TRIM_PKGVAR}/log/npm-install.log"
  mkdir -p "${TRIM_PKGVAR}/runtime" "${TRIM_PKGVAR}/log" 2>/dev/null || true

  if has_core_modules "${persist}"; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] stash: 持久目录已有依赖，跳过" >> "${log_file}"
    return 0
  fi
  if has_core_modules "${root}/node_modules"; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] stash: 备份 APP node_modules → ${persist}" >> "${log_file}"
    rm -rf "${persist}" 2>/dev/null || true
    if mv "${root}/node_modules" "${persist}" 2>/dev/null; then
      return 0
    fi
    mkdir -p "${persist}" 2>/dev/null || true
    cp -a "${root}/node_modules/." "${persist}/" 2>/dev/null || true
  fi
  return 0
}

# 安装生产依赖（npm 走国内源；缓存放应用目录；跳过 optional）
# - 依赖装在 TRIM_PKGVAR/runtime，升级替换 APPDEST 后仍可复用
# - 核心模块齐全：默认跳过；deps.rev 变更则增量装；force 才清空
install_node_modules() {
  local root npm_bin log_file fp stamp persist force="${1:-}"
  root="$(app_root)"
  persist="$(persist_modules_dir)"
  log_file="${TRIM_PKGVAR}/log/npm-install.log"
  stamp="${TRIM_PKGVAR}/npm.deps.stamp"
  mkdir -p "${TRIM_PKGVAR}/log" "${TRIM_PKGVAR}/runtime" 2>/dev/null || true

  if [ ! -f "${root}/package.json" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 缺少 package.json: ${root}" >> "${log_file}"
    return 1
  fi

  fp="$(deps_fingerprint "${root}")"

  # 先挂接已有持久依赖 / FPK 内置依赖
  attach_persist_modules || true

  local has_core=0
  if has_core_modules "${persist}" || has_core_modules "${root}/node_modules"; then
    has_core=1
  fi

  if [ "${force}" = "force" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] force reinstall: 清理持久/APP node_modules" >> "${log_file}"
    rm -rf "${persist}" "${root}/node_modules" 2>/dev/null || true
    rm -f "${stamp}" 2>/dev/null || true
    has_core=0
  fi

  if [ "${has_core}" = "1" ]; then
    attach_persist_modules || true
    if [ ! -f "${stamp}" ] || [ "$(cat "${stamp}" 2>/dev/null)" = "${fp}" ]; then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] node_modules 已就绪（rev=${fp}），跳过 npm install" >> "${log_file}"
      echo "${fp}" > "${stamp}" 2>/dev/null || true
      update_npm_ui "依赖已就绪，跳过 npm 安装"
      return 0
    fi
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] deps.rev 变更（$(cat "${stamp}" 2>/dev/null) → ${fp}），增量 npm install…" >> "${log_file}"
    update_npm_ui "依赖有更新，正在增量安装（不删除已有模块）…"
    npm_bin="$(resolve_npm_bin)" || return 1
    prepend_store_node_path || true
    prepare_npm_env
    (
      cd "${root}" || exit 1
      # 保证安装落到 APP/node_modules（已是持久目录的软链或实体）
      if [ ! -e "${root}/node_modules" ]; then
        mkdir -p "${persist}" && ln -sfn "${persist}" "${root}/node_modules" 2>/dev/null \
          || mkdir -p "${root}/node_modules"
      fi
      run_npm_with_timeout "${npm_bin}" "${log_file}" install --omit=dev --ignore-scripts --no-audit --no-fund
    ) || true
    attach_persist_modules || true
    if has_core_modules "${root}/node_modules"; then
      echo "${fp}" > "${stamp}" 2>/dev/null || true
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] 增量 npm install ok" >> "${log_file}"
      update_npm_ui "依赖增量更新完成"
      return 0
    fi
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 增量安装后核心模块仍异常，尝试全量安装" >> "${log_file}"
  fi

  npm_bin="$(resolve_npm_bin)" || return 1
  prepend_store_node_path || true
  prepare_npm_env

  # 全量安装写到持久目录，再挂到 APP
  mkdir -p "${persist}" 2>/dev/null || true
  rm -rf "${root}/node_modules" 2>/dev/null || true
  ln -sfn "${persist}" "${root}/node_modules" 2>/dev/null \
    || { mkdir -p "${root}/node_modules"; }

  local rc=0
  local npm_pid=""
  update_npm_ui "正在安装本应用 npm 依赖（国内源）… 请勿关闭"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] npm install start root=${root} persist=${persist} cache=${npm_config_cache} rev=${fp}" >> "${log_file}"

  (
    cd "${root}" || exit 1
    if [ -f package-lock.json ]; then
      run_npm_with_timeout "${npm_bin}" "${log_file}" ci --omit=dev --ignore-scripts \
        || run_npm_with_timeout "${npm_bin}" "${log_file}" install --omit=dev --ignore-scripts
    else
      run_npm_with_timeout "${npm_bin}" "${log_file}" install --omit=dev --ignore-scripts
    fi
  ) &
  npm_pid=$!
  npm_progress_heartbeat "${npm_pid}" "安装"
  wait "${npm_pid}" || rc=$?

  # 若装到了软链目标之外的实体目录，再迁一次
  attach_persist_modules || true

  if ! has_core_modules "${root}/node_modules" && ! has_core_modules "${persist}"; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] npm 结束后仍无 express (rc=${rc})" >> "${log_file}"
    update_npm_ui "依赖安装失败。请查看 ${log_file}；或确认可访问 registry.npmmirror.com，并已安装 Node.js v22。"
    return 1
  fi

  attach_persist_modules || true
  echo "${fp}" > "${stamp}" 2>/dev/null || true
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] npm install ok (rc=${rc})" >> "${log_file}"
  return 0
}
