/**
 * 接水管 —— 回溯求解器
 */

import type { Puzzle, SolveResult } from '../core/types'
import {
  checkSolution,
  initialCandidates,
  popcount4,
  propagate,
  type RotationMask,
} from './rules.ts'
import { type PipesPuzzle, type PipesState } from './types.ts'

export interface CountOutcome {
  count: number
  nodes: number
  timedOut: boolean
}

function search(
  p: PipesPuzzle,
  limit: number,
  maxNodes: number,
): { solutions: number[][]; nodes: number; timedOut: boolean } {
  const size = p.width * p.height
  const solutions: number[][] = []
  let nodes = 0
  let timedOut = false

  const dfs = (cands: RotationMask[]): void => {
    if (solutions.length >= limit || timedOut) return
    nodes++
    if (nodes > maxNodes) {
      timedOut = true
      return
    }
    if (!propagate(cands, p)) return

    let target = -1
    let best = 5
    for (let i = 0; i < size; i++) {
      const c = popcount4(cands[i]!)
      if (c > 1 && c < best) {
        best = c
        target = i
      }
    }
    if (target < 0) {
      const rotations = cands.map((m) => (m & 1 ? 0 : m & 2 ? 1 : m & 4 ? 2 : 3))
      if (checkSolution(rotations, p).ok) solutions.push(rotations)
      return
    }

    const allowed = cands[target]!
    for (let r = 0; r < 4; r++) {
      if (!(allowed & (1 << r))) continue
      const next = cands.slice()
      next[target] = 1 << r
      dfs(next)
      if (solutions.length >= limit || timedOut) break
    }
  }

  dfs(initialCandidates(p))
  return { solutions, nodes, timedOut }
}

export function countSolutions(
  p: PipesPuzzle,
  limit = 2,
  maxNodes = 300_000,
): CountOutcome {
  const out = search(p, limit, maxNodes)
  return { count: out.solutions.length, nodes: out.nodes, timedOut: out.timedOut }
}

export function findSolution(p: PipesPuzzle, maxNodes = 2_000_000): number[] | null {
  const out = search(p, 1, maxNodes)
  return out.solutions[0] ?? null
}

export function solvePuzzle(puzzle: Puzzle, maxNodes = 1_500_000): SolveResult {
  const p = puzzle as PipesPuzzle
  if (!p.tiles || p.tiles.length !== p.width * p.height) {
    return { solved: false, solution: null, nodes: 0, timedOut: false }
  }
  const out = search(p, 1, maxNodes)
  const rotations = out.solutions[0]
  if (!rotations) {
    return { solved: false, solution: null, nodes: out.nodes, timedOut: out.timedOut }
  }
  return { solved: true, solution: makeState(p, rotations), nodes: out.nodes, timedOut: false }
}

export function makeState(puzzle: PipesPuzzle, rotations: number[]): PipesState {
  return {
    puzzleId: puzzle.id,
    width: puzzle.width,
    height: puzzle.height,
    rotations: rotations.map((r) => ((r | 0) % 4 + 4) % 4),
    givens: (puzzle.givens ?? []).slice(),
  }
}
