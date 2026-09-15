#!/bin/bash
# 原生运行时：优先使用飞牛应用中心依赖「Node.js v22」(nodejs_v22)
# manifest 需声明：install_dep_apps = nodejs_v22
# 安装本应用时，应用中心会自动安装缺失的依赖，无需自行调商店下载接口。

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

# 飞牛商店 Node.js v22 常见路径（不同卷/版本略有差异）
store_node_candidates() {
  cat <<EOF
/var/apps/nodejs_v22/target/bin/node
/var/apps/nodejs_v22/bin/node
/usr/local/apps/@appcenter/nodejs_v22/bin/node
/vol1/@appcenter/nodejs_v22/bin/node
/vol2/@appcenter/nodejs_v22/bin/node
/vol3/@appcenter/nodejs_v22/bin/node
EOF
}

# 把商店 Node 的 bin 目录插入 PATH
prepend_store_node_path() {
  local bin_dir d
  for d in \
    "/var/apps/nodejs_v22/target/bin" \
    "/var/apps/nodejs_v22/bin" \
    "/usr/local/apps/@appcenter/nodejs_v22/bin" \
    "/vol1/@appcenter/nodejs_v22/bin" \
    "/vol2/@appcenter/nodejs_v22/bin" \
    "/vol3/@appcenter/nodejs_v22/bin"
  do
    if [ -x "${d}/node" ]; then
      case ":${PATH}:" in
        *":${d}:"*) ;;
        *) export PATH="${d}:${PATH}" ;;
      esac
      return 0
    fi
  done
  return 1
}

resolve_node_bin() {
  local p
  prepend_store_node_path || true
  while IFS= read -r p; do
    [ -z "${p}" ] && continue
    if [ -x "${p}" ] && "${p}" -v >/dev/null 2>&1; then
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
  dir="$(cd "$(dirname "${node_bin}")" && pwd -P 2>/dev/null || dirname "${node_bin}")"
  npm_bin="${dir}/npm"
  if [ -x "${npm_bin}" ]; then
    echo "${npm_bin}"
    return 0
  fi
  if command -v npm >/dev/null 2>&1; then
    command -v npm
    return 0
  fi
  return 1
}

is_node_ready() {
  resolve_node_bin >/dev/null 2>&1
}

# 安装回调：只检查商店依赖是否已就绪（由 install_dep_apps 触发安装）
ensure_store_node() {
  local log_file="${TRIM_PKGVAR}/log/runtime-install.log"
  local node_bin
  mkdir -p "${TRIM_PKGVAR}/log" 2>/dev/null || true

  if node_bin="$(resolve_node_bin)"; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 使用商店/系统 Node: ${node_bin} ($("${node_bin}" -v 2>/dev/null))" >> "${log_file}"
    return 0
  fi

  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 未找到 nodejs_v22" >> "${log_file}"
  return 1
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
  # 跳过 ffmpeg-static 等可选大包，避免安装卡死；APE/情绪分析优先用系统 ffmpeg
  export npm_config_optional=false
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
ensure_better_sqlite3_native() {
  local root npm_bin log_file binding
  root="$(app_root)"
  log_file="${TRIM_PKGVAR}/log/npm-install.log"
  mkdir -p "${TRIM_PKGVAR}/log" 2>/dev/null || true

  binding="$(find "${root}/node_modules/better-sqlite3" -name '*.node' 2>/dev/null | head -n 1 || true)"
  if [ -n "${binding}" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] better-sqlite3 native ok: ${binding}" >> "${log_file}"
    return 0
  fi

  npm_bin="$(resolve_npm_bin)" || return 1
  prepend_store_node_path || true
  prepare_npm_env
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] rebuilding better-sqlite3…" >> "${log_file}"
  update_npm_ui "正在重建 better-sqlite3 原生模块…"
  (
    cd "${root}" || exit 1
    run_npm_with_timeout "${npm_bin}" "${log_file}" rebuild better-sqlite3 \
      || run_npm_with_timeout "${npm_bin}" "${log_file}" install better-sqlite3 --omit=dev --omit=optional
  ) || true

  binding="$(find "${root}/node_modules/better-sqlite3" -name '*.node' 2>/dev/null | head -n 1 || true)"
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
  if [ -f "${root}/package-lock.json" ]; then
    # 短指纹即可：升级时对比是否需要重装
    cksum "${root}/package-lock.json" 2>/dev/null | awk '{print $1"-"$2}'
    return 0
  fi
  if [ -f "${root}/package.json" ]; then
    cksum "${root}/package.json" 2>/dev/null | awk '{print $1"-"$2}'
    return 0
  fi
  echo "none"
}

