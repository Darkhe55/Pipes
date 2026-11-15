/**
 * 接水管题库审计
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  decodeGivens,
  decodeRotations,
  decodeTiles,
} from '../src/game/types.ts'
import { checkSolution, initialCandidates, popcount4, propagate } from '../src/game/rules.ts'
import { countSolutions } from '../src/game/solver.ts'

const DATA_FILE = path.resolve('src/game/puzzles-data.ts')
const text = readFileSync(DATA_FILE, 'utf8')

const entries = []
const re =
  /\{\s*id:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*width:\s*(\d+),\s*height:\s*(\d+),\s*difficulty:\s*'([^']+)',\s*series:\s*"([^"]+)",\s*board:\s*"([^"]*)",\s*solution:\s*"([^"]*)"\s*\}/g
let m
while ((m = re.exec(text)) !== null) {
  entries.push({
    id: m[1],
    name: m[2],
    width: Number(m[3]),
    height: Number(m[4]),
    difficulty: m[5],
    series: m[6],
    board: m[7],
    solution: m[8],
  })
}

let errors = 0
let warnings = 0
const ids = new Set()

for (const e of entries) {
  if (ids.has(e.id)) {
    console.error(`[check] 重复 id: ${e.id}`)
    errors++
  }
  ids.add(e.id)
  const cells = e.width * e.height
  const parts = e.board.split('|')
  if (parts.length !== 3) {
    console.error(`[check] ${e.id} board 格式非法`)
    errors++
    continue
  }
  const tiles = decodeTiles(parts[0], cells)
  const givens = decodeGivens(parts[1], cells)
  const initial = decodeRotations(parts[2], cells)
  const solution = decodeRotations(e.solution, cells)
  if (!tiles || !givens || !initial || !solution) {
    console.error(`[check] ${e.id} 编码非法`)
    errors++
    continue
  }

  const puzzle = {
    id: e.id,
    name: e.name,
    width: e.width,
    height: e.height,
    difficulty: e.difficulty,
    tiles,
    givens,
    initialRotations: initial,
  }

  const ref = checkSolution(solution, puzzle)
  if (!ref.ok) {
    console.error(`[check] ${e.id} 参考解不合法`)
    errors++
    continue
  }

  const counted = countSolutions(puzzle, 2, 1_000_000)
  if (counted.timedOut) {
    console.warn(`[check] ${e.id} 唯一解检查超时（${counted.nodes} 节点）`)
    warnings++
  } else if (counted.count !== 1) {
    console.error(`[check] ${e.id} 解不唯一：找到 ${counted.count} 个`)
    errors++
    continue
  }

  const cands = initialCandidates(puzzle)
  const sat = propagate(cands, puzzle)
  const decided = cands.every((m) => popcount4(m) === 1)
  if (!sat) {
    console.error(`[check] ${e.id} 规则传播矛盾`)
    errors++
    continue
  }
  if (!decided) warnings++

  const locked = givens.filter((v) => v >= 0).length
  console.log(
    `[check] ${e.id} ${e.width}×${e.height} 锁定 ${locked} · 解唯一 · 逻辑${decided ? '可推满' : '需回溯'} · ${counted.nodes} 节点`,
  )
}

console.log(`[check] 共 ${entries.length} 题，错误 ${errors}，警告 ${warnings}`)
if (entries.length === 0) console.warn('[check] 题库为空，请先运行 npm run gen。')
if (errors > 0) process.exitCode = 1
