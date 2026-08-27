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
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] rebuilding better-sqlite3…" >> "${log_file}"
  (
    cd "${root}" || exit 1
    export npm_config_registry="https://registry.npmmirror.com"
    export npm_config_disturl="https://npmmirror.com/mirrors/node"
    "${npm_bin}" rebuild better-sqlite3 >> "${log_file}" 2>&1 \
      || "${npm_bin}" install better-sqlite3 --omit=dev >> "${log_file}" 2>&1
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

# 安装生产依赖（npm 走国内源）
install_node_modules() {
  local root npm_bin log_file
  root="$(app_root)"
  log_file="${TRIM_PKGVAR}/log/npm-install.log"
  mkdir -p "${TRIM_PKGVAR}/log" 2>/dev/null || true

  if [ ! -f "${root}/package.json" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 缺少 package.json: ${root}" >> "${log_file}"
    return 1
  fi

  if [ -d "${root}/node_modules/express" ] && [ -d "${root}/node_modules/better-sqlite3" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] node_modules 已存在，跳过 npm install" >> "${log_file}"
    return 0
  fi

  npm_bin="$(resolve_npm_bin)" || return 1
  prepend_store_node_path || true

  local rc=0
  (
    cd "${root}" || exit 1
    export npm_config_registry="https://registry.npmmirror.com"
    export npm_config_disturl="https://npmmirror.com/mirrors/node"
    export npm_config_fetch_timeout=600000
    export npm_config_better_sqlite3_binary_host="https://npmmirror.com/mirrors/better-sqlite3"
    if [ -f package-lock.json ]; then
      "${npm_bin}" ci --omit=dev >> "${log_file}" 2>&1 || "${npm_bin}" install --omit=dev >> "${log_file}" 2>&1
    else
      "${npm_bin}" install --omit=dev >> "${log_file}" 2>&1
    fi
  ) || rc=$?

  if [ ! -d "${root}/node_modules/express" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] npm 结束后仍无 express (rc=${rc})" >> "${log_file}"
    return 1
  fi
  return 0
}
