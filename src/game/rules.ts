/**
 * 接水管 —— 规则传播与校验
 *
 * 候选表示：cands[i] 是 4 位比特，第 r 位 = 「可以旋转 r 次」。
 * 传播分两层，全部是「标准定式」级别的可证明约束：
 *
 *   规则 1 接口匹配：相邻两格的开口必须同时存在或同时不存在（弧相容 AC-3）；
 *   规则 2 边界封闭：盘外方向不能开口（在 initialCandidates 里一次筛掉）；
 *   规则 3 端点约束：单接口的端点格是生成树的叶子，两个端点不能互连成孤岛；
 *   规则 4 度数守恒：每格管道形状固定 ⇒ 全盘开口总数固定 ⇒ 最终管道边数
 *            requiredEdges = 开口总数 / 2 是定值。任何候选组合能产生的
 *            「可能边」少于它 ⇒ 矛盾；候选恰好用满 ⇒ 所有可能边都必须在。
 *   规则 5 连通成片：最终所有格子必须连成一片。用「必然存在的边」做并查集，
 *            某个片区的管道只剩唯一出口时该出口必连；没有出口又不覆盖全盘 ⇒ 矛盾。
 *   规则 6 禁止成环：生成题的解是一棵生成树（requiredEdges = 格子数 - 1），
 *            所以必然边成环、或某候选会让必然边成环 ⇒ 矛盾 / 删候选。
 *   规则 7 回溯兜底：以上都推不动时才做搜索，仅用于回放标签（不在本文件）。
 *
 * 所有规则只依赖「题面形状 + 候选集合」，不做任何假设性猜测；删掉的候选一定
 * 不可能出现在任何合法终盘里。回归校验见 scripts/check.mjs（每题唯一解）。
 */

import {
  DIR_DX,
  DIR_DY,
  maskHas,
  opposite,
  popcount4,
  rotateMask,
  type PipesPuzzle,
} from './types.ts'

export type RotationMask = number

/** 规则编号（回放标签用） */
export const RULE_EDGE = 1
export const RULE_BORDER = 2
export const RULE_ENDPOINT = 3
export const RULE_COUNT = 4
export const RULE_CONNECT = 5
export const RULE_CYCLE = 6
export const RULE_GUESS = 7

/** 规则名（README / 状态栏 / 报告用） */
export const RULE_NAMES: Readonly<Record<number, string>> = {
  [RULE_EDGE]: '接口匹配',
  [RULE_BORDER]: '边界封闭',
  [RULE_ENDPOINT]: '端点约束',
  [RULE_COUNT]: '度数守恒',
  [RULE_CONNECT]: '连通成片',
  [RULE_CYCLE]: '禁止成环',
  [RULE_GUESS]: '回溯兜底',
}

/** 每步回放给玩家看的人类理由 */
export const RULE_REASONS: Readonly<Record<number, string>> = {
  [RULE_EDGE]: '接口匹配：相邻格的开口必须成对相连，剩下的角度会漏水',
  [RULE_BORDER]: '边界封闭：盘外不能有开口，这个角度会把水漏到盘外',
  [RULE_ENDPOINT]: '端点约束：单接口的端点格只能接一个邻居，两个端点不能互相封死成孤岛',
  [RULE_COUNT]: '度数守恒：每格管口数固定，全盘管道边数必须是定值',
  [RULE_CONNECT]: '连通成片：所有管道最终必须连成一整片，这一格接上才通',
  [RULE_CYCLE]: '禁止成环：管网是一棵生成树，提前闭合成环就接不到所有格子',
  [RULE_GUESS]: '回溯兜底：规则推不动，搜索得到该格的最终角度',
}

export function ruleName(rule: number): string {
  return RULE_NAMES[rule] ?? `规则${rule}`
}

/** 传播日志：forced[i] = 候选第一次收敛到唯一角度时命中的规则编号；0 = 未记录 */
export interface PropagateLog {
  forced: number[]
}

export { popcount4 }

/**
 * 初始候选：给定角锁定，否则 0..3；边界开口直接排除（规则 2）。
 * 传 log 时把「只因边界封闭才唯一」的格子记成规则 2。
 */
