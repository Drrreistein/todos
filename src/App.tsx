import { useReducer, useEffect, useState, useRef } from 'react'
import { todoReducer, loadTodos, saveTodos } from './todo'

// ── SVG 图标（内联，零依赖）────────────────────

function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconX() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── 主应用组件 ────────────────────────────────

export default function App() {
  const [todos, dispatch] = useReducer(todoReducer, [], loadTodos)
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  // IME 组字状态：true 表示正在用输入法选字，此时 Enter 不应提交
  const isComposingRef = useRef(false)

  // 每次 todos 变化时持久化
  useEffect(() => {
    saveTodos(todos)
  }, [todos])

  // 提交新待办
  function handleSubmit() {
    const text = input.trim()
    if (!text) return
    dispatch({ type: 'ADD', text })
    setInput('')
    inputRef.current?.focus()
  }

  // 键盘事件：IME 组字期间忽略 Enter
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !isComposingRef.current) handleSubmit()
  }

  const remaining = todos.filter((t) => !t.completed).length
  const hasCompleted = todos.some((t) => t.completed)

  return (
    <main className="app">
      {/* 标题 */}
      <header className="app-header">
        <h1 className="app-title">todos</h1>
      </header>

      {/* 输入区域 */}
      <div className="input-area">
        <input
          ref={inputRef}
          className="todo-input"
          type="text"
          placeholder="添加待办事项…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => { isComposingRef.current = true }}
          onCompositionEnd={() => { isComposingRef.current = false }}
          autoFocus
          aria-label="新建待办事项"
        />
        <button
          className="add-btn"
          onClick={handleSubmit}
          aria-label="添加"
          title="添加 (Enter)"
        >
          <IconPlus />
        </button>
      </div>

      {/* 待办列表 */}
      {todos.length === 0 ? (
        <p className="empty-state">没有待办事项</p>
      ) : (
        <ul className="todo-list" aria-label="待办列表">
          {todos.map((todo) => (
            <li key={todo.id} className="todo-item">
              {/* 复选框 */}
              <button
                className={`checkbox-btn${todo.completed ? ' checked' : ''}`}
                onClick={() => dispatch({ type: 'TOGGLE', id: todo.id })}
                aria-label={todo.completed ? '标记为未完成' : '标记为完成'}
                aria-pressed={todo.completed}
              >
                <IconCheck />
              </button>

              {/* 文字 */}
              <span className={`todo-text${todo.completed ? ' done' : ''}`}>
                {todo.text}
              </span>

              {/* 删除 */}
              <button
                className="delete-btn"
                onClick={() => dispatch({ type: 'DELETE', id: todo.id })}
                aria-label={`删除：${todo.text}`}
              >
                <IconX />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 底部状态栏 */}
      {todos.length > 0 && (
        <footer className="footer">
          <span className="item-count">
            {remaining === 0
              ? '全部完成 ✓'
              : `${remaining} 项待完成`}
          </span>
          {hasCompleted && (
            <button
              className="clear-btn"
              onClick={() => dispatch({ type: 'CLEAR_COMPLETED' })}
            >
              清除已完成
            </button>
          )}
        </footer>
      )}
    </main>
  )
}
