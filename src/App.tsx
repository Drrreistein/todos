import { useReducer, useEffect, useState, useRef } from 'react'
import { todoReducer, loadTodos, saveTodos, exportTodos, parseTodosFromJson, type Todo } from './todo'
import Heatmap from './Heatmap'

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

// ── 隐蔽的导入/导出菜单 ──────────────────────────

interface DataMenuProps {
  todos: Todo[]
  onImport: (todos: Todo[]) => void
}

function DataMenu({ todos, onImport }: DataMenuProps) {
  const [open, setOpen] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // 点击菜单外部关闭
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  function handleExport() {
    exportTodos(todos)
    setOpen(false)
  }

  function handleImportClick() {
    fileRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const parsed = parseTodosFromJson(text)
      if (!parsed) {
        setHint('文件格式不正确')
        setTimeout(() => setHint(null), 2500)
      } else {
        onImport(parsed)
        setHint(`已导入 ${parsed.length} 条`)
        setTimeout(() => setHint(null), 2000)
      }
    }
    reader.readAsText(file)
    // 重置，允许再次选同一文件
    e.target.value = ''
    setOpen(false)
  }

  return (
    <div className="data-menu-wrap" ref={menuRef}>
      {/* 触发按钮：固定在右下角 */}
      <button
        className="data-menu-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-label="数据菜单"
        title="导入 / 导出"
      >
        ···
      </button>

      {/* 弹出菜单 */}
      {open && (
        <div className="data-menu-popup" role="menu">
          <button className="data-menu-item" onClick={handleExport} role="menuitem">
            导出 JSON
          </button>
          <button className="data-menu-item" onClick={handleImportClick} role="menuitem">
            导入 JSON
          </button>
        </div>
      )}

      {/* 隐藏文件输入 */}
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* 轻提示 */}
      {hint && <div className="data-menu-hint">{hint}</div>}
    </div>
  )
}

// ── 单条待办（带行内编辑）────────────────────────

interface TodoItemProps {
  todo: Todo
  onToggle: (id: string) => void
  onEdit: (id: string, text: string) => void
  onDelete: (id: string) => void
}

function TodoItem({ todo, onToggle, onEdit, onDelete }: TodoItemProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(todo.text)
  const editRef = useRef<HTMLInputElement>(null)
  const editComposingRef = useRef(false)

  // 进入编辑模式时聚焦并全选
  useEffect(() => {
    if (editing) {
      editRef.current?.focus()
      editRef.current?.select()
    }
  }, [editing])

  function startEdit() {
    setDraft(todo.text)
    setEditing(true)
  }

  function commitEdit() {
    const text = draft.trim()
    if (text && text !== todo.text) {
      onEdit(todo.id, text)
    } else {
      setDraft(todo.text) // 放弃空内容修改
    }
    setEditing(false)
  }

  function cancelEdit() {
    setDraft(todo.text)
    setEditing(false)
  }

  function handleEditKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !editComposingRef.current) {
      e.preventDefault()
      commitEdit()
    } else if (e.key === 'Escape') {
      cancelEdit()
    }
  }

  return (
    <li className="todo-item">
      {/* 复选框 */}
      <button
        className={`checkbox-btn${todo.completed ? ' checked' : ''}`}
        onClick={() => onToggle(todo.id)}
        aria-label={todo.completed ? '标记为未完成' : '标记为完成'}
        aria-pressed={todo.completed}
      >
        <IconCheck />
      </button>

      {/* 文字 / 编辑输入框 */}
      {editing ? (
        <input
          ref={editRef}
          className="todo-edit-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleEditKeyDown}
          onCompositionStart={() => { editComposingRef.current = true }}
          onCompositionEnd={() => { editComposingRef.current = false }}
          onBlur={commitEdit}
          aria-label="编辑待办事项"
        />
      ) : (
        <span
          className={`todo-text${todo.completed ? ' done' : ''}`}
          onDoubleClick={startEdit}
          title="双击编辑"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'F2') startEdit() }}
          aria-label={`${todo.text}，双击编辑`}
        >
          {todo.text}
        </span>
      )}

      {/* 删除 */}
      {!editing && (
        <button
          className="delete-btn"
          onClick={() => onDelete(todo.id)}
          aria-label={`删除：${todo.text}`}
        >
          <IconX />
        </button>
      )}
    </li>
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
            <TodoItem
              key={todo.id}
              todo={todo}
              onToggle={(id) => dispatch({ type: 'TOGGLE', id })}
              onEdit={(id, text) => dispatch({ type: 'EDIT', id, text })}
              onDelete={(id) => dispatch({ type: 'DELETE', id })}
            />
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

      {/* 每日完成热力图 */}
      <Heatmap todos={todos} />

      {/* 隐蔽的导入/导出入口 */}
      <DataMenu
        todos={todos}
        onImport={(imported) => dispatch({ type: 'IMPORT', todos: imported })}
      />
    </main>
  )
}
