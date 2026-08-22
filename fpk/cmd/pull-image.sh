#!/bin/bash
# Pull Lemon Music image during install/upgrade wizard (stdout = install UI progress).
# 优先使用 docker compose pull，与手动 docker-compose.yml 部署行为一致。

DEFAULT_REGISTRY="ghcr.1ms.run/jia070310/lemon-muisc"
FALLBACK_REGISTRIES=(
  "ghcr.1ms.run/jia070310/lemon-muisc"
  "ghcr.io/jia070310/lemon-muisc"
)
# shellcheck disable=SC1091
. "$(dirname "$0")/image-alias.sh"
IMAGE="${DEFAULT_REGISTRY}:latest"
COMPOSE_FILE="${TRIM_APPDEST}/docker/docker-compose.yaml"
COMPOSE_DIR="$(dirname "${COMPOSE_FILE}")"
IMAGE_CONF="${TRIM_PKGETC}/image.conf"

init_log() {
  mkdir -p "${TRIM_PKGVAR}/log" "${TRIM_PKGETC}" 2>/dev/null || true
  LOG_FILE="${TRIM_PKGVAR}/log/install.log"
  touch "${LOG_FILE}" 2>/dev/null || true
  if [ ! -f "${LOG_FILE}" ]; then
    LOG_FILE="${TRIM_PKGVAR}/install.log"
    touch "${LOG_FILE}" 2>/dev/null || true
  fi
  if [ -n "${TRIM_APPDEST}" ]; then
    mkdir -p "${TRIM_APPDEST}/../var/log" 2>/dev/null || true
  fi
}

log_hint_paths() {
  log_line "日志路径（需 SSH 查看，文件管理器通常看不到 @appdata）:"
  log_line "  ${LOG_FILE}"
  [ -n "${TRIM_PKGVAR}" ] && log_line "  ${TRIM_PKGVAR}/install.log"
  log_line "  /var/apps/lemon-music/var/log/install.log"
}

log_line() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "${LOG_FILE}" 2>/dev/null || true
}

pull_log_has_fatal_error() {
  local log="$1"
  [ -s "${log}" ] || return 1
  grep -qiE 'permission denied while trying to connect to the Docker daemon|Cannot connect to the Docker daemon|Is the docker daemon running\?' "${log}" 2>/dev/null
}

pull_log_indicates_success() {
  local log="$1"
  grep -qiE 'Downloaded newer image|Status: Downloaded newer image|Image is up to date|Pull complete|pull complete' "${log}" 2>/dev/null
}

append_pull_log_to_install_log() {
  local pull_log="$1"
  if [ -s "${pull_log}" ]; then
    cat "${pull_log}" >> "${LOG_FILE}" 2>/dev/null || true
  fi
}

fail_install() {
  log_line "错误: $*"
  log_hint_paths
  echo "$*" > "${TRIM_TEMP_LOGFILE}"
  echo "failed at $(date -Iseconds): $*" > "${TRIM_PKGVAR}/install.status" 2>/dev/null || true
  exit 1
}

update_install_ui() {
  echo "$*" > "${TRIM_TEMP_LOGFILE}" 2>/dev/null || true
}

