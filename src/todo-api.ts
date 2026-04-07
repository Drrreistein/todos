/**
 * Agent API - 待办事项编程接口层
 * 
 * 供外部 agent 技能调用，操作待办数据。
 * 核心职责：解析自然语言意图 → 操作 localStorage → 返回结构化结果
 * 
 * 使用方式：
 *   1. 网页端：window.todoApi.add({...})
 *   2. 外部 agent：通过浏览器控制台 / Playwright 调用
 *   3. 技能集成：agent-todos skill 解析用户意图后调用此接口
 */

import { Todo, loadTodos, saveTodos, DEFAULT_CATEGORIES } from './todo'

// Category 在存储中实际是 string (category id)
type CategoryId = string

// ── 类型定义 ─────────────────────────────────────

/** 结构化操作参数（替代命令行字符串） */
export interface AddTodoParams {
  text: string
  category?: string
  notes?: string
}

export interface UpdateTodoParams {
  idOrText: string
  updates: {
    text?: string
    completed?: boolean
    category?: string
    notes?: string
  }
}

export interface ListFilter {
  status?: 'all' | 'active' | 'completed'
  category?: string
  query?: string // 文本搜索
}

/** API 执行结果 */
export interface ApiResult<T = unknown> {
  success: boolean
  message: string
  data?: T
  error?: string
}

/** Todo 的 JSON 可序列化格式 */
export interface TodoJson {
  id: string
  text: string
  completed: boolean
  createdAt: number
  completedAt?: number
  category: CategoryId
  notes?: string
}

/** 变更事件类型 */
export type ChangeType = 'add' | 'update' | 'delete' | 'bulk' | 'clear'

/** 变更事件回调 */
export type ChangeCallback = (event: { type: ChangeType; data: unknown }) => void

// ── 分类别名映射 ─────────────────────────────────

const CATEGORY_ALIASES: Record<string, string> = {
  'work': 'work', '工作': 'work', '办公': 'work', 'job': 'work',
  'personal': 'personal', '生活': 'personal', '私人': 'personal', 'home': 'personal',
  'study': 'study', '学习': 'study', '读书': 'study', 'school': 'study',
  'health': 'health', '健康': 'health', '运动': 'health', 'fitness': 'health',
}

function resolveCategory(raw?: string): CategoryId | undefined {
  if (!raw) return undefined
  const resolved = CATEGORY_ALIASES[raw.trim()] || raw.trim()
  const validIds = DEFAULT_CATEGORIES.map(c => c.id)
  return validIds.includes(resolved) ? resolved : undefined
}

// ── 查找待办 ─────────────────────────────────────

function findTodo(todos: Todo[], idOrText: string): Todo | null {
  const exact = todos.find(t => t.id === idOrText)
  if (exact) return exact
  const byText = todos.find(t => t.text === idOrText)
  if (byText) return byText
  const fuzzy = todos.find(t => t.text.includes(idOrText))
  if (fuzzy) return fuzzy
  const lower = idOrText.toLowerCase()
  return todos.find(t => t.text.toLowerCase().includes(lower)) || null
}

function findMultipleTodos(todos: Todo[], idOrTexts: string[]): Todo[] {
  const results: Todo[] = []
  for (const target of idOrTexts) {
    const found = findTodo(todos, target)
    if (found && !results.includes(found)) results.push(found)
  }
  return results
}

// ── 序列化 ───────────────────────────────────────

function toJson(todo: Todo): TodoJson {
  return {
    id: todo.id,
    text: todo.text,
    completed: todo.completed,
    createdAt: todo.createdAt,
    completedAt: todo.completedAt,
    category: todo.category || 'work',
    notes: todo.notes,
  }
}

// ── 核心 API ──────────────────────────────────────

class TodoAgentAPI {
  private listeners: ChangeCallback[] = []

