#!/bin/bash
# Best-effort: desktop shortcut + overwrite stale icon caches after upgrade.
# Feiniu often keeps first-install copies under /var/apps_ui (real dir),
# @appmeta, and poster/*.png; uninstall+reinstall clears them, upgrade does not.

pkg_root_dir() {
  local appname="${TRIM_APPNAME:-lemon-music}"
  local here parent
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." 2>/dev/null && pwd)" || true
  # 运行时 cmd 在 target/cmd，ICON 在包根 /var/apps/<app>/ICON.PNG
  if [ -n "${here}" ]; then
    if [ -f "${here}/ICON.PNG" ] || [ -f "${here}/ICON_256.PNG" ]; then
      echo "${here}"
      return 0
    fi
    parent="$(cd "${here}/.." 2>/dev/null && pwd)" || true
    if [ -n "${parent}" ] && { [ -f "${parent}/ICON.PNG" ] || [ -f "${parent}/ICON_256.PNG" ]; }; then
      echo "${parent}"
      return 0
    fi
  fi
  if [ -n "${TRIM_APPDEST:-}" ]; then
    parent="$(cd "${TRIM_APPDEST}/.." 2>/dev/null && pwd)" || true
    if [ -n "${parent}" ] && { [ -f "${parent}/ICON.PNG" ] || [ -f "${parent}/ICON_256.PNG" ]; }; then
      echo "${parent}"
      return 0
    fi
    if [ -f "${TRIM_APPDEST}/ICON.PNG" ] || [ -f "${TRIM_APPDEST}/ICON_256.PNG" ]; then
      echo "${TRIM_APPDEST}"
      return 0
    fi
  fi
  if [ -d "/var/apps/${appname}" ]; then
    echo "/var/apps/${appname}"
    return 0
  fi
  echo ""
}

read_pkg_version() {
  local pkg ver=""
  pkg="$(pkg_root_dir)"
  if [ -n "${pkg}" ] && [ -f "${pkg}/manifest" ]; then
    ver="$(awk -F= '/^[[:space:]]*version[[:space:]]*=/{gsub(/[[:space:]]/,"",$2); print $2; exit}' "${pkg}/manifest" 2>/dev/null)"
  fi
  if [ -z "${ver}" ] && [ -f "${TRIM_APPDEST}/package.json" ] && command -v python3 >/dev/null 2>&1; then
    ver="$(python3 - "${TRIM_APPDEST}/package.json" <<'PY' 2>/dev/null || true
import json,sys
print(json.load(open(sys.argv[1],encoding="utf-8")).get("version",""))
PY
)"
  fi
  echo "${ver:-0}"
}

icon_log() {
  mkdir -p "${TRIM_PKGVAR:-/tmp}/log" 2>/dev/null || true
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] icon: $*" >> "${TRIM_PKGVAR:-/tmp}/log/desktop-icon.log" 2>/dev/null || true
}

copy_if_src() {
  local src="$1" dest="$2"
  [ -f "${src}" ] || return 1
  mkdir -p "$(dirname "${dest}")" 2>/dev/null || true
  cp -f "${src}" "${dest}" 2>/dev/null || return 1
  # 尽量改掉 inode/mtime，逼缓存失效
  touch -c "${dest}" 2>/dev/null || touch "${dest}" 2>/dev/null || true
  chmod a+r "${dest}" 2>/dev/null || true
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
    chmod a+r "${img}/icon_${size}.png" "${img}/icon-${size}.png" 2>/dev/null || true
  done
  if [ -f "${src256}" ]; then
    cp -f "${src256}" "${img}/icon.png" 2>/dev/null || true
  elif [ -f "${src64}" ]; then
    cp -f "${src64}" "${img}/icon.png" 2>/dev/null || true
  fi
  touch "${img}/icon.png" 2>/dev/null || true
}

# 桌面常读 /var/apps_ui/<app>/images；升级后若是实体目录必须强制覆盖
sync_apps_ui_images() {
  local appname="${TRIM_APPNAME:-lemon-music}"
  local src64="$1" src256="$2"
  local link="/var/apps_ui/${appname}"
  local dest_ui=""

  if [ -L "${link}" ]; then
    dest_ui="$(readlink -f "${link}" 2>/dev/null || true)"
  elif [ -d "${link}" ]; then
    dest_ui="${link}"
  fi
  [ -n "${dest_ui}" ] || return 0
  sync_ui_images "${dest_ui}" "${src64}" "${src256}"
  # 保险：直接覆盖常见文件
  copy_if_src "${src64}" "${dest_ui}/images/icon_64.png" || true
  copy_if_src "${src64}" "${dest_ui}/images/icon-64.png" || true
  copy_if_src "${src256}" "${dest_ui}/images/icon_256.png" || true
  copy_if_src "${src256}" "${dest_ui}/images/icon-256.png" || true
  copy_if_src "${src256}" "${dest_ui}/images/icon.png" || true
  icon_log "synced apps_ui images -> ${dest_ui}"
}

