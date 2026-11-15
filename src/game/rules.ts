/**
 * 接水管 —— 规则传播与校验
 */

import {
  DIR_DX,
  DIR_DY,
  maskHas,
  opposite,
  rotateMask,
  type PipesPuzzle,
} from './types.ts'

export type RotationMask = number

/** 初始候选：给定角锁定，否则 0..3；边界开口直接排除 */
export function initialCandidates(p: PipesPuzzle): RotationMask[] {
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
  }
  return out
}

export function popcount4(m: number): number {
  let n = 0
  while (m) {
    m &= m - 1
    n++
  }
  return n
}

export function propagate(cands: RotationMask[], p: PipesPuzzle): boolean {
  const w = p.width
  const h = p.height
  let changed = true
  while (changed) {
    changed = false
    for (let i = 0; i < w * h; i++) {
      const allowed = cands[i]!
      if (allowed === 0) return false
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
          let compatible = false
          let m2 = cands[j]!
          while (m2) {
            const low = m2 & -m2
            const r2 = 31 - Math.clz32(low)
            m2 ^= low
            const nm = rotateMask(p.tiles[j] ?? 0, r2)
            if (maskHas(nm, opposite(d)) === has) {
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
        if (keep === 0) return false
        cands[i] = keep
        changed = true
      }
    }
  }
  return true
}

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
