#!/bin/bash
# Pull Lemon Music image during install/upgrade wizard (stdout = install UI progress).
# 优先使用 docker compose pull，与手动 docker-compose.yml 部署行为一致。

DEFAULT_REGISTRY="ghcr.1ms.run/jia070310/lemon-muisc"
FALLBACK_REGISTRIES=(
  "ghcr.1ms.run/jia070310/lemon-muisc"
  "ghcr.io/jia070310/lemon-muisc"
)
# shellcheck disable=SC1091
. "$(dirname "$0")/image-alias.sh"
IMAGE="${DEFAULT_REGISTRY}:latest"
COMPOSE_FILE="${TRIM_APPDEST}/docker/docker-compose.yaml"
COMPOSE_DIR="$(dirname "${COMPOSE_FILE}")"
IMAGE_CONF="${TRIM_PKGETC}/image.conf"

init_log() {
  mkdir -p "${TRIM_PKGVAR}/log" "${TRIM_PKGETC}" 2>/dev/null || true
  LOG_FILE="${TRIM_PKGVAR}/log/install.log"
  touch "${LOG_FILE}" 2>/dev/null || true
  if [ ! -f "${LOG_FILE}" ]; then
    LOG_FILE="${TRIM_PKGVAR}/install.log"
    touch "${LOG_FILE}" 2>/dev/null || true
  fi
  if [ -n "${TRIM_APPDEST}" ]; then
    mkdir -p "${TRIM_APPDEST}/../var/log" 2>/dev/null || true
  fi
}

log_hint_paths() {
  log_line "日志路径（需 SSH 查看，文件管理器通常看不到 @appdata）:"
  log_line "  ${LOG_FILE}"
  [ -n "${TRIM_PKGVAR}" ] && log_line "  ${TRIM_PKGVAR}/install.log"
  log_line "  /var/apps/lemon-music/var/log/install.log"
}

log_line() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "${LOG_FILE}" 2>/dev/null || true
}

pull_log_has_fatal_error() {
  local log="$1"
  [ -s "${log}" ] || return 1
  grep -qiE 'permission denied while trying to connect to the Docker daemon|Cannot connect to the Docker daemon|Is the docker daemon running\?' "${log}" 2>/dev/null
}

pull_log_indicates_success() {
  local log="$1"
  grep -qiE 'Downloaded newer image|Status: Downloaded newer image|Image is up to date|Pull complete|pull complete' "${log}" 2>/dev/null
}

append_pull_log_to_install_log() {
  local pull_log="$1"
  if [ -s "${pull_log}" ]; then
    cat "${pull_log}" >> "${LOG_FILE}" 2>/dev/null || true
  fi
}

fail_install() {
  log_line "错误: $*"
  log_hint_paths
  echo "$*" > "${TRIM_TEMP_LOGFILE}"
  echo "failed at $(date -Iseconds): $*" > "${TRIM_PKGVAR}/install.status" 2>/dev/null || true
  exit 1
}

update_install_ui() {
  echo "$*" > "${TRIM_TEMP_LOGFILE}" 2>/dev/null || true
}

# 从 docker pull --progress=plain 日志解析可读进度（供安装窗口文案展示）
format_pull_progress_from_log() {
  local log="$1"
  local complete total pct dl_line

  if [ ! -s "${log}" ]; then
    echo "0% · 正在连接镜像仓库…"
    return 0
  fi

  if grep -qiE 'Downloaded newer image|Status: Downloaded newer image|Image is up to date' "${log}" 2>/dev/null; then
    echo "100% · 镜像拉取完成"
    return 0
  fi

  complete="$(grep -ciE '^#[0-9]+ pull complete|Pull complete' "${log}" 2>/dev/null | tr -d ' \n\r' || true)"
  complete="${complete:-0}"
  total="$(grep -oE '^#[0-9]+' "${log}" 2>/dev/null | sed 's/^#//' | sort -n | tail -1 || true)"
  total="${total:-0}"

  if [ "${total}" -lt 1 ]; then
    total="$(grep -ciE 'Pulling fs layer|pulling fs layer' "${log}" 2>/dev/null | tr -d ' \n\r' || true)"
  fi
  if [ "${total}" -lt 1 ]; then
    total=12
  fi
  if [ "${complete}" -gt "${total}" ]; then
    total="${complete}"
  fi

  pct=$(( complete * 100 / total ))
  if [ "${pct}" -lt 1 ]; then
    pct=1
  fi
  if [ "${complete}" -lt "${total}" ] && [ "${pct}" -ge 100 ]; then
    pct=99
  fi

  dl_line="$(grep -iE 'downloading|extracting|Waiting|Verifying|Pulling fs layer|pulling manifest|Pulling from' "${log}" 2>/dev/null | tail -1 | sed 's/^[[:space:]]*//;s/\r$//' | cut -c1-120)"
  if [ -n "${dl_line}" ]; then
    echo "${pct}% · 已完成 ${complete}/${total} 层 · ${dl_line}"
  else
    echo "${pct}% · 已完成 ${complete}/${total} 层"
  fi
}

