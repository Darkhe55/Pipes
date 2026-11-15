/**
 * 接水管题库生成器
 *
 * 1. 随机生成一张网格生成树，作为「管道网络」终盘；
 * 2. 每格按度数生成管道形状，随机旋转后反推基础掩码；
 * 3. 先锁定全部角度，再随机解锁仍保持唯一解的角度。
 */

import type { Difficulty } from '../core/types'
import {
  DIR_DX,
  DIR_DY,
  encodeGivens,
  encodeRotations,
  encodeTiles,
  rotateMask,
  type PipesPuzzle,
} from './types.ts'
import { countSolutions } from './solver.ts'

interface GenSpec {
  seed: number
  difficulty: Difficulty
  name: string
  series: string
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

const SPECS: GenSpec[] = [
  { seed: 0x4d534a01, difficulty: 'easy', name: '初识水管', series: '入门' },
  { seed: 0x4d534a02, difficulty: 'easy', name: '弯管回廊', series: '入门' },
  { seed: 0x4d534a03, difficulty: 'medium', name: '管网交错', series: '进阶' },
  { seed: 0x4d534a04, difficulty: 'medium', name: '水流迷宫', series: '进阶' },
  { seed: 0x4d534a05, difficulty: 'hard', name: '水管之壁', series: '挑战' },
  { seed: 0x4d534a06, difficulty: 'hard', name: '终局水管', series: '挑战' },
]

export interface GeneratedPuzzle {
  id: string
  name: string
  width: number
  height: number
  difficulty: Difficulty
  series: string
  board: string
  solution: string
}

function makeTree(w: number, h: number, rng: () => number): Set<string> | null {
  const n = w * h
  const visited = new Uint8Array(n)
  const start = Math.floor(rng() * n)
  visited[start] = 1
  let count = 1
  const edges = new Set<string>()
  while (count < n) {
    const frontier: Array<[number, number]> = []
    for (let i = 0; i < n; i++) {
      if (!visited[i]) continue
      const x = i % w
      const y = (i / w) | 0
      for (let d = 0; d < 4; d++) {
        const nx = x + DIR_DX[d]!
        const ny = y + DIR_DY[d]!
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const j = ny * w + nx
        if (!visited[j]) frontier.push([i, j])
      }
    }
    if (!frontier.length) return null
    const [a, b] = frontier[Math.floor(rng() * frontier.length)]!
    visited[b] = 1
    count++
    edges.add(a < b ? `${a},${b}` : `${b},${a}`)
  }
  return edges
}

function masksFromTree(tree: Set<string>, w: number): number[] {
  const masks = new Array<number>(w * w).fill(0)
  // 只用于 7×7；调用方保证 w==h
  for (const key of tree) {
    const [a, b] = key.split(',').map(Number) as [number, number]
    const ax = a % w
    const ay = (a / w) | 0
    const bx = b % w
    const by = (b / w) | 0
    if (ay === by) {
      if (bx > ax) {
        masks[a]! |= 2
        masks[b]! |= 8
      } else {
        masks[a]! |= 8
        masks[b]! |= 2
      }
    } else if (by > ay) {
      masks[a]! |= 4
      masks[b]! |= 1
    } else {
      masks[a]! |= 1
      masks[b]! |= 4
    }
  }
  return masks
}

function attempt(spec: GenSpec, rng: () => number, w: number, h: number): GeneratedPuzzle | null {
  const tree = makeTree(w, h, rng)
  if (!tree) return null
  const solutionMasks = masksFromTree(tree, w)
  const n = w * h
  const tiles = new Array<number>(n).fill(0)
  const solutionRot = new Array<number>(n).fill(0)
  for (let i = 0; i < n; i++) {
    const rot = Math.floor(rng() * 4)
    solutionRot[i] = rot
    tiles[i] = rotateMask(solutionMasks[i]!, (4 - rot) % 4)
  }

  const givens = solutionRot.slice()
  const initialRotations = new Array<number>(n).fill(0)
  for (let i = 0; i < n; i++) {
    let r = Math.floor(rng() * 4)
    if (r === solutionRot[i]) r = (r + 1 + Math.floor(rng() * 3)) % 4
    initialRotations[i] = r
  }

  const puzzle: PipesPuzzle = {
    id: `pipes-${w}x${h}-${spec.seed.toString(36)}`,
    name: spec.name,
    width: w,
    height: h,
    difficulty: spec.difficulty,
    tiles,
    givens,
    initialRotations,
  }

  let counted = countSolutions(puzzle, 2, 250_000)
  if (counted.timedOut || counted.count !== 1) return null

  const order = shuffle(Array.from({ length: n }, (_, i) => i), rng)
  for (const i of order) {
    if ((givens[i] ?? -1) < 0) continue
    const save = givens[i]!
    givens[i] = -1
    counted = countSolutions(puzzle, 2, 250_000)
    if (counted.timedOut) {
      givens[i] = save
      break
    }
    if (counted.count === 1) continue
    givens[i] = save
  }

  counted = countSolutions(puzzle, 2, 250_000)
  if (counted.timedOut || counted.count !== 1) return null

  for (let i = 0; i < n; i++) {
    initialRotations[i] = givens[i]! >= 0 ? givens[i]! : initialRotations[i]!
  }

  return {
    id: puzzle.id,
    name: spec.name,
    width: w,
    height: h,
    difficulty: spec.difficulty,
    series: spec.series,
    board: `${encodeTiles(tiles)}|${encodeGivens(givens)}|${encodeRotations(initialRotations)}`,
    solution: encodeRotations(solutionRot),
  }
}

export function generatePuzzles(): GeneratedPuzzle[] {
  const out: GeneratedPuzzle[] = []
  for (const spec of SPECS) {
    const t0 = Date.now()
    const rng = mulberry32(spec.seed)
    let made: GeneratedPuzzle | null = null
    for (let tries = 0; tries < 120 && !made; tries++) made = attempt(spec, rng, 7, 7)
    if (!made) throw new Error(`[接水管 gen] ${spec.name} 生成失败`)
    const clueCount = made.board.split('|')[1]!.split('').filter((c) => c !== 'x').length
    console.log(`[接水管 gen] ${spec.name}：锁定 ${clueCount}，${Date.now() - t0}ms`)
    out.push(made)
  }
  return out
}
