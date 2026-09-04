/** 默认展开到第几层目录节点（1=仅根，2=根+一级子目录） */
export const DIR_TREE_DEFAULT_EXPAND_DEPTH = 2

export function normalizeDirPath(dirPath) {
  return String(dirPath || '').replace(/\\/g, '/').replace(/\/+$/, '')
}

export function isDirPathUnder(childPath, parentPath) {
  const child = normalizeDirPath(childPath)
  const parent = normalizeDirPath(parentPath)
  if (!child || !parent || child === parent) return false
  return child.startsWith(`${parent}/`)
}

/** 从集合中移除目录及其所有下级路径 */
export function removeDirPathAndDescendants(pathSet, dirPath) {
  const parent = normalizeDirPath(dirPath)
  for (const p of [...pathSet]) {
    if (normalizeDirPath(p) === parent || isDirPathUnder(p, parent)) {
      pathSet.delete(p)
    }
  }
}

/** 目录自身或任一上级被勾选时，视为已选中 */
export function isDirChecked(dirPath, selectedList) {
  const target = normalizeDirPath(dirPath)
  if (!target) return false
  return (selectedList || []).some((p) => {
    const n = normalizeDirPath(p)
    return n === target || isDirPathUnder(target, n)
  })
}

function explodeExcept(set, parent, exceptPath, getChildren) {
  const children = getChildren?.(parent) || []
  for (const child of children) {
    const cp = normalizeDirPath(child.path || child)
    if (!cp || cp === exceptPath) continue
    if (isDirPathUnder(exceptPath, cp)) {
      explodeExcept(set, cp, exceptPath, getChildren)
      continue
    }
    set.add(cp)
  }
}

/**
 * 勾选/取消勾选：父级覆盖子级，无需预先加载整棵树。
 * 取消父级时会去掉其下所有勾选；取消已被父级覆盖的子级时，会拆成其余兄弟勾选。
 */
export function applyDirToggle(selectedList, dirPath, getChildren) {
  const set = new Set((selectedList || []).map(normalizeDirPath).filter(Boolean))
  const target = normalizeDirPath(dirPath)
  if (!target) return [...set]

  const checked = [...set].some((p) => p === target || isDirPathUnder(target, p))
  if (checked) {
    const covering = [...set].filter((p) => p === target || isDirPathUnder(target, p))
    for (const parent of covering) {
      set.delete(parent)
      if (parent !== target) explodeExcept(set, parent, target, getChildren)
    }
    removeDirPathAndDescendants(set, target)
  } else {
    set.add(target)
    for (const p of [...set]) {
      if (isDirPathUnder(p, target)) set.delete(p)
    }
  }
  return [...set]
}

/**
 * 递归收集某目录下所有子文件夹路径（不含自身）。
 */
export async function collectAllDescendantDirPaths(dirPath, getEntry, ensureChildren) {
  const paths = []
  async function walk(parent) {
    await ensureChildren(parent)
    for (const child of getEntry(parent).dirs || []) {
      paths.push(child.path)
      await walk(child.path)
    }
  }
  await walk(dirPath)
  return paths
}

/**
 * 收集目录树默认应展开的节点路径。
 * @param {string[]} roots
 * @param {(dirPath: string) => { dirs?: { path: string }[] }} getEntry
 * @param {(dirPath: string) => Promise<void>} ensureChildren
 * @param {number} [expandDepth]
 */
export async function collectDefaultExpandedPaths(
  roots,
  getEntry,
  ensureChildren,
  expandDepth = DIR_TREE_DEFAULT_EXPAND_DEPTH,
) {
  const expanded = new Set()
  if (!roots?.length || expandDepth < 1) return expanded

  async function visit(dirPath, depth) {
    await ensureChildren(dirPath)
    if (depth >= expandDepth) return
    expanded.add(dirPath)
    if (depth + 1 >= expandDepth) return
    for (const child of getEntry(dirPath).dirs || []) {
      await visit(child.path, depth + 1)
    }
  }

  for (const root of roots) {
    await visit(root, 0)
  }
  return expanded
}