update_install_pull_ui() {
  local image="$1"
  local log_file="$2"
  local status
  status="$(format_pull_progress_from_log "${log_file}")"
  update_install_ui "【实际拉取进度 ${status}】
镜像：${image}
提示：上方 55% 为飞牛系统进度，请以下方百分比为准"
  echo "${status}" > "${TRIM_PKGVAR}/pull.progress" 2>/dev/null || true
}

start_pull_progress_reporter() {
  local log_file="$1"
  local image="$2"
  local done_flag="$3"
  (
    local last_size=0 stall=0 tick=0 last_log_tick=0
    while [ ! -f "${done_flag}" ]; do
      local cur_size=0
      if [ -f "${log_file}" ]; then
        cur_size="$(wc -c < "${log_file}" 2>/dev/null | tr -d ' \n\r')"
        cur_size="${cur_size:-0}"
      fi
      if [ "${cur_size}" -le "${last_size}" ]; then
        stall=$((stall + 1))
      else
        stall=0
        last_size="${cur_size}"
      fi
      tick=$((tick + 1))
      # 每 30 秒把 pull 进度摘要写入 install.log，便于 tail -f install.log 观察
      if [ "${tick}" -ge 30 ] && [ $((tick - last_log_tick)) -ge 30 ]; then
        last_log_tick="${tick}"
        if [ -s "${log_file}" ]; then
          echo "[$(date '+%Y-%m-%d %H:%M:%S')] 拉取进度: $(format_pull_progress_from_log "${log_file}")" >> "${LOG_FILE}" 2>/dev/null || true
        elif [ "${stall}" -ge 30 ]; then
          echo "[$(date '+%Y-%m-%d %H:%M:%S')] 拉取进行中，尚未收到 docker 输出（已等待 ${stall}s）…" >> "${LOG_FILE}" 2>/dev/null || true
        fi
      fi
      if [ "${stall}" -ge 20 ] && [ "${cur_size}" -lt 200 ]; then
        update_install_ui "【镜像仓库连接较慢 / 无流量】
镜像：${image}
已等待约 ${stall} 秒仍无下载数据。请检查 NAS 网络，或取消后 SSH 执行：
docker pull ${image}
再选手动安装 +「跳过拉取」"
      else
        update_install_pull_ui "${image}" "${log_file}"
      fi
      sleep 1
    done
    update_install_pull_ui "${image}" "${log_file}"
  ) &
  echo $!
}

preflight_registry() {
  local image="$1"
  log_line "预检镜像仓库: ${image}"
  update_install_ui "正在连接镜像仓库…
${image}"
  if command -v timeout >/dev/null 2>&1; then
    if timeout 20 docker_cmd manifest inspect "${image}" >/dev/null 2>&1; then
      log_line "仓库预检 OK: ${image}"
    else
      log_line "仓库预检未响应（仍将尝试 pull，可能是镜像加速域名限制 manifest）"
    fi
  fi
  return 0
}

image_already_pulled() {
  local tag="${wizard_image_tag:-latest}"
  local candidate
  resolve_image_from_wizard
  for candidate in \
    "${IMAGE}" \
    "${DEFAULT_REGISTRY}:${tag}" \
    "ghcr.io/jia070310/lemon-muisc:${tag}" \
    "${LOCAL_IMAGE_ALIAS}"
  do
    if docker_cmd image inspect "${candidate}" >/dev/null 2>&1; then
      IMAGE="${candidate}"
      return 0
    fi
  done
  return 1
}

# SOFT_PULL_FAIL=1 时只记录错误并返回 1，不中断安装（交给飞牛 docker-project / 启用时再拉）
abort_pull() {
  log_line "错误: $*"
  echo "$*" > "${TRIM_PKGVAR}/pull.failed" 2>/dev/null || true
  if [ "${SOFT_PULL_FAIL:-0}" = "1" ]; then
    return 1
  fi
  fail_install "$*"
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
  local host

  case "${source}" in
    custom_image)
      if [ -z "${wizard_custom_image}" ]; then
        fail_install "已选择「自定义镜像地址」，但未填写完整镜像名。例如 ghcr.1ms.run/jia070310/lemon-muisc:latest"
      fi
      IMAGE="${wizard_custom_image}"
      ;;
    skip_pull)
      load_saved_image_config
      read_image_from_compose
      ;;
    mirror_1ms|mirror_nju|mirror_dockerproxy|mirror_daocloud|ghcr_io|ghcr_direct|*)
      host="$(wizard_registry_host "${source}")"
      IMAGE="$(image_ref_for_registry "${host}" "${tag}")"
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

