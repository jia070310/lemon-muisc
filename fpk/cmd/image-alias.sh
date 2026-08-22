#!/bin/bash
# Local short image name for Feiniu Docker UI / docker run.
# Remote pulls still use ghcr(.1ms.run); after pull we retag to this alias.

DOCKER_USE_SUDO="${DOCKER_USE_SUDO:-0}"

docker_cmd() {
  if [ "${DOCKER_USE_SUDO}" = "1" ]; then
    sudo docker "$@"
  else
    docker "$@"
  fi
}

# Call before any docker operation; sets DOCKER_USE_SUDO when plain docker lacks socket access.
init_docker_access() {
  if docker info >/dev/null 2>&1; then
    DOCKER_USE_SUDO=0
    return 0
  fi
  # 仅免密 sudo，避免安装向导里卡在交互式密码（表现为无网速、无日志）
  if command -v sudo >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then
    DOCKER_USE_SUDO=1
    log_line_maybe "Docker: 使用免密 sudo docker"
    return 0
  fi
  return 1
}

LOCAL_IMAGE_ALIAS="${LOCAL_IMAGE_ALIAS:-lemon-music:latest}"
LEMON_IMAGE_REPO="${LEMON_IMAGE_REPO:-jia070310/lemon-muisc}"
REMOTE_IMAGE_DEFAULT="${REMOTE_IMAGE_DEFAULT:-ghcr.1ms.run/jia070310/lemon-muisc:latest}"

# 安装向导镜像源 → registry 主机（含路径型加速）
wizard_registry_host() {
  case "${1:-ghcr_direct}" in
    mirror_nju) echo "ghcr.nju.edu.cn" ;;
    mirror_dockerproxy) echo "ghcr.dockerproxy.com" ;;
    mirror_daocloud) echo "docker.m.daocloud.io/ghcr.io" ;;
    ghcr_io) echo "ghcr.io" ;;
    mirror_1ms|ghcr_direct|*) echo "ghcr.1ms.run" ;;
  esac
}

image_ref_for_registry() {
  local host="${1:-ghcr.1ms.run}"
  local tag="${2:-latest}"
  printf '%s/%s:%s' "${host}" "${LEMON_IMAGE_REPO}" "${tag}"
}

# 按向导首选源排序，供 pull 依次尝试
pull_registry_hosts() {
  local source="${1:-ghcr_direct}"
  local primary seen="" host
  primary="$(wizard_registry_host "${source}")"
  for host in \
    "${primary}" \
    "ghcr.1ms.run" \
    "ghcr.nju.edu.cn" \
    "ghcr.dockerproxy.com" \
    "docker.m.daocloud.io/ghcr.io" \
    "ghcr.io"
  do
    case " ${seen} " in *" ${host} "*) continue ;; esac
    seen="${seen} ${host}"
    printf '%s\n' "${host}"
  done
}

REMOTE_IMAGE_FALLBACKS=(
  "ghcr.1ms.run/jia070310/lemon-muisc:latest"
  "ghcr.nju.edu.cn/jia070310/lemon-muisc:latest"
  "ghcr.dockerproxy.com/jia070310/lemon-muisc:latest"
  "docker.m.daocloud.io/ghcr.io/jia070310/lemon-muisc:latest"
  "ghcr.io/jia070310/lemon-muisc:latest"
)

image_created_at() {
  local ref="${1:-}"
  [ -n "${ref}" ] || return 1
  docker_cmd image inspect -f '{{.Created}}' "${ref}" 2>/dev/null
}

