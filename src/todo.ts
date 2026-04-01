// 预设分类
export interface Category {
  id: string
  name: string
  color: string       // 主题色（用于 Tab 和 favicon）
  icon: string        // emoji icon
}

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'all',       name: '全部',   color: '#1a1a1a', icon: '📋' },
  { id: 'work',      name: '工作',   color: '#2563eb', icon: '💼' },
  { id: 'personal',  name: '生活',   color: '#16a34a', icon: '🏠' },
  { id: 'study',     name: '学习',   color: '#9333ea', icon: '📚' },
  { id: 'health',    name: '健康',   color: '#dc2626', icon: '🏃' },
]

export const CATEGORY_MAP = Object.fromEntries(
  DEFAULT_CATEGORIES.map(c => [c.id, c])
)

// 待办事项类型定义
export interface Todo {
  id: string
  text: string
  completed: boolean
  createdAt: number
  completedAt?: number  // 最近一次被标为完成的时间戳
  category?: string     // 分类 ID，默认 'work'
}

// Action 类型
export type TodoAction =
  | { type: 'ADD'; text: string; category?: string }
  | { type: 'TOGGLE'; id: string }
  | { type: 'EDIT'; id: string; text: string }
  | { type: 'DELETE'; id: string }
  | { type: 'CLEAR_COMPLETED' }
  | { type: 'IMPORT'; todos: Todo[] }
  | { type: 'SET_CATEGORY'; id: string; category: string }

// Reducer
export function todoReducer(state: Todo[], action: TodoAction): Todo[] {
  switch (action.type) {
    case 'ADD':
      return [
        {
          id: crypto.randomUUID(),
          text: action.text.trim(),
          completed: false,
          createdAt: Date.now(),
          category: action.category || 'work',
        },
        ...state,
      ]
    case 'TOGGLE':
      return state.map((todo) =>
        todo.id === action.id
          ? {
              ...todo,
              completed: !todo.completed,
              completedAt: !todo.completed ? Date.now() : todo.completedAt,
            }
          : todo
      )
    case 'EDIT':
      return state.map((todo) =>
        todo.id === action.id ? { ...todo, text: action.text.trim() } : todo
      )
    case 'DELETE':
      return state.filter((todo) => todo.id !== action.id)
    case 'CLEAR_COMPLETED':
      return state.filter((todo) => !todo.completed)
    case 'SET_CATEGORY':
      return state.map((todo) =>
        todo.id === action.id ? { ...todo, category: action.category } : todo
      )
    case 'IMPORT':
      return mergeTodos(state, action.todos)
    default:
      return state
  }
}

// localStorage 工具
const STORAGE_KEY = 'minimal-todo-v1'

export function loadTodos(): Todo[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (!data) return []
    const todos = JSON.parse(data) as Todo[]
    // 兼容旧数据：没有 category 字段的自动归入 'work'
    return todos.map(t => ({ ...t, category: t.category || 'work' }))
  } catch {
    return []
  }
}

export function saveTodos(todos: Todo[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos))
}

// ── 导出：下载 JSON 文件 ──────────────────────────
export function exportTodos(todos: Todo[]): void {
  const json = JSON.stringify(todos, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const date = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `todos-${date}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// ── 导入：解析 JSON，合并去重（以 id 为键） ────────
export function parseTodosFromJson(json: string): Todo[] | null {
  try {
    const data = JSON.parse(json)
    if (!Array.isArray(data)) return null
    // 基本校验：每项必须有 id / text / completed / createdAt
    const valid = data.every(
      (item) =>
        typeof item.id === 'string' &&
        typeof item.text === 'string' &&
        typeof item.completed === 'boolean' &&
        typeof item.createdAt === 'number'
    )
    return valid ? (data as Todo[]) : null
  } catch {
    return null
  }
}

/** 将导入的 todos 合并到现有列表，id 相同则用导入版本覆盖，新 id 插到最前面 */
export function mergeTodos(existing: Todo[], imported: Todo[]): Todo[] {
  const map = new Map(existing.map((t) => [t.id, t]))
  for (const t of imported) map.set(t.id, t)
  // 保持：imported 中的新条目排在最前
  const importedIds = new Set(imported.map((t) => t.id))
  const newItems = imported.filter((t) => !existing.some((e) => e.id === t.id))
  const rest = [...map.values()].filter((t) => !importedIds.has(t.id) || existing.some((e) => e.id === t.id))
  return [...newItems, ...rest]
}
