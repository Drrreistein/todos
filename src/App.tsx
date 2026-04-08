import { useReducer, useEffect, useState, useRef, useCallback } from 'react'
import {
  todoReducer, loadTodos, saveTodos, exportTodos, parseTodosFromJson,
  DEFAULT_CATEGORIES, CATEGORY_MAP,
  type Todo, type Category,
} from './todo'
import { todoApi } from './todo-api'
import { cloudStore, type SyncStatus } from './cloud-store'
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

function IconTag() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"
        strokeLinecap="round" strokeLinejoin="round" />
      <line x1="7" y1="7" x2="7.01" y2="7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconChevronDown() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconChevronUp() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path d="M18 15l-6-6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconNote() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="14 2 14 8 20 8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── 动态 Favicon 生成器 ─────────────────────────

/** 用 Canvas 将 emoji 渲染成 SVG favicon */
function generateFavicon(emoji: string, color: string): string {
  // 创建一个 SVG favicon，背景为分类主题色，中间放 emoji
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect width="100" height="100" rx="20" fill="${color}"/>
    <text x="50" y="68" font-size="56" text-anchor="middle" dominant-baseline="middle"
      font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">${emoji}</text>
  </svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
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
    e.target.value = ''
    setOpen(false)
  }

  return (
    <div className="data-menu-wrap" ref={menuRef}>
      <button
        className="data-menu-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-label="数据菜单"
        title="导入 / 导出"
      >
        ···
      </button>

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

      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {hint && <div className="data-menu-hint">{hint}</div>}
    </div>
  )
}

// ── 云同步状态徽标 ──────────────────────────────

function CloudIconSyncing() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="spin-icon" aria-hidden>
      <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0118.8-4.3M22 12.5a10 10 0 01-18.8 4.2" />
    </svg>
  )
}

function CloudIconDone() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" />
    </svg>
  )
}

function CloudIconOff() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" />
      <line x1="2" y1="2" x2="22" y2="22" strokeOpacity="0.4" />
    </svg>
  )
}

interface CloudSyncBadgeProps {
  status: SyncStatus
  isEnabled: boolean
  onClick: () => void
}

function CloudSyncBadge({ status, isEnabled, onClick }: CloudSyncBadgeProps) {
  const statusLabel = {
    idle: isEnabled ? '已连接' : '本地模式',
    syncing: '同步中…',
    synced: '已同步',
    error: '同步失败',
    offline: '离线',
  }

  const icon = !isEnabled ? <CloudIconOff />
    : status === 'syncing' ? <CloudIconSyncing />
    : status === 'error' ? <CloudIconOff />
    : <CloudIconDone />

  return (
    <button
      className={`cloud-sync-badge ${status} ${!isEnabled ? 'local' : ''}`}
      onClick={onClick}
      title={`云同步: ${statusLabel[status]}（点击设置）`}
      aria-label={`云同步状态: ${statusLabel[status]}`}
    >
      {icon}
      <span className="cloud-status-text">{statusLabel[status]}</span>
    </button>
  )
}

// ── 云同步设置面板 ───────────────────────────────

interface CloudSetupPanelProps {
  token: string
  gistId: string
  isEnabled: boolean
  status: SyncStatus
  onTokenChange: (v: string) => void
  onGistIdChange: (v: string) => void
  onSave: () => void
  onDisconnect: () => void
  onClose: () => void
}

