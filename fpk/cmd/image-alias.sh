#!/bin/bash
# Local short image name for Feiniu Docker UI / docker run.
# Remote pulls still use ghcr(.1ms.run); after pull we retag to this alias.

LOCAL_IMAGE_ALIAS="${LOCAL_IMAGE_ALIAS:-lemon-music:latest}"
REMOTE_IMAGE_DEFAULT="${REMOTE_IMAGE_DEFAULT:-ghcr.1ms.run/jia070310/lemon-muisc:latest}"
REMOTE_IMAGE_FALLBACKS=(
  "ghcr.1ms.run/jia070310/lemon-muisc:latest"
  "ghcr.io/jia070310/lemon-muisc:latest"
)

image_created_at() {
  local ref="${1:-}"
  [ -n "${ref}" ] || return 1
  docker image inspect -f '{{.Created}}' "${ref}" 2>/dev/null
}

# Find the newest locally stored remote lemon-music image.
find_newest_remote_image() {
  local tag="${1:-latest}"
  local newest="" created="" img c
  for img in \
    "ghcr.1ms.run/jia070310/lemon-muisc:${tag}" \
    "ghcr.io/jia070310/lemon-muisc:${tag}" \
    "ghcr.1ms.run/jia070310/lemon-muisc:latest" \
    "ghcr.io/jia070310/lemon-muisc:latest"
  do
    if docker image inspect "${img}" >/dev/null 2>&1; then
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
  docker image inspect "${src}" >/dev/null 2>&1 || return 1

  if [ "${src}" != "${LOCAL_IMAGE_ALIAS}" ]; then
    if ! docker tag "${src}" "${LOCAL_IMAGE_ALIAS}" 2>/dev/null; then
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
  if docker image inspect "${LOCAL_IMAGE_ALIAS}" >/dev/null 2>&1; then
    printf '%s\n' "${LOCAL_IMAGE_ALIAS}"
    return 0
  fi
  return 1
}

# If a newer remote image exists locally, retag it to lemon-music:latest.
sync_local_image_alias() {
  local tag="${1:-latest}"
  local remote alias_created remote_created

  remote="$(find_newest_remote_image "${tag}")"
  if [ -z "${remote}" ]; then
    prefer_local_image_alias
    return $?
  fi

  if docker image inspect "${LOCAL_IMAGE_ALIAS}" >/dev/null 2>&1; then
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
