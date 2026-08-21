#!/bin/bash
# Local short image name for Feiniu Docker UI / docker run.
# Remote pulls still use ghcr(.1ms.run); after pull we retag to this alias.

LOCAL_IMAGE_ALIAS="${LOCAL_IMAGE_ALIAS:-lemon-music:latest}"
REMOTE_IMAGE_DEFAULT="${REMOTE_IMAGE_DEFAULT:-ghcr.1ms.run/jia070310/lemon-muisc:latest}"
REMOTE_IMAGE_FALLBACKS=(
  "ghcr.1ms.run/jia070310/lemon-muisc:latest"
  "ghcr.io/jia070310/lemon-muisc:latest"
)

# Tag a pulled remote image as the short local alias. Echoes alias on success.
promote_to_local_image_alias() {
  local src="${1:-}"
  [ -n "${src}" ] || return 1
  docker image inspect "${src}" >/dev/null 2>&1 || return 1

  if [ "${src}" != "${LOCAL_IMAGE_ALIAS}" ]; then
    if ! docker tag "${src}" "${LOCAL_IMAGE_ALIAS}" 2>/dev/null; then
      return 1
    fi
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

# Prefer short alias when resolving any lemon image reference.
prefer_local_image_alias() {
  if docker image inspect "${LOCAL_IMAGE_ALIAS}" >/dev/null 2>&1; then
    printf '%s\n' "${LOCAL_IMAGE_ALIAS}"
    return 0
  fi
  return 1
}