# ui/config 图标加 ?v=版本，迫使桌面/浏览器换新图
patch_ui_config_icon_cachebust() {
  local file="$1" ver="$2"
  [ -f "${file}" ] || return 0
  [ -n "${ver}" ] || return 0
  if command -v python3 >/dev/null 2>&1; then
    python3 - "${file}" "${ver}" <<'PY' 2>/dev/null || true
import json, sys, re
from pathlib import Path
path, ver = Path(sys.argv[1]), str(sys.argv[2]).strip()
try:
    data = json.loads(path.read_text(encoding="utf-8"))
except Exception:
    sys.exit(0)
root = data.get(".url") if isinstance(data, dict) else None
if not isinstance(root, dict):
    sys.exit(0)
changed = False
for item in root.values():
    if not isinstance(item, dict):
        continue
    icon = str(item.get("icon") or "")
    if not icon:
        continue
    base = re.sub(r"[?&]v=[^&]*", "", icon).rstrip("?&")
    if "?" in base:
        nxt = f"{base}&v={ver}"
    else:
        nxt = f"{base}?v={ver}"
    if item.get("icon") != nxt:
        item["icon"] = nxt
        changed = True
if changed:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY
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
    copy_if_src "${src64}" "${dir}/ICON.png" || true
    copy_if_src "${src256}" "${dir}/ICON_256.png" || true
    icon_log "meta icons -> ${dir}"
  done

  # 包根 ICON（部分版本桌面直接读这里）
  for dir in \
    "/var/apps/${appname}" \
    "${TRIM_APPDEST:-}" \
    "$(pkg_root_dir)"
  do
    [ -n "${dir}" ] && [ -d "${dir}" ] || continue
    # 勿把源文件复制到自身造成 truncate
    if [ -f "${src64}" ] && [ "$(readlink -f "${src64}" 2>/dev/null)" != "$(readlink -f "${dir}/ICON.PNG" 2>/dev/null)" ]; then
      copy_if_src "${src64}" "${dir}/ICON.PNG" || true
    fi
    if [ -f "${src256}" ] && [ "$(readlink -f "${src256}" 2>/dev/null)" != "$(readlink -f "${dir}/ICON_256.PNG" 2>/dev/null)" ]; then
      copy_if_src "${src256}" "${dir}/ICON_256.PNG" || true
    fi
  done

  # 应用中心 poster 哈希文件名不变，就地覆盖内容即可让 URL 指向新图
  for dir in \
    "/var/apps/${appname}/poster" \
    /vol*/@appcenter/"${appname}"/poster \
    /vol*/@appmeta/"${appname}"/poster \
    /usr/local/apps/@appcenter/"${appname}"/poster \
    /vol*/@appdata/"${appname}"/poster
  do
    [ -d "${dir}" ] || continue
    for f in "${dir}"/*.png "${dir}"/*.PNG "${dir}"/*.jpg "${dir}"/*.jpeg "${dir}"/*.webp; do
      [ -f "${f}" ] || continue
      if [ -f "${src256}" ]; then
        cp -f "${src256}" "${f}" 2>/dev/null || true
      elif [ -f "${src64}" ]; then
        cp -f "${src64}" "${f}" 2>/dev/null || true
      fi
      touch "${f}" 2>/dev/null || true
    done
    icon_log "poster overwritten -> ${dir}"
  done
}

resolve_icon_sources() {
  local pkg ui_dir src64="" src256=""
  pkg="$(pkg_root_dir)"
  ui_dir="${TRIM_APPDEST}/ui"
  if [ ! -d "${ui_dir}" ] && [ -n "${pkg}" ] && [ -d "${pkg}/target/ui" ]; then
    ui_dir="${pkg}/target/ui"
  fi
  if [ ! -d "${ui_dir}" ] && [ -n "${pkg}" ] && [ -d "${pkg}/ui" ]; then
    ui_dir="${pkg}/ui"
  fi

  [ -n "${pkg}" ] && [ -f "${pkg}/ICON.PNG" ] && src64="${pkg}/ICON.PNG"
  [ -n "${pkg}" ] && [ -f "${pkg}/ICON_256.PNG" ] && src256="${pkg}/ICON_256.PNG"
  [ -z "${src64}" ] && [ -n "${pkg}" ] && [ -f "${pkg}/icon.png" ] && src64="${pkg}/icon.png"
  [ -z "${src256}" ] && [ -n "${pkg}" ] && [ -f "${pkg}/icon_256.png" ] && src256="${pkg}/icon_256.png"

  [ -z "${src256}" ] && [ -f "${ui_dir}/images/icon_256.png" ] && src256="${ui_dir}/images/icon_256.png"
  [ -z "${src256}" ] && [ -f "${ui_dir}/images/icon-256.png" ] && src256="${ui_dir}/images/icon-256.png"
  [ -z "${src64}" ] && [ -f "${ui_dir}/images/icon_64.png" ] && src64="${ui_dir}/images/icon_64.png"
  [ -z "${src64}" ] && [ -f "${ui_dir}/images/icon-64.png" ] && src64="${ui_dir}/images/icon-64.png"
  [ -z "${src64}" ] && src64="${src256}"
  [ -z "${src256}" ] && src256="${src64}"

  ICON_SRC_64="${src64}"
  ICON_SRC_256="${src256}"
  ICON_UI_DIR="${ui_dir}"
  ICON_PKG_DIR="${pkg}"
}

refresh_app_icons() {
  local ver
  resolve_icon_sources
  ver="$(read_pkg_version)"
  icon_log "refresh begin pkg=${ICON_PKG_DIR} ui=${ICON_UI_DIR} src64=${ICON_SRC_64} src256=${ICON_SRC_256} ver=${ver}"

  [ -n "${ICON_SRC_64}" ] || [ -n "${ICON_SRC_256}" ] || {
    icon_log "no icon sources found"
    return 0
  }

  [ -d "${ICON_UI_DIR}" ] && sync_ui_images "${ICON_UI_DIR}" "${ICON_SRC_64}" "${ICON_SRC_256}"
  overwrite_icon_caches "${ICON_SRC_64}" "${ICON_SRC_256}"
  sync_apps_ui_images "${ICON_SRC_64}" "${ICON_SRC_256}"

  for file in \
    "${TRIM_APPDEST}/ui/config" \
    "/var/apps_ui/${TRIM_APPNAME:-lemon-music}/config" \
    "/var/apps/${TRIM_APPNAME:-lemon-music}/target/ui/config" \
    "${ICON_UI_DIR}/config"
  do
    patch_ui_config_icon_cachebust "${file}" "${ver}"
  done
  icon_log "refresh done"
}

ensure_ui_symlink() {
  local appname="${TRIM_APPNAME:-lemon-music}"
  local ui_dir="${TRIM_APPDEST}/ui"
  local link="/var/apps_ui/${appname}"
  local cur=""
  [ -d "${ui_dir}" ] || return 0
  mkdir -p /var/apps_ui 2>/dev/null || true

  # 已是指向正确目录的符号链接则保留
  if [ -L "${link}" ]; then
    cur="$(readlink -f "${link}" 2>/dev/null || true)"
    if [ "${cur}" = "$(readlink -f "${ui_dir}" 2>/dev/null)" ]; then
      icon_log "apps_ui symlink ok -> ${cur}"
      return 0
    fi
    rm -f "${link}" 2>/dev/null || true
  fi

  # 首次安装可能拷成实体目录；必须删掉再链，否则升级后桌面仍读旧图
  if [ -e "${link}" ] && [ ! -L "${link}" ]; then
    icon_log "removing stale apps_ui directory ${link}"
    rm -rf "${link}" 2>/dev/null || true
  fi

  if ln -sfn "${ui_dir}" "${link}" 2>/dev/null; then
    icon_log "apps_ui linked ${link} -> ${ui_dir}"
    return 0
  fi

  # 无法建链则整树覆盖（含 images）
  icon_log "symlink failed, copying ui tree into ${link}"
  mkdir -p "${link}" 2>/dev/null || true
  cp -a "${ui_dir}/." "${link}/" 2>/dev/null || true
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
  local port protocol ver
  # 先链到最新 ui，再刷图标（避免先刷到旧实体目录）
  ensure_ui_symlink || true
  refresh_app_icons || true
  # 再刷一次 apps_ui（链建好后）
  resolve_icon_sources
  if [ -n "${ICON_SRC_64}" ] || [ -n "${ICON_SRC_256}" ]; then
    sync_apps_ui_images "${ICON_SRC_64}" "${ICON_SRC_256}"
  fi
  port="$(sync_desktop_port)"
  protocol="$(read_desktop_protocol)"
  ver="$(read_pkg_version)"
  sync_desktop_port "${port}" >/dev/null
  # 再写一遍协议与图标缓存参数
  for file in \
    "${TRIM_APPDEST}/ui/config" \
    "/var/apps_ui/${TRIM_APPNAME:-lemon-music}/config" \
    "/var/apps/${TRIM_APPNAME:-lemon-music}/target/ui/config"
  do
    patch_ui_config_port "${file}" "${port}" "${protocol}"
    patch_ui_config_icon_cachebust "${file}" "${ver}"
  done
  fix_desktop_db "${port}"
  icon_log "ensure_desktop_entry finished port=${port} protocol='${protocol}' ver=${ver}"
}
