import { reactive } from 'vue'

/** 全局应用内确认 / 提示弹窗（替代 window.confirm / alert / prompt） */
export const appDialogState = reactive({
  open: false,
  mode: 'confirm', // confirm | alert | prompt
  title: '确认',
  message: '',
  hint: '',
  cover: '',
  confirmText: '确定',
  cancelText: '取消',
  danger: false,
  busy: false,
  busyText: '处理中…',
  inputValue: '',
  inputPlaceholder: '',
  inputLabel: '',
})

let resolver = null

function settle(result) {
  appDialogState.open = false
  appDialogState.busy = false
  const resolve = resolver
  resolver = null
  if (resolve) resolve(result)
}

/**
 * @param {{
 *   title?: string,
 *   message?: string,
 *   hint?: string,
 *   cover?: string,
 *   confirmText?: string,
 *   cancelText?: string,
 *   danger?: boolean,
 * }} options
 * @returns {Promise<boolean>}
 */
export function appConfirm(options = {}) {
  return new Promise((resolve) => {
    if (resolver) settle(false)
    resolver = resolve
    appDialogState.open = true
    appDialogState.mode = 'confirm'
    appDialogState.title = options.title || '确认'
    appDialogState.message = options.message || ''
    appDialogState.hint = options.hint || ''
    appDialogState.cover = options.cover || ''
    appDialogState.confirmText = options.confirmText || '确定'
    appDialogState.cancelText = options.cancelText || '取消'
    appDialogState.danger = Boolean(options.danger)
    appDialogState.busy = false
    appDialogState.busyText = options.busyText || '处理中…'
    appDialogState.inputValue = ''
    appDialogState.inputPlaceholder = ''
    appDialogState.inputLabel = ''
  })
}

/**
 * @param {{ title?: string, message?: string, hint?: string, confirmText?: string }} options
 * @returns {Promise<void>}
 */
export function appAlert(options = {}) {
  return new Promise((resolve) => {
    if (resolver) settle(undefined)
    resolver = () => resolve()
    appDialogState.open = true
    appDialogState.mode = 'alert'
    appDialogState.title = options.title || '提示'
    appDialogState.message = options.message || ''
    appDialogState.hint = options.hint || ''
    appDialogState.cover = ''
    appDialogState.confirmText = options.confirmText || '知道了'
    appDialogState.cancelText = ''
    appDialogState.danger = false
    appDialogState.busy = false
    appDialogState.inputValue = ''
    appDialogState.inputPlaceholder = ''
    appDialogState.inputLabel = ''
  })
}

/**
 * @param {{
 *   title?: string,
 *   message?: string,
 *   hint?: string,
 *   defaultValue?: string,
 *   placeholder?: string,
 *   inputLabel?: string,
 *   confirmText?: string,
 *   cancelText?: string,
 * }} options
 * @returns {Promise<string|null>} 确认返回输入内容，取消返回 null
 */
export function appPrompt(options = {}) {
  return new Promise((resolve) => {
    if (resolver) settle(null)
    resolver = resolve
    appDialogState.open = true
    appDialogState.mode = 'prompt'
    appDialogState.title = options.title || '请输入'
    appDialogState.message = options.message || ''
    appDialogState.hint = options.hint || ''
    appDialogState.cover = ''
    appDialogState.confirmText = options.confirmText || '确定'
    appDialogState.cancelText = options.cancelText || '取消'
    appDialogState.danger = false
    appDialogState.busy = false
    appDialogState.inputValue = options.defaultValue != null ? String(options.defaultValue) : ''
    appDialogState.inputPlaceholder = options.placeholder || ''
    appDialogState.inputLabel = options.inputLabel || ''
  })
}

export function setAppDialogInput(value) {
  appDialogState.inputValue = value != null ? String(value) : ''
}

export function confirmAppDialog() {
  if (appDialogState.busy) return
  if (appDialogState.mode === 'alert') settle(undefined)
  else if (appDialogState.mode === 'prompt') settle(String(appDialogState.inputValue || ''))
  else settle(true)
}

export function cancelAppDialog() {
  if (appDialogState.busy) return
  if (appDialogState.mode === 'alert') settle(undefined)
  else if (appDialogState.mode === 'prompt') settle(null)
  else settle(false)
}
