/**
 * 接水管 —— 状态
 */

import type { GameState, HitTarget, Move, Puzzle } from '../core/types'
import {
  asPipesPuzzle,
  asPipesState,
  decodeGivens,
  decodeRotations,
  encodeGivens,
  encodeRotations,
  type PipesState,
} from './types'

export function createEmptyState(puzzle: Puzzle): PipesState {
  const p = asPipesPuzzle(puzzle)
  const size = p.width * p.height
  const givens = p.givens ?? new Array<number>(size).fill(-1)
  const rotations = new Array<number>(size).fill(0)
  for (let i = 0; i < size; i++) {
    rotations[i] = givens[i]! >= 0 ? givens[i]! : (p.initialRotations?.[i] ?? 0) % 4
  }
  return {
    puzzleId: p.id,
    width: p.width,
    height: p.height,
    rotations,
    givens: givens.slice(),
  }
}

export function cloneState(state: GameState): PipesState {
  const s = asPipesState(state)
  return {
    puzzleId: s.puzzleId,
    width: s.width,
    height: s.height,
    rotations: s.rotations.slice(),
    givens: s.givens.slice(),
  }
}

export function cycleValue(state: GameState, target: HitTarget): number {
  const s = asPipesState(state)
  const given = s.givens[target.index] ?? -1
  if (given >= 0) return given
  return ((s.rotations[target.index] ?? 0) + 1) % 4
}

export function rightClickValue(state: GameState, target: HitTarget): number {
  const s = asPipesState(state)
  const given = s.givens[target.index] ?? -1
  return given >= 0 ? given : ((s.rotations[target.index] ?? 0) + 3) % 4
}

export function applyMove(state: GameState, move: Move): void {
  const s = asPipesState(state)
  if (move.index < 0 || move.index >= s.rotations.length) return
  if ((s.givens[move.index] ?? -1) >= 0) return
  const v = ((move.to | 0) % 4 + 4) % 4
  s.rotations[move.index] = v
}

export function invertMove(move: Move): Move {
  return { index: move.index, from: move.to, to: move.from }
}

export function valueAt(state: GameState, index: number): number {
  return asPipesState(state).rotations[index] ?? 0
}

export function serializeState(state: GameState): Record<string, unknown> {
  const s = asPipesState(state)
  return {
    version: 1,
    puzzleId: s.puzzleId,
    width: s.width,
    height: s.height,
    rotations: encodeRotations(s.rotations),
    givens: encodeGivens(s.givens),
  }
}

export function deserializeState(data: Record<string, unknown>): PipesState | null {
  if (typeof data.puzzleId !== 'string') return null
  if (typeof data.width !== 'number' || typeof data.height !== 'number') return null
  const size = data.width * data.height
  if (!Number.isInteger(size) || size <= 0) return null
  const rotations = typeof data.rotations === 'string' ? decodeRotations(data.rotations, size) : null
  if (!rotations) return null
  const givens =
    typeof data.givens === 'string'
      ? decodeGivens(data.givens, size)
      : new Array<number>(size).fill(-1)
  if (!givens) return null
  for (let i = 0; i < size; i++) if (givens[i]! >= 0) rotations[i] = givens[i]!
  return { puzzleId: data.puzzleId, width: data.width, height: data.height, rotations, givens }
}

export function firstHintMove(state: GameState, solution: GameState): Move | null {
  const s = asPipesState(state)
  const sol = asPipesState(solution)
  for (let i = 0; i < s.rotations.length; i++) {
    if ((s.givens[i] ?? -1) >= 0) continue
    if ((s.rotations[i] ?? 0) !== (sol.rotations[i] ?? 0)) {
      return { index: i, from: s.rotations[i] ?? 0, to: sol.rotations[i] ?? 0 }
    }
  }
  return null
}
