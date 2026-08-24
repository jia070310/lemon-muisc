#!/bin/bash
# 卸载「保留 / 删除数据」：配置备份到卷根，避免随应用目录被清掉。
# 删除数据时只清理本应用配置目录，不删除用户自己的音乐库/下载目录。

app_volume_root() {
  local p="${TRIM_PKGVAR:-/vol1/@appdata/lemon-music}"
  case "${p}" in
    /vol[0-9]*) echo "${p}" | cut -d/ -f1-2 ;;
    *) echo "/vol1" ;;
  esac
}

app_keep_dir() {
  echo "$(app_volume_root)/.apps/lemon-music"
}

is_app_managed_path() {
  local target="${1:-}"
  [ -n "${target}" ] || return 1
  case "${target}" in
    "${TRIM_PKGVAR}"|"${TRIM_PKGVAR}"/*|"${TRIM_PKGETC}"|"${TRIM_PKGETC}"/*|"${TRIM_APPDEST}"|"${TRIM_APPDEST}"/*)
      return 0
      ;;
  esac
  return 1
}

backup_app_data() {
  local dest src_config
  dest="$(app_keep_dir)"
  mkdir -p "${dest}" 2>/dev/null || return 1
  load_paths
  src_config="$(resolve_config_path)"
  if [ -d "${src_config}" ]; then
    rm -rf "${dest}/config"
    cp -a "${src_config}" "${dest}/config" 2>/dev/null || true
  fi
  if [ -f "${PATHS_CONF}" ]; then
    cp -a "${PATHS_CONF}" "${dest}/paths.conf" 2>/dev/null || true
  fi
  date -Iseconds > "${dest}/saved_at" 2>/dev/null || true
  echo "kept data in ${dest}"
}

restore_app_data() {
  local src dest_config
  src="$(app_keep_dir)"
  [ -d "${src}/config" ] || return 1
  dest_config="$(default_config_path)"
  mkdir -p "${dest_config}" 2>/dev/null || true
  cp -a "${src}/config/." "${dest_config}/" 2>/dev/null || true
  if [ -f "${src}/paths.conf" ]; then
    mkdir -p "$(dirname "${PATHS_CONF}")" 2>/dev/null || true
    cp -a "${src}/paths.conf" "${PATHS_CONF}" 2>/dev/null || true
  fi
  echo "restored data from ${src}"
}

remove_app_images() {
  init_docker_access 2>/dev/null || true
  docker_cmd images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null \
    | grep -E '(^|/)lemon-muisc:|(^|/)lemon-music:' \
    | while read -r img; do
        [ -z "${img}" ] && continue
        docker_cmd rmi -f "${img}" >/dev/null 2>&1 || true
      done
}

purge_app_data() {
  local music downloads config keep
  load_paths
  music="${wizard_music_path:-}"
  downloads="${wizard_downloads_path:-}"
  config="$(resolve_config_path)"

  if is_app_managed_path "${config}"; then
    rm -rf "${config}"
  fi
  if is_app_managed_path "${music}"; then
    rm -rf "${music}"
  fi
  if is_app_managed_path "${downloads}"; then
    rm -rf "${downloads}"
  fi

  rm -rf "${TRIM_PKGVAR}/config" "${TRIM_PKGVAR}/log" \
    "${TRIM_PKGVAR}/music" "${TRIM_PKGVAR}/downloads"
  rm -f "${TRIM_PKGVAR}/accessible_paths" "${TRIM_PKGVAR}/install.status"
  rm -rf "${TRIM_PKGETC}"

  keep="$(app_keep_dir)"
  rm -rf "${keep}"

  remove_app_images
  echo "purged app config (user music folders outside app dir were not deleted)"
}