export function initialCandidates(p: PipesPuzzle, log?: PropagateLog): RotationMask[] {
  const w = p.width
  const h = p.height
  const out = new Array<RotationMask>(w * h).fill(0)
  for (let i = 0; i < w * h; i++) {
    const given = p.givens?.[i] ?? -1
    let m = 0
    for (let r = 0; r < 4; r++) {
      if (given >= 0 && r !== given) continue
      const mask = rotateMask(p.tiles[i] ?? 0, r)
      let border = false
      const x = i % w
      const y = (i / w) | 0
      if ((x === 0 && maskHas(mask, 3)) || (x + 1 === w && maskHas(mask, 1))) border = true
      if ((y === 0 && maskHas(mask, 0)) || (y + 1 === h && maskHas(mask, 2))) border = true
      if (!border) m |= 1 << r
    }
    out[i] = m
    if (log && given < 0 && popcount4(m) === 1) log.forced[i] = RULE_BORDER
  }
  return out
}

/* ———————————————————— 候选集/方向信息 ———————————————————— */

interface DirInfo {
  /** 存在某个候选含该方向开口 */
  poss: Uint8Array
  /** 所有候选都含该方向开口 */
  forced: Uint8Array
}

function buildDirInfo(cands: RotationMask[], p: PipesPuzzle): DirInfo {
  const n = p.width * p.height
  const poss = new Uint8Array(n)
  const forced = new Uint8Array(n)
  const tiles = p.tiles
  for (let i = 0; i < n; i++) {
    const m = cands[i]!
    let po = 0
    let fo = 15
    let any = false
    for (let r = 0; r < 4; r++) {
      if (!(m & (1 << r))) continue
      const mask = rotateMask(tiles[i] ?? 0, r)
      po |= mask
      fo &= mask
      any = true
    }
    poss[i] = any ? po & 15 : 0
    forced[i] = any ? fo & 15 : 0
  }
  return { poss, forced }
}

/** 全盘开口总数（与旋转无关）与最终管道边数 */
function requiredEdgeCount(p: PipesPuzzle): { totalOpenings: number; requiredEdges: number } {
  let totalOpenings = 0
  for (let i = 0; i < p.tiles.length; i++) totalOpenings += popcount4(p.tiles[i] ?? 0)
  return { totalOpenings, requiredEdges: totalOpenings / 2 }
}

/** 把格子 i 的候选限制为「含方向 dir 开口」；返回 -1 矛盾 / 0 无变化 / 1 有变化 */
function keepOpening(
  cands: RotationMask[],
  p: PipesPuzzle,
  i: number,
  dir: number,
  rule: number,
  log?: PropagateLog,
): number {
  const allowed = cands[i]!
  let keep = 0
  for (let r = 0; r < 4; r++) {
    if (!(allowed & (1 << r))) continue
    if (maskHas(rotateMask(p.tiles[i] ?? 0, r), dir)) keep |= 1 << r
  }
  if (keep === allowed) return 0
  if (keep === 0) return -1
  if (log && popcount4(allowed) > 1 && popcount4(keep) === 1) log.forced[i] = rule
  cands[i] = keep
  return 1
}

/** 把格子 i 的候选限制为「不含方向 dir 开口」；返回 -1 矛盾 / 0 无变化 / 1 有变化 */
function banOpening(
  cands: RotationMask[],
  p: PipesPuzzle,
  i: number,
  dir: number,
  rule: number,
  log?: PropagateLog,
): number {
  const allowed = cands[i]!
  let keep = 0
  for (let r = 0; r < 4; r++) {
    if (!(allowed & (1 << r))) continue
    if (!maskHas(rotateMask(p.tiles[i] ?? 0, r), dir)) keep |= 1 << r
  }
  if (keep === allowed) return 0
  if (keep === 0) return -1
  if (log && popcount4(allowed) > 1 && popcount4(keep) === 1) log.forced[i] = rule
  cands[i] = keep
  return 1
}

/* ———————————————————— 规则 1：接口匹配（弧相容） ———————————————————— */

function edgePass(cands: RotationMask[], p: PipesPuzzle, log?: PropagateLog): number {
  const w = p.width
  const h = p.height
  const n = w * h
  let changed = 0
  for (let i = 0; i < n; i++) {
    const allowed = cands[i]!
    if (allowed === 0) return -1
    let keep = 0
    for (let r = 0; r < 4; r++) {
      if (!(allowed & (1 << r))) continue
      const mask = rotateMask(p.tiles[i] ?? 0, r)
      let ok = true
      for (let d = 0; d < 4; d++) {
        const nx = (i % w) + DIR_DX[d]!
        const ny = ((i / w) | 0) + DIR_DY[d]!
        const has = maskHas(mask, d)
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
          if (has) {
            ok = false
            break
          }
          continue
        }
        const j = ny * w + nx
        const m2 = cands[j]!
        let compatible = false
        for (let r2 = 0; r2 < 4; r2++) {
          if (!(m2 & (1 << r2))) continue
          if (maskHas(rotateMask(p.tiles[j] ?? 0, r2), opposite(d)) === has) {
            compatible = true
            break
          }
        }
        if (!compatible) {
          ok = false
          break
        }
      }
      if (ok) keep |= 1 << r
    }
    if (keep !== allowed) {
      if (keep === 0) return -1
      if (log && popcount4(allowed) > 1 && popcount4(keep) === 1) log.forced[i] = RULE_EDGE
      cands[i] = keep
      changed = 1
    }
  }
  return changed
}

