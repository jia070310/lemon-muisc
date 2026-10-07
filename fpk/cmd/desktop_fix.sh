#!/bin/bash
# Best-effort: desktop shortcut + overwrite stale icon caches after upgrade.
# Feiniu often keeps first-install copies under /var/apps_ui (real dir),
# @appmeta, and poster/*.png; uninstall+reinstall clears them, upgrade does not.

pkg_root_dir() {
  local appname="${TRIM_APPNAME:-lemon-music}"
  local here
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." 2>/dev/null && pwd)" || true
  if [ -n "${here}" ] && { [ -f "${here}/ICON.PNG" ] || [ -f "${here}/ICON_256.PNG" ] || [ -d "${here}/cmd" ]; }; then
    echo "${here}"
    return 0
  fi
  if [ -d "/var/apps/${appname}" ]; then
    echo "/var/apps/${appname}"
    return 0
  fi
  echo ""
}

copy_if_src() {
  local src="$1" dest="$2"
  [ -f "${src}" ] || return 1
  mkdir -p "$(dirname "${dest}")" 2>/dev/null || true
  cp -f "${src}" "${dest}" 2>/dev/null || return 1
  touch "${dest}" 2>/dev/null || true
}

# Keep both icon_64.png and icon-64.png (ui/config uses images/icon_{0}.png)
sync_ui_images() {
  local ui_dir="$1" src64="$2" src256="$3"
  local img="${ui_dir}/images"
  local size src
  mkdir -p "${img}" 2>/dev/null || true
  for size in 16 24 32 48 64 72 96 128 192 256; do
    if [ "${size}" -ge 128 ] && [ -f "${src256}" ]; then
      src="${src256}"
    elif [ -f "${src64}" ]; then
      src="${src64}"
    else
      src="${src256}"
    fi
    [ -f "${src}" ] || continue
    cp -f "${src}" "${img}/icon_${size}.png" 2>/dev/null || true
    cp -f "${src}" "${img}/icon-${size}.png" 2>/dev/null || true
    touch "${img}/icon_${size}.png" "${img}/icon-${size}.png" 2>/dev/null || true
  done
  if [ -f "${src256}" ]; then
    cp -f "${src256}" "${img}/icon.png" 2>/dev/null || true
  elif [ -f "${src64}" ]; then
    cp -f "${src64}" "${img}/icon.png" 2>/dev/null || true
  fi
}

