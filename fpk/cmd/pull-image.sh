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
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG_FILE}"
}

fail_install() {
  log_line "错误: $*"
  log_hint_paths
  echo "$*" > "${TRIM_TEMP_LOGFILE}"
  echo "failed at $(date -Iseconds): $*" > "${TRIM_PKGVAR}/install.status" 2>/dev/null || true
  exit 1
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
    ghcr_direct|*)
      IMAGE="${DEFAULT_REGISTRY}:${tag}"
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
    fail_install "未检测到 Docker。请先在飞牛系统中安装并启用 Docker，再重新安装本应用。"
  fi
}

docker_compose_cmd() {
  if [ ! -f "${COMPOSE_FILE}" ]; then
    return 127
  fi
  if docker compose version >/dev/null 2>&1; then
    docker compose -f "${COMPOSE_FILE}" "$@"
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
  log_line "执行 docker compose pull（与手动部署相同，超时 ${timeout_sec} 秒）..."
  echo "compose pulling ${IMAGE} at $(date -Iseconds)" > "${TRIM_PKGVAR}/install.status" 2>/dev/null || true

  if [ ! -f "${COMPOSE_FILE}" ]; then
    log_line "compose 文件不存在: ${COMPOSE_FILE}"
    return 127
  fi

  local rc=0
  if docker compose version >/dev/null 2>&1; then
    if command -v timeout >/dev/null 2>&1; then
      timeout "${timeout_sec}" docker compose -p "${TRIM_APPNAME}" -f "${COMPOSE_FILE}" pull > "${pull_log}" 2>&1 || rc=$?
    else
      docker compose -p "${TRIM_APPNAME}" -f "${COMPOSE_FILE}" pull > "${pull_log}" 2>&1 || rc=$?
    fi
  elif command -v docker-compose >/dev/null 2>&1; then
    if command -v timeout >/dev/null 2>&1; then
      timeout "${timeout_sec}" docker-compose -p "${TRIM_APPNAME}" -f "${COMPOSE_FILE}" pull > "${pull_log}" 2>&1 || rc=$?
    else
      docker-compose -p "${TRIM_APPNAME}" -f "${COMPOSE_FILE}" pull > "${pull_log}" 2>&1 || rc=$?
    fi
  else
    log_line "未找到 docker compose 命令"
    return 127
  fi

  cat "${pull_log}" | tee -a "${LOG_FILE}" || true

  if [ "${rc}" -eq 0 ]; then
    read_image_from_compose
    return 0
  fi
  if [ "${rc}" -eq 124 ]; then
    log_line "compose 拉取超时（${timeout_sec} 秒）"
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
  if run_with_timeout "${timeout_sec}" docker pull "${IMAGE}" > "${pull_log}" 2>&1; then
    cat "${pull_log}" | tee -a "${LOG_FILE}"
    return 0
  fi
  rc=$?
  cat "${pull_log}" | tee -a "${LOG_FILE}" || true
  if [ "${rc}" -eq 124 ]; then
    log_line "镜像拉取超时（${timeout_sec} 秒）"
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
    if docker image inspect "${candidate}" >/dev/null 2>&1; then
      IMAGE="${candidate}"
      return 0
    fi
  done

  repo="$(find_newest_remote_image "${wizard_image_tag:-latest}" 2>/dev/null || true)"
  if [ -n "${repo}" ] && docker image inspect "${repo}" >/dev/null 2>&1; then
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

  if ! docker image inspect "${remote}" >/dev/null 2>&1; then
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
  local registry
  local pulled=0
  local last_err=""
  local last_log=""

  if [ "${source}" = "custom_image" ]; then
    update_compose_image
    if docker_pull_with_timeout || compose_pull_with_timeout; then
      if normalize_pulled_image; then
        return 0
      fi
      log_line "警告: pull 返回成功但 inspect 未命中，继续尝试其他方式…"
    fi
    last_log="$(tail -n 8 "${TRIM_PKGVAR}/pull.last.log" 2>/dev/null | tr '\n' ' ')"
    abort_pull "镜像拉取失败: ${IMAGE}。${last_log}请 SSH 执行: docker pull ${IMAGE}"
    return 1
  fi

  for registry in "${FALLBACK_REGISTRIES[@]}"; do
    IMAGE="${registry}:${tag}"
    update_compose_image
    log_line "尝试镜像源: ${IMAGE}"

    if docker_pull_with_timeout; then
      if normalize_pulled_image; then
        pulled=1
        log_line "docker pull 成功，本地可用: ${IMAGE}"
        break
      fi
      log_line "docker pull 退出码成功，但本地未识别到镜像名，尝试 compose / 下一源…"
    fi

    log_line "尝试 compose pull..."
    if compose_pull_with_timeout; then
      if normalize_pulled_image; then
        pulled=1
        log_line "compose 拉取成功，本地可用: ${IMAGE}"
        break
      fi
      log_line "compose pull 退出码成功，但本地未识别到镜像名"
    fi

    last_err="${IMAGE}"
    log_line "镜像源失败，尝试下一个..."
  done

  if [ "${pulled}" -ne 1 ]; then
    IMAGE="${DEFAULT_REGISTRY}:${tag}"
    if normalize_pulled_image; then
      log_line "未直接拉取，但本地已有可用镜像: ${IMAGE}"
      return 0
    fi
    docker images 2>&1 | tee -a "${LOG_FILE}" || true
    last_log="$(tail -n 8 "${TRIM_PKGVAR}/pull.last.log" 2>/dev/null | tr '\n' ' ')"
    abort_pull "镜像拉取失败。详情: ${last_log}可先 SSH: docker pull ghcr.1ms.run/jia070310/lemon-muisc:latest 后再启用。最后尝试: ${last_err}"
    return 1
  fi
  return 0
}

pull_image_with_progress() {
  local phase="$1"

  resolve_image_from_wizard
  ensure_docker
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
    if ! pull_image_with_fallback; then
      update_compose_image
      save_image_config
      return 1
    fi
    log_line "镜像拉取完成。"
    docker images "${IMAGE}" 2>&1 | tee -a "${LOG_FILE}" || true
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