# 从 docker pull --progress=plain 日志解析可读进度（供安装窗口文案展示）
format_pull_progress_from_log() {
  local log="$1"
  local complete total pct dl_line

  if [ ! -s "${log}" ]; then
    echo "0% · 正在连接镜像仓库…"
    return 0
  fi

  if grep -qiE 'Downloaded newer image|Status: Downloaded newer image|Image is up to date' "${log}" 2>/dev/null; then
    echo "100% · 镜像拉取完成"
    return 0
  fi

  complete="$(grep -ciE '^#[0-9]+ pull complete|Pull complete' "${log}" 2>/dev/null | tr -d ' \n\r' || true)"
  complete="${complete:-0}"
  total="$(grep -oE '^#[0-9]+' "${log}" 2>/dev/null | sed 's/^#//' | sort -n | tail -1 || true)"
  total="${total:-0}"

  if [ "${total}" -lt 1 ]; then
    total="$(grep -ciE 'Pulling fs layer|pulling fs layer' "${log}" 2>/dev/null | tr -d ' \n\r' || true)"
  fi
  if [ "${total}" -lt 1 ]; then
    total=12
  fi
  if [ "${complete}" -gt "${total}" ]; then
    total="${complete}"
  fi

  pct=$(( complete * 100 / total ))
  if [ "${pct}" -lt 1 ]; then
    pct=1
  fi
  if [ "${complete}" -lt "${total}" ] && [ "${pct}" -ge 100 ]; then
    pct=99
  fi

  dl_line="$(grep -iE 'downloading|extracting|Waiting|Verifying|Pulling fs layer|pulling manifest|Pulling from' "${log}" 2>/dev/null | tail -1 | sed 's/^[[:space:]]*//;s/\r$//' | cut -c1-120)"
  if [ -n "${dl_line}" ]; then
    echo "${pct}% · 已完成 ${complete}/${total} 层 · ${dl_line}"
  else
    echo "${pct}% · 已完成 ${complete}/${total} 层"
  fi
}

update_install_pull_ui() {
  local image="$1"
  local log_file="$2"
  local status
  status="$(format_pull_progress_from_log "${log_file}")"
  update_install_ui "【实际拉取进度 ${status}】
镜像：${image}
提示：上方 55% 为飞牛系统进度，请以下方百分比为准"
  echo "${status}" > "${TRIM_PKGVAR}/pull.progress" 2>/dev/null || true
}

start_pull_progress_reporter() {
  local log_file="$1"
  local image="$2"
  local done_flag="$3"
  (
    local last_size=0 stall=0 tick=0 last_log_tick=0
    while [ ! -f "${done_flag}" ]; do
      local cur_size=0
      if [ -f "${log_file}" ]; then
        cur_size="$(wc -c < "${log_file}" 2>/dev/null | tr -d ' \n\r')"
        cur_size="${cur_size:-0}"
      fi
      if [ "${cur_size}" -le "${last_size}" ]; then
        stall=$((stall + 1))
      else
        stall=0
        last_size="${cur_size}"
      fi
      tick=$((tick + 1))
      # 每 30 秒把 pull 进度摘要写入 install.log，便于 tail -f install.log 观察
      if [ "${tick}" -ge 30 ] && [ $((tick - last_log_tick)) -ge 30 ]; then
        last_log_tick="${tick}"
        if [ -s "${log_file}" ]; then
          echo "[$(date '+%Y-%m-%d %H:%M:%S')] 拉取进度: $(format_pull_progress_from_log "${log_file}")" >> "${LOG_FILE}" 2>/dev/null || true
        elif [ "${stall}" -ge 30 ]; then
          echo "[$(date '+%Y-%m-%d %H:%M:%S')] 拉取进行中，尚未收到 docker 输出（已等待 ${stall}s）…" >> "${LOG_FILE}" 2>/dev/null || true
        fi
      fi
      if [ "${stall}" -ge 20 ] && [ "${cur_size}" -lt 200 ]; then
        update_install_ui "【镜像仓库连接较慢 / 无流量】
镜像：${image}
已等待约 ${stall} 秒仍无下载数据。请检查 NAS 网络，或取消后 SSH 执行：
docker pull ${image}
再选手动安装 +「跳过拉取」"
      else
        update_install_pull_ui "${image}" "${log_file}"
      fi
      sleep 1
    done
    update_install_pull_ui "${image}" "${log_file}"
  ) &
  echo $!
}

preflight_registry() {
  local image="$1"
  log_line "预检镜像仓库: ${image}"
  update_install_ui "正在连接镜像仓库…
${image}"
  if command -v timeout >/dev/null 2>&1; then
    if timeout 20 docker_cmd manifest inspect "${image}" >/dev/null 2>&1; then
      log_line "仓库预检 OK: ${image}"
    else
      log_line "仓库预检未响应（仍将尝试 pull，可能是镜像加速域名限制 manifest）"
    fi
  fi
  return 0
}