# 安装阶段脚本 pull 上限（与飞牛 docker-project 并行，避免独占 docker 数分钟）
get_script_pull_timeout() {
  local full max_cap
  full="$(get_pull_timeout)"
  if [ "${INSTALL_PULL_SOFT:-0}" = "1" ]; then
    max_cap="${INSTALL_SCRIPT_PULL_MAX:-120}"
    if ! echo "${max_cap}" | grep -Eq '^[0-9]+$'; then
      max_cap=120
    fi
    if [ "${max_cap}" -lt 30 ]; then
      max_cap=30
    fi
    if [ "${full}" -gt "${max_cap}" ]; then
      echo "${max_cap}"
      return 0
    fi
  fi
  echo "${full}"
}

# 飞牛部分环境无 GNU timeout，用后台进程 + kill 兜底
run_with_timeout() {
  local sec="$1"
  shift

  if command -v timeout >/dev/null 2>&1; then
    timeout "${sec}" "$@"
    return $?
  fi

  "$@" &
  local pid=$!
  local elapsed=0
  while kill -0 "${pid}" 2>/dev/null; do
    if [ "${elapsed}" -ge "${sec}" ]; then
      kill "${pid}" 2>/dev/null || true
      wait "${pid}" 2>/dev/null || true
      return 124
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  wait "${pid}"
  return $?
}

# 安装进程无 inspect 权限时，仍可通过 docker images 列表判断（docker-project 已拉完）
# 若传入 want（完整镜像名），只匹配同仓库且同 tag，避免把本地 latest 当成用户选的旧版。
any_lemon_image_in_docker_list() {
  local want="${1:-}"
  local want_tag="" line="" runner repo tag
  if [ -n "${want}" ]; then
    want_tag="${want##*:}"
    case "${want}" in
      *:*) ;;
      *) want_tag="" ;;
    esac
  fi
  for runner in docker_cmd docker; do
    while IFS= read -r line; do
      [ -z "${line}" ] && continue
      if [ -z "${want_tag}" ] || [ "${want_tag}" = "latest" ]; then
        printf '%s\n' "${line}"
        return 0
      fi
      tag="${line##*:}"
      if [ "${tag}" = "${want_tag}" ]; then
        printf '%s\n' "${line}"
        return 0
      fi
    done <<EOF
$(${runner} images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep -E 'lemon-muisc|lemon-music' || true)
EOF
  done
  return 1
}

ensure_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    if [ "${SOFT_PULL_FAIL:-0}" = "1" ]; then
      log_line "警告: 未检测到 docker 命令，跳过在线拉取"
      return 1
    fi
    fail_install "未检测到 Docker。请先在飞牛系统中安装并启用 Docker，再重新安装本应用。"
  fi
  log_line "Docker 检测: 用户=$(id -un 2>/dev/null || echo '?') uid=$(id -u 2>/dev/null || echo '?')"
  if ! init_docker_access; then
    if [ "${SOFT_PULL_FAIL:-0}" = "1" ]; then
      log_line "警告: 安装/升级进程无法访问 Docker（与 SSH 用户权限不同），跳过在线拉取"
      return 1
    fi
    fail_install "安装脚本无法访问 Docker（与 SSH 不同用户/无 socket 权限）。请先 SSH 执行: docker pull ghcr.1ms.run/jia070310/lemon-muisc:latest && docker tag ghcr.1ms.run/jia070310/lemon-muisc:latest lemon-music:latest ，再选手动安装并选「跳过拉取」。"
  fi
  return 0
}

docker_compose_cmd() {
  if [ ! -f "${COMPOSE_FILE}" ]; then
    return 127
  fi
  if docker_cmd compose version >/dev/null 2>&1; then
    docker_cmd compose -f "${COMPOSE_FILE}" "$@"
    return $?
  fi
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose -f "${COMPOSE_FILE}" "$@"
    return $?
  fi
  return 127
}

update_compose_image() {
  if [ ! -f "${COMPOSE_FILE}" ]; then
    log_line "警告: 未找到 compose 文件 ${COMPOSE_FILE}"
    return 0
  fi
  local compose_img tmp
  # 禁止把短名写入 compose，否则飞牛 docker-project 会去拉 Docker Hub
  if declare -F compose_registry_image >/dev/null 2>&1; then
    compose_img="$(compose_registry_image "${IMAGE}")"
  else
    compose_img="${IMAGE}"
    case "${compose_img}" in
      lemon-music|lemon-music:*) compose_img="${REMOTE_IMAGE_DEFAULT}" ;;
    esac
  fi
  tmp="${COMPOSE_FILE}.tmp"
  sed -E "s|^([[:space:]]*)image:[[:space:]]*.*|\1image: ${compose_img}|" "${COMPOSE_FILE}" > "${tmp}" \
    && mv "${tmp}" "${COMPOSE_FILE}"
  log_line "已写入 compose 镜像: ${compose_img}"
}

