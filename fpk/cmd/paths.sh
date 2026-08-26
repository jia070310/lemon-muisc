#!/bin/bash
# Shared path helpers for FPK lifecycle scripts.

PATHS_CONF="${TRIM_PKGETC}/paths.conf"
IMAGE_CONF="${TRIM_PKGETC}/image.conf"
ACCESSIBLE_FILE="${TRIM_PKGVAR}/accessible_paths"
COMPOSE_FILE="${TRIM_APPDEST}/docker/docker-compose.yaml"
COMPOSE_DIR="$(dirname "${COMPOSE_FILE}")"
COMPOSE_ENV="${COMPOSE_DIR}/.env"
# shellcheck disable=SC1091
. "$(dirname "$0")/image-alias.sh"
DEFAULT_IMAGE="${LOCAL_IMAGE_ALIAS}"
CONTAINER_NAME="lemon-music"
COMPOSE_PROJECT="${TRIM_APPNAME:-lemon-music}"

is_container_running() {
  docker_cmd inspect -f '{{.State.Running}}' "${CONTAINER_NAME}" 2>/dev/null | grep -qi true
}

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

  # 环境变量为空时，读上次保存的访问权限列表
  if [ -z "${raw}" ] && [ -f "${ACCESSIBLE_FILE}" ]; then
    raw="$(tr -d '\r' < "${ACCESSIBLE_FILE}" 2>/dev/null)"
  fi

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
  local default_music default_downloads

  default_music="$(default_music_path)"
  default_downloads="$(default_downloads_path)"

  if parse_accessible_paths; then
    auth_music="${RESOLVED_MUSIC}"
    auth_downloads="${RESOLVED_DOWNLOADS}"
  fi

  # 安装占位路径（TRIM_PKGVAR/...）不算用户配置；优先用访问权限 / 向导新值
  if [ -n "${auth_music}" ]; then
    if [ -z "${music}" ] || [ "${music}" = "${default_music}" ]; then
      music="${auth_music}"
    fi
  fi
  if [ -n "${auth_downloads}" ]; then
    if [ -z "${downloads}" ] || [ "${downloads}" = "${default_downloads}" ]; then
      downloads="${auth_downloads}"
    fi
  fi

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

# 飞牛 docker-project 会按 compose 的 image 去拉仓库。
# 短名（lemon-music:latest）会被解析成 registry-1.docker.io，国内必超时。
# compose 里永远写带 registry 的完整地址；本地短名只用于 docker run。
compose_registry_image() {
  local img="${1:-}"
  local remote=""

  if [ -f "${IMAGE_CONF}" ]; then
    # shellcheck disable=SC1090
    . "${IMAGE_CONF}"
    remote="${REMOTE_IMAGE:-}"
  fi

  case "${img}" in
    ""|lemon-music|lemon-music:*)
      if [ -n "${remote}" ]; then
        case "${remote}" in
          */*|ghcr.*|*.*/*) printf '%s\n' "${remote}"; return 0 ;;
        esac
      fi
      printf '%s\n' "${REMOTE_IMAGE_DEFAULT}"
      return 0
      ;;
    */*|ghcr.*|*.*/*)
      printf '%s\n' "${img}"
      return 0
      ;;
    *)
      # 其它无仓库前缀短名同样会打到 Docker Hub
      printf '%s\n' "${REMOTE_IMAGE_DEFAULT}"
      return 0
      ;;
  esac
}

# 当前向导/环境选定的完整镜像（优先于旧 image.conf，避免总是拉 latest）
wizard_selected_image() {
  if [ -n "${IMAGE:-}" ]; then
    case "${IMAGE}" in
      */*|ghcr.*|*.*/*)
        printf '%s\n' "${IMAGE}"
        return 0
        ;;
    esac
  fi
  if [ -n "${wizard_custom_image:-}" ] && [ "${wizard_pull_source:-}" = "custom_image" ]; then
    printf '%s\n' "${wizard_custom_image}"
    return 0
  fi
  if [ -n "${wizard_image_tag:-}" ] || [ -n "${wizard_pull_source:-}" ]; then
    local host tag
    host="$(wizard_registry_host "${wizard_pull_source:-mirror_1ms}")"
    tag="${wizard_image_tag:-latest}"
    image_ref_for_registry "${host}" "${tag}"
    return 0
  fi
  return 1
}