image_already_pulled() {
  local tag="${wizard_image_tag:-latest}"
  local candidate
  resolve_image_from_wizard
  for candidate in \
    "${IMAGE}" \
    "${DEFAULT_REGISTRY}:${tag}" \
    "ghcr.io/jia070310/lemon-muisc:${tag}" \
    "${LOCAL_IMAGE_ALIAS}"
  do
    if docker_cmd image inspect "${candidate}" >/dev/null 2>&1; then
      IMAGE="${candidate}"
      return 0
    fi
  done
  return 1
}

# SOFT_PULL_FAIL=1 时只记录错误并返回 1，不中断安装（交给飞牛 docker-project / 启用时再拉）
abort_pull() {
  log_line "错误: $*"
  echo "$*" > "${TRIM_PKGVAR}/pull.failed" 2>/dev/null || true
  if [ "${SOFT_PULL_FAIL:-0}" = "1" ]; then
    return 1
  fi
  fail_install "$*"
}

read_image_from_compose() {
  if [ -f "${COMPOSE_FILE}" ]; then
    local parsed
    parsed="$(grep -E '^[[:space:]]*image:[[:space:]]*' "${COMPOSE_FILE}" | head -n 1 | sed -E 's/^[[:space:]]*image:[[:space:]]*//' | tr -d '\r' | xargs)"
    if [ -n "${parsed}" ]; then
      IMAGE="${parsed}"
    fi
  fi
}

load_saved_image_config() {
  if [ -f "${IMAGE_CONF}" ]; then
    # shellcheck disable=SC1090
    . "${IMAGE_CONF}"
    if [ -n "${SAVED_IMAGE}" ]; then
      IMAGE="${SAVED_IMAGE}"
    fi
  fi
}

resolve_image_from_wizard() {
  local source="${wizard_pull_source:-ghcr_direct}"
  local tag="${wizard_image_tag:-latest}"
  local host

  case "${source}" in
    custom_image)
      if [ -z "${wizard_custom_image}" ]; then
        fail_install "已选择「自定义镜像地址」，但未填写完整镜像名。例如 ghcr.1ms.run/jia070310/lemon-muisc:latest"
      fi
      IMAGE="${wizard_custom_image}"
      ;;
    skip_pull)
      load_saved_image_config
      read_image_from_compose
      ;;
    mirror_1ms|mirror_nju|mirror_dockerproxy|mirror_daocloud|ghcr_io|ghcr_direct|*)
      host="$(wizard_registry_host "${source}")"
      IMAGE="$(image_ref_for_registry "${host}" "${tag}")"
      ;;
  esac
}

get_pull_timeout() {
  local t="${wizard_pull_timeout:-600}"
  if ! echo "${t}" | grep -Eq '^[0-9]+$'; then
    t=600
  fi
  if [ "${t}" -lt 60 ]; then
    t=60
  fi
  echo "${t}"
}

ensure_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    if [ "${SOFT_PULL_FAIL:-0}" = "1" ]; then
      log_line "警告: 未检测到 docker 命令，跳过在线拉取"
      return 1
    fi
    fail_install "未检测到 Docker。请先在飞牛系统中安装并启用 Docker，再重新安装本应用。"
  fi
  log_line "Docker 检测: 用户=$(id -un 2>/dev/null || echo '?') uid=$(id -u 2>/dev/null || echo '?')"
  if ! init_docker_access; then
    if [ "${SOFT_PULL_FAIL:-0}" = "1" ]; then
      log_line "警告: 安装/升级进程无法访问 Docker（与 SSH 用户权限不同），跳过在线拉取"
      return 1
    fi
    fail_install "安装脚本无法访问 Docker（与 SSH 不同用户/无 socket 权限）。请先 SSH 执行: docker pull ghcr.1ms.run/jia070310/lemon-muisc:latest && docker tag ghcr.1ms.run/jia070310/lemon-muisc:latest lemon-music:latest ，再选手动安装并选「跳过拉取」。"
  fi
  return 0
}

