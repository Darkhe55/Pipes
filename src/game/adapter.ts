/**
 * ════════════════════════════════════════════════════════════════════
 *  接水管（Pipes）—— 游戏适配器
 * ════════════════════════════════════════════════════════════════════
 *
 * 状态：每格旋转次数 0..3；givens 锁定的格子不能旋转。
 */

import { playPluck } from '../core/audio'
import type { CustomSupport, GameAdapter, Move, Puzzle, SolveResult } from '../core/types'
import { planLogicSolve } from './logic'
import { builtinPuzzles, getReferenceSolution } from './puzzles'
import { hitTest, metricsFor, renderBoard } from './render'
import { solvePuzzle } from './solver'
import {
  applyMove,
  cloneState,
  createEmptyState,
  cycleValue,
  deserializeState,
  firstHintMove,
  invertMove,
  rightClickValue,
  serializeState,
  valueAt,
} from './state'
import { statusBits, validate } from './validate'
import type { PipesPuzzle } from './types'

const meta = {
  title: '接水管',
  tagline: '旋转管道，让所有接口相连且没有漏水',
  footerNote:
    '规则：每个格子是一段可旋转的管道。旋转所有管道，使每个接口都与相邻格的接口相连、盘外不能有开口，并且全部管道连成一整片。灰暗的格子是锁定角度，不能旋转。',
  storageKeyPrefix: 'pipes',
  customIdPrefix: 'pipes-custom-',
  customMinW: 4,
  customMinH: 4,
  customMaxW: 10,
  customMaxH: 10,
  targetKind: 'cell' as const,
  interactionHint: '点击格子顺时针旋转管道；锁定格不可旋转。',
}

const custom: CustomSupport = {
  mode: 'none',
  valueCycle: [null, 0, 1, 2, 3],
  keyForDigit: () => undefined,
  cellLabel: (v) => (v == null ? '' : String(v)),
  hint: '接水管暂不支持自定义题板。',
  makePuzzle: (w, h, _grid, existingId) => ({
    id: existingId ?? `${meta.customIdPrefix}${w}x${h}-${Date.now()}`,
    name: `自定义 · ${w}×${h}`,
    width: w,
    height: h,
    difficulty: 'custom',
    tiles: new Array<number>(w * h).fill(5),
    givens: new Array<number>(w * h).fill(-1),
    initialRotations: new Array<number>(w * h).fill(0),
  } satisfies PipesPuzzle),
  encodePuzzle: () => ({ board: '' }),
  decodePuzzle: () => null,
}

function playForMove(_move: Move, streak: number): void {
  playPluck(streak, 1 + (_move.to % 4) * 0.1)
}

export const adapter: GameAdapter = {
  meta,
  builtinPuzzles,
  getReferenceSolution,
  createEmptyState,
  cloneState,
  cycleValue,
  rightClickValue,
  applyMove,
  invertMove,
  valueAt,
  serializeState,
  deserializeState,
  validate,
  statusBits,
  metricsFor,
  renderBoard,
  hitTest,
  planLogicSolve,
  solvePuzzle: (puzzle: Puzzle, maxNodes?: number): SolveResult => solvePuzzle(puzzle, maxNodes),
  firstHintMove,
  custom,
  playForMove,
}
