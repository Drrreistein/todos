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