docker_compose_cmd() {
  if [ ! -f "${COMPOSE_FILE}" ]; then
    return 127
  fi
  if docker_cmd compose version >/dev/null 2>&1; then
    docker_cmd compose -f "${COMPOSE_FILE}" "$@"
    return $?
  fi
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose -f "${COMPOSE_FILE}" "$@"
    return $?
  fi
  return 127
}

update_compose_image() {
  if [ ! -f "${COMPOSE_FILE}" ]; then
    log_line "警告: 未找到 compose 文件 ${COMPOSE_FILE}"
    return 0
  fi
  local tmp="${COMPOSE_FILE}.tmp"
  sed -E "s|^([[:space:]]*)image:[[:space:]]*.*|\1image: ${IMAGE}|" "${COMPOSE_FILE}" > "${tmp}" \
    && mv "${tmp}" "${COMPOSE_FILE}"
  log_line "已写入 compose 镜像: ${IMAGE}"
}

save_image_config() {
  mkdir -p "${TRIM_PKGETC}" 2>/dev/null || true
  local saved="${IMAGE}"
  case "${saved}" in
    ghcr.*|ghcr.io/*|*/lemon-muisc:*|*/lemon-music:*) saved="${LOCAL_IMAGE_ALIAS}" ;;
  esac
  cat > "${IMAGE_CONF}" << EOF
SAVED_IMAGE="${saved}"
SAVED_PULL_SOURCE="${wizard_pull_source:-ghcr_direct}"
SAVED_PULL_TIMEOUT="${wizard_pull_timeout:-600}"
SAVED_AT="$(date -Iseconds)"
EOF
  IMAGE="${saved}"
}

show_wizard_summary() {
  local source="${wizard_pull_source:-ghcr_direct}"
  local timeout_sec
  timeout_sec="$(get_pull_timeout)"
  log_line "------------------------------------------"
  log_line "安装向导配置:"
  log_line "  拉取方式: ${source}"
  log_line "  目标镜像: ${IMAGE}"
  log_line "  compose: ${COMPOSE_FILE}"
  log_line "  拉取超时: ${timeout_sec} 秒"
  log_line "------------------------------------------"
}

run_with_timeout() {
  local timeout_sec="$1"
  shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "${timeout_sec}" "$@"
    return $?
  fi
  "$@"
}

compose_pull_with_timeout() {
  local timeout_sec
  timeout_sec="$(get_pull_timeout)"
  local pull_log="${TRIM_PKGVAR}/compose.pull.log"
  local done_flag="${pull_log}.done"
  local reporter_pid=0

  read_image_from_compose
  case "${IMAGE}" in
    lemon-music:*|lemon-music)
      if ! docker_cmd image inspect "${IMAGE}" >/dev/null 2>&1; then
        log_line "compose 为本地短名 ${IMAGE} 且不存在，跳过 compose pull（避免误拉 Docker Hub）"
        return 127
      fi
      ;;
  esac

  log_line "执行 docker compose pull（超时 ${timeout_sec} 秒）..."
  echo "compose pulling ${IMAGE} at $(date -Iseconds)" > "${TRIM_PKGVAR}/install.status" 2>/dev/null || true
  update_install_pull_ui "${IMAGE}" "${pull_log}"

  if [ ! -f "${COMPOSE_FILE}" ]; then
    log_line "compose 文件不存在: ${COMPOSE_FILE}"
    return 127
  fi

  rm -f "${done_flag}" 2>/dev/null || true
  : > "${pull_log}" 2>/dev/null || true
  reporter_pid="$(start_pull_progress_reporter "${pull_log}" "${IMAGE}" "${done_flag}")"

  local rc=0
  if docker_cmd compose version >/dev/null 2>&1; then
    if command -v timeout >/dev/null 2>&1; then
      timeout "${timeout_sec}" docker_cmd compose -p "${TRIM_APPNAME}" -f "${COMPOSE_FILE}" pull --progress plain > "${pull_log}" 2>&1 || rc=$?
    else
      docker_cmd compose -p "${TRIM_APPNAME}" -f "${COMPOSE_FILE}" pull --progress plain > "${pull_log}" 2>&1 || rc=$?
    fi
  elif command -v docker-compose >/dev/null 2>&1; then
    if command -v timeout >/dev/null 2>&1; then
      timeout "${timeout_sec}" docker-compose -p "${TRIM_APPNAME}" -f "${COMPOSE_FILE}" pull > "${pull_log}" 2>&1 || rc=$?
    else
      docker-compose -p "${TRIM_APPNAME}" -f "${COMPOSE_FILE}" pull > "${pull_log}" 2>&1 || rc=$?
    fi
  else
    touch "${done_flag}" 2>/dev/null || true
    wait "${reporter_pid}" 2>/dev/null || true
    log_line "未找到 docker compose 命令"
    return 127
  fi

  touch "${done_flag}" 2>/dev/null || true
  wait "${reporter_pid}" 2>/dev/null || true
  append_pull_log_to_install_log "${pull_log}"

  if [ "${rc}" -eq 0 ]; then
    update_install_pull_ui "${IMAGE}" "${pull_log}"
    read_image_from_compose
    return 0
  fi
  if [ "${rc}" -eq 124 ]; then
    log_line "compose 拉取超时（${timeout_sec} 秒）"
    update_install_ui "镜像拉取超时（${timeout_sec}s），可 SSH 手动 pull 后选「跳过拉取」"
    return 124
  fi
  return "${rc}"
}