/* ———————————————————— 规则 3：端点约束 ———————————————————— */

/**
 * 端点（只有一个接口的管道格）是生成树的叶子：
 *  - 端点必须接上唯一一条边，否则它就是一个单独的连通片；
 *  - 两个端点不能直接互连：它们的唯一接口都用在对方身上，会封成一个
 *    永远接不到其余格子的孤岛（只有全盘 2 格时才允许）。
 * 所以「端点 → 端点」这条边在解里必然不存在，直接抹掉两侧对应开口。
 */
function endpointPass(cands: RotationMask[], p: PipesPuzzle, log?: PropagateLog): number {
  const n = p.width * p.height
  if (n <= 2) return 0
  const w = p.width
  const h = p.height
  const isEndpoint = new Uint8Array(n)
  for (let i = 0; i < n; i++) isEndpoint[i] = popcount4(p.tiles[i] ?? 0) === 1 ? 1 : 0

  let changed = 0
  for (let i = 0; i < n; i++) {
    if (!isEndpoint[i]) continue
    const x = i % w
    const y = (i / w) | 0
    for (let d = 0; d < 4; d++) {
      const nx = x + DIR_DX[d]!
      const ny = y + DIR_DY[d]!
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const j = ny * w + nx
      if (!isEndpoint[j]) continue
      const r1 = banOpening(cands, p, i, d, RULE_ENDPOINT, log)
      if (r1 < 0) return -1
      changed |= r1
      const r2 = banOpening(cands, p, j, opposite(d), RULE_ENDPOINT, log)
      if (r2 < 0) return -1
      changed |= r2
    }
  }
  return changed
}

/* ———————————————————— 规则 4：度数守恒 ———————————————————— */

function countPass(cands: RotationMask[], p: PipesPuzzle, log?: PropagateLog): number {
  const w = p.width
  const h = p.height
  const n = w * h
  const { totalOpenings, requiredEdges } = requiredEdgeCount(p)
  // 合法终盘里每个开口都要和邻格配对：开口数必须为偶数、且边数够连通全盘
  if (totalOpenings % 2 !== 0) return -1
  if (requiredEdges < n - 1) return -1

  const { poss, forced } = buildDirInfo(cands, p)
  let minEdges = 0
  let maxEdges = 0
  const canEdges: Array<[number, number, number]> = [] // i, dir, j
  for (let i = 0; i < n; i++) {
    const x = i % w
    const y = (i / w) | 0
    for (let d = 1; d <= 2; d++) {
      const nx = x + DIR_DX[d]!
      const ny = y + DIR_DY[d]!
      if (nx >= w || ny >= h) continue
      const j = ny * w + nx
      const od = opposite(d)
      const canI = maskHas(poss[i]!, d)
      const canJ = maskHas(poss[j]!, od)
      if (!canI || !canJ) continue
      maxEdges++
      canEdges.push([i, d, j])
      if (maskHas(forced[i]!, d) && maskHas(forced[j]!, od)) minEdges++
    }
  }
  if (maxEdges < requiredEdges) return -1
  if (minEdges === requiredEdges && maxEdges === 0) return -1

  let changed = 0
  // 全盘最多只能有 requiredEdges 条边，而候选恰好只剩这么多可能边 ⇒ 每条都得连上
  if (maxEdges === requiredEdges) {
    for (const [i, d, j] of canEdges) {
      if (maskHas(forced[i]!, d) && maskHas(forced[j]!, opposite(d))) continue
      if (!maskHas(forced[i]!, d)) {
        const r1 = keepOpening(cands, p, i, d, RULE_COUNT, log)
        if (r1 < 0) return -1
        changed |= r1
      }
      if (!maskHas(forced[j]!, opposite(d))) {
        const r2 = keepOpening(cands, p, j, opposite(d), RULE_COUNT, log)
        if (r2 < 0) return -1
        changed |= r2
      }
    }
  }
  return changed
}

/* ———————————————————— 并查集 ———————————————————— */

