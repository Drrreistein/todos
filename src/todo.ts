// 待办事项类型定义
export interface Todo {
  id: string
  text: string
  completed: boolean
  createdAt: number
  completedAt?: number  // 最近一次被标为完成的时间戳
}

// Action 类型
export type TodoAction =
  | { type: 'ADD'; text: string }
  | { type: 'TOGGLE'; id: string }
  | { type: 'EDIT'; id: string; text: string }
  | { type: 'DELETE'; id: string }
  | { type: 'CLEAR_COMPLETED' }
  | { type: 'IMPORT'; todos: Todo[] }

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
    return data ? (JSON.parse(data) as Todo[]) : []
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
