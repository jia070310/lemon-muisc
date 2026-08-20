#!/bin/bash
# Pull Lemon Music image during install/upgrade wizard (stdout = install UI progress).

DEFAULT_REGISTRY="ghcr.io/jia070310/lemon-muisc"
IMAGE="${DEFAULT_REGISTRY}:latest"
COMPOSE_FILE="${TRIM_APPDEST}/docker/docker-compose.yaml"
IMAGE_CONF="${TRIM_PKGETC}/image.conf"

init_log() {
  mkdir -p "${TRIM_PKGVAR}/log" "${TRIM_PKGETC}" 2>/dev/null || true
  LOG_FILE="${TRIM_PKGVAR}/log/install.log"
  touch "${LOG_FILE}" 2>/dev/null || LOG_FILE="${TRIM_PKGVAR}/install.log"
}

log_line() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG_FILE}"
}

fail_install() {
  log_line "错误: $*"
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
        fail_install "已选择「自定义镜像地址」，但未填写完整镜像名。请返回向导填写，例如 registry.example.com/lemon-music:latest"
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

update_compose_image() {
  if [ ! -f "${COMPOSE_FILE}" ]; then
    return 0
  fi
  local tmp="${COMPOSE_FILE}.tmp"
  sed -E "s|^([[:space:]]*)image:[[:space:]]*.*|\1image: ${IMAGE}|" "${COMPOSE_FILE}" > "${tmp}" \
    && mv "${tmp}" "${COMPOSE_FILE}"
  log_line "已更新 compose 镜像为: ${IMAGE}"
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
  log_line "  拉取超时: ${timeout_sec} 秒"
  if [ "${wizard_apply_docker_mirror:-false}" = "true" ]; then
    log_line "  已勾选尝试 Docker registry-mirrors（对 ghcr.io 通常无效）"
  fi
  log_line "------------------------------------------"
}

docker_pull_with_timeout() {
  local timeout_sec
  timeout_sec="$(get_pull_timeout)"
  log_line "开始拉取镜像（超时 ${timeout_sec} 秒，下方为实时进度）..."
  echo "pulling ${IMAGE} at $(date -Iseconds)" > "${TRIM_PKGVAR}/install.status" 2>/dev/null || true

  set -o pipefail
  local rc=0

  if command -v timeout >/dev/null 2>&1; then
    timeout "${timeout_sec}" docker pull "${IMAGE}" 2>&1 | tee -a "${LOG_FILE}" || rc=$?
    if [ "${rc}" -eq 124 ]; then
      fail_install "镜像拉取超时（${timeout_sec} 秒）。请返回重新安装，在向导中选择更长超时、自定义镜像地址，或先 SSH 执行 docker load 后选「跳过拉取」。"
    fi
  else
    log_line "系统无 timeout 命令，将不设超时限制..."
    docker pull "${IMAGE}" 2>&1 | tee -a "${LOG_FILE}" || rc=$?
  fi

  set +o pipefail
  return "${rc}"
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
    if docker image inspect "${IMAGE}" >/dev/null 2>&1; then
      log_line "本地已存在镜像: ${IMAGE}"
    else
      fail_install "本地不存在镜像 ${IMAGE}。请先 SSH 执行 docker pull 或 docker load，或改选「官方 ghcr.io」拉取。"
    fi
  else
    if ! docker_pull_with_timeout; then
      fail_install "镜像拉取失败: ${IMAGE}。请检查网络/代理，或在向导中使用「自定义镜像地址」。日志: ${LOG_FILE}"
    fi
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
  log_line "日志: ${LOG_FILE}"
  log_line "=========================================="
  echo "completed ${IMAGE} at $(date -Iseconds)" > "${TRIM_PKGVAR}/install.status" 2>/dev/null || true
}
