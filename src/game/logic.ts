/**
 * 接水管 —— 逻辑解题回放
 *
 * 先跑六条标准定式（接口匹配 / 边界封闭 / 端点约束 / 度数守恒 / 连通成片 /
 * 禁止成环）把候选传播到不动点；只有仍然推不动的格子才交给搜索兜底（规则 7），
 * 因此「回溯试探」帧只会出现在规则确实无能为力的地方。
 *
 * 回放从「当前盘面」开始：玩家已经转动过的格子（角度与题面初始角度不同、且未被
 * 题面锁定）会以当前角度作为唯一候选写入工作候选集，未知格保持 0..3 全集；
 * 回放帧的 from 也取当前角度，不会把已有正确标记清成别的值。
 * 如果玩家标记本身与规则冲突（种子传播矛盾），退回「只看题面」的旧路径，
 * 回放同样从当前盘面出发，用帧纠正错误角度。
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
import { asPipesPuzzle, asPipesState, type PipesPuzzle, type PipesState } from './types'

/** 锁定角度的回放标签（不走规则推理，属于题面给定） */
const LOCKED_REASON = '题面锁定：这一格的角度是固定的'

/** 该格的题面初始角度（未转动过的格子保持这个值） */
function initialRotation(p: PipesPuzzle, index: number): number {
  const given = p.givens?.[index] ?? -1
  if (given >= 0) return ((given % 4) + 4) % 4
  return (((p.initialRotations?.[index] ?? 0) % 4) + 4) % 4
}

/** 当前盘面里是否有玩家转动过的格子 */
function hasPlayerRotation(p: PipesPuzzle, s: PipesState): boolean {
  const size = p.width * p.height
  for (let i = 0; i < size; i++) {
    const given = p.givens?.[i] ?? -1
    if (given >= 0) continue
    if (((((s.rotations[i] ?? 0) % 4) + 4) % 4) !== initialRotation(p, i)) return true
  }
  return false
}

/**
 * 把当前盘面里玩家转动过的格子写成唯一候选（未知保持 0..3 全集）。
 * 返回是否真的写入了种子；若当前角度不在候选域里（例如会漏水），
 * 说明玩家标记本身不合法，不强行写入，留给回放帧纠正。
 */
function seedCandidates(p: PipesPuzzle, s: PipesState, cands: number[]): boolean {
  const givens = p.givens ?? []
  let seeded = false
  for (let i = 0; i < cands.length; i++) {
    if ((givens[i] ?? -1) >= 0) continue
    const cur = ((((s.rotations[i] ?? 0) % 4) + 4) % 4)
    if (cur === initialRotation(p, i)) continue
    const bit = 1 << cur
    if (!(cands[i]! & bit)) continue
    cands[i] = bit
    seeded = true
  }
  return seeded
}

/** 一次完整尝试；失败返回 null，便于「种子矛盾 → 退回只看题面」重试 */
function attempt(p: PipesPuzzle, s: PipesState, seedPlayer: boolean): LogicPlan | null {
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
  if (seedPlayer) seedCandidates(p, s, cands)
  if (!propagate(cands, p, log)) return null

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
    if (!solution) return null
    for (let i = 0; i < size; i++) {
      if (decided[i]) continue
      emit(i, solution[i]!, RULE_GUESS, RULE_REASONS[RULE_GUESS]!)
    }
  }

  if (!checkSolution(rotations, p).ok) return null
  const finalState: PipesState = {
    puzzleId: s.puzzleId,
    width: p.width,
    height: p.height,
    rotations,
    givens: s.givens.slice(),
  }
  return { puzzleId: p.id, frames, finalState, ruleSteps: frames.length, saturated }
}

export function planLogicSolve(puzzle: Puzzle, initialState: GameState): LogicPlan {
  const p = asPipesPuzzle(puzzle)
  const s = asPipesState(initialState)
  const emptyPlan: LogicPlan = {
    puzzleId: p.id,
    frames: [],
    finalState: null,
    ruleSteps: 0,
    saturated: false,
  }

  const seeded = attempt(p, s, true)
  if (seeded) return seeded
  // 玩家标记与规则矛盾时，退回只看题面的旧路径（回放仍从当前角度出发）
  if (hasPlayerRotation(p, s)) {
    const plain = attempt(p, s, false)
    if (plain) return plain
  }
  return emptyPlan
}