save_image_config() {
  mkdir -p "${TRIM_PKGETC}" 2>/dev/null || true
  local saved="${LOCAL_IMAGE_ALIAS}"
  local remote="${IMAGE}"
  case "${remote}" in
    lemon-music|lemon-music:*)
      remote="${REMOTE_IMAGE:-${REMOTE_IMAGE_DEFAULT}}"
      ;;
  esac
  # 若向导指定了版本 tag，强制 REMOTE_IMAGE 带上该 tag（防止被旧 latest 覆盖）
  if [ -n "${wizard_image_tag:-}" ] && [ "${wizard_image_tag}" != "latest" ]; then
    case "${remote}" in
      *:*) remote="${remote%:*}:${wizard_image_tag}" ;;
    esac
  fi
  cat > "${IMAGE_CONF}" << EOF
SAVED_IMAGE="${saved}"
REMOTE_IMAGE="${remote}"
SAVED_PULL_SOURCE="${wizard_pull_source:-ghcr_direct}"
SAVED_IMAGE_TAG="${wizard_image_tag:-latest}"
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
  log_line "  镜像标签: ${wizard_image_tag:-latest}"
  log_line "  目标镜像: ${IMAGE}"
  log_line "  compose: ${COMPOSE_FILE}"
  log_line "  拉取超时: ${timeout_sec} 秒"
  log_line "------------------------------------------"
}

run_with_timeout() {
  local timeout_sec="$1"
  shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "${timeout_sec}" "$@"
    return $?
  fi
  "$@"
}

compose_pull_with_timeout() {
  local timeout_sec
  timeout_sec="$(get_pull_timeout)"
  local pull_log="${TRIM_PKGVAR}/compose.pull.log"
  local done_flag="${pull_log}.done"
  local reporter_pid=0

  read_image_from_compose
  case "${IMAGE}" in
    lemon-music:*|lemon-music)
      if ! docker_cmd image inspect "${IMAGE}" >/dev/null 2>&1; then
        log_line "compose 为本地短名 ${IMAGE} 且不存在，跳过 compose pull（避免误拉 Docker Hub）"
        return 127
      fi
      ;;
  esac

  log_line "执行 docker compose pull（超时 ${timeout_sec} 秒）..."
  echo "compose pulling ${IMAGE} at $(date -Iseconds)" > "${TRIM_PKGVAR}/install.status" 2>/dev/null || true
  update_install_pull_ui "${IMAGE}" "${pull_log}"

  if [ ! -f "${COMPOSE_FILE}" ]; then
    log_line "compose 文件不存在: ${COMPOSE_FILE}"
    return 127
  fi

  rm -f "${done_flag}" 2>/dev/null || true
  : > "${pull_log}" 2>/dev/null || true
  reporter_pid="$(start_pull_progress_reporter "${pull_log}" "${IMAGE}" "${done_flag}")"

  local rc=0
  if docker_cmd compose version >/dev/null 2>&1; then
    if command -v timeout >/dev/null 2>&1; then
      timeout "${timeout_sec}" docker_cmd compose -p "${TRIM_APPNAME}" -f "${COMPOSE_FILE}" pull --progress plain > "${pull_log}" 2>&1 || rc=$?
    else
      docker_cmd compose -p "${TRIM_APPNAME}" -f "${COMPOSE_FILE}" pull --progress plain > "${pull_log}" 2>&1 || rc=$?
    fi
  elif command -v docker-compose >/dev/null 2>&1; then
    if command -v timeout >/dev/null 2>&1; then
      timeout "${timeout_sec}" docker-compose -p "${TRIM_APPNAME}" -f "${COMPOSE_FILE}" pull > "${pull_log}" 2>&1 || rc=$?
    else
      docker-compose -p "${TRIM_APPNAME}" -f "${COMPOSE_FILE}" pull > "${pull_log}" 2>&1 || rc=$?
    fi
  else
    touch "${done_flag}" 2>/dev/null || true
    wait "${reporter_pid}" 2>/dev/null || true
    log_line "未找到 docker compose 命令"
    return 127
  fi

  touch "${done_flag}" 2>/dev/null || true
  wait "${reporter_pid}" 2>/dev/null || true
  append_pull_log_to_install_log "${pull_log}"

  if [ "${rc}" -eq 0 ]; then
    update_install_pull_ui "${IMAGE}" "${pull_log}"
    read_image_from_compose
    return 0
  fi
  if [ "${rc}" -eq 124 ]; then
    log_line "compose 拉取超时（${timeout_sec} 秒）"
    update_install_ui "镜像拉取超时（${timeout_sec}s），可 SSH 手动 pull 后选「跳过拉取」"
    return 124
  fi
  return "${rc}"
}