function makeUF(n: number) {
  const parent = new Int32Array(n)
  for (let i = 0; i < n; i++) parent[i] = i
  const find = (x: number): number => {
    let r = x
    while (parent[r] !== r) r = parent[r]!
    while (parent[x] !== r) {
      const next = parent[x]!
      parent[x] = r
      x = next
    }
    return r
  }
  return {
    find,
    union(a: number, b: number): boolean {
      const ra = find(a)
      const rb = find(b)
      if (ra === rb) return false
      parent[rb] = ra
      return true
    },
  }
}

/* ———————————————————— 规则 5：连通成片 ———————————————————— */

function connectPass(cands: RotationMask[], p: PipesPuzzle, log?: PropagateLog): number {
  const w = p.width
  const h = p.height
  const n = w * h
  const { poss, forced } = buildDirInfo(cands, p)

  // 必然边（两端在所有候选里都开口）用来收缩片区；可能边用来判断能否再连出去
  const mustUF = makeUF(n)
  const canUF = makeUF(n)
  for (let i = 0; i < n; i++) {
    const x = i % w
    const y = (i / w) | 0
    for (let d = 1; d <= 2; d++) {
      const nx = x + DIR_DX[d]!
      const ny = y + DIR_DY[d]!
      if (nx >= w || ny >= h) continue
      const j = ny * w + nx
      const od = opposite(d)
      const canI = maskHas(poss[i]!, d)
      const canJ = maskHas(poss[j]!, od)
      if (!canI || !canJ) continue
      canUF.union(i, j)
      if (maskHas(forced[i]!, d) && maskHas(forced[j]!, od)) mustUF.union(i, j)
    }
  }

  // 可能边图不连通 ⇒ 无论怎么转都连不成一整片
  const root0 = canUF.find(0)
  for (let i = 1; i < n; i++) if (canUF.find(i) !== root0) return -1

  // 收缩必然片区：统计每个片区的格子数，以及跨片区的「可能出口」边
  const compSize = new Map<number, number>()
  for (let i = 0; i < n; i++) {
    const r = mustUF.find(i)
    compSize.set(r, (compSize.get(r) ?? 0) + 1)
  }
  const compExits = new Map<number, Array<{ i: number; d: number; j: number }>>()
  for (const r of compSize.keys()) compExits.set(r, [])
  for (let i = 0; i < n; i++) {
    const ri = mustUF.find(i)
    const x = i % w
    const y = (i / w) | 0
    for (let d = 1; d <= 2; d++) {
      const nx = x + DIR_DX[d]!
      const ny = y + DIR_DY[d]!
      if (nx >= w || ny >= h) continue
      const j = ny * w + nx
      const rj = mustUF.find(j)
      if (rj === ri) continue
      const od = opposite(d)
      if (!maskHas(poss[i]!, d) || !maskHas(poss[j]!, od)) continue
      // 同一条边对两个片区都是出口，两边各记一次
      compExits.get(ri)!.push({ i, d, j })
      compExits.get(rj)!.push({ i: j, d: od, j: i })
    }
  }

  let changed = 0
  for (const [root, list] of compExits) {
    const size = compSize.get(root) ?? 0
    if (size >= n) continue
    if (list.length === 0) return -1 // 封闭片区，永远接不到剩下的格子
    if (list.length === 1) {
      // 只剩唯一出口 ⇒ 这条边必须在解里
      const { i, d, j } = list[0]!
      if (maskHas(forced[i]!, d) && maskHas(forced[j]!, opposite(d))) continue
      if (!maskHas(forced[i]!, d)) {
        const r1 = keepOpening(cands, p, i, d, RULE_CONNECT, log)
        if (r1 < 0) return -1
        changed |= r1
      }
      if (!maskHas(forced[j]!, opposite(d))) {
        const r2 = keepOpening(cands, p, j, opposite(d), RULE_CONNECT, log)
        if (r2 < 0) return -1
        changed |= r2
      }
    }
  }
  return changed
}

/* ———————————————————— 规则 6：禁止成环 ———————————————————— */