# Find the newest locally stored remote lemon-music image.
find_newest_remote_image() {
  local tag="${1:-latest}"
  local newest="" created="" img c
  for img in \
    "ghcr.1ms.run/jia070310/lemon-muisc:${tag}" \
    "ghcr.nju.edu.cn/jia070310/lemon-muisc:${tag}" \
    "ghcr.dockerproxy.com/jia070310/lemon-muisc:${tag}" \
    "docker.m.daocloud.io/ghcr.io/jia070310/lemon-muisc:${tag}" \
    "ghcr.io/jia070310/lemon-muisc:${tag}" \
    "ghcr.1ms.run/jia070310/lemon-muisc:latest" \
    "ghcr.io/jia070310/lemon-muisc:latest"
  do
    if docker_cmd image inspect "${img}" >/dev/null 2>&1; then
      c="$(image_created_at "${img}")"
      if [ -z "${newest}" ] || [ "${c}" \> "${created}" ]; then
        newest="${img}"
        created="${c}"
      fi
    fi
  done
  [ -n "${newest}" ] && printf '%s\n' "${newest}"
}

# Tag a pulled remote image as the short local alias. Echoes alias on success.
promote_to_local_image_alias() {
  local src="${1:-}"
  [ -n "${src}" ] || return 1
  docker_cmd image inspect "${src}" >/dev/null 2>&1 || return 1

  if [ "${src}" != "${LOCAL_IMAGE_ALIAS}" ]; then
    if ! docker_cmd tag "${src}" "${LOCAL_IMAGE_ALIAS}" 2>/dev/null; then
      return 1
    fi
    log_line_maybe "retag ${src} -> ${LOCAL_IMAGE_ALIAS}"
  fi

  if [ -n "${TRIM_PKGETC:-}" ]; then
    mkdir -p "${TRIM_PKGETC}" 2>/dev/null || true
    cat > "${TRIM_PKGETC}/image.conf" <<EOF
SAVED_IMAGE="${LOCAL_IMAGE_ALIAS}"
REMOTE_IMAGE="${src}"
SAVED_AT="$(date -Iseconds)"
EOF
  fi

  printf '%s\n' "${LOCAL_IMAGE_ALIAS}"
  return 0
}

log_line_maybe() {
  if declare -F log_line >/dev/null 2>&1; then
    log_line "$*"
  fi
}

# Prefer short alias when resolving any lemon image reference.
prefer_local_image_alias() {
  if docker_cmd image inspect "${LOCAL_IMAGE_ALIAS}" >/dev/null 2>&1; then
    printf '%s\n' "${LOCAL_IMAGE_ALIAS}"
    return 0
  fi
  return 1
}

# If a newer remote image exists locally, retag it to lemon-music:latest.
sync_local_image_alias() {
  local tag="${1:-latest}"
  local remote alias_created remote_created alias_id remote_id

  remote="$(find_newest_remote_image "${tag}")"
  if [ -z "${remote}" ]; then
    prefer_local_image_alias
    return $?
  fi

  if docker_cmd image inspect "${LOCAL_IMAGE_ALIAS}" >/dev/null 2>&1; then
    alias_id="$(docker_cmd image inspect -f '{{.Id}}' "${LOCAL_IMAGE_ALIAS}" 2>/dev/null || true)"
    remote_id="$(docker_cmd image inspect -f '{{.Id}}' "${remote}" 2>/dev/null || true)"
    if [ -n "${alias_id}" ] && [ "${alias_id}" = "${remote_id}" ]; then
      printf '%s\n' "${LOCAL_IMAGE_ALIAS}"
      return 0
    fi
    alias_created="$(image_created_at "${LOCAL_IMAGE_ALIAS}")"
    remote_created="$(image_created_at "${remote}")"
    if [ -n "${alias_created}" ] && [ -n "${remote_created}" ] && [ "${alias_created}" \>= "${remote_created}" ]; then
      printf '%s\n' "${LOCAL_IMAGE_ALIAS}"
      return 0
    fi
    log_line_maybe "检测到较新的远程镜像 ${remote}，更新 ${LOCAL_IMAGE_ALIAS}"
  else
    log_line_maybe "将远程镜像 ${remote} 标记为 ${LOCAL_IMAGE_ALIAS}"
  fi

  promote_to_local_image_alias "${remote}"
}