docker_pull_with_timeout() {
  local timeout_sec
  timeout_sec="$(get_script_pull_timeout)"
  log_line "执行 docker pull ${IMAGE}（超时 ${timeout_sec} 秒）..."
  echo "pulling ${IMAGE} at $(date -Iseconds)" > "${TRIM_PKGVAR}/install.status" 2>/dev/null || true

  local rc=0
  local pull_log="${TRIM_PKGVAR}/pull.last.log"
  local done_flag="${pull_log}.done"
  rm -f "${done_flag}" 2>/dev/null || true
  : > "${pull_log}" 2>/dev/null || true

  preflight_registry "${IMAGE}"
  log_line "预检完成，开始 docker pull（输出同时写入日志与安装窗口）"
  update_install_pull_ui "${IMAGE}" "${pull_log}"
  local reporter_pid
  reporter_pid="$(start_pull_progress_reporter "${pull_log}" "${IMAGE}" "${done_flag}")"

  set -o pipefail 2>/dev/null || true
  run_with_timeout "${timeout_sec}" docker_cmd pull --progress plain "${IMAGE}" 2>&1 | tee -a "${pull_log}"
  rc=${PIPESTATUS[0]:-$?}

  touch "${done_flag}" 2>/dev/null || true
  wait "${reporter_pid}" 2>/dev/null || true
  append_pull_log_to_install_log "${pull_log}"

  if pull_log_has_fatal_error "${pull_log}"; then
    log_line "Docker 守护进程不可用（permission denied / 未运行）"
    update_install_ui "无法连接 Docker。请确认飞牛 Docker 已启动，且应用以 root 运行；或 SSH 手动 pull 后选「跳过拉取」。"
    return 125
  fi

  if [ "${rc}" -eq 0 ]; then
    if pull_log_indicates_success "${pull_log}" \
      || docker_cmd image inspect "${IMAGE}" >/dev/null 2>&1 \
      || any_lemon_image_in_docker_list >/dev/null 2>&1; then
      update_install_pull_ui "${IMAGE}" "${pull_log}"
      echo "pull done ${IMAGE} at $(date -Iseconds)" > "${TRIM_PKGVAR}/pull.progress" 2>/dev/null || true
      echo "pull done ${IMAGE} at $(date -Iseconds)" > "${TRIM_PKGVAR}/install.status" 2>/dev/null || true
      return 0
    fi
    log_line "docker pull 退出码为 0，但日志与本地 inspect/列表 均未确认成功"
    return 1
  fi

  if [ "${rc}" -eq 124 ]; then
    log_line "镜像拉取超时（${timeout_sec} 秒）"
    update_install_ui "镜像拉取超时（${timeout_sec}s），可 SSH 手动 pull 后选「跳过拉取」"
    return 124
  fi
  return "${rc}"
}

