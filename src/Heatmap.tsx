import { useMemo, useRef, useState, useEffect } from 'react'
import type { Todo } from './todo'

// ── 工具函数 ──────────────────────────────────

/** 将时间戳转成 YYYY-MM-DD 字符串（本地时区） */
function toDateKey(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 给定一个 Date，返回当天 00:00:00 的 Date */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** 将 Date 加 n 天 */
function addDays(d: Date, n: number): Date {
  const result = new Date(d)
  result.setDate(result.getDate() + n)
  return result
}

// ── 热力图组件 ────────────────────────────────

interface HeatmapProps {
  todos: Todo[]
}

const WEEKS = 16       // 显示最近 16 周
const DAYS = WEEKS * 7 // = 112 天
const GAP = 3          // 格子间距（px），固定值

// 颜色档次：0 无完成，1~4 由浅到深
const LEVEL_COLORS = ['#f0f0f0', '#d4d4d4', '#a3a3a3', '#525252', '#1a1a1a']

function getLevel(count: number): number {
  if (count === 0) return 0
  if (count === 1) return 1
  if (count === 2) return 2
  if (count <= 4) return 3
  return 4
}

export default function Heatmap({ todos }: HeatmapProps) {
  // 用 ResizeObserver 测量容器宽度，反推格子尺寸
  const wrapRef = useRef<HTMLDivElement>(null)
  const [cellSize, setCellSize] = useState(11)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const available = entry.contentRect.width
      // available = WEEKS * cellSize + (WEEKS - 1) * GAP
      // => cellSize = (available - (WEEKS - 1) * GAP) / WEEKS
      const size = Math.floor((available - (WEEKS - 1) * GAP) / WEEKS)
      setCellSize(Math.max(size, 6)) // 最小 6px，防止太窄
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  // 统计每天完成数量
  const countMap = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {}
    for (const t of todos) {
      if (t.completed && t.completedAt) {
        const key = toDateKey(t.completedAt)
        map[key] = (map[key] ?? 0) + 1
      }
    }
    return map
  }, [todos])

  // 生成过去 DAYS 天的日期列表（从最早到今天）
  const cells = useMemo(() => {
    const today = startOfDay(new Date())
    const start = addDays(today, -(DAYS - 1))
    const result: { date: Date; key: string }[] = []
    for (let i = 0; i < DAYS; i++) {
      const d = addDays(start, i)
      result.push({ date: d, key: toDateKey(d.getTime()) })
    }
    return result
  }, [])

  // 按列（周）分组
  const columns = useMemo(() => {
    const cols: (typeof cells)[] = []
    for (let i = 0; i < cells.length; i += 7) {
      cols.push(cells.slice(i, i + 7))
    }
    return cols
  }, [cells])

  // 今日和总计
  const todayKey = toDateKey(Date.now())
  const totalCompleted = todos.filter((t) => t.completed).length

  // 月份标签（在每周列上方，仅当该列第一天换月时显示）
  function getMonthLabel(colIdx: number): string {
    const col = columns[colIdx]
    if (!col || col.length === 0) return ''
    const firstDay = col[0].date
    if (colIdx === 0 || firstDay.getMonth() !== columns[colIdx - 1][0].date.getMonth()) {
      return `${firstDay.getMonth() + 1}月`
    }
    return ''
  }

  return (
    <section className="heatmap-section" aria-label="每日完成热力图">
      <div className="heatmap-header">
        <span className="heatmap-title">完成记录</span>
        <span className="heatmap-subtitle">{totalCompleted} 项已完成 · 最近 {WEEKS} 周</span>
      </div>

      {/* wrapRef 绑在这里，ResizeObserver 观测此元素 */}
      <div className="heatmap-wrap" ref={wrapRef}>
        {/* 月份标签行 */}
        <div className="heatmap-months" style={{ gap: GAP }}>
          {columns.map((_, colIdx) => (
            <div
              key={colIdx}
              className="heatmap-month-label"
              style={{ width: cellSize }}
            >
              {getMonthLabel(colIdx)}
            </div>
          ))}
        </div>

        {/* 格子区域 */}
        <div className="heatmap-grid" style={{ gap: GAP }}>
          {columns.map((col, colIdx) => (
            <div key={colIdx} className="heatmap-col" style={{ gap: GAP }}>
              {col.map(({ date, key }) => {
                const count = countMap[key] ?? 0
                const level = getLevel(count)
                const isToday = key === todayKey
                const label = `${date.getMonth() + 1}月${date.getDate()}日，完成 ${count} 项`
                return (
                  <div
                    key={key}
                    className={`heatmap-cell${isToday ? ' today' : ''}`}
                    style={{
                      width: cellSize,
                      height: cellSize,
                      backgroundColor: LEVEL_COLORS[level],
                    }}
                    title={label}
                    aria-label={label}
                    role="img"
                  />
                )
              })}
            </div>
          ))}
        </div>

        {/* 图例 */}
        <div className="heatmap-legend">
          <span className="legend-label">少</span>
          {LEVEL_COLORS.map((color, i) => (
            <div
              key={i}
              className="heatmap-cell"
              style={{ width: cellSize, height: cellSize, backgroundColor: color }}
            />
          ))}
          <span className="legend-label">多</span>
        </div>
      </div>
    </section>
  )
}
