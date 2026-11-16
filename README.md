# 接水管 Pipes

一个基于 Web 的接水管（Pipes）谜题游戏，原生 SVG 渲染，内置逻辑解题器。

## 在线体验

```bash
npm install
npm start
```

`npm start` 会等开发服务就绪后用默认浏览器打开 **http://127.0.0.1:5203/**。

> 也可以用 `npm run dev`，但不会自动打开浏览器。

## 游戏规则

- 每个格子是一段可旋转的管道
- 旋转所有管道，使每个接口都与相邻格接口相连，盘外不能有开口
- 全部管道必须连成一整片
- 灰暗格子的角度已锁定，不能旋转

## 操作

| 操作 | 说明 |
|------|------|
| 左键点管道 | 顺时针旋转 |
| 右键点管道 | 逆时针旋转 |
| 按住拖动 | 连续旋转 |
| 滚轮 / 中键拖拽 | 缩放 / 平移画布 |
| Z / Shift+Z / Y | 撤销 / 重做 |
| C / H / S / Esc | 检查 / 提示一格 / 显示解 / 清空 |
| R / L / P / M | 随机抽题 / 逻辑解题 / 暂停回放 / 音效开关 |
| 0 / + / - | 视图复位 / 放大 / 缩小 |

## 数据存放

运行 `npm start` / `npm run dev` 时，题库、进度和上次题目保存在项目内 `data/` 目录；静态部署时自动降级到浏览器 localStorage。

## 功能

- **题库**：内置多道题，题目均校验唯一解
- **实时校验**：冲突与违规位置即时高亮，满足的条件同步变灰
- **逻辑解题**：规则引擎逐帧回放，显示每一步理由；回放中按钮变为停止，按 `P` 暂停/继续
- **提示一格 / 显示解**：提示优先揭示所有解一致的格子，显示解直接填入可行答案
- **撤销/重做**：按手势分组，一次拖拽只需一步撤销
- **进度保存**：自动保存当前题目进度，刷新不丢失
- **音效特效**：Web Audio 合成拨弦、水滴与落子动画，无外部音频资源
- **缩放/平移**：滚轮缩放，中键或 `Shift` 拖拽平移

## 技术栈

- Vite + TypeScript
- 原生 SVG（无框架）
- Web Audio 合成音效（无外部资源）
- localStorage / 项目内 `data/` 存储进度与题库

## 项目结构

```
src/
  main.ts
  core/
    app.ts / ui.ts / view.ts      界面、交互、缩放、回放控制
    store.ts / library.ts         题库、进度、上次题目存储
    audio.ts / fx.ts              音效与落子特效
  game/
    adapter.ts                    游戏规则接入
    rules.ts                      推理规则
    logic.ts                      逻辑解题回放
    render.ts / state.ts          SVG 渲染与盘面状态
    validate.ts / solver.ts       实时校验与回溯求解
    puzzles.ts / puzzles-data.ts  题库加载与静态题库
```

## 命令

```bash
npm run dev       # 开发服务
npm start         # 开发服务 + 自动打开浏览器
npm run build     # tsc --noEmit + vite build
npm run gen       # 重新生成题库
npm run check     # 审计题库
npm run verify    # 参考解、逻辑回放与交互验证
npm run audit     # 逐题审计逻辑解题
```

## 图片识图导入

```bash
# 预览：识别题图网格与管道接口，不写入题库
npm run import-image -- month.png

# 识别并追加到题库（题图一般就是初始打乱状态，导入后即可旋转游玩）
npm run import-image -- month.png --append --name "识图 · 40×60"

# 额外尝试求解 / 唯一性检查（大盘面很慢，超时只警告）
npm run import-image -- month.png --verify --budget 20000
```

| 参数 | 说明 |
|------|------|
| `--name 名称` / `--id ID` / `--series 系列` | 题库条目信息 |
| `--append` | 写入 `src/game/puzzles-data.ts` |
| `--verify` | 额外尝试求解并检查唯一解（40×60 这类大盘面通常超时，只给警告） |
| `--budget N` | 求解节点上限（默认 15000，`--verify` 时可调大） |
| `--dry` | 只识别并打印接口掩码，不求解、不写入 |

- 识别原理：浅灰网格线投影定位棋盘 → 每格四条边中点只在「本格一侧」采样深色管道 → 得到 N/E/S/W 接口掩码（N=1 E=2 S=4 W=8）。
- 题图一般就是「初始打乱状态」：导入时把观察到的接口当作 tiles、`givens` 全空，玩家旋转即可；如果截图上已是解答状态，也会按当前旋转导入。
- `npm run gen` 会重新生成 `puzzles-data.ts` 并覆盖导入内容，导入后请留意。