overwrite_icon_caches() {
  local src64="$1" src256="$2"
  local appname="${TRIM_APPNAME:-lemon-music}"
  local dir f

  # @appmeta 升级后仍保留，应用中心常从这里读首次安装的 ICON
  for dir in \
    "${TRIM_PKGMETA:-}" \
    "/var/apps/${appname}/meta" \
    /vol*/@appmeta/"${appname}" \
    /usr/local/apps/@appmeta/"${appname}"
  do
    [ -n "${dir}" ] && [ -e "${dir}" ] || continue
    copy_if_src "${src64}" "${dir}/ICON.PNG" || true
    copy_if_src "${src256}" "${dir}/ICON_256.PNG" || true
    copy_if_src "${src64}" "${dir}/icon.png" || true
    copy_if_src "${src256}" "${dir}/icon_256.png" || true
  done

  # 应用中心 poster 哈希文件名不变，就地覆盖内容即可让 URL 指向新图
  for dir in \
    "/var/apps/${appname}/poster" \
    /vol*/@appcenter/"${appname}"/poster \
    /vol*/@appmeta/"${appname}"/poster \
    /usr/local/apps/@appcenter/"${appname}"/poster
  do
    [ -d "${dir}" ] || continue
    for f in "${dir}"/*.png "${dir}"/*.PNG; do
      [ -f "${f}" ] || continue
      if [ -f "${src256}" ]; then
        cp -f "${src256}" "${f}" 2>/dev/null || true
      elif [ -f "${src64}" ]; then
        cp -f "${src64}" "${f}" 2>/dev/null || true
      fi
      touch "${f}" 2>/dev/null || true
    done
  done
}

refresh_app_icons() {
  local pkg ui_dir src64="" src256=""
  pkg="$(pkg_root_dir)"
  ui_dir="${TRIM_APPDEST}/ui"
  if [ ! -d "${ui_dir}" ] && [ -n "${pkg}" ] && [ -d "${pkg}/target/ui" ]; then
    ui_dir="${pkg}/target/ui"
  fi

  [ -n "${pkg}" ] && [ -f "${pkg}/ICON.PNG" ] && src64="${pkg}/ICON.PNG"
  [ -n "${pkg}" ] && [ -f "${pkg}/ICON_256.PNG" ] && src256="${pkg}/ICON_256.PNG"
  [ -z "${src256}" ] && [ -f "${ui_dir}/images/icon_256.png" ] && src256="${ui_dir}/images/icon_256.png"
  [ -z "${src256}" ] && [ -f "${ui_dir}/images/icon-256.png" ] && src256="${ui_dir}/images/icon-256.png"
  [ -z "${src64}" ] && [ -f "${ui_dir}/images/icon_64.png" ] && src64="${ui_dir}/images/icon_64.png"
  [ -z "${src64}" ] && src64="${src256}"
  [ -z "${src256}" ] && src256="${src64}"
  [ -n "${src64}" ] || [ -n "${src256}" ] || return 0

  [ -d "${ui_dir}" ] && sync_ui_images "${ui_dir}" "${src64}" "${src256}"
  overwrite_icon_caches "${src64}" "${src256}"
}

ensure_ui_symlink() {
  local appname="${TRIM_APPNAME:-lemon-music}"
  local ui_dir="${TRIM_APPDEST}/ui"
  local link="/var/apps_ui/${appname}"
  [ -d "${ui_dir}" ] || return 0
  mkdir -p /var/apps_ui 2>/dev/null || true
  # 首次安装可能拷成实体目录；ln -sfn 无法替换目录，升级后桌面仍读旧图
  if [ -e "${link}" ] && [ ! -L "${link}" ]; then
    rm -rf "${link}" 2>/dev/null || true
  fi
  if ! ln -sfn "${ui_dir}" "${link}" 2>/dev/null; then
    mkdir -p "${link}" 2>/dev/null || true
    cp -a "${ui_dir}/." "${link}/" 2>/dev/null || true
  fi
}

fix_desktop_db() {
  local appname="${TRIM_APPNAME:-lemon-music}"
  local port="${1:-}"
  command -v psql >/dev/null 2>&1 || return 0

  run_sql() {
    sudo -u postgres psql -d appcenter -v ON_ERROR_STOP=1 -c "$1" >/dev/null 2>&1 \
      || psql -U postgres -d appcenter -v ON_ERROR_STOP=1 -c "$1" >/dev/null 2>&1
  }

  run_sql "UPDATE app SET is_docker = false, micro_app = false, updated_at = NOW() WHERE app_name = '${appname}';" || true
  # 只修正入口可见性/打开方式，不要改 is_admin：
  # 飞牛「谁可以访问」对应 app_service.is_admin（true=仅管理员）。
  # 以前每次启用都写 is_admin=true，会覆盖用户在设置里选的「设备内所有用户」。
  if [ -n "${port}" ] && [ "${port}" -eq "${port}" ] 2>/dev/null; then
    run_sql "UPDATE app_service SET no_display = false, type = 'url', port = ${port}, updated_at = NOW() WHERE app_id IN (SELECT id FROM app WHERE app_name = '${appname}');" || true
  else
    run_sql "UPDATE app_service SET no_display = false, type = 'url', updated_at = NOW() WHERE app_id IN (SELECT id FROM app WHERE app_name = '${appname}');" || true
  fi
}

# 桌面入口协议：空字符串 = 交给飞牛按当前桌面访问方式自适应（http/https）
# 仅当用户显式写死 desktop-protocol / https.json 时才固定
read_desktop_protocol() {
  local conf forced hint
  conf="$(resolve_config_path 2>/dev/null || true)"
  [ -n "${conf}" ] || conf="${TRIM_PKGVAR:-}/config"
  if [ -f "${conf}/desktop-protocol" ]; then
    hint="$(tr -d ' \n\r' < "${conf}/desktop-protocol" 2>/dev/null)"
    case "${hint}" in
      http|https) echo "${hint}"; return 0 ;;
      auto|"") ;;
    esac
  fi
  if [ -f "${conf}/https.json" ] && command -v python3 >/dev/null 2>&1; then
    forced="$(python3 - "${conf}/https.json" <<'PY' 2>/dev/null || true
import json
from pathlib import Path
try:
    data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    en = data.get("enabled", None)
    if en is False or en == 0 or en == "0" or str(en).lower() == "false":
        print("http")
    elif en is True or en == 1 or en == "1" or str(en).lower() == "true":
        print("https")
    else:
        print("")
except Exception:
    print("")
PY
)"
    case "${forced}" in
      http|https) echo "${forced}"; return 0 ;;
    esac
  fi
  # 默认：自适应（空）
  echo ""
}

patch_ui_config_port() {
  local file="$1" port="$2" protocol="${3-}"
  [ -f "${file}" ] || return 0
  [ -n "${port}" ] || return 0
  if [ "${#}" -lt 3 ]; then
    protocol="$(read_desktop_protocol)"
  fi
  if command -v python3 >/dev/null 2>&1; then
    python3 - "${file}" "${port}" "${protocol}" <<'PY' 2>/dev/null || true
import json, sys
from pathlib import Path
path, port, protocol = Path(sys.argv[1]), str(sys.argv[2]), str(sys.argv[3] if len(sys.argv) > 3 else "")
# 空字符串 = 飞牛自适应；仅允许 http / https / ""
if protocol not in ("http", "https", ""):
    protocol = ""
try:
    data = json.loads(path.read_text(encoding="utf-8"))
except Exception:
    sys.exit(0)
root = data.get(".url") if isinstance(data, dict) else None
if isinstance(root, dict):
    for item in root.values():
        if isinstance(item, dict):
            if "port" in item:
                item["port"] = port
            if "protocol" in item:
                item["protocol"] = protocol
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY
    return 0
  fi
  sed -i -E "s/\"port\"[[:space:]]*:[[:space:]]*\"[^\"]*\"/\"port\": \"${port}\"/" "${file}" 2>/dev/null || true
  sed -i -E "s/\"protocol\"[[:space:]]*:[[:space:]]*\"[^\"]*\"/\"protocol\": \"${protocol}\"/" "${file}" 2>/dev/null || true
}

sync_desktop_port() {
  local port="${1:-}"
  local appname="${TRIM_APPNAME:-lemon-music}"
  local file
  if [ -z "${port}" ] && declare -F read_saved_service_port >/dev/null 2>&1; then
    port="$(read_saved_service_port)"
  fi
  [ -n "${port}" ] || port=7983

  for file in \
    "${TRIM_APPDEST}/ui/config" \
    "/var/apps_ui/${appname}/config" \
    "/var/apps/${appname}/target/ui/config"
  do
    patch_ui_config_port "${file}" "${port}"
  done
  echo "${port}"
}

ensure_desktop_entry() {
  local port protocol
  refresh_app_icons || true
  port="$(sync_desktop_port)"
  protocol="$(read_desktop_protocol)"
  ensure_ui_symlink
  sync_desktop_port "${port}" >/dev/null
  # 再写一遍协议，避免 sync 只改端口
  for file in \
    "${TRIM_APPDEST}/ui/config" \
    "/var/apps_ui/${TRIM_APPNAME:-lemon-music}/config" \
    "/var/apps/${TRIM_APPNAME:-lemon-music}/target/ui/config"
  do
    patch_ui_config_port "${file}" "${port}" "${protocol}"
  done
  fix_desktop_db "${port}"
}
