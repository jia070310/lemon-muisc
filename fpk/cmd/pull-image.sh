#!/bin/bash
# Shared helpers for pulling the Lemon Music Docker image during install/upgrade.

IMAGE="ghcr.io/jia070310/lemon-muisc:latest"
COMPOSE_FILE="${TRIM_APPDEST}/docker/docker-compose.yaml"

init_log() {
  LOG_FILE="${TRIM_PKGVAR}/install.log"
  mkdir -p "${TRIM_PKGVAR}/log" "${TRIM_PKGVAR}" 2>/dev/null || true
  LOG_FILE="${TRIM_PKGVAR}/log/install.log"
  mkdir -p "$(dirname "${LOG_FILE}")"
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

ensure_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    fail_install "未检测到 Docker，请先在飞牛系统中安装并启用 Docker 后再安装本应用。"
  fi
}

pull_image_with_progress() {
  local phase="$1"
  read_image_from_compose
  ensure_docker

  log_line "=========================================="
  log_line "柠檬音乐下载 · ${phase}"
  log_line "镜像: ${IMAGE}"
  log_line "=========================================="
  log_line "开始拉取镜像（下方为 Docker 拉取进度）..."

  echo "pulling at $(date -Iseconds)" > "${TRIM_PKGVAR}/install.status" 2>/dev/null || true

  if ! docker pull "${IMAGE}" 2>&1 | tee -a "${LOG_FILE}"; then
    fail_install "镜像拉取失败: ${IMAGE}。请检查网络或代理，详见 ${LOG_FILE}。"
  fi

  log_line "镜像拉取完成。"
  docker images "${IMAGE}" 2>&1 | tee -a "${LOG_FILE}" || true
}

mark_install_complete() {
  local phase="$1"
  log_line "=========================================="
  log_line "${phase}完成！"
  log_line "下一步：在应用中心启动「柠檬音乐下载」"
  log_line "访问地址: http://<NAS_IP>:7983"
  log_line "安装日志: ${LOG_FILE}"
  log_line "=========================================="
  echo "completed at $(date -Iseconds)" > "${TRIM_PKGVAR}/install.status" 2>/dev/null || true
}
