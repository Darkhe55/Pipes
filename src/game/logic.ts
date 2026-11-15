/**
 * 接水管 —— 逻辑解题回放
 */

import type { GameState, LogicPlan, Move, PlaybackFrame, Puzzle } from '../core/types'
import { checkSolution, initialCandidates, propagate } from './rules'
import { findSolution } from './solver'
import { asPipesPuzzle, asPipesState, type PipesState } from './types'

export function planLogicSolve(puzzle: Puzzle, initialState: GameState): LogicPlan {
  const p = asPipesPuzzle(puzzle)
  const s = asPipesState(initialState)
  const size = p.width * p.height
  const frames: PlaybackFrame[] = []
  const rotations = s.rotations.slice()
  let streak = 0

  const emit = (index: number, to: number, rule: number, label: string): void => {
    const from = rotations[index] ?? 0
    if (from === to) return
    rotations[index] = to
    streak++
    const move: Move = { index, from, to }
    frames.push({ rule, label, move, streak })
  }

  const cands = initialCandidates(p)
  if (!propagate(cands, p)) {
    return { puzzleId: p.id, frames: [], finalState: null, ruleSteps: 0, saturated: false }
  }

  let saturated = true
  for (let i = 0; i < size; i++) {
    const m = cands[i]!
    if (m & (m - 1)) {
      saturated = false
      continue
    }
    const r = m & 1 ? 0 : m & 2 ? 1 : m & 4 ? 2 : 3
    emit(i, r, 1, '接口约束：这一格只能转到这个角度')
  }

  if (!saturated) {
    const solution = findSolution(p, 2_000_000)
    if (!solution) {
      return { puzzleId: p.id, frames: [], finalState: null, ruleSteps: 0, saturated: false }
    }
    for (let i = 0; i < size; i++) {
      if ((cands[i]! & (cands[i]! - 1)) === 0) continue
      emit(i, solution[i]!, 4, '回溯试探：该格最终角度')
    }
  }

  if (!checkSolution(rotations, p).ok) {
    return { puzzleId: p.id, frames: [], finalState: null, ruleSteps: 0, saturated: false }
  }
  const finalState: PipesState = {
    puzzleId: s.puzzleId,
    width: p.width,
    height: p.height,
    rotations,
    givens: s.givens.slice(),
  }
  return { puzzleId: p.id, frames, finalState, ruleSteps: frames.length, saturated }
}
