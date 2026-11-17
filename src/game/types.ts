/**
 * 接水管（Pipes）—— 类型
 *
 * tiles[i]：旋转 0 时的接口掩码（N=1, E=2, S=4, W=8）。
 * rotations[i]：0..3 顺时针旋转次数。
 * givens[i]：-1 可旋转；0..3 锁定角度。
 */

import type { GameState, Puzzle, ValidationResult } from '../core/types'

export const DIR_DX = [0, 1, 0, -1]
export const DIR_DY = [-1, 0, 1, 0]

export function maskHas(mask: number, dir: number): boolean {
  return (mask & (1 << dir)) !== 0
}

export function opposite(dir: number): number {
  return (dir + 2) % 4
}

/** 4 位掩码里 1 的个数（= 管道接口数 / 候选角度数） */
export function popcount4(m: number): number {
  let n = 0
  while (m) {
    m &= m - 1
    n++
  }
  return n
}

export function rotateMask(mask: number, r: number): number {
  let m = mask & 15
  for (let k = 0; k < ((r % 4) + 4) % 4; k++) {
    m = ((m << 1) & 15) | ((m >> 3) & 1)
  }
  return m
}

export function cellMask(tiles: ArrayLike<number>, rotations: ArrayLike<number>, cell: number): number {
  return rotateMask(tiles[cell] ?? 0, rotations[cell] ?? 0)
}

export interface PipesPuzzle extends Puzzle {
  tiles: number[]
  givens: number[]
  initialRotations: number[]
  solutionRotations?: string
}

export interface PipesState extends GameState {
  rotations: number[]
  givens: number[]
}

export interface PipesResult extends ValidationResult {
  leaks: number[]
  badCells: number[]
  parts: number
  solved: boolean
}

export function asPipesPuzzle(p: Puzzle): PipesPuzzle {
  return p as PipesPuzzle
}

export function asPipesState(s: GameState): PipesState {
  return s as PipesState
}

const HEX = '0123456789abcdef'

export function encodeTiles(tiles: ArrayLike<number>): string {
  let out = ''
  for (let i = 0; i < tiles.length; i++) out += HEX[tiles[i]! & 15]
  return out
}

export function decodeTiles(text: string, expected: number): number[] | null {
  if (typeof text !== 'string' || text.length !== expected) return null
  const out = new Array<number>(expected)
  for (let i = 0; i < expected; i++) {
    const v = HEX.indexOf(text[i]!)
    if (v < 0) return null
    out[i] = v
  }
  return out
}

export function encodeGivens(givens: ArrayLike<number>): string {
  let out = ''
  for (let i = 0; i < givens.length; i++) {
    const v = givens[i]!
    out += v < 0 ? 'x' : String(v)
  }
  return out
}

export function decodeGivens(text: string, expected: number): number[] | null {
  if (typeof text !== 'string' || text.length !== expected) return null
  const out = new Array<number>(expected).fill(-1)
  for (let i = 0; i < expected; i++) {
    const ch = text[i]!
    if (ch === 'x' || ch === '.') continue
    const v = ch.charCodeAt(0) - 48
    if (v < 0 || v > 3) return null
    out[i] = v
  }
  return out
}

export function encodeRotations(rotations: ArrayLike<number>): string {
  let out = ''
  for (let i = 0; i < rotations.length; i++) out += String((rotations[i]! | 0) % 4)
  return out
}

export function decodeRotations(text: string, expected: number): number[] | null {
  if (typeof text !== 'string' || text.length !== expected) return null
  const out = new Array<number>(expected).fill(0)
  for (let i = 0; i < expected; i++) {
    const v = text.charCodeAt(i) - 48
    if (v < 0 || v > 3) return null
    out[i] = v
  }
  return out
}

/** 相邻格对（用于约束传播） */
export function neighbors4(cell: number, w: number, h: number): Array<[number, number]> {
  const x = cell % w
  const y = (cell / w) | 0
  const out: Array<[number, number]> = []
  if (y > 0) out.push([cell - w, 0])
  if (x + 1 < w) out.push([cell + 1, 1])
  if (y + 1 < h) out.push([cell + w, 2])
  if (x > 0) out.push([cell - 1, 3])
  return out
}