docker_pull_with_timeout() {
  local timeout_sec
  timeout_sec="$(get_pull_timeout)"
  log_line "执行 docker pull ${IMAGE}（超时 ${timeout_sec} 秒）..."
  echo "pulling ${IMAGE} at $(date -Iseconds)" > "${TRIM_PKGVAR}/install.status" 2>/dev/null || true

  local rc=0
  local pull_log="${TRIM_PKGVAR}/pull.last.log"
  local done_flag="${pull_log}.done"
  rm -f "${done_flag}" 2>/dev/null || true
  : > "${pull_log}" 2>/dev/null || true

  preflight_registry "${IMAGE}"
  log_line "预检完成，开始 docker pull（实时层进度见 ${pull_log}，也可用 tail -f 该文件）"
  update_install_pull_ui "${IMAGE}" "${pull_log}"
  local reporter_pid
  reporter_pid="$(start_pull_progress_reporter "${pull_log}" "${IMAGE}" "${done_flag}")"

  if run_with_timeout "${timeout_sec}" docker_cmd pull --progress plain "${IMAGE}" >> "${pull_log}" 2>&1; then
    rc=0
  else
    rc=$?
  fi

  touch "${done_flag}" 2>/dev/null || true
  wait "${reporter_pid}" 2>/dev/null || true
  append_pull_log_to_install_log "${pull_log}"

  if pull_log_has_fatal_error "${pull_log}"; then
    log_line "Docker 守护进程不可用（permission denied / 未运行）"
    update_install_ui "无法连接 Docker。请确认飞牛 Docker 已启动，且应用以 root 运行；或 SSH 手动 pull 后选「跳过拉取」。"
    return 125
  fi

  if [ "${rc}" -eq 0 ]; then
    if pull_log_indicates_success "${pull_log}" || docker_cmd image inspect "${IMAGE}" >/dev/null 2>&1; then
      update_install_pull_ui "${IMAGE}" "${pull_log}"
      echo "pull done ${IMAGE} at $(date -Iseconds)" > "${TRIM_PKGVAR}/pull.progress" 2>/dev/null || true
      echo "pull done ${IMAGE} at $(date -Iseconds)" > "${TRIM_PKGVAR}/install.status" 2>/dev/null || true
      return 0
    fi
    log_line "docker pull 退出码为 0，但日志与本地 inspect 均未确认成功"
    return 1
  fi

  if [ "${rc}" -eq 124 ]; then
    log_line "镜像拉取超时（${timeout_sec} 秒）"
    update_install_ui "镜像拉取超时（${timeout_sec}s），可 SSH 手动 pull 后选「跳过拉取」"
    return 124
  fi
  return "${rc}"
}

