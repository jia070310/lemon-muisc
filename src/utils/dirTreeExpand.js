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
