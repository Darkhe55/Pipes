/**
 * 接水管逻辑求解审计（Playwright）
 *
 * 对每道内置题跑一次逻辑解题，输出：
 *   - 帧数、各规则贡献帧数（1 接口匹配 / 2 边界封闭 / 3 端点约束 /
 *     4 度数守恒 / 5 连通成片 / 6 禁止成环 / 7 回溯兜底）；
 *   - 是否推到规则不动点（saturated）、最终是否解完、耗时。
 *
 * 健康标准：内置题应全部 saturated=true、回溯兜底帧 0。
 */
import { chromium } from 'playwright-core'
import { PORT } from './_port.mjs'

const RULE_NAMES = {
  1: '接口匹配',
  2: '边界封闭',
  3: '端点约束',
  4: '度数守恒',
  5: '连通成片',
  6: '禁止成环',
  7: '回溯兜底',
}

const executablePath =
  process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

const browser = await chromium.launch({ headless: true, executablePath })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' })
const results = await page.evaluate(() => {
  const a = window.__game.adapter
  return a.builtinPuzzles.map((p) => {
    const st = a.createEmptyState(p)
    const t = performance.now()
    const plan = a.planLogicSolve(p, st)
    const dt = Math.round(performance.now() - t)
    const vr = plan.finalState ? a.validate(plan.finalState, p) : null
    const byRule = {}
    for (const f of plan.frames) byRule[f.rule] = (byRule[f.rule] ?? 0) + 1
    return {
      name: p.name,
      size: `${p.width}x${p.height}`,
      frames: plan.frames.length,
      byRule,
      finalSolved: vr?.solved ?? false,
      saturated: plan.saturated,
      ms: dt,
    }
  })
})

let bad = 0
for (const row of results) {
  const rules = Object.keys(row.byRule)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => `${RULE_NAMES[k] ?? `规则${k}`}×${row.byRule[k]}`)
    .join(' ')
  const backtrack = row.byRule[7] ?? 0
  console.log(
    `${row.name.padEnd(6, ' ')} ${row.size.padEnd(5)} 帧 ${String(row.frames).padStart(3)}  ` +
      `${row.saturated ? '推满' : '未推满'}  ${row.finalSolved ? '解完' : '未解完'}  ` +
      `回溯兜底 ${String(backtrack).padStart(2)}  ${String(row.ms).padStart(5)}ms  ${rules}`,
  )
  if (!row.saturated || !row.finalSolved || backtrack > 0) bad++
}
console.log(`共 ${results.length} 题，全部推到不动点且无回溯兜底 ${results.length - bad} 题`)
await browser.close()
if (bad > 0) process.exitCode = 1