  /** 订阅变更事件 */
  onChange(callback: ChangeCallback): () => void {
    this.listeners.push(callback)
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback)
    }
  }

  private emit(type: ChangeType, data: unknown) {
    for (const cb of this.listeners) {
      try { cb({ type, data }) } catch {}
    }
  }

  // ---- CRUD 操作 ----

  /** 添加单个待办 */
  add(params: AddTodoParams): ApiResult<TodoJson> {
    const { text, category, notes } = params
    if (!text?.trim()) {
      return { success: false, message: '❌ 待办内容不能为空', error: 'empty_text' }
    }

    const newTodo: Todo = {
      id: crypto.randomUUID(),
      text: text.trim(),
      completed: false,
      createdAt: Date.now(),
      category: resolveCategory(category) || 'work',
      notes: notes?.trim() || undefined,
    }

    const todos = loadTodos()
    const updated = [newTodo, ...todos]
    saveTodos(updated)

    this.emit('add', toJson(newTodo))

    return {
      success: true,
      message: `✓ 已添加: ${newTodo.text}`,
      data: toJson(newTodo),
    }
  }

  /** 批量添加待办 */
  addBatch(items: AddTodoParams[]): ApiResult<TodoJson[]> {
    const results: TodoJson[] = []
    const errors: string[] = []

    for (const item of items) {
      const result = this.add(item)
      if (result.success && result.data) {
        results.push(result.data as TodoJson)
      } else {
        errors.push(result.message)
      }
    }

    // 重新加载最终状态
    // 重新加载最终状态（用于确认数据一致性）
    void loadTodos()

    this.emit('bulk', { added: results.length, errors })

    return {
      success: errors.length === 0,
      message: `✓ 已添加 ${results.length} 个，失败 ${errors.length} 个`,
      data: results.map(r => r),
      ...(errors.length > 0 ? { error: errors.join('; ') } : {}),
    }
  }

  /** 列出待办 */
  list(filter?: ListFilter): ApiResult<TodoJson[]> {
    let todos = loadTodos()

    if (filter?.status === 'active') {
      todos = todos.filter(t => !t.completed)
    } else if (filter?.status === 'completed') {
      todos = todos.filter(t => t.completed)
    }

    if (filter?.category) {
      const cat = resolveCategory(filter.category)
      if (cat) todos = todos.filter(t => t.category === cat)
    }

    if (filter?.query) {
      const q = filter.query.toLowerCase()
      todos = todos.filter(t =>
        t.text.toLowerCase().includes(q) ||
        (t.notes || '').toLowerCase().includes(q)
      )
    }

    return {
      success: true,
      message: `共 ${todos.length} 条待办`,
      data: todos.map(toJson),
    }
  }

  /** 获取单条待办详情 */
  get(idOrText: string): ApiResult<TodoJson> {
    const todos = loadTodos()
    const todo = findTodo(todos, idOrText)

    if (!todo) {
      return { success: false, message: `❌ 未找到: "${idOrText}"`, error: 'not_found' }
    }

    return {
      success: true,
      message: `✓ 找到: ${todo.text}`,
      data: toJson(todo),
    }
  }

  /** 更新待办 */
  update(params: UpdateTodoParams): ApiResult<TodoJson> {
    const todos = loadTodos()
    const todo = findTodo(todos, params.idOrText)

    if (!todo) {
      return { success: false, message: `❌ 未找到: "${params.idOrText}"`, error: 'not_found' }
    }

    const updated = todos.map(t => {
      if (t.id !== todo.id) return t
      return { ...t, ...params.updates }
    })
    saveTodos(updated)

    const updatedTodo = updated.find(t => t.id === todo.id)!
    this.emit('update', toJson(updatedTodo))

    const changes = Object.keys(params.updates).join(', ')
    return {
      success: true,
      message: `✏️ 已更新 [${changes}]: ${updatedTodo.text}`,
      data: toJson(updatedTodo),
    }
  }

  /** 完成待办 */
  complete(idOrText: string): ApiResult<TodoJson> {
    return this.update({ idOrText, updates: { completed: true } })
  }

  /** 取消完成 */
  uncomplete(idOrText: string): ApiResult<TodoJson> {
    return this.update({ idOrText, updates: { completed: false } })
  }

  /** 删除待办 */
  delete(idOrText: string): ApiResult<TodoJson> {
    const todos = loadTodos()
    const todo = findTodo(todos, idOrText)

    if (!todo) {
      return { success: false, message: `❌ 未找到: "${idOrText}"`, error: 'not_found' }
    }

    const updated = todos.filter(t => t.id !== todo.id)
    saveTodos(updated)

    this.emit('delete', toJson(todo))

    return {
      success: true,
      message: `🗑️ 已删除: ${todo.text}`,
      data: toJson(todo),
    }
  }

  /** 批量完成 */
  completeBatch(idOrTexts: string[]): ApiResult<TodoJson[]> {
    const todos = loadTodos()
    const targets = findMultipleTodos(todos, idOrTexts)

    if (targets.length === 0) {
      return { success: false, message: '❌ 未找到匹配的待办', error: 'not_found' }
    }

    const ids = new Set(targets.map(t => t.id))
    const updated = todos.map(t =>
      ids.has(t.id) ? { ...t, completed: true, completedAt: Date.now() } : t
    )
    saveTodos(updated)

    this.emit('bulk', { completed: targets.length })

    return {
      success: true,
      message: `✓ 已完成 ${targets.length} 条`,
      data: targets.map(toJson),
    }
  }

  /** 批量删除 */
  deleteBatch(idOrTexts: string[]): ApiResult<TodoJson[]> {
    const todos = loadTodos()
    const targets = findMultipleTodos(todos, idOrTexts)

    if (targets.length === 0) {
      return { success: false, message: '❌ 未找到匹配的待办', error: 'not_found' }
    }

    const ids = new Set(targets.map(t => t.id))
    const remaining = todos.filter(t => !ids.has(t.id))
    saveTodos(remaining)

    this.emit('bulk', { deleted: targets.length })

    return {
      success: true,
      message: `🗑️ 已删除 ${targets.length} 条`,
      data: targets.map(toJson),
    }
  }

  /** 清除所有已完成 */
  clearCompleted(): ApiResult<TodoJson[]> {
    const todos = loadTodos()
    const completed = todos.filter(t => t.completed)

    if (completed.length === 0) {
      return { success: true, message: '没有已完成的待办需要清除', data: [] }
    }

    const remaining = todos.filter(t => !t.completed)
    saveTodos(remaining)

    this.emit('clear', { cleared: completed.length })

    return {
      success: true,
      message: `🧹 已清除 ${completed.length} 个已完成事项`,
      data: completed.map(toJson),
    }
  }

  // ---- 统计信息 ----

  /** 获取统计摘要 */
  stats(): ApiResult<{
    total: number
    active: number
    completed: number
    byCategory: Record<string, number>
  }> {
    const todos = loadTodos()
    const active = todos.filter(t => !t.completed).length
    const completed = todos.filter(t => t.completed).length
    const byCategory: Record<string, number> = {}

    for (const t of todos) {
      const cat = t.category || 'unknown'
      byCategory[cat] = (byCategory[cat] || 0) + 1
    }

    return {
      success: true,
      message: `共 ${todos.length} 条（${active} 待完成，${completed} 已完成）`,
      data: { total: todos.length, active, completed, byCategory },
    }
  }

  // ---- 自然语言接口（兼容旧版）----

  /**
   * 解析自然语言输入并执行
   * 保留给需要从字符串派生命令的场景（如快捷命令）
   */
  exec(input: string): ApiResult {
    const trimmed = input.trim()
    if (!trimmed) {
      return { success: false, message: '❌ 输入不能为空' }
    }

    // 帮助
    if (/^help$|^帮助$|^\?$|^--help$/i.test(trimmed)) {
      return { success: true, message: this.help() }
    }

    // 列出
    if (/^list$|^ls$|^显示$|^列出$/i.test(trimmed)) {
      return this.list({ status: 'all' })
    }
    if (/^active$|^待办$|^未完成$/i.test(trimmed)) {
      return this.list({ status: 'active' })
    }
    if (/^completed$|^已完成$/i.test(trimmed)) {
      return this.list({ status: 'completed' })
    }

    // 清除已完成
    if (/^clear$|^清理$|^清除已完成$/i.test(trimmed)) {
      return this.clearCompleted()
    }

    // 添加
    const addMatch = trimmed.match(/^(?:添加|add|新建|new|\+)\s+(.+)$/i)
    if (addMatch) {
      return this.parseAndAdd(addMatch[1])
    }

    // 完成
    const completeMatch = trimmed.match(/^(?:完成|done|check)\s+(.+)$/i)
    if (completeMatch) {
      return this.complete(completeMatch[1].trim())
    }

    // 取消完成
    const uncompleteMatch = trimmed.match(/^(?:取消完成|uncheck|undo)\s+(.+)$/i)
    if (uncompleteMatch) {
      return this.uncomplete(uncompleteMatch[1].trim())
    }

    // 删除
    const deleteMatch = trimmed.match(/^(?:删除|delete|del|rm|-)\s+(.+)$/i)
    if (deleteMatch) {
      return this.delete(deleteMatch[1].trim())
    }

    // 编辑
    const editMatch = trimmed.match(/^(?:编辑|edit|修改)\s+(.+?)\s+(?:改为|to|成)\s+(.+)$/i)
    if (editMatch) {
      return this.update({
        idOrText: editMatch[1].trim(),
        updates: { text: editMatch[2].trim() },
      })
    }

    // 设置分类
    const catMatch = trimmed.match(/^(?:将)?\s*(.+?)\s*(?:分类为|category)\s*(.+)$/i)
    if (catMatch) {
      return this.update({
        idOrText: catMatch[1].trim(),
        updates: { category: resolveCategory(catMatch[2].trim()) || catMatch[2].trim() as CategoryId },
      })
    }

    // 备注
    const noteMatch = trimmed.match(/^(?:备注|note)\s+(.+?)[:：]\s*(.+)$/i)
    if (noteMatch) {
      return this.update({
        idOrText: noteMatch[1].trim(),
        updates: { notes: noteMatch[2].trim() },
      })
    }

    // 默认：尝试作为添加
    return this.parseAndAdd(trimmed)
  }

  /** 帮助文本 */
  help(): string {
    return `📋 Todo Agent API v2.0

结构化 API（推荐）:
  api.add({text, category?, notes?})     — 添加待办
  api.addBatch([{text}, ...])            — 批量添加
  api.get(idOrText)                      — 获取详情
  api.list({status?, category?, query?}) — 列出/搜索
  api.complete(idOrText)                 — 完成
  api.uncomplete(idOrText)               — 取消完成
  api.delete(idOrText)                   — 删除
  api.update({idOrText, updates})        — 更新任意字段
  api.completeBatch([...])               — 批量完成
  api.deleteBatch([...])                 — 批量删除
  api.clearCompleted()                   — 清除已完成
  api.stats()                            — 统计摘要
  api.onChange(fn)                       — 监听变更事件

自然语言兼容:
  exec("添加 写周报 #work @参考xxx")
  exec("完成 写周报")
  exec("list")

分类: work(工作), personal(生活), study(学习), health(健康)`
  }

  // ---- 内部：解析添加命令内容 ----

  private parseAndAdd(content: string): ApiResult<TodoJson> {
    let text = content
    let category: string | undefined
    let notes: string | undefined

    // #分类 或 [分类]
    const catMatch = content.match(/[#\[]([^#\[\]\n]+)[#\]]/)
    if (catMatch) {
      category = CATEGORY_ALIASES[catMatch[1].trim()] || catMatch[1].trim()
      text = text.replace(catMatch[0], '').trim()
    }

    // @备注 或 (备注)
    const notesPattern = new RegExp('[@(（【]([^@(（【\\n]+)[@)）】]')
    const notesMatch = content.match(notesPattern)
    if (notesMatch) {
      notes = notesMatch[1].trim()
      text = text.replace(notesMatch[0], '').trim()
    }

    text = text.replace(/\s+/g, ' ').trim()

    return this.add({ text, category, notes })
  }
}

// ── 导出实例 ─────────────────────────────────────

export const todoApi = new TodoAgentAPI()

// 向后兼容的导出
export function processAgentInput(input: string) {
  return todoApi.exec(input)
}
export { parseCommand } from './agent-cli-legacy'

// 全局暴露
declare global {
  interface Window {
    todoApi: InstanceType<typeof TodoAgentAPI>
    todoAgent: {
      exec: (input: string) => ReturnType<typeof processAgentInput>
      help: () => string
    }
  }
}

if (typeof window !== 'undefined') {
  window.todoApi = todoApi
  window.todoAgent = {
    exec: (input: string) => {
      const result = todoApi.exec(input)
      console.log('[todoAgent]', result.message)
      return result
    },
    help: () => {
      const msg = todoApi.help()
      console.log('[todoAgent]', msg)
      return msg
    },
  }
}
