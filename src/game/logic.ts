/**
 * 接水管 —— 逻辑解题回放
 *
 * 先跑六条标准定式（接口匹配 / 边界封闭 / 端点约束 / 度数守恒 / 连通成片 /
 * 禁止成环）把候选传播到不动点；只有仍然推不动的格子才交给搜索兜底（规则 7），
 * 因此「回溯试探」帧只会出现在规则确实无能为力的地方。
 */

import type { GameState, LogicPlan, Move, PlaybackFrame, Puzzle } from '../core/types'
import {
  checkSolution,
  initialCandidates,
  popcount4,
  propagate,
  RULE_EDGE,
  RULE_GUESS,
  RULE_REASONS,
  type PropagateLog,
} from './rules'
import { findSolution } from './solver'
import { asPipesPuzzle, asPipesState, type PipesState } from './types'

/** 锁定角度的回放标签（不走规则推理，属于题面给定） */
const LOCKED_REASON = '题面锁定：这一格的角度是固定的'

export function planLogicSolve(puzzle: Puzzle, initialState: GameState): LogicPlan {
  const p = asPipesPuzzle(puzzle)
  const s = asPipesState(initialState)
  const size = p.width * p.height
  const frames: PlaybackFrame[] = []
  const rotations = s.rotations.slice()
  const givens = p.givens ?? []
  let streak = 0

  const emit = (index: number, to: number, rule: number, label: string): void => {
    const from = rotations[index] ?? 0
    if (from === to) return
    rotations[index] = to
    streak++
    const move: Move = { index, from, to }
    frames.push({ rule, label, move, streak })
  }

  const log: PropagateLog = { forced: new Array<number>(size).fill(0) }
  const cands = initialCandidates(p, log)
  if (!propagate(cands, p, log)) {
    return { puzzleId: p.id, frames: [], finalState: null, ruleSteps: 0, saturated: false }
  }

  let saturated = true
  const decided = new Uint8Array(size)
  for (let i = 0; i < size; i++) {
    const m = cands[i]!
    if (popcount4(m) !== 1) {
      saturated = false
      continue
    }
    decided[i] = 1
    const r = m & 1 ? 0 : m & 2 ? 1 : m & 4 ? 2 : 3
    const given = givens[i] ?? -1
    if (given >= 0) {
      emit(i, r, RULE_EDGE, LOCKED_REASON)
    } else {
      const rule = log.forced[i] || RULE_EDGE
      emit(i, r, rule, RULE_REASONS[rule] ?? RULE_REASONS[RULE_EDGE]!)
    }
  }

  if (!saturated) {
    const solution = findSolution(p, 2_000_000)
    if (!solution) {
      return { puzzleId: p.id, frames: [], finalState: null, ruleSteps: 0, saturated: false }
    }
    for (let i = 0; i < size; i++) {
      if (decided[i]) continue
      emit(i, solution[i]!, RULE_GUESS, RULE_REASONS[RULE_GUESS]!)
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
