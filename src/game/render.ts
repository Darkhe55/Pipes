/**
 * 接水管 —— SVG 渲染
 */

import { cellAtPoint, cellCenter, originOf, squareMetrics, cellSizeOf } from '../core/board'
import type { BoardMetrics, GameState, HitTarget, Puzzle, ValidationResult } from '../core/types'
import {
  asPipesPuzzle,
  asPipesState,
  DIR_DX,
  DIR_DY,
  maskHas,
  rotateMask,
  type PipesResult,
} from './types'

export function metricsFor(puzzle: Puzzle): BoardMetrics {
  return squareMetrics(puzzle.width, puzzle.height, { cell: 56, pad: 22 })
}

export function renderBoard(
  puzzle: Puzzle,
  state: GameState,
  result: ValidationResult,
): string {
  const p = asPipesPuzzle(puzzle)
  const s = asPipesState(state)
  const r = result as PipesResult
  const m = metricsFor(puzzle)
  const o = originOf(m)
  const { w: cw, h: ch } = cellSizeOf(m)
  const bad = new Set(r.badCells ?? [])
  const parts: string[] = []

  parts.push(
    `<rect class="pp-board-bg" x="${o.x}" y="${o.y}" width="${(cw * p.width).toFixed(2)}" height="${(ch * p.height).toFixed(2)}" />`,
  )

  for (let i = 0; i < p.width * p.height; i++) {
    const x = o.x + (i % p.width) * cw
    const y = o.y + Math.floor(i / p.width) * ch
    parts.push(
      `<rect class="pp-cell${bad.has(i) ? ' bad' : ''}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${cw.toFixed(2)}" height="${ch.toFixed(2)}" />`,
    )
    const c = cellCenter(m, i)
    const mask = rotateMask(p.tiles?.[i] ?? 0, s.rotations?.[i] ?? 0)
    const given = (s.givens[i] ?? -1) >= 0
    for (let d = 0; d < 4; d++) {
      if (!maskHas(mask, d)) continue
      const ex = c.x + (DIR_DX[d]! * cw) / 2
      const ey = c.y + (DIR_DY[d]! * ch) / 2
      parts.push(
        `<line class="pp-pipe${given ? ' given' : ''}${bad.has(i) ? ' bad' : ''}" x1="${c.x.toFixed(2)}" y1="${c.y.toFixed(2)}" x2="${ex.toFixed(2)}" y2="${ey.toFixed(2)}" />`,
      )
    }
    parts.push(
      `<circle class="pp-hub${given ? ' given' : ''}${bad.has(i) ? ' bad' : ''}" cx="${c.x.toFixed(2)}" cy="${c.y.toFixed(2)}" r="${(cw * 0.1).toFixed(2)}" />`,
    )
  }

  for (let i = 0; i < p.width * p.height; i++) {
    const x = o.x + (i % p.width) * cw
    const y = o.y + Math.floor(i / p.width) * ch
    parts.push(
      `<rect class="cell-hit" data-index="${i}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${cw.toFixed(2)}" height="${ch.toFixed(2)}" />`,
    )
  }

  return `<svg class="board-svg pp-board" viewBox="0 0 ${m.svgWidth} ${m.svgHeight}" width="${m.svgWidth}" height="${m.svgHeight}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`
}

export function hitTest(m: BoardMetrics, puzzle: Puzzle, x: number, y: number): HitTarget | null {
  void puzzle
  const index = cellAtPoint(m, x, y)
  return index === null ? null : { index, kind: 'cell' }
}