function cyclePass(cands: RotationMask[], p: PipesPuzzle, log?: PropagateLog): number {
  const w = p.width
  const h = p.height
  const n = w * h
  const { requiredEdges } = requiredEdgeCount(p)
  // 只有「解必然是生成树」时才禁止成环：合法终盘边数 = n-1 且连通 ⇒ 无环
  if (requiredEdges !== n - 1) return 0

  const { poss, forced } = buildDirInfo(cands, p)
  const mustUF = makeUF(n)
  const mustEdges: Array<{ i: number; d: number; j: number }> = []
  for (let i = 0; i < n; i++) {
    const x = i % w
    const y = (i / w) | 0
    for (let d = 1; d <= 2; d++) {
      const nx = x + DIR_DX[d]!
      const ny = y + DIR_DY[d]!
      if (nx >= w || ny >= h) continue
      const j = ny * w + nx
      if (!maskHas(forced[i]!, d) || !maskHas(forced[j]!, opposite(d))) continue
      if (mustUF.union(i, j)) mustEdges.push({ i, d, j })
      else return -1 // 必然边自己已经成环
    }
  }

  // 非必然边：若两端已被必然边连在一起，这条边一旦连上就成环 ⇒ 抹掉相应开口
  let changed = 0
  for (let i = 0; i < n; i++) {
    const x = i % w
    const y = (i / w) | 0
    for (let d = 1; d <= 2; d++) {
      const nx = x + DIR_DX[d]!
      const ny = y + DIR_DY[d]!
      if (nx >= w || ny >= h) continue
      const j = ny * w + nx
      const od = opposite(d)
      const fi = maskHas(forced[i]!, d)
      const fj = maskHas(forced[j]!, od)
      if (fi && fj) continue // 必然边，已在并查集里
      if (mustUF.find(i) !== mustUF.find(j)) continue
      if (!maskHas(poss[i]!, d) || !maskHas(poss[j]!, od)) continue
      if (fj) {
        const r = banOpening(cands, p, i, d, RULE_CYCLE, log)
        if (r < 0) return -1
        changed |= r
      } else if (fi) {
        const r = banOpening(cands, p, j, od, RULE_CYCLE, log)
        if (r < 0) return -1
        changed |= r
      }
    }
  }
  return changed
}

/* ———————————————————— 传播主循环 ———————————————————— */

/**
 * 把候选传播到不动点。返回 false = 当前盘面已经矛盾（无解）。
 * 传 log 时记录每格候选收敛到唯一角度时命中的规则编号（用于回放理由）。
 */
export function propagate(cands: RotationMask[], p: PipesPuzzle, log?: PropagateLog): boolean {
  let changed = true
  while (changed) {
    changed = false
    const e = edgePass(cands, p, log)
    if (e < 0) return false
    if (e > 0) changed = true
    const t = endpointPass(cands, p, log)
    if (t < 0) return false
    if (t > 0) changed = true
    const c = countPass(cands, p, log)
    if (c < 0) return false
    if (c > 0) changed = true
    const k = connectPass(cands, p, log)
    if (k < 0) return false
    if (k > 0) changed = true
    const y = cyclePass(cands, p, log)
    if (y < 0) return false
    if (y > 0) changed = true
  }
  for (let i = 0; i < cands.length; i++) if (cands[i] === 0) return false
  return true
}

/* ———————————————————— 终盘校验 ———————————————————— */

export interface PipesCheck {
  ok: boolean
  leaks: number[]
  badCells: number[]
  parts: number
}

export function checkSolution(rotations: ArrayLike<number>, p: PipesPuzzle): PipesCheck {
  const w = p.width
  const h = p.height
  const n = w * h
  const bad = new Set<number>()
  const leaks = new Set<number>()
  const masks: number[] = []
  for (let i = 0; i < n; i++) masks.push(rotateMask(p.tiles[i] ?? 0, rotations[i] ?? 0))

  const adj: number[][] = Array.from({ length: n }, () => [])
  for (let i = 0; i < n; i++) {
    for (let d = 0; d < 4; d++) {
      if (!maskHas(masks[i]!, d)) continue
      const nx = (i % w) + DIR_DX[d]!
      const ny = ((i / w) | 0) + DIR_DY[d]!
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
        leaks.add(i)
        bad.add(i)
        continue
      }
      const j = ny * w + nx
      if (!maskHas(masks[j]!, opposite(d))) {
        leaks.add(i)
        leaks.add(j)
        bad.add(i)
        bad.add(j)
        continue
      }
      adj[i]!.push(j)
    }
  }

  let parts = 0
  const seen = new Uint8Array(n)
  for (let start = 0; start < n; start++) {
    if (seen[start]) continue
    parts++
    const stack = [start]
    seen[start] = 1
    while (stack.length) {
      const i = stack.pop()!
      for (const j of adj[i]!) {
        if (!seen[j]) {
          seen[j] = 1
          stack.push(j)
        }
      }
    }
  }

  if (parts > 1) for (let i = 0; i < n; i++) bad.add(i)
  return { ok: leaks.size === 0 && parts === 1, leaks: Array.from(leaks), badCells: Array.from(bad), parts }
}