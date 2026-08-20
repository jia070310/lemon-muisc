#!/bin/bash
# Shared path helpers for FPK lifecycle scripts.

PATHS_CONF="${TRIM_PKGETC}/paths.conf"
IMAGE_CONF="${TRIM_PKGETC}/image.conf"
ACCESSIBLE_FILE="${TRIM_PKGVAR}/accessible_paths"
COMPOSE_FILE="${TRIM_APPDEST}/docker/docker-compose.yaml"
COMPOSE_DIR="$(dirname "${COMPOSE_FILE}")"
DEFAULT_IMAGE="ghcr.1ms.run/jia070310/lemon-muisc:latest"

default_config_path() {
  echo "${TRIM_PKGVAR}/config"
}

default_music_path() {
  echo "${TRIM_PKGVAR}/music"
}

default_downloads_path() {
  echo "${TRIM_PKGVAR}/downloads"
}

load_paths() {
  # 先保存 fnOS 传入的向导环境变量（不能被 paths.conf 覆盖丢失）
  local env_music="${wizard_music_path:-}"
  local env_downloads="${wizard_downloads_path:-}"
  local env_config="${wizard_config_path:-}"

  wizard_music_path=""
  wizard_downloads_path=""
  wizard_config_path=""

  if [ -f "${PATHS_CONF}" ]; then
    # shellcheck disable=SC1090
    . "${PATHS_CONF}"
  fi

  if [ -n "${env_music}" ]; then
    wizard_music_path="${env_music}"
  fi
  if [ -n "${env_downloads}" ]; then
    wizard_downloads_path="${env_downloads}"
  fi
  if [ -n "${env_config}" ]; then
    wizard_config_path="${env_config}"
  fi
}

save_paths() {
  local music="${1:-}"
  local downloads="${2:-}"
  local config="${3:-}"
  mkdir -p "${TRIM_PKGETC}" 2>/dev/null || true
  cat > "${PATHS_CONF}" <<EOF
wizard_music_path="${music}"
wizard_downloads_path="${downloads}"
wizard_config_path="${config}"
EOF
}

save_accessible_paths() {
  mkdir -p "${TRIM_PKGVAR}/log" 2>/dev/null || true
  if [ -n "${TRIM_DATA_ACCESSIBLE_PATHS}" ]; then
    echo "${TRIM_DATA_ACCESSIBLE_PATHS}" > "${ACCESSIBLE_FILE}" 2>/dev/null || true
  fi
}

log_config() {
  mkdir -p "${TRIM_PKGVAR}/log" 2>/dev/null || true
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "${TRIM_PKGVAR}/log/config.log" 2>/dev/null || true
}