get_compose_image() {
  local parsed="" remote="" selected=""

  # 1) 本次安装/升级向导选择（最优先，否则会永远沿用上次的 latest）
  if selected="$(wizard_selected_image 2>/dev/null)"; then
    compose_registry_image "${selected}"
    return 0
  fi

  if [ -f "${IMAGE_CONF}" ]; then
    # shellcheck disable=SC1090
    . "${IMAGE_CONF}"
    if [ -n "${REMOTE_IMAGE:-}" ]; then
      compose_registry_image "${REMOTE_IMAGE}"
      return 0
    fi
  fi

  if [ -f "${COMPOSE_FILE}" ]; then
    parsed="$(grep -E '^[[:space:]]*image:[[:space:]]*' "${COMPOSE_FILE}" | head -n 1 | sed -E 's/^[[:space:]]*image:[[:space:]]*//' | tr -d '\r' | xargs)"
    if [ -n "${parsed}" ]; then
      compose_registry_image "${parsed}"
      return 0
    fi
  fi

  echo "${REMOTE_IMAGE_DEFAULT}"
}

# docker run 优先本地短名，避免依赖仓库可达性
get_runtime_image() {
  if prefer_local_image_alias >/dev/null 2>&1; then
    echo "${LOCAL_IMAGE_ALIAS}"
    return 0
  fi
  if resolved="$(resolve_local_image_name "$(get_compose_image)" 2>/dev/null)"; then
    echo "${resolved}"
    return 0
  fi
  get_compose_image
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

# 供 docker compose 与飞牛 docker-project 共同读取
write_compose_env() {
  local music="${1:-}"
  local downloads="${2:-}"
  local config="${3:-}"
  mkdir -p "${COMPOSE_DIR}" 2>/dev/null || true
  cat > "${COMPOSE_ENV}" <<EOF
wizard_music_path=${music}
wizard_downloads_path=${downloads}
wizard_config_path=${config}
EOF
}

write_compose_file() {
  local music="${1:-$(default_music_path)}"
  local downloads="${2:-$(default_downloads_path)}"
  local config="${3:-$(default_config_path)}"
  local image
  image="$(get_compose_image)"

  mkdir -p "${COMPOSE_DIR}" 2>/dev/null || true
  write_compose_env "${music}" "${downloads}" "${config}"

  # compose 只用完整仓库地址（飞牛 docker-project）；挂载必须写绝对路径
  image="$(compose_registry_image "${image}")"
  cat > "${COMPOSE_FILE}" <<EOF
services:
  lemon-music:
    image: ${image}
    container_name: ${CONTAINER_NAME}
    restart: always
    ports:
      - "7983:7983"
    volumes:
      - "${music}:/music"
      - "${downloads}:/downloads"
      - "${config}:/config"
    environment:
      PORT: "7983"
      DOWNLOAD_PATH: /music
      CONFIG_PATH: /config
      MUSIC_HOST_PATH: "${music}"
      DOWNLOADS_HOST_PATH: "${downloads}"
EOF

  log_config "wrote compose volumes music=${music} downloads=${downloads} config=${config}"
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
  mkdir -p "${config}" "${RESOLVED_MUSIC}" "${RESOLVED_DOWNLOADS}" 2>/dev/null || true
  write_mounts_meta "${RESOLVED_MUSIC}" "${RESOLVED_DOWNLOADS}" "${config}"
  write_compose_file "${RESOLVED_MUSIC}" "${RESOLVED_DOWNLOADS}" "${config}"
  touch "${config}/.user-paths-configured" 2>/dev/null || true
  log_config "saved music=${RESOLVED_MUSIC} downloads=${RESOLVED_DOWNLOADS} config=${config}"
  return 0
}

compose_up() {
  local project="${1:-${COMPOSE_PROJECT}}"
  if [ -f "${COMPOSE_ENV}" ]; then
    docker_cmd compose -p "${project}" -f "${COMPOSE_FILE}" --env-file "${COMPOSE_ENV}" up -d --force-recreate --remove-orphans
  else
    docker_cmd compose -p "${project}" -f "${COMPOSE_FILE}" up -d --force-recreate --remove-orphans
  fi
}

# 检查容器内挂载源是否匹配期望的宿主机路径
mount_matches_expected() {
  local expected_music="${1:-}"
  local expected_downloads="${2:-}"
  local mounts

  if ! docker_cmd inspect "${CONTAINER_NAME}" >/dev/null 2>&1; then
    return 1
  fi

  mounts="$(docker_cmd inspect -f '{{range .Mounts}}{{.Destination}}={{.Source}};{{end}}' "${CONTAINER_NAME}" 2>/dev/null || true)"
  echo "${mounts}" | grep -q "/music=${expected_music};" || return 1
  echo "${mounts}" | grep -q "/downloads=${expected_downloads};" || return 1
  return 0
}

# 启用/重建前确保本地有镜像（安装若秒完成、飞牛未拉取时，这里补拉）
resolve_local_image_name() {
  local want="${1:-}"
  local candidate repo tag="latest"

  case "${want}" in
    *:*) tag="${want##*:}" ;;
  esac
  [ -n "${wizard_image_tag:-}" ] && tag="${wizard_image_tag}"

  # 对明确版本号，优先精确匹配，不要用 sync latest 把旧版冲掉
  if [ "${tag}" != "latest" ]; then
    for candidate in \
        "${want}" \
        "ghcr.io/${want#ghcr.1ms.run/}" \
        "ghcr.1ms.run/${want#ghcr.io/}" \
        "ghcr.1ms.run/jia070310/lemon-muisc:${tag}" \
        "ghcr.io/jia070310/lemon-muisc:${tag}"
    do
      [ -z "${candidate}" ] && continue
      if docker_cmd image inspect "${candidate}" >/dev/null 2>&1; then
        if promote_to_local_image_alias "${candidate}" >/dev/null 2>&1; then
          echo "${LOCAL_IMAGE_ALIAS}"
          return 0
        fi
        echo "${candidate}"
        return 0
      fi
    done
    if declare -F any_lemon_image_in_docker_list >/dev/null 2>&1 \
      && listed="$(any_lemon_image_in_docker_list "${want:-jia070310/lemon-muisc:${tag}}" 2>/dev/null)"; then
      if promote_to_local_image_alias "${listed}" >/dev/null 2>&1; then
        echo "${LOCAL_IMAGE_ALIAS}"
        return 0
      fi
      echo "${listed}"
      return 0
    fi
    return 1
  fi

  if synced="$(sync_local_image_alias latest 2>/dev/null)"; then
    echo "${synced}"
    return 0
  fi

  if alias_name="$(prefer_local_image_alias)"; then
    echo "${alias_name}"
    return 0
  fi

  for candidate in \
      "${want}" \
      "ghcr.io/${want#ghcr.1ms.run/}" \
      "ghcr.1ms.run/${want#ghcr.io/}" \
      "${REMOTE_IMAGE_DEFAULT}" \
      "ghcr.io/jia070310/lemon-muisc:latest"
  do
    [ -z "${candidate}" ] && continue
    case "${candidate}" in
      ghcr.io/ghcr.io/*|ghcr.1ms.run/ghcr.1ms.run/*|ghcr.io/ghcr.1ms.run/*|ghcr.1ms.run/ghcr.io/*) continue ;;
    esac
    if docker_cmd image inspect "${candidate}" >/dev/null 2>&1; then
      if promote_to_local_image_alias "${candidate}" >/dev/null 2>&1; then
        echo "${LOCAL_IMAGE_ALIAS}"
        return 0
      fi
      echo "${candidate}"
      return 0
    fi
  done

  repo="$(docker_cmd images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep -E 'lemon-muisc|lemon-music' | head -n 1 || true)"
  if [ -n "${repo}" ] && docker_cmd image inspect "${repo}" >/dev/null 2>&1; then
    if promote_to_local_image_alias "${repo}" >/dev/null 2>&1; then
      echo "${LOCAL_IMAGE_ALIAS}"
      return 0
    fi
    echo "${repo}"
    return 0
  fi
  return 1
}

ensure_image_available() {
  local image="${1:-}"
  local remote resolved
  local log_file="${TRIM_PKGVAR}/log/compose.recreate.log"
  local pull_timeout="${IMAGE_PULL_TIMEOUT:-180}"

  if [ -z "${image}" ]; then
    image="$(get_compose_image)"
  fi

  # 若已有较新的远程镜像，先 retag 到 lemon-music:latest
  if resolved="$(sync_local_image_alias latest 2>/dev/null)"; then
    log_config "using synced alias: ${resolved}"
    return 0
  fi

  if prefer_local_image_alias >/dev/null 2>&1; then
    log_config "image present: ${LOCAL_IMAGE_ALIAS}"
    return 0
  fi

  if resolved="$(resolve_local_image_name "${image}" 2>/dev/null)"; then
    log_config "using existing image: ${resolved}"
    return 0
  fi

  if [ "${SKIP_REMOTE_PULL:-0}" = "1" ]; then
    log_config "no local image (remote pull disabled on enable/start)"
    return 1
  fi

  mkdir -p "$(dirname "${log_file}")" 2>/dev/null || true
  {
    echo "=== pull missing image $(date -Iseconds) timeout=${pull_timeout}s ==="
    echo "wanted=${image}"
  } >> "${log_file}" 2>&1

  for remote in "${REMOTE_IMAGE_FALLBACKS[@]}"; do
    log_config "image missing, pulling: ${remote} (timeout ${pull_timeout}s)"
    echo "pull ${remote}" >> "${log_file}" 2>&1
    if command -v timeout >/dev/null 2>&1; then
      timeout "${pull_timeout}" docker_cmd pull "${remote}" >> "${log_file}" 2>&1 || continue
    else
      docker_cmd pull "${remote}" >> "${log_file}" 2>&1 || continue
    fi
    if resolved="$(promote_to_local_image_alias "${remote}")"; then
      log_config "docker pull ok, aliased as: ${resolved}"
      return 0
    fi
  done

  log_config "all image pulls failed or timed out"
  return 1
}

recreate_compose_stack() {
  local log_file="${TRIM_PKGVAR}/log/compose.recreate.log"
  init_docker_access 2>/dev/null || true
  local music downloads config image
  mkdir -p "$(dirname "${log_file}")" 2>/dev/null || true

  if [ ! -f "${COMPOSE_ENV}" ]; then
    log_config "compose .env missing"
    return 1
  fi

  # shellcheck disable=SC1090
  . "${COMPOSE_ENV}"
  music="${wizard_music_path}"
  downloads="${wizard_downloads_path}"
  config="${wizard_config_path:-$(default_config_path)}"
  image="$(get_compose_image)"

  if [ -z "${music}" ] || [ -z "${downloads}" ]; then
    log_config "recreate aborted: empty music/downloads"
    return 1
  fi

  mkdir -p "${music}" "${downloads}" "${config}" 2>/dev/null || true
  write_compose_file "${music}" "${downloads}" "${config}"
  image="$(get_compose_image)"

  if ! ensure_image_available "${image}"; then
    log_config "recreate aborted: no image"
    echo "本地没有 Docker 镜像，自动拉取也失败。请检查网络，或在 SSH 执行: docker pull ghcr.1ms.run/jia070310/lemon-muisc:latest && docker tag ghcr.1ms.run/jia070310/lemon-muisc:latest lemon-music:latest" >> "${log_file}"
    return 1
  fi
  # compose 仍写完整仓库地址；实际 docker run 优先本地短名
  write_compose_file "${music}" "${downloads}" "${config}"
  image="$(get_runtime_image)"

  {
    echo "=== recreate $(date -Iseconds) ==="
    echo "music=${music}"
    echo "downloads=${downloads}"
    echo "config=${config}"
    echo "image=${image}"
    docker_cmd stop "${CONTAINER_NAME}" 2>/dev/null || true
    docker_cmd rm -f "${CONTAINER_NAME}" 2>/dev/null || true
    docker_cmd compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}" down --remove-orphans 2>/dev/null || true
    docker_cmd compose -p "lemon-music" -f "${COMPOSE_FILE}" down --remove-orphans 2>/dev/null || true
  } >> "${log_file}" 2>&1

  if ! docker_cmd run -d \
      --name "${CONTAINER_NAME}" \
      --restart always \
      -p 7983:7983 \
      -v "${music}:/music" \
      -v "${downloads}:/downloads" \
      -v "${config}:/config" \
      -e PORT=7983 \
      -e DOWNLOAD_PATH=/music \
      -e CONFIG_PATH=/config \
      -e "MUSIC_HOST_PATH=${music}" \
      -e "DOWNLOADS_HOST_PATH=${downloads}" \
      --label "com.lemon-music.managed=1" \
      "${image}" >> "${log_file}" 2>&1; then
    log_config "docker run failed: $(tail -n 5 "${log_file}" 2>/dev/null | tr '\n' ' ')"
    if is_container_running; then
      log_config "container already running with same name"
      return 0
    fi
    return 1
  fi

  sleep 1
  if mount_matches_expected "${music}" "${downloads}"; then
    log_config "docker run ok, mounts verified music=${music} downloads=${downloads}"
    return 0
  fi

  # 飞牛 docker-project 可能抢着重启成 @appdata：再强制重建一次
  {
    echo "=== remount retry $(date -Iseconds) ==="
    docker_cmd stop "${CONTAINER_NAME}" 2>/dev/null || true
    docker_cmd rm -f "${CONTAINER_NAME}" 2>/dev/null || true
    docker_cmd compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}" down --remove-orphans 2>/dev/null || true
  } >> "${log_file}" 2>&1

  if docker_cmd run -d \
      --name "${CONTAINER_NAME}" \
      --restart always \
      -p 7983:7983 \
      -v "${music}:/music" \
      -v "${downloads}:/downloads" \
      -v "${config}:/config" \
      -e PORT=7983 \
      -e DOWNLOAD_PATH=/music \
      -e CONFIG_PATH=/config \
      -e "MUSIC_HOST_PATH=${music}" \
      -e "DOWNLOADS_HOST_PATH=${downloads}" \
      --label "com.lemon-music.managed=1" \
      "${image}" >> "${log_file}" 2>&1 \
     && sleep 1 \
     && mount_matches_expected "${music}" "${downloads}"; then
    log_config "docker run retry ok music=${music} downloads=${downloads}"
    return 0
  fi

  log_config "docker run up but mounts mismatch: $(docker_cmd inspect -f '{{range .Mounts}}{{.Destination}}={{.Source}};{{end}}' "${CONTAINER_NAME}" 2>/dev/null)"
  if is_container_running; then
    log_config "container is running, treat enable as success (check mounts in app settings if paths wrong)"
    return 0
  fi
  return 1
}

# 路径已配置但挂载不对时，自动纠偏（供 main status / config_callback 调用）
ensure_mounts_applied() {
  if ! resolve_paths; then
    return 1
  fi
  local config
  config="$(resolve_config_path)"
  write_compose_file "${RESOLVED_MUSIC}" "${RESOLVED_DOWNLOADS}" "${config}"
  write_mounts_meta "${RESOLVED_MUSIC}" "${RESOLVED_DOWNLOADS}" "${config}"

  if mount_matches_expected "${RESOLVED_MUSIC}" "${RESOLVED_DOWNLOADS}"; then
    return 0
  fi

  log_config "mounts outdated or missing, recreating..."
  recreate_compose_stack
}
