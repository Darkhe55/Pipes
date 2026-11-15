/**
 * 接水管 —— 题库
 */

import type { Difficulty, GameState, Puzzle } from '../core/types'
import { RAW_PUZZLES } from './puzzles-data'
import {
  decodeGivens,
  decodeRotations,
  decodeTiles,
  type PipesPuzzle,
  type PipesState,
} from './types'

export interface RawPuzzle {
  id: string
  name: string
  width: number
  height: number
  difficulty: Difficulty
  series?: string
  board: string
  solution?: string
}

export function decodePuzzle(raw: RawPuzzle): PipesPuzzle | null {
  const expected = raw.width * raw.height
  const parts = raw.board.split('|')
  if (parts.length !== 3) return null
  const tiles = decodeTiles(parts[0]!, expected)
  const givens = decodeGivens(parts[1]!, expected)
  const initialRotations = decodeRotations(parts[2]!, expected)
  if (!tiles || !givens || !initialRotations) return null
  return {
    id: raw.id,
    name: raw.name,
    width: raw.width,
    height: raw.height,
    difficulty: raw.difficulty,
    tiles,
    givens,
    initialRotations,
    solutionRotations: raw.solution,
  }
}

export const builtinPuzzles: Puzzle[] = (RAW_PUZZLES as RawPuzzle[])
  .map(decodePuzzle)
  .filter((p): p is PipesPuzzle => p !== null)

export function getReferenceSolution(id: string): GameState | null {
  const raw = (RAW_PUZZLES as RawPuzzle[]).find((p) => p.id === id)
  if (!raw || typeof raw.solution !== 'string') return null
  const puzzle = decodePuzzle(raw)
  if (!puzzle) return null
  const rotations = decodeRotations(raw.solution, puzzle.width * puzzle.height)
  if (!rotations) return null
  const state: PipesState = {
    puzzleId: puzzle.id,
    width: puzzle.width,
    height: puzzle.height,
    rotations,
    givens: puzzle.givens.slice(),
  }
  return state
}