# 安装生产依赖（npm 走国内源；缓存放应用目录；跳过 optional）
install_node_modules() {
  local root npm_bin log_file fp stamp force="${1:-}"
  root="$(app_root)"
  log_file="${TRIM_PKGVAR}/log/npm-install.log"
  stamp="${TRIM_PKGVAR}/npm.deps.stamp"
  mkdir -p "${TRIM_PKGVAR}/log" 2>/dev/null || true

  if [ ! -f "${root}/package.json" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 缺少 package.json: ${root}" >> "${log_file}"
    return 1
  fi

  fp="$(deps_fingerprint "${root}")"
  if [ "${force}" = "force" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] force reinstall: 清理旧 node_modules" >> "${log_file}"
    rm -rf "${root}/node_modules" 2>/dev/null || true
    rm -f "${stamp}" 2>/dev/null || true
  fi

  if [ "${force}" != "force" ] \
    && [ -d "${root}/node_modules/express" ] \
    && [ -d "${root}/node_modules/better-sqlite3" ] \
    && [ -f "${stamp}" ] \
    && [ "$(cat "${stamp}" 2>/dev/null)" = "${fp}" ]
  then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] node_modules 已是当前依赖，跳过 npm install" >> "${log_file}"
    return 0
  fi

  if [ "${force}" != "force" ] \
    && [ -d "${root}/node_modules/express" ] \
    && [ -d "${root}/node_modules/better-sqlite3" ]
  then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] node_modules 已存在，跳过 npm install" >> "${log_file}"
    echo "${fp}" > "${stamp}" 2>/dev/null || true
    return 0
  fi

  npm_bin="$(resolve_npm_bin)" || return 1
  prepend_store_node_path || true
  prepare_npm_env

  local rc=0
  local npm_pid=""
  update_npm_ui "正在安装依赖（npm，国内源）… 首次可能需几分钟，请勿关闭"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] npm install start root=${root} cache=${npm_config_cache}" >> "${log_file}"

  (
    cd "${root}" || exit 1
    # 不跑 scripts（避免 postinstall 再下二进制卡住）；随后单独确保 better-sqlite3
    if [ -f package-lock.json ]; then
      run_npm_with_timeout "${npm_bin}" "${log_file}" ci --omit=dev --omit=optional --ignore-scripts \
        || run_npm_with_timeout "${npm_bin}" "${log_file}" install --omit=dev --omit=optional --ignore-scripts
    else
      run_npm_with_timeout "${npm_bin}" "${log_file}" install --omit=dev --omit=optional --ignore-scripts
    fi
  ) &
  npm_pid=$!
  npm_progress_heartbeat "${npm_pid}" "安装"
  wait "${npm_pid}" || rc=$?

  if [ ! -d "${root}/node_modules/express" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] npm 结束后仍无 express (rc=${rc})" >> "${log_file}"
    update_npm_ui "依赖安装失败。请查看 ${log_file}；或确认可访问 registry.npmmirror.com，并已安装 Node.js v22。"
    return 1
  fi

  echo "${fp}" > "${stamp}" 2>/dev/null || true
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] npm install ok (rc=${rc})" >> "${log_file}"
  return 0
}
