/**
 * 接水管 —— 实时校验
 */

import type { GameState, Puzzle, ValidationResult } from '../core/types'
import { checkSolution } from './rules'
import { asPipesPuzzle, asPipesState, type PipesResult } from './types'

export function validate(state: GameState, puzzle: Puzzle): PipesResult {
  const s = asPipesState(state)
  const p = asPipesPuzzle(puzzle)
  const out = checkSolution(s.rotations, p)
  return {
    solved: out.ok,
    leaks: out.leaks,
    badCells: out.badCells,
    parts: out.parts,
  }
}

export function statusBits(result: ValidationResult): string[] {
  const r = result as PipesResult
  if (r.solved) return ['完成']
  const bits: string[] = []
  if (r.leaks.length > 0) bits.push(`${r.leaks.length} 处接口漏水`)
  if (r.parts > 1) bits.push(`管道分成 ${r.parts} 段未连通`)
  if (bits.length === 0) bits.push('继续旋转管道')
  return bits
}
