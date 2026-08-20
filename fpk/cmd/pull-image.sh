#!/bin/bash
# Pull Lemon Music image during install/upgrade wizard (stdout = install UI progress).
# 优先使用 docker compose pull，与手动 docker-compose.yml 部署行为一致。

DEFAULT_REGISTRY="ghcr.1ms.run/jia070310/lemon-muisc"
FALLBACK_REGISTRIES=(
  "ghcr.1ms.run/jia070310/lemon-muisc"
  "ghcr.io/jia070310/lemon-muisc"
)
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
  cat > "${IMAGE_CONF}" << EOF
SAVED_IMAGE="${IMAGE}"
SAVED_PULL_SOURCE="${wizard_pull_source:-ghcr_direct}"
SAVED_PULL_TIMEOUT="${wizard_pull_timeout:-600}"
SAVED_AT="$(date -Iseconds)"
EOF
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
    fail_install "compose 拉取超时（${timeout_sec} 秒）。请延长超时或选「跳过拉取」。"
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
    fail_install "镜像拉取超时（${timeout_sec} 秒）。请延长超时或选「跳过拉取」。"
  fi
  return "${rc}"
}

image_exists_locally() {
  docker image inspect "${IMAGE}" >/dev/null 2>&1
}

pull_image_with_fallback() {
  local tag="${wizard_image_tag:-latest}"
  local source="${wizard_pull_source:-ghcr_direct}"
  local registry
  local pulled=0
  local last_err=""

  if [ "${source}" = "custom_image" ]; then
    update_compose_image
    # 优先 docker pull（不依赖 compose 项目）；失败再 compose pull
    if docker_pull_with_timeout || compose_pull_with_timeout; then
      return 0
    fi
    fail_install "镜像拉取失败: ${IMAGE}。请检查自定义地址，或 SSH 执行: docker pull ${IMAGE}"
  fi

  for registry in "${FALLBACK_REGISTRIES[@]}"; do
    IMAGE="${registry}:${tag}"
    update_compose_image
    log_line "尝试镜像源: ${IMAGE}"

    # 先 docker pull，避免「安装秒完成、本地无镜像」
    if docker_pull_with_timeout; then
      pulled=1
      log_line "docker pull 成功: ${IMAGE}"
      break
    fi

    log_line "docker pull 失败，尝试 compose pull..."
    if compose_pull_with_timeout; then
      pulled=1
      log_line "compose 拉取成功: ${IMAGE}"
      break
    fi

    last_err="${IMAGE}"
    log_line "镜像源失败，尝试下一个..."
  done

  if [ "${pulled}" -ne 1 ]; then
    fail_install "镜像拉取失败（已尝试 docker pull 与 compose pull）。请检查网络或选自定义加速地址。最后失败: ${last_err}"
  fi

  if ! image_exists_locally; then
    fail_install "拉取命令已返回成功，但本地仍找不到镜像 ${IMAGE}。请 SSH 执行 docker images 核对。"
  fi
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
    log_line "已选择跳过拉取，检查本地镜像..."
    read_image_from_compose
    if image_exists_locally; then
      log_line "本地已存在镜像: ${IMAGE}"
    else
      fail_install "本地不存在镜像 ${IMAGE}。你已通过 Docker 项目部署的话，请确认 compose 里 image 与此一致，或先执行 docker compose pull。"
    fi
  else
    pull_image_with_fallback
    log_line "镜像拉取完成。"
    docker images "${IMAGE}" 2>&1 | tee -a "${LOG_FILE}" || true
  fi

  update_compose_image
  save_image_config
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