parse_accessible_paths() {
  local raw="${1:-${TRIM_DATA_ACCESSIBLE_PATHS}}"
  local auth_music=""
  local auth_downloads=""

  if [ -z "${raw}" ]; then
    return 1
  fi

  if echo "${raw}" | grep -q '^\['; then
    auth_music="$(echo "${raw}" | sed -n 's/.*"\([^"]*\)".*/\1/p' | sed -n '1p')"
    auth_downloads="$(echo "${raw}" | sed -n 's/.*"\([^"]*\)".*/\1/p' | sed -n '2p')"
  else
    auth_music="${raw%%:*}"
    if [ "${raw}" != "${auth_music}" ]; then
      auth_downloads="${raw#*:}"
      auth_downloads="${auth_downloads%%:*}"
    fi
  fi

  if [ -z "${auth_downloads}" ]; then
    auth_downloads="${auth_music}"
  fi

  RESOLVED_MUSIC="${auth_music}"
  RESOLVED_DOWNLOADS="${auth_downloads}"
  [ -n "${RESOLVED_MUSIC}" ]
}

resolve_paths() {
  load_paths

  local music="${wizard_music_path}"
  local downloads="${wizard_downloads_path}"
  local auth_music=""
  local auth_downloads=""

  if parse_accessible_paths; then
    auth_music="${RESOLVED_MUSIC}"
    auth_downloads="${RESOLVED_DOWNLOADS}"
  fi

  [ -z "${music}" ] && music="${auth_music}"
  [ -z "${downloads}" ] && downloads="${auth_downloads}"

  if [ -n "${music}" ] && [ -z "${downloads}" ]; then
    downloads="${music}"
  fi

  RESOLVED_MUSIC="${music}"
  RESOLVED_DOWNLOADS="${downloads}"

  [ -n "${RESOLVED_MUSIC}" ] && [ -n "${RESOLVED_DOWNLOADS}" ]
}

resolve_config_path() {
  load_paths
  if [ -n "${wizard_config_path}" ]; then
    echo "${wizard_config_path}"
  else
    default_config_path
  fi
}

paths_ready() {
  load_paths
  [ -n "${wizard_music_path}" ] && [ -n "${wizard_downloads_path}" ]
}

get_compose_image() {
  if [ -f "${IMAGE_CONF}" ]; then
    # shellcheck disable=SC1090
    . "${IMAGE_CONF}"
    if [ -n "${SAVED_IMAGE}" ]; then
      echo "${SAVED_IMAGE}"
      return 0
    fi
  fi
  if [ -f "${COMPOSE_FILE}" ]; then
    local parsed
    parsed="$(grep -E '^[[:space:]]*image:[[:space:]]*' "${COMPOSE_FILE}" | head -n 1 | sed -E 's/^[[:space:]]*image:[[:space:]]*//' | tr -d '\r' | xargs)"
    if [ -n "${parsed}" ]; then
      echo "${parsed}"
      return 0
    fi
  fi
  echo "${DEFAULT_IMAGE}"
}

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

write_mounts_meta() {
  local music="${1:-}"
  local downloads="${2:-}"
  local config="${3:-}"
  local em ed
  em="$(json_escape "${music}")"
  ed="$(json_escape "${downloads}")"
  mkdir -p "${config}" 2>/dev/null || true
  cat > "${config}/mounts.json" <<EOF
{"music":{"host":"${em}","container":"/music"},"downloads":{"host":"${ed}","container":"/downloads"}}
EOF
}

write_compose_file() {
  local music="${1:-$(default_music_path)}"
  local downloads="${2:-$(default_downloads_path)}"
  local config="${3:-$(default_config_path)}"
  local image
  image="$(get_compose_image)"

  mkdir -p "${COMPOSE_DIR}" 2>/dev/null || true

  cat > "${COMPOSE_FILE}" <<EOF
services:
  lemon-music:
    image: ${image}
    container_name: lemon-music
    restart: unless-stopped
    ports:
      - "7983:7983"
    volumes:
      - "${music}:/music"
      - "${downloads}:/downloads"
      - "${config}:/config"
    environment:
      PORT: 7983
      DOWNLOAD_PATH: /music
      CONFIG_PATH: /config
      MUSIC_HOST_PATH: "${music}"
      DOWNLOADS_HOST_PATH: "${downloads}"
EOF
}

apply_saved_paths() {
  save_accessible_paths

  if ! resolve_paths; then
    log_config "paths incomplete, saved accessible only"
    return 1
  fi

  local config
  config="$(resolve_config_path)"
  save_paths "${RESOLVED_MUSIC}" "${RESOLVED_DOWNLOADS}" "${config}"
  mkdir -p "${config}" 2>/dev/null || true
  write_mounts_meta "${RESOLVED_MUSIC}" "${RESOLVED_DOWNLOADS}" "${config}"
  write_compose_file "${RESOLVED_MUSIC}" "${RESOLVED_DOWNLOADS}" "${config}"
  touch "${config}/.user-paths-configured" 2>/dev/null || true
  log_config "saved music=${RESOLVED_MUSIC} downloads=${RESOLVED_DOWNLOADS} config=${config}"
  return 0
}

recreate_compose_stack() {
  local log_file="${TRIM_PKGVAR}/log/compose.recreate.log"
  mkdir -p "$(dirname "${log_file}")" 2>/dev/null || true

  cd "${COMPOSE_DIR}" || return 1

  {
    echo "=== recreate $(date -Iseconds) ==="
    echo "compose=${COMPOSE_FILE}"
    echo "project=${TRIM_APPNAME}"
    docker compose -p "${TRIM_APPNAME}" -f "${COMPOSE_FILE}" down --remove-orphans || true
  } > "${log_file}" 2>&1

  if docker compose -p "${TRIM_APPNAME}" -f "${COMPOSE_FILE}" up -d --force-recreate >> "${log_file}" 2>&1; then
    log_config "compose recreate ok"
    return 0
  fi
  log_config "compose recreate failed: $(tr '\n' ' ' < "${log_file}" 2>/dev/null)"
  return 1
}
