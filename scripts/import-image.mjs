/**
 * 接水管（Pipes）—— 从题图自动导入题库
 *
 * 用法：
 *   node scripts/import-image.mjs <图片路径> [--name 名称] [--id ID] [--series 系列]
 *                                 [--append] [--verify] [--dry] [--budget 节点数]
 *
 * 流程：
 *   1. Playwright + Edge 打开图片到 canvas，取像素；
 *   2. 用浅灰网格线（长直线）投影求出棋盘行列数；
 *   3. 逐格检查上下左右四条边中点是否有深色管道穿过，得到每格的接口掩码
 *      （N=1 E=2 S=4 W=8，与 src/game/types.ts 一致）；
 *   4. 题图就是「初始旋转状态」：把观察到的掩码作为 tiles，initialRotations 全 0，
 *      givens 全 -1（全部可旋转），玩家旋转到全部相接即可；
 *   5. 预览；--verify 额外尝试求解（40×60 这类大盘面通常很慢，超时只警告）；
 *   6. --append 追加到 src/game/puzzles-data.ts。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { findSolution, countSolutions } from '../src/game/solver.ts'
import { checkSolution } from '../src/game/rules.ts'
import { encodeGivens, encodeRotations, encodeTiles } from '../src/game/types.ts'

const DIR_NAMES = ['N', 'E', 'S', 'W']
const EDGE_CANDIDATES = [
  process.env.EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean)

function findEdge() {
  for (const p of EDGE_CANDIDATES) if (existsSync(p)) return p
  throw new Error('找不到 Microsoft Edge，可用环境变量 EDGE_PATH 指定 msedge.exe 路径')
}

function usage(msg) {
  console.error(`[接水管识图] ${msg}`)
  console.error(
    '用法：node scripts/import-image.mjs <图片路径> [--name 名称] [--id ID] [--series 系列] [--append] [--verify] [--dry] [--budget 节点数]',
  )
  process.exit(1)
}

function parseArgs(argv) {
  const out = { file: null, name: null, id: null, series: '识图', append: false, verify: false, dry: false, budget: 15_000 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => {
      const v = argv[++i]
      if (v === undefined) usage(`参数 ${a} 缺少值`)
      return v
    }
    if (a === '--name') out.name = next()
    else if (a === '--id') out.id = next()
    else if (a === '--series') out.series = next()
    else if (a === '--append') out.append = true
    else if (a === '--verify') out.verify = true
    else if (a === '--dry') out.dry = true
    else if (a === '--budget') out.budget = Math.max(1000, Number(next()) || 0)
    else if (!a.startsWith('--')) {
      if (out.file) usage(`多余参数 ${a}`)
      out.file = a
    } else usage(`未知参数 ${a}`)
  }
  if (!out.file) usage('请指定图片路径')
  return out
}

const args = parseArgs(process.argv.slice(2))
const imagePath = path.resolve(args.file)
if (!existsSync(imagePath)) usage(`找不到图片：${imagePath}`)

const dataUrl = `data:image/png;base64,${readFileSync(imagePath).toString('base64')}`
const browser = await chromium.launch({ headless: true, executablePath: findEdge() })
const page = await browser.newPage()
await page.setContent('<canvas id="c"></canvas>')

const detected = await page.evaluate(async ({ dataUrl }) => {
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  const W = img.naturalWidth
  const H = img.naturalHeight
  const cv = document.getElementById('c')
  cv.width = W
  cv.height = H
  const g = cv.getContext('2d', { willReadFrequently: true })
  g.drawImage(img, 0, 0)
  const d = g.getImageData(0, 0, W, H).data
  const rgb = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return [255, 255, 255]
    const i = (y * W + x) * 4
    return [d[i], d[i + 1], d[i + 2]]
  }
  const dark = (x, y) => {
    const c = rgb(x, y)
    return c[0] < 110 && c[1] < 110 && c[2] < 110
  }
  // 浅灰网格线（题图里的方格纸）：低饱和、亮度 170..245
  const isGrid = (c) => {
    const mx = Math.max(c[0], c[1], c[2])
    const mn = Math.min(c[0], c[1], c[2])
    const lum = (c[0] + c[1] + c[2]) / 3
    return mx - mn <= 8 && lum >= 170 && lum <= 245
  }
  const colCount = new Int32Array(W)
  const rowCount = new Int32Array(H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isGrid(rgb(x, y))) { colCount[x]++; rowCount[y]++ }
  const peaks = (counts, min) => {
    const out = []
    let st = -1
    for (let i = 0; i <= counts.length; i++) {
      const on = i < counts.length && counts[i] >= min
      if (on && st < 0) st = i
      if (!on && st >= 0) { out.push((st + i - 1) / 2); st = -1 }
    }
    return out
  }
  // 网格线会被管道覆盖，容差放到 0.25 高度/宽度
  const rawXs = peaks(colCount, H * 0.25)
  const rawYs = peaks(rowCount, W * 0.25)
  // 只保留等距的部分（去掉图片边缘的杂线；截图最外圈的 1px 灰线不是网格）
  const regularize = (lines, limit) => {
    const filtered = lines.filter((v) => v > 2 && v < limit - 2)
    if (filtered.length < 4) return filtered
    const diffs = filtered.slice(1).map((v, i) => v - filtered[i]).sort((a, b) => a - b)
    const median = diffs[Math.floor(diffs.length / 2)]
    if (!(median > 4)) return filtered
    let best = []
    let cur = [filtered[0]]
    for (let i = 1; i < filtered.length; i++) {
      if (Math.abs(filtered[i] - filtered[i - 1] - median) <= median * 0.3) cur.push(filtered[i])
      else {
        if (cur.length > best.length) best = cur
        cur = [filtered[i]]
      }
    }
    if (cur.length > best.length) best = cur
    return best
  }
  const xs = regularize(rawXs, W)
  const ys = regularize(rawYs, H)
  const w = xs.length - 1
  const h = ys.length - 1
  if (w < 3 || h < 3) {
    throw new Error(`网格识别失败：竖线 ${rawXs.length} 条、横线 ${rawYs.length} 条（规则化后 ${xs.length}×${ys.length}）`)
  }
  const x0 = xs[0]
  const y0 = ys[0]
  const cellW = (xs[w] - x0) / w
  const cellH = (ys[h] - y0) / h
  const countDark = (x1, y1, x2, y2) => {
    let n = 0
    for (let y = Math.round(y1); y <= Math.round(y2); y++) for (let x = Math.round(x1); x <= Math.round(x2); x++) if (dark(x, y)) n++
    return n
  }
  const spanX = Math.max(6, Math.round(cellW * 0.26))
  const spanY = Math.max(6, Math.round(cellH * 0.26))
  const near = Math.max(2, Math.round(cellW * 0.07))
  // 关键：只在「格子自己这一侧」的窄带里数深色像素。
  // 相邻格中指向本格、但本格没有对应接口的管道会在边界外侧结束，
  // 如果跨边界采样就会被误判成本格也有接口。
  const vEdge = (ex, ey, side) => {
    const bx = x0 + ex * cellW
    const cy = y0 + (ey + 0.5) * cellH
    // side: -1 = 本格在边界左侧（采左半），+1 = 本格在边界右侧（采右半）
    const a = side < 0 ? bx - near : bx + 1
    const b = side < 0 ? bx - 1 : bx + near
    return countDark(a, cy - spanY, b, cy + spanY)
  }
  const hEdge = (ex, ey, side) => {
    const cx = x0 + (ex + 0.5) * cellW
    const by = y0 + ey * cellH
    const a = side < 0 ? by - near : by + 1
    const b = side < 0 ? by - 1 : by + near
    return countDark(cx - spanX, a, cx + spanX, b)
  }
  const TH = 8
  const masks = []
  let borderOpen = 0
  for (let ry = 0; ry < h; ry++) {
    const row = []
    for (let cxi = 0; cxi < w; cxi++) {
      let m = 0
      // 本格在水平边界的下方 → 采下侧；在边界上方 → 采上侧
      if (hEdge(cxi, ry, 1) >= TH) m |= 1
      if (hEdge(cxi, ry + 1, -1) >= TH) m |= 4
      // 本格在垂直边界的右侧 → 采右侧；在边界左侧 → 采左侧
      if (vEdge(cxi, ry, 1) >= TH) m |= 8
      if (vEdge(cxi + 1, ry, -1) >= TH) m |= 2
      if (ry === 0 && m & 1) borderOpen++
      if (ry === h - 1 && m & 4) borderOpen++
      if (cxi === 0 && m & 8) borderOpen++
      if (cxi === w - 1 && m & 2) borderOpen++
      row.push(m)
    }
    masks.push(row)
  }
  return { W, H, w, h, x0, y0, cellW, cellH, masks, borderOpen }
}, { dataUrl })
await browser.close()

const { w, h, masks } = detected
if (process.env.IMPORT_DEBUG) writeFileSync(path.resolve('scripts/.import-debug.json'), JSON.stringify({ w, h, masks }))
const flat = masks.flat()
console.log(
  `[接水管识图] ${path.basename(imagePath)}：棋盘 ${w}×${h}，格子 ${detected.cellW.toFixed(1)}×${detected.cellH.toFixed(1)}px，` +
    `外边开口 ${detected.borderOpen} 处`,
)
const zero = flat.filter((m) => m === 0).length
if (zero) console.warn(`[接水管识图] 警告：有 ${zero} 格没有识别到接口（可能格子被遮挡/选区高亮）`)
const deg = {}
for (const m of flat) deg[m] = (deg[m] ?? 0) + 1
console.log(
  '[接水管识图] 管道接口数分布：' +
    Object.entries(deg)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([m, n]) => `${m}(${n})`)
      .join(' '),
)
console.log('[接水管识图] 掩码预览（十六进制，0-F，N=1 E=2 S=4 W=8）：')
for (let ry = 0; ry < h; ry++) {
  console.log('  ' + masks[ry].map((m) => m.toString(16)).join(''))
}

let previewSolution = null
if (!args.dry) {
  // 题图是初始旋转状态；把所有格设置为可旋转（givens=-1）。
  const puzzle = {
    id: 'preview',
    name: 'preview',
    width: w,
    height: h,
    difficulty: 'hard',
    tiles: flat.slice(),
    givens: new Array(w * h).fill(-1),
    initialRotations: new Array(w * h).fill(0),
  }
  // 先自检：如果把观察到的状态直接当作答案，是否合法（初始态通常有漏/不连通，不作为错误）
  const asIs = checkSolution(new Array(w * h).fill(0), puzzle)
  console.log(
    `[接水管识图] 当前截图状态：${asIs.ok ? '已连通无漏水（可能是解答图）' : '不是合法解（初始打乱状态正常）'}；` +
      `漏水 ${asIs.leaks.length} 格、连通块 ${asIs.parts}`,
  )
  if (args.verify) {
    console.log(`[接水管识图] 尝试求解（节点上限 ${args.budget.toLocaleString()}）…`)
    const t0 = Date.now()
    const sol = findSolution(puzzle, args.budget)
    if (sol) {
      previewSolution = sol
      const chk = checkSolution(sol, puzzle)
      console.log(`[接水管识图] 找到解（${Date.now() - t0}ms，合法=${chk.ok}，连通块 ${chk.parts}）`)
      const counted = countSolutions(puzzle, 2, args.budget)
      if (counted.timedOut) console.warn('[接水管识图] 警告：唯一性检查超时，未能确认解唯一')
      else if (counted.count > 1) console.warn(`[接水管识图] 警告：解不唯一（至少 ${counted.count} 个）`)
      else console.log('[接水管识图] 唯一解 ✓')
    } else {
      console.warn(
        `[接水管识图] 警告：${Date.now() - t0}ms 内没有求出解（${w}×${h} 大盘面搜索可能超时）。导入不附参考解，游戏内仍可手动旋转。`,
      )
    }
  } else {
    console.log('[接水管识图] 未求解（初始状态题图通常不需要参考解）；加 --verify 可尝试求解。')
  }
}

if (args.dry) {
  console.log('[接水管识图] --dry：仅识别，不求解、不写入。')
  process.exit(0)
}

if (!args.append) {
  console.log('[接水管识图] 预览模式，未写入题库。加 --append 写入 src/game/puzzles-data.ts。')
  process.exit(0)
}

/* ───────── 写入题库 ───────── */
const tilesText = encodeTiles(flat)
const givensText = encodeGivens(new Array(w * h).fill(-1))
const rotText = encodeRotations(new Array(w * h).fill(0))
const board = `${tilesText}|${givensText}|${rotText}`
const solution = previewSolution ? encodeRotations(previewSolution) : ''
const id = args.id || `pipes-import-${Date.now().toString(36)}`
const name = args.name || `识图 · ${w}×${h}`
const sol = solution ? `, solution: ${JSON.stringify(solution)}` : ''
const entry = `  { id: ${JSON.stringify(id)}, name: ${JSON.stringify(name)}, width: ${w}, height: ${h}, difficulty: 'hard', series: ${JSON.stringify(args.series)}, board: ${JSON.stringify(board)}${sol} },\n`
const dataFile = path.resolve('src/game/puzzles-data.ts')
if (!existsSync(dataFile)) usage(`找不到题库文件：${dataFile}`)
let text = readFileSync(dataFile, 'utf8').replace(/\r\n/g, '\n')
const marker = text.lastIndexOf('\n]')
if (marker < 0) usage('puzzles-data.ts 格式异常：找不到结尾 ]')
text = text.slice(0, marker + 1) + '\n' + entry + text.slice(marker + 1)
writeFileSync(dataFile, text)
console.log(`[接水管识图] 已写入 ${dataFile}`)
console.log(`[接水管识图] id=${id}  name=${name}`)
if (process.env.IMPORT_DEBUG) writeFileSync(path.resolve('scripts/.import-debug.json'), JSON.stringify({ w, h, masks }))
console.log('[接水管识图] 注意：npm run gen 会重新生成该文件并覆盖导入内容。')
console.log(
  `[接水管识图] 目录：${dirList(flat, w, h)}`,
)

function dirList() {
  return `${w}×${h} 共 ${flat.length} 格`
}