function CloudSetupPanel({
  token, gistId, isEnabled, status,
  onTokenChange, onGistIdChange,
  onSave, onDisconnect, onClose,
}: CloudSetupPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        // 点击外部不关闭，让用户操作
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className="cloud-setup-overlay" onClick={onClose}>
      <div className="cloud-setup-panel" ref={panelRef} onClick={e => e.stopPropagation()}>
        <div className="cloud-setup-header">
          <h3>☁️ 云端同步设置</h3>
          <button className="cloud-setup-close" onClick={onClose} aria-label="关闭">✕</button>
        </div>

        <div className="cloud-setup-body">
          {!isEnabled ? (
            <>
              <p className="cloud-setup-desc">
                使用 GitHub Gist 存储待办数据，实现多端同步。
                数据加密存储在你的 Gist 中，只有你能访问。
              </p>

              <label className="cloud-input-label">
                GitHub Personal Access Token
                <input
                  type="password"
                  className="cloud-input"
                  placeholder="ghp_xxxxxxxxxxxx"
                  value={token}
                  onChange={e => onTokenChange(e.target.value)}
                  autoComplete="off"
                />
                <span className="cloud-input-hint">
                  需要 <code>gist</code> 权限。
                  <a href="https://github.com/settings/tokens/new?scopes=gist&description=todo-app-sync"
                     target="_blank" rel="noopener noreferrer">
                    去生成 →
                  </a>
                </span>
              </label>

              <label className="cloud-input-label">
                Gist ID
                <input
                  type="text"
                  className="cloud-input"
                  placeholder="abc123def456"
                  value={gistId}
                  onChange={e => onGistIdChange(e.target.value)}
                />
                <span className="cloud-input-hint">
                  现有 Gist 的 ID（URL 中的那串字符），或留空自动创建。
                </span>
              </label>

              <button
                className="cloud-save-btn"
                disabled={!token.trim() || !gistId.trim()}
                onClick={onSave}
              >
                连接并同步
              </button>
            </>
          ) : (
            <>
              <div className="cloud-status-row">
                <span>状态</span>
                <span className={`cloud-status-badge ${status}`}>{status}</span>
              </div>
              <div className="cloud-status-row">
                <span>Gist ID</span>
                <code className="cloud-gist-id">{gistId}</code>
                <a
                  href={`https://gist.github.com/${gistId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cloud-link"
                >
                  查看
                </a>
              </div>
              <button className="cloud-disconnect-btn" onClick={onDisconnect}>
                断开云同步（数据保留在本地）
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 分类 Tab 栏 ──────────────────────────────────

interface TabBarProps {
  categories: Category[]
  activeId: string
  counts: Record<string, number>
  onChange: (id: string) => void
}

function TabBar({ categories, activeId, counts, onChange }: TabBarProps) {
  return (
    <nav className="tab-bar" role="tablist" aria-label="分类切换">
      {categories.map(cat => {
        const isActive = cat.id === activeId
        const count = cat.id === 'all'
          ? Object.values(counts).reduce((s, n) => s + n, 0)
          : (counts[cat.id] ?? 0)
        return (
          <button
            key={cat.id}
            className={`tab-item${isActive ? ' active' : ''}`}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(cat.id)}
            style={isActive ? { '--tab-color': cat.color } as React.CSSProperties : undefined}
          >
            <span className="tab-icon">{cat.icon}</span>
            <span className="tab-label">{cat.name}</span>
            {count > 0 && <span className="tab-badge">{count}</span>}
          </button>
        )
      })}
    </nav>
  )
}

// ── 单条待办（带行内编辑 + 分类标签 + 详情展开）────────────

interface TodoItemProps {
  todo: Todo
  onToggle: (id: string) => void
  onEdit: (id: string, text: string) => void
  onDelete: (id: string) => void
  onSetCategory: (id: string, category: string) => void
  onSetNotes: (id: string, notes: string) => void
}

function TodoItem({ todo, onToggle, onEdit, onDelete, onSetCategory, onSetNotes }: TodoItemProps) {
  const [editing, setEditing] = useState(false)
  const [showCatMenu, setShowCatMenu] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [draft, setDraft] = useState(todo.text)
  const [notesDraft, setNotesDraft] = useState(todo.notes || '')
  const editRef = useRef<HTMLInputElement>(null)
  const editComposingRef = useRef(false)
  const catMenuRef = useRef<HTMLDivElement>(null)
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (editing) {
      editRef.current?.focus()
      editRef.current?.select()
    }
  }, [editing])

  // 展开时自动聚焦 textarea
  useEffect(() => {
    if (expanded) {
      notesRef.current?.focus()
    }
  }, [expanded])

  // 点击分类菜单外部关闭
  useEffect(() => {
    if (!showCatMenu) return
    function handleClick(e: MouseEvent) {
      if (catMenuRef.current && !catMenuRef.current.contains(e.target as Node)) {
        setShowCatMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showCatMenu])

  function startEdit() {
    setDraft(todo.text)
    setEditing(true)
  }

  function commitEdit() {
    const text = draft.trim()
    if (text && text !== todo.text) {
      onEdit(todo.id, text)
    } else {
      setDraft(todo.text)
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

  function handleNotesChange(value: string) {
    setNotesDraft(value)
    onSetNotes(todo.id, value)
  }

  const cat = CATEGORY_MAP[todo.category || 'work']
  const hasNotes = Boolean(todo.notes && todo.notes.trim())

  // 悬停预览逻辑
  const handleMouseEnter = () => {
    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current)
    }
    if (hasNotes && !expanded) {
      previewTimeoutRef.current = setTimeout(() => {
        setShowPreview(true)
      }, 300)
    }
  }

  const handleMouseLeave = () => {
    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current)
    }
    setShowPreview(false)
  }

  return (
    <li 
      className={`todo-item-wrap${expanded ? ' expanded' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="todo-item">
        {/* 复选框 */}
        <button
          className={`checkbox-btn${todo.completed ? ' checked' : ''}`}
          onClick={() => onToggle(todo.id)}
          aria-label={todo.completed ? '标记为未完成' : '标记为完成'}
          aria-pressed={todo.completed}
          style={todo.completed ? {} : { borderColor: cat.color }}
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

        {/* 有详情标记 */}
        {!editing && hasNotes && (
          <span className="note-indicator" title="有详情">
            <IconNote />
          </span>
        )}

        {/* 展开/收起按钮 */}
        {!editing && (
          <button
            className="expand-btn"
            onClick={() => setExpanded(v => !v)}
            aria-label={expanded ? '收起详情' : '展开详情'}
            title={expanded ? '收起详情' : '展开详情'}
            aria-expanded={expanded}
          >
            {expanded ? <IconChevronUp /> : <IconChevronDown />}
          </button>
        )}

        {/* 分类标签按钮 */}
        {!editing && (
          <div className="cat-menu-wrap" ref={catMenuRef}>
            <button
              className="cat-tag-btn"
              onClick={() => setShowCatMenu(v => !v)}
              aria-label={`分类：${cat.name}`}
              title={`分类：${cat.name}`}
              style={{ color: cat.color }}
            >
              <IconTag />
            </button>

            {showCatMenu && (
              <div className="cat-menu-popup" role="menu">
                {DEFAULT_CATEGORIES.filter(c => c.id !== 'all').map(c => (
                  <button
                    key={c.id}
                    className={`cat-menu-item${c.id === (todo.category || 'work') ? ' active' : ''}`}
                    role="menuitem"
                    onClick={() => { onSetCategory(todo.id, c.id); setShowCatMenu(false) }}
                  >
                    <span>{c.icon}</span>
                    <span>{c.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
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
      </div>

      {/* 悬停预览浮层 */}
      {showPreview && hasNotes && !expanded && (
        <div className="notes-preview-popup">
          <div className="notes-preview-content">
            {todo.notes}
          </div>
        </div>
      )}

      {/* 详情编辑区域 */}
      {expanded && (
        <div className="todo-notes">
          <textarea
            ref={notesRef}
            className="notes-textarea"
            placeholder="添加备注、灵感或信息来源…"
            value={notesDraft}
            onChange={(e) => handleNotesChange(e.target.value)}
            rows={3}
            aria-label="待办详情"
          />
        </div>
      )}
    </li>
  )
}

// ── 主应用组件 ────────────────────────────────

// ── 主应用组件 ────────────────────────────────

export default function App() {
  const [todos, dispatch] = useReducer(todoReducer, [], loadTodos)
  const [activeTab, setActiveTab] = useState('all')
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const isComposingRef = useRef(false)

  // ── 云同步状态 ──
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [showCloudSetup, setShowCloudSetup] = useState(false)
  const [cloudToken, setCloudToken] = useState('')
  const [cloudGistId, setCloudGistId] = useState('')

  // 加载已保存的云配置
  useEffect(() => {
    const saved = cloudStore.loadConfig()
    if (saved) {
      setCloudToken(saved.token)
      setCloudGistId(saved.gistId)
    }
  }, [])

  // 监听云存储事件
  useEffect(() => {
    const unsub = cloudStore.onEvent((event) => {
      if (event.type === 'status-change' && event.status) {
        setSyncStatus(event.status)
      }
      if (event.type === 'remote-update' && event.data) {
        // 远程有新数据 → 导入到本地（覆盖）
        const remoteTodos = event.data as Todo[]
        dispatch({ type: 'IMPORT', todos: remoteTodos })
      }
      if (event.type === 'sync-error') {
        console.error('[Cloud]', event.error)
      }
    })
    return unsub
  }, [])

  // 首次加载 + 配置变更时从云端拉取
  useEffect(() => {
    if (cloudStore.isEnabled()) {
      void cloudStore.pull().then((remoteTodos) => {
        if (remoteTodos && remoteTodos.length > 0) {
          dispatch({ type: 'IMPORT', todos: remoteTodos })
        }
      })
    }
  }, []) // 仅组件挂载时执行一次

  // 组件卸载时清理
  useEffect(() => {
    return () => { cloudStore.destroy() }
  }, [])

  // 每次 todos 变化时持久化
  useEffect(() => {
    saveTodos(todos)
  }, [todos])

  // 动态 favicon：切换 Tab 时更新
  useEffect(() => {
    const cat = CATEGORY_MAP[activeTab]
    if (!cat) return
    const url = generateFavicon(cat.icon, cat.color)
    // 查找或创建 favicon link
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']")
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      link.type = 'image/svg+xml'
      document.head.appendChild(link)
    }
    link.href = url
    // 更新页面标题
    document.title = `${cat.icon} ${cat.name} · todos`
  }, [activeTab])

  // 统计各分类待完成数
  const counts = useCallback(() => {
    const map: Record<string, number> = {}
    for (const t of todos) {
      if (t.completed) continue
      const c = t.category || 'work'
      map[c] = (map[c] ?? 0) + 1
    }
    return map
  }, [todos])

  // 当前 Tab 过滤后的 todos
  const filteredTodos = activeTab === 'all'
    ? todos
    : todos.filter(t => (t.category || 'work') === activeTab)

  function handleSubmit() {
    const text = input.trim()
    if (!text) return
    const category = activeTab === 'all' ? 'work' : activeTab
    dispatch({ type: 'ADD', text, category })
    setInput('')
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !isComposingRef.current) handleSubmit()
  }

  // 监听 todoApi 变更，自动同步到 React state
  useEffect(() => {
    const unsubscribe = todoApi.onChange(() => {
      // 当外部 API 操作数据时，重新加载以保持同步
      dispatch({ type: 'IMPORT', todos: loadTodos() })
    })
    return unsubscribe
  }, [dispatch])

  const remaining = filteredTodos.filter((t) => !t.completed).length
  const hasCompleted = filteredTodos.some((t) => t.completed)

  return (
    <main className="app">
      {/* 标题 */}
      <header className="app-header">
        <h1 className="app-title">todos</h1>
        <p className="app-subtitle">你的待办，一目了然</p>
      </header>

      {/* 分类 Tab 栏 */}
      <TabBar
        categories={DEFAULT_CATEGORIES}
        activeId={activeTab}
        counts={counts()}
        onChange={setActiveTab}
      />

      {/* 输入区域 */}
      <div className="input-area">
        <input
          ref={inputRef}
          className="todo-input"
          type="text"
          placeholder={
            activeTab === 'all'
              ? '添加待办事项…'
              : `添加${CATEGORY_MAP[activeTab]?.name}待办…`
          }
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
      {filteredTodos.length === 0 ? (
        <p className="empty-state">
          {activeTab === 'all' ? '没有待办事项' : `没有${CATEGORY_MAP[activeTab]?.name}待办`}
        </p>
      ) : (
        <ul className="todo-list" aria-label="待办列表">
          {filteredTodos.map((todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onToggle={(id) => dispatch({ type: 'TOGGLE', id })}
              onEdit={(id, text) => dispatch({ type: 'EDIT', id, text })}
              onDelete={(id) => dispatch({ type: 'DELETE', id })}
              onSetCategory={(id, category) => dispatch({ type: 'SET_CATEGORY', id, category })}
              onSetNotes={(id, notes) => dispatch({ type: 'SET_NOTES', id, notes })}
            />
          ))}
        </ul>
      )}

      {/* 底部状态栏 */}
      {filteredTodos.length > 0 && (
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

      {/* 每日完成热力图（仅在"全部"Tab 显示） */}
      {activeTab === 'all' && <Heatmap todos={todos} />}

      {/* 隐蔽的导入/导出入口 */}
      <DataMenu
        todos={todos}
        onImport={(imported) => dispatch({ type: 'IMPORT', todos: imported })}
      />

      {/* 云同步状态 & 设置 */}
      <CloudSyncBadge
        status={syncStatus}
        isEnabled={cloudStore.isEnabled()}
        onClick={() => setShowCloudSetup(v => !v)}
      />

      {showCloudSetup && (
        <CloudSetupPanel
          token={cloudToken}
          gistId={cloudGistId}
          isEnabled={cloudStore.isEnabled()}
          status={syncStatus}
          onTokenChange={setCloudToken}
          onGistIdChange={setCloudGistId}
          onSave={() => {
            if (cloudToken.trim() && cloudGistId.trim()) {
              cloudStore.saveConfig({ token: cloudToken.trim(), gistId: cloudGistId.trim() })
              setSyncStatus('syncing')
            }
          }}
          onDisconnect={() => {
            cloudStore.clearConfig()
            setCloudToken('')
            setCloudGistId('')
            setSyncStatus('idle')
            setShowCloudSetup(false)
          }}
          onClose={() => setShowCloudSetup(false)}
        />
      )}
    </main>
  )
}