image_exists_locally() {
  local candidate repo
  local tag="${wizard_image_tag:-latest}"
  local pulled_ref="${IMAGE:-}"

  # 刚拉取/向导选定的远程引用优先，避免误用旧的 lemon-music:latest
  for candidate in \
      "${pulled_ref}" \
      "ghcr.io/${pulled_ref#ghcr.1ms.run/}" \
      "ghcr.1ms.run/${pulled_ref#ghcr.io/}" \
      "ghcr.1ms.run/jia070310/lemon-muisc:${tag}" \
      "ghcr.io/jia070310/lemon-muisc:${tag}" \
      "jia070310/lemon-muisc:${tag}"
  do
    [ -z "${candidate}" ] && continue
    case "${candidate}" in
      ghcr.io/ghcr.io/*|ghcr.1ms.run/ghcr.1ms.run/*|ghcr.io/ghcr.1ms.run/*|ghcr.1ms.run/ghcr.io/*) continue ;;
    esac
    if docker_cmd image inspect "${candidate}" >/dev/null 2>&1; then
      IMAGE="${candidate}"
      return 0
    fi
  done

  # 仅当目标 tag 就是 latest 时，才把本地短名 alias 视为已就绪
  if [ "${tag}" = "latest" ] && docker_cmd image inspect "${LOCAL_IMAGE_ALIAS}" >/dev/null 2>&1; then
    IMAGE="${LOCAL_IMAGE_ALIAS}"
    return 0
  fi

  repo="$(find_newest_remote_image "${tag}" 2>/dev/null || true)"
  if [ -n "${repo}" ] && docker_cmd image inspect "${repo}" >/dev/null 2>&1; then
    IMAGE="${repo}"
    log_line "检测到目标镜像: ${IMAGE}"
    return 0
  fi

  if listed="$(any_lemon_image_in_docker_list "${pulled_ref}" 2>/dev/null)"; then
    IMAGE="${listed}"
    return 0
  fi

  return 1
}

# 拉取后把远程镜像 retag 为 lemon-music:latest；compose 仍写完整仓库地址（避免飞牛打 Docker Hub）
normalize_pulled_image() {
  local remote="${IMAGE:-}"
  local promoted=""

  if ! docker_cmd image inspect "${remote}" >/dev/null 2>&1; then
    remote="$(find_newest_remote_image "${wizard_image_tag:-latest}" 2>/dev/null || true)"
  fi

  if [ -z "${remote}" ] && ! image_exists_locally; then
    return 1
  fi

  [ -n "${remote}" ] || remote="${IMAGE}"

  case "${remote}" in
    lemon-music|lemon-music:*)
      remote="$(find_newest_remote_image "${wizard_image_tag:-latest}" 2>/dev/null || true)"
      [ -n "${remote}" ] || remote="${REMOTE_IMAGE_DEFAULT}"
      ;;
  esac

  if promoted="$(promote_to_local_image_alias "${remote}")"; then
    IMAGE="${promoted}"
    log_line "已打本地短名: ${IMAGE} ← ${remote}"
  elif promoted="$(sync_local_image_alias "${wizard_image_tag:-latest}")"; then
    IMAGE="${promoted}"
    log_line "已同步本地短名: ${IMAGE}"
  else
    return 1
  fi

  # compose 写远程完整地址；IMAGE 保持短名供运行时使用
  REMOTE_IMAGE="${remote}"
  export REMOTE_IMAGE
  IMAGE="${remote}"
  update_compose_image
  IMAGE="${promoted}"
  save_image_config
  return 0
}

# 等待本地出现「向导选定」的镜像（不要把任意 lemon 镜像当成成功）
wait_for_local_image() {
  local max_sec="${1:-600}"
  local waited=0
  local resolved="" listed="" pull_log="${TRIM_PKGVAR}/pull.last.log"
  local want="${IMAGE:-}"

  while [ "${waited}" -lt "${max_sec}" ]; do
    init_docker_access 2>/dev/null || true

    if image_exists_locally; then
      log_line "镜像已就绪（目标匹配 ${waited}s）: ${IMAGE}"
      return 0
    fi

    if [ -n "${want}" ] && resolved="$(resolve_local_image_name "${want}" 2>/dev/null)"; then
      # resolve_local_image_name 可能返回短名；若 want 是版本 tag，再确认 tag
      case "${want}" in
        *:latest|lemon-music|lemon-music:*)
          IMAGE="${resolved}"
          log_line "镜像已就绪（inspect ${waited}s）: ${IMAGE}"
          return 0
          ;;
        *:*)
          if docker_cmd image inspect "${want}" >/dev/null 2>&1 \
            || listed="$(any_lemon_image_in_docker_list "${want}" 2>/dev/null)"; then
            [ -n "${listed}" ] && IMAGE="${listed}" || IMAGE="${want}"
            log_line "镜像已就绪（版本 tag ${waited}s）: ${IMAGE}"
            return 0
          fi
          ;;
      esac
    fi

    if listed="$(any_lemon_image_in_docker_list "${want}" 2>/dev/null)"; then
      IMAGE="${listed}"
      log_line "镜像已就绪（docker images 列表 ${waited}s）: ${IMAGE}"
      normalize_pulled_image || true
      return 0
    fi

    if [ -s "${pull_log}" ] && pull_log_indicates_success "${pull_log}"; then
      if listed="$(any_lemon_image_in_docker_list "${want}" 2>/dev/null)"; then
        IMAGE="${listed}"
        log_line "pull 日志已成功且镜像在列表中: ${IMAGE}"
        normalize_pulled_image || true
        return 0
      fi
    fi

    sleep 5
    waited=$((waited + 5))
    if [ $((waited % 15)) -eq 0 ]; then
      log_line "等待镜像… ${waited}/${max_sec}s 目标=${want:-?}（docker-project / 脚本 pull）"
      update_install_ui "正在拉取/确认镜像 ${waited}/${max_sec}s…
目标：${want}
镜像已在 Docker「本地镜像」出现后，安装将很快到 100%。
装完后请点「启用」启动容器。"
      echo "waiting image ${waited}s" > "${TRIM_PKGVAR}/install.status" 2>/dev/null || true
    fi
  done
  return 1
}

# 安装专用：飞牛 docker-project 负责主拉取；脚本后台短 pull + 轮询 docker images（不阻塞 600s）
install_pull_with_docker_project() {
  local max_wait="${1:-600}"
  local phase="${2:-安装}"
  local listed="" pull_log="${TRIM_PKGVAR}/pull.last.log"
  local done_flag="${pull_log}.done"
  local pull_pid="" reporter_pid="" script_max wait_rc=0

  resolve_image_from_wizard
  ensure_docker || log_line "Docker 暂不可用，仅等待 docker-project / 镜像列表…"
  show_wizard_summary

  log_line "=========================================="
  log_line "柠檬音乐下载 · ${phase}"
  log_line "=========================================="
  log_line "安装策略：飞牛 docker-project 主拉取 + 脚本检测本地镜像（后台 pull 最多 ${INSTALL_SCRIPT_PULL_MAX:-120}s）"
  # 先把向导选定的镜像写入 compose + image.conf，避免飞牛仍按旧 latest 拉
  REMOTE_IMAGE="${IMAGE}"
  export REMOTE_IMAGE
  save_image_config
  update_compose_image

  if image_exists_locally; then
    log_line "本地已有目标镜像: ${IMAGE}"
    normalize_pulled_image || true
    update_compose_image
    save_image_config
    return 0
  fi

  if listed="$(any_lemon_image_in_docker_list "${IMAGE}" 2>/dev/null)"; then
    IMAGE="${listed}"
    normalize_pulled_image || true
    log_line "本地已有目标 tag 镜像: ${IMAGE}"
    update_compose_image
    save_image_config
    return 0
  fi

  script_max="$(get_script_pull_timeout)"
  rm -f "${done_flag}" 2>/dev/null || true
  : > "${pull_log}" 2>/dev/null || true

  if init_docker_access 2>/dev/null; then
    update_install_ui "【飞牛拉取中】系统进度 55→80%
目标：${IMAGE}
脚本后台尝试 pull（最多 ${script_max}s），同时检测 Docker「本地镜像」…"
    log_line "后台 docker pull ${IMAGE}（最多 ${script_max}s，与 docker-project 并行）"
    (
      preflight_registry "${IMAGE}" 2>/dev/null || true
      run_with_timeout "${script_max}" docker_cmd pull --progress plain "${IMAGE}" >> "${pull_log}" 2>&1 || true
      touch "${done_flag}" 2>/dev/null || true
    ) &
    pull_pid=$!
    reporter_pid="$(start_pull_progress_reporter "${pull_log}" "${IMAGE}" "${done_flag}")"
  else
    update_install_ui "【等待飞牛 docker-project 拉取】
目标：${IMAGE}
脚本无法访问 Docker，请观察系统进度 55→80%…"
    log_line "脚本无 Docker 权限，等待 docker-project 完成拉取"
    touch "${done_flag}" 2>/dev/null || true
  fi

  wait_for_local_image "${max_wait}" || wait_rc=$?

  if [ -n "${pull_pid}" ]; then
    kill "${pull_pid}" 2>/dev/null || true
    wait "${pull_pid}" 2>/dev/null || true
  fi
  touch "${done_flag}" 2>/dev/null || true
  [ -n "${reporter_pid}" ] && wait "${reporter_pid}" 2>/dev/null || true
  append_pull_log_to_install_log "${pull_log}"

  if [ "${wait_rc}" -eq 0 ]; then
    normalize_pulled_image || true
    update_compose_image
    save_image_config
    log_line "镜像拉取/检测完成。"
    return 0
  fi
  return 1
}

pull_image_with_fallback() {
  local tag="${wizard_image_tag:-latest}"
  local source="${wizard_pull_source:-ghcr_direct}"
  local registry host
  local pulled=0
  local last_err=""
  local last_log=""
  local pull_rc=0
  local -a registry_hosts=()

  while IFS= read -r host; do
    [ -n "${host}" ] && registry_hosts+=("${host}")
  done <<EOF
$(pull_registry_hosts "${source}")
EOF

  # 飞牛 install_callback 内 docker 常不可用：只试用户选的加速源，且受 INSTALL_PULL_SOFT 限制时长
  if [ "${INSTALL_PULL_SOFT:-0}" = "1" ] && [ "${#registry_hosts[@]}" -gt 1 ]; then
    registry_hosts=("${registry_hosts[0]}")
    log_line "安装阶段软拉取：仅尝试首选源 ${registry_hosts[0]}"
  fi

  if [ "${source}" = "custom_image" ]; then
    update_compose_image
    pull_rc=0
    docker_pull_with_timeout || pull_rc=$?
    if [ "${pull_rc}" -eq 125 ]; then
      abort_pull "无法连接 Docker。请确认 Docker 已启动且应用有权限访问 /var/run/docker.sock"
      return 1
    fi
    if [ "${pull_rc}" -eq 0 ] && normalize_pulled_image; then
      return 0
    fi
    last_log="$(tail -n 8 "${TRIM_PKGVAR}/pull.last.log" 2>/dev/null | tr '\n' ' ')"
    abort_pull "镜像拉取失败: ${IMAGE}。${last_log}请 SSH 执行: docker pull ${IMAGE}"
    return 1
  fi

  for host in "${registry_hosts[@]}"; do
    IMAGE="$(image_ref_for_registry "${host}" "${tag}")"
    update_compose_image
    log_line "尝试镜像源: ${IMAGE}"

    pull_rc=0
    docker_pull_with_timeout || pull_rc=$?

    if [ "${pull_rc}" -eq 125 ]; then
      abort_pull "无法连接 Docker。请确认 Docker 已启动且应用有 root 权限，或 SSH 手动 pull 后选「跳过拉取」。"
      return 1
    fi

    if [ "${pull_rc}" -eq 0 ]; then
      if normalize_pulled_image; then
        pulled=1
        log_line "docker pull 成功，本地可用: ${IMAGE}"
        break
      elif listed="$(any_lemon_image_in_docker_list 2>/dev/null)"; then
        IMAGE="${listed}"
        if normalize_pulled_image; then
          pulled=1
          log_line "docker pull 成功（docker images 列表）: ${IMAGE}"
          break
        fi
      fi
      log_line "docker pull 退出码成功，但本地未识别到镜像名，尝试下一源…"
    elif [ "${pull_rc}" -eq 124 ]; then
      last_err="${IMAGE} (超时)"
      log_line "镜像源超时，尝试下一个..."
      continue
    fi

    last_err="${IMAGE}"
    log_line "镜像源失败，尝试下一个..."
  done

  if [ "${pulled}" -ne 1 ]; then
    IMAGE="$(image_ref_for_registry "$(wizard_registry_host "${source}")" "${tag}")"
    if normalize_pulled_image; then
      log_line "未直接拉取，但本地已有可用镜像: ${IMAGE}"
      return 0
    fi
    docker_cmd images 2>&1 >> "${LOG_FILE}" || true
    last_log="$(tail -n 8 "${TRIM_PKGVAR}/pull.last.log" 2>/dev/null | tr '\n' ' ')"
    abort_pull "镜像拉取失败。详情: ${last_log}可先 SSH: docker pull ghcr.1ms.run/jia070310/lemon-muisc:latest 后再启用。最后尝试: ${last_err}"
    return 1
  fi
  return 0
}

pull_image_with_progress() {
  local phase="$1"

  resolve_image_from_wizard
  if ! ensure_docker; then
    update_compose_image
    save_image_config
    return 1
  fi
  show_wizard_summary

  log_line "=========================================="
  log_line "柠檬音乐下载 · ${phase}"
  log_line "=========================================="

  if [ "${wizard_pull_source:-ghcr_direct}" = "skip_pull" ]; then
    log_line "已选择跳过拉取，同步本地镜像..."
    read_image_from_compose
    if sync_local_image_alias "${wizard_image_tag:-latest}" >/dev/null; then
      IMAGE="${LOCAL_IMAGE_ALIAS}"
      log_line "本地已同步镜像: ${IMAGE}"
    elif image_exists_locally; then
      normalize_pulled_image || true
      log_line "本地已存在镜像: ${IMAGE}"
    elif listed="$(any_lemon_image_in_docker_list 2>/dev/null)"; then
      IMAGE="${listed}"
      normalize_pulled_image || true
      log_line "本地已存在镜像（docker images）: ${IMAGE}"
    else
      if [ "${SOFT_PULL_FAIL:-0}" = "1" ]; then
        log_line "本地暂无镜像，安装将继续；请稍后 SSH 拉取或启用时自动拉取"
        update_compose_image
        save_image_config
        return 1
      fi
      fail_install "本地不存在镜像 ${IMAGE}。请先 SSH 执行 docker pull，或不要选「跳过拉取」。"
    fi
  else
    log_line "在线拉取镜像（始终从仓库更新，不沿用旧本地层）…"
    if ! pull_image_with_fallback; then
      update_compose_image
      save_image_config
      return 1
    fi
    log_line "镜像拉取完成。"
    update_install_ui "【实际拉取进度 100% · 镜像拉取完成】
镜像：${IMAGE}
正在写入配置…"
    docker_cmd images "${IMAGE}" 2>&1 >> "${LOG_FILE}" || true
  fi

  update_compose_image
  save_image_config
  return 0
}

mark_install_complete() {
  local phase="$1"
  log_line "=========================================="
  log_line "${phase}完成！"
  log_line "镜像: ${IMAGE}"
  log_line "请在应用中心点击「启动」"
  log_line "访问: http://<NAS_IP>:7983"
  log_hint_paths
  log_line "=========================================="
  echo "completed ${IMAGE} at $(date -Iseconds)" > "${TRIM_PKGVAR}/install.status" 2>/dev/null || true
}