image_exists_locally() {
  local candidate repo
  local pulled_ref="${IMAGE:-}"

  # 刚拉取的远程引用优先，避免误用旧的 lemon-music:latest
  for candidate in \
      "${pulled_ref}" \
      "ghcr.io/${pulled_ref#ghcr.1ms.run/}" \
      "ghcr.1ms.run/${pulled_ref#ghcr.io/}" \
      "ghcr.1ms.run/jia070310/lemon-muisc:latest" \
      "ghcr.io/jia070310/lemon-muisc:latest" \
      "jia070310/lemon-muisc:latest" \
      "${LOCAL_IMAGE_ALIAS}"
  do
    [ -z "${candidate}" ] && continue
    case "${candidate}" in
      ghcr.io/ghcr.io/*|ghcr.1ms.run/ghcr.1ms.run/*|ghcr.io/ghcr.1ms.run/*|ghcr.1ms.run/ghcr.io/*) continue ;;
    esac
    if docker_cmd image inspect "${candidate}" >/dev/null 2>&1; then
      IMAGE="${candidate}"
      return 0
    fi
  done

  repo="$(find_newest_remote_image "${wizard_image_tag:-latest}" 2>/dev/null || true)"
  if [ -n "${repo}" ] && docker_cmd image inspect "${repo}" >/dev/null 2>&1; then
    IMAGE="${repo}"
    log_line "检测到最新远程镜像: ${IMAGE}"
    return 0
  fi

  return 1
}

# 拉取后把远程镜像 retag 为 lemon-music:latest，并写回 compose
normalize_pulled_image() {
  local remote="${IMAGE:-}"
  local promoted=""

  if ! docker_cmd image inspect "${remote}" >/dev/null 2>&1; then
    remote="$(find_newest_remote_image "${wizard_image_tag:-latest}" 2>/dev/null || true)"
  fi

  if [ -z "${remote}" ] && ! image_exists_locally; then
    return 1
  fi

  [ -n "${remote}" ] || remote="${IMAGE}"

  if promoted="$(promote_to_local_image_alias "${remote}")"; then
    IMAGE="${promoted}"
    log_line "已打本地短名: ${IMAGE} ← ${remote}"
  elif promoted="$(sync_local_image_alias "${wizard_image_tag:-latest}")"; then
    IMAGE="${promoted}"
    log_line "已同步本地短名: ${IMAGE}"
  else
    return 1
  fi

  update_compose_image
  save_image_config
  return 0
}

pull_image_with_fallback() {
  local tag="${wizard_image_tag:-latest}"
  local source="${wizard_pull_source:-ghcr_direct}"
  local registry host
  local pulled=0
  local last_err=""
  local last_log=""
  local pull_rc=0
  local -a registry_hosts=()

  while IFS= read -r host; do
    [ -n "${host}" ] && registry_hosts+=("${host}")
  done <<EOF
$(pull_registry_hosts "${source}")
EOF

  # 飞牛 install_callback 内 docker 常不可用：只试用户选的加速源，且受 INSTALL_PULL_SOFT 限制时长
  if [ "${INSTALL_PULL_SOFT:-0}" = "1" ] && [ "${#registry_hosts[@]}" -gt 1 ]; then
    registry_hosts=("${registry_hosts[0]}")
    log_line "安装阶段软拉取：仅尝试首选源 ${registry_hosts[0]}"
  fi

  if [ "${source}" = "custom_image" ]; then
    update_compose_image
    pull_rc=0
    docker_pull_with_timeout || pull_rc=$?
    if [ "${pull_rc}" -eq 125 ]; then
      abort_pull "无法连接 Docker。请确认 Docker 已启动且应用有权限访问 /var/run/docker.sock"
      return 1
    fi
    if [ "${pull_rc}" -eq 0 ] && normalize_pulled_image; then
      return 0
    fi
    last_log="$(tail -n 8 "${TRIM_PKGVAR}/pull.last.log" 2>/dev/null | tr '\n' ' ')"
    abort_pull "镜像拉取失败: ${IMAGE}。${last_log}请 SSH 执行: docker pull ${IMAGE}"
    return 1
  fi

  for host in "${registry_hosts[@]}"; do
    IMAGE="$(image_ref_for_registry "${host}" "${tag}")"
    update_compose_image
    log_line "尝试镜像源: ${IMAGE}"

    pull_rc=0
    docker_pull_with_timeout || pull_rc=$?

    if [ "${pull_rc}" -eq 125 ]; then
      abort_pull "无法连接 Docker。请确认 Docker 已启动且应用有 root 权限，或 SSH 手动 pull 后选「跳过拉取」。"
      return 1
    fi

    if [ "${pull_rc}" -eq 0 ]; then
      if normalize_pulled_image; then
        pulled=1
        log_line "docker pull 成功，本地可用: ${IMAGE}"
        break
      fi
      log_line "docker pull 退出码成功，但本地未识别到镜像名，尝试下一源…"
    elif [ "${pull_rc}" -eq 124 ]; then
      last_err="${IMAGE} (超时)"
      log_line "镜像源超时，尝试下一个..."
      continue
    fi

    last_err="${IMAGE}"
    log_line "镜像源失败，尝试下一个..."
  done

  if [ "${pulled}" -ne 1 ]; then
    IMAGE="$(image_ref_for_registry "$(wizard_registry_host "${source}")" "${tag}")"
    if normalize_pulled_image; then
      log_line "未直接拉取，但本地已有可用镜像: ${IMAGE}"
      return 0
    fi
    docker_cmd images 2>&1 >> "${LOG_FILE}" || true
    last_log="$(tail -n 8 "${TRIM_PKGVAR}/pull.last.log" 2>/dev/null | tr '\n' ' ')"
    abort_pull "镜像拉取失败。详情: ${last_log}可先 SSH: docker pull ghcr.1ms.run/jia070310/lemon-muisc:latest 后再启用。最后尝试: ${last_err}"
    return 1
  fi
  return 0
}

pull_image_with_progress() {
  local phase="$1"

  resolve_image_from_wizard
  if ! ensure_docker; then
    update_compose_image
    save_image_config
    return 1
  fi
  show_wizard_summary

  log_line "=========================================="
  log_line "柠檬音乐下载 · ${phase}"
  log_line "=========================================="

  if [ "${wizard_pull_source:-ghcr_direct}" = "skip_pull" ]; then
    log_line "已选择跳过拉取，同步本地镜像..."
    read_image_from_compose
    if sync_local_image_alias "${wizard_image_tag:-latest}" >/dev/null; then
      IMAGE="${LOCAL_IMAGE_ALIAS}"
      log_line "本地已同步镜像: ${IMAGE}"
    elif image_exists_locally; then
      normalize_pulled_image || true
      log_line "本地已存在镜像: ${IMAGE}"
    else
      if [ "${SOFT_PULL_FAIL:-0}" = "1" ]; then
        log_line "本地暂无镜像，安装将继续；请稍后 SSH 拉取或启用时自动拉取"
        update_compose_image
        save_image_config
        return 1
      fi
      fail_install "本地不存在镜像 ${IMAGE}。请先 SSH 执行 docker pull，或不要选「跳过拉取」。"
    fi
  else
    log_line "在线拉取镜像（始终从仓库更新，不沿用旧本地层）…"
    if ! pull_image_with_fallback; then
      update_compose_image
      save_image_config
      return 1
    fi
    log_line "镜像拉取完成。"
    update_install_ui "【实际拉取进度 100% · 镜像拉取完成】
镜像：${IMAGE}
正在写入配置…"
    docker_cmd images "${IMAGE}" 2>&1 >> "${LOG_FILE}" || true
  fi

  update_compose_image
  save_image_config
  return 0
}

mark_install_complete() {
  local phase="$1"
  log_line "=========================================="
  log_line "${phase}完成！"
  log_line "镜像: ${IMAGE}"
  log_line "请在应用中心点击「启动」"
  log_line "访问: http://<NAS_IP>:7983"
  log_hint_paths
  log_line "=========================================="
  echo "completed ${IMAGE} at $(date -Iseconds)" > "${TRIM_PKGVAR}/install.status" 2>/dev/null || true
}
