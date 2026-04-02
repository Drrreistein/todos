/**
 * Agent CLI - 命令行接口用于操作待办事项
 * 支持通过自然语言风格的命令增删改查提醒事项
 */

import { Todo, loadTodos, saveTodos, DEFAULT_CATEGORIES } from './todo'

// CLI 命令类型
export type CliCommand =
  | { type: 'ADD'; text: string; category?: string; notes?: string }
  | { type: 'LIST'; filter?: 'all' | 'active' | 'completed'; category?: string }
  | { type: 'COMPLETE'; idOrText: string }
  | { type: 'UNCOMPLETE'; idOrText: string }
  | { type: 'DELETE'; idOrText: string }
  | { type: 'EDIT'; idOrText: string; newText: string }
  | { type: 'SET_CATEGORY'; idOrText: string; category: string }
  | { type: 'SET_NOTES'; idOrText: string; notes: string }
  | { type: 'CLEAR_COMPLETED' }
  | { type: 'HELP' }

// CLI 执行结果
export interface CliResult {
  success: boolean
  message: string
  todos?: Todo[]
  affectedCount?: number
}

// 分类名称映射（支持中文/英文别名）
const CATEGORY_ALIASES: Record<string, string> = {
  'work': 'work', '工作': 'work', '办公': 'work', 'job': 'work',
  'personal': 'personal', '生活': 'personal', '私人': 'personal', 'home': 'personal',
  'study': 'study', '学习': 'study', '读书': 'study', 'school': 'study',
  'health': 'health', '健康': 'health', '运动': 'health', 'fitness': 'health',
}

/**
 * 解析自然语言命令
 */
export function parseCommand(input: string): CliCommand | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // 帮助命令
  if (/^help$|^帮助$|^\?$|^--help$|^\-h$/i.test(trimmed)) {
    return { type: 'HELP' }
  }

  // 列出所有
  if (/^list$|^ls$|^显示$|^列出$|^查看所有$/i.test(trimmed)) {
    return { type: 'LIST', filter: 'all' }
  }

  // 列出未完成
  if (/^active$|^待办$|^未完成$|^待完成$/i.test(trimmed)) {
    return { type: 'LIST', filter: 'active' }
  }

  // 列出已完成
  if (/^completed$|^已完成$|^完成$/i.test(trimmed)) {
    return { type: 'LIST', filter: 'completed' }
  }

  // 清除已完成
  if (/^clear$|^清理$|^清除已完成$|^clear completed$/i.test(trimmed)) {
    return { type: 'CLEAR_COMPLETED' }
  }

  // 添加待办 - 支持多种格式
  // "添加 xxx" / "add xxx" / "新建 xxx" / "+ xxx"
  const addMatch = trimmed.match(/^(?:添加|add|新建|new|create|\+)\s+(.+)$/i)
  if (addMatch) {
    const content = addMatch[1].trim()
    return parseAddCommand(content)
  }

  // 完成待办
  // "完成 xxx" / "done xxx" / "check xxx" / "✓ xxx"
  const completeMatch = trimmed.match(/^(?:完成|done|check|tick|✓|✔)\s+(.+)$/i)
  if (completeMatch) {
    return { type: 'COMPLETE', idOrText: completeMatch[1].trim() }
  }

  // 取消完成
  // "取消完成 xxx" / "uncheck xxx" / "undo xxx"
  const uncompleteMatch = trimmed.match(/^(?:取消完成|uncheck|undo|uncheck)\s+(.+)$/i)
  if (uncompleteMatch) {
    return { type: 'UNCOMPLETE', idOrText: uncompleteMatch[1].trim() }
  }

  // 删除待办
  // "删除 xxx" / "delete xxx" / "del xxx" / "remove xxx" / "- xxx"
  const deleteMatch = trimmed.match(/^(?:删除|delete|del|remove|rm|-)\s+(.+)$/i)
  if (deleteMatch) {
    return { type: 'DELETE', idOrText: deleteMatch[1].trim() }
  }

  // 编辑待办
  // "编辑 xxx 改为 yyy" / "edit xxx to yyy" / "修改 xxx 成 yyy"
  const editMatch = trimmed.match(/^(?:编辑|edit|修改|update)\s+(.+?)\s+(?:改为|to|成|->)\s+(.+)$/i)
  if (editMatch) {
    return { type: 'EDIT', idOrText: editMatch[1].trim(), newText: editMatch[2].trim() }
  }

  // 设置分类
  // "将 xxx 分类为 yyy" / "set xxx category to yyy"
  const categoryMatch = trimmed.match(/^(?:将|set)?\s*(.+?)\s*(?:分类为|分类|category|归类为)\s*(.+)$/i)
  if (categoryMatch) {
    const category = CATEGORY_ALIASES[categoryMatch[2].trim()] || categoryMatch[2].trim()
    return { type: 'SET_CATEGORY', idOrText: categoryMatch[1].trim(), category }
  }

  // 添加备注
  // "备注 xxx: yyy" / "note xxx: yyy" / "xxx 的备注: yyy"
  const notesMatch = trimmed.match(/^(?:备注|note)\s+(.+?)[:：]\s*(.+)$/i) ||
                     trimmed.match(/^(.+?)\s*(?:的备注|的笔记|notes?)[:：]\s*(.+)$/i)
  if (notesMatch) {
    return { type: 'SET_NOTES', idOrText: notesMatch[1].trim(), notes: notesMatch[2].trim() }
  }

  // 默认：尝试作为添加命令
  return parseAddCommand(trimmed)
}

/**
 * 解析添加命令的内容（支持分类和备注）
 * 格式: "内容 #分类 @备注" 或 "内容 [分类] (备注)"
 */
function parseAddCommand(content: string): CliCommand {
  let text = content
  let category: string | undefined
  let notes: string | undefined

  // 提取分类 - #work 或 [工作]
  const categoryMatch = content.match(/[#\[]([^#\[\]\n]+)[#\]]/)
  if (categoryMatch) {
    const catKey = categoryMatch[1].trim()
    category = CATEGORY_ALIASES[catKey] || catKey
    text = text.replace(categoryMatch[0], '').trim()
  }

  // 提取备注 - @备注内容 或 (备注内容) 或 【备注内容】
  const notesMatch = content.match(/[@(（【]([^@(（【\n]+)[@(）】]/)
  if (notesMatch) {
    notes = notesMatch[1].trim()
    text = text.replace(notesMatch[0], '').trim()
  }

  // 清理多余的空格
  text = text.replace(/\s+/g, ' ').trim()

  return { type: 'ADD', text, category, notes }
}

/**
 * 查找待办（支持 ID 或文本匹配）
 */
function findTodo(todos: Todo[], idOrText: string): Todo | null {
  // 先尝试精确匹配 ID
  let todo = todos.find(t => t.id === idOrText)
  if (todo) return todo

  // 尝试模糊匹配文本（包含关系）
  todo = todos.find(t => t.text.includes(idOrText))
  if (todo) return todo

  // 尝试忽略大小写匹配
  const lower = idOrText.toLowerCase()
  todo = todos.find(t => t.text.toLowerCase().includes(lower))
  
  return todo || null
}

/**
 * 格式化待办列表为文本
 */
function formatTodoList(todos: Todo[]): string {
  if (todos.length === 0) {
    return '暂无待办事项'
  }

  const lines = todos.map((todo, index) => {
    const status = todo.completed ? '✓' : '○'
    const category = todo.category || 'work'
    const catEmoji = DEFAULT_CATEGORIES.find(c => c.id === category)?.icon || '📋'
    const notesIndicator = todo.notes ? ' 📝' : ''
    return `${index + 1}. ${status} ${catEmoji} ${todo.text}${notesIndicator}`
  })

  return lines.join('\n')
}

/**
 * 执行 CLI 命令
 */
export function executeCommand(command: CliCommand): CliResult {
  const todos = loadTodos()

  switch (command.type) {
    case 'ADD': {
      const newTodo: Todo = {
        id: crypto.randomUUID(),
        text: command.text,
        completed: false,
        createdAt: Date.now(),
        category: command.category || 'work',
        notes: command.notes,
      }
      const updated = [newTodo, ...todos]
      saveTodos(updated)
      return {
        success: true,
        message: `✓ 已添加: ${newTodo.text}`,
        todos: updated,
        affectedCount: 1,
      }
    }

    case 'LIST': {
      let filtered = todos
      if (command.filter === 'active') {
        filtered = todos.filter(t => !t.completed)
      } else if (command.filter === 'completed') {
        filtered = todos.filter(t => t.completed)
      }
      if (command.category) {
        filtered = filtered.filter(t => t.category === command.category)
      }
      return {
        success: true,
        message: formatTodoList(filtered),
        todos: filtered,
        affectedCount: filtered.length,
      }
    }

    case 'COMPLETE': {
      const todo = findTodo(todos, command.idOrText)
      if (!todo) {
        return { success: false, message: `❌ 未找到: "${command.idOrText}"` }
      }
      const updated = todos.map(t =>
        t.id === todo.id
          ? { ...t, completed: true, completedAt: Date.now() }
          : t
      )
      saveTodos(updated)
      return {
        success: true,
        message: `✓ 已完成: ${todo.text}`,
        todos: updated,
        affectedCount: 1,
      }
    }

    case 'UNCOMPLETE': {
      const todo = findTodo(todos, command.idOrText)
      if (!todo) {
        return { success: false, message: `❌ 未找到: "${command.idOrText}"` }
      }
      const updated = todos.map(t =>
        t.id === todo.id
          ? { ...t, completed: false, completedAt: undefined }
          : t
      )
      saveTodos(updated)
      return {
        success: true,
        message: `○ 已取消完成: ${todo.text}`,
        todos: updated,
        affectedCount: 1,
      }
    }

    case 'DELETE': {
      const todo = findTodo(todos, command.idOrText)
      if (!todo) {
        return { success: false, message: `❌ 未找到: "${command.idOrText}"` }
      }
      const updated = todos.filter(t => t.id !== todo.id)
      saveTodos(updated)
      return {
        success: true,
        message: `🗑️ 已删除: ${todo.text}`,
        todos: updated,
        affectedCount: 1,
      }
    }

    case 'EDIT': {
      const todo = findTodo(todos, command.idOrText)
      if (!todo) {
        return { success: false, message: `❌ 未找到: "${command.idOrText}"` }
      }
      const updated = todos.map(t =>
        t.id === todo.id ? { ...t, text: command.newText } : t
      )
      saveTodos(updated)
      return {
        success: true,
        message: `✏️ 已修改: "${todo.text}" → "${command.newText}"`,
        todos: updated,
        affectedCount: 1,
      }
    }

    case 'SET_CATEGORY': {
      const todo = findTodo(todos, command.idOrText)
      if (!todo) {
        return { success: false, message: `❌ 未找到: "${command.idOrText}"` }
      }
      const categoryName = DEFAULT_CATEGORIES.find(c => c.id === command.category)?.name || command.category
      const updated = todos.map(t =>
        t.id === todo.id ? { ...t, category: command.category } : t
      )
      saveTodos(updated)
      return {
        success: true,
        message: `🏷️ 已设置分类: "${todo.text}" → ${categoryName}`,
        todos: updated,
        affectedCount: 1,
      }
    }

    case 'SET_NOTES': {
      const todo = findTodo(todos, command.idOrText)
      if (!todo) {
        return { success: false, message: `❌ 未找到: "${command.idOrText}"` }
      }
      const updated = todos.map(t =>
        t.id === todo.id ? { ...t, notes: command.notes } : t
      )
      saveTodos(updated)
      return {
        success: true,
        message: `📝 已添加备注: "${todo.text}"`,
        todos: updated,
        affectedCount: 1,
      }
    }

    case 'CLEAR_COMPLETED': {
      const completedCount = todos.filter(t => t.completed).length
      const updated = todos.filter(t => !t.completed)
      saveTodos(updated)
      return {
        success: true,
        message: `🧹 已清除 ${completedCount} 个已完成事项`,
        todos: updated,
        affectedCount: completedCount,
      }
    }

    case 'HELP': {
      return {
        success: true,
        message: `📋 Agent CLI 命令帮助

添加待办:
  添加 <内容> [#分类] [@备注]
  例: 添加写文章 #工作 @灵感来源xxx

查看待办:
  list / ls / 显示     - 显示所有
  active / 待办        - 显示未完成
  completed / 已完成   - 显示已完成

操作待办:
  完成 <内容/ID>       - 标记完成
  取消完成 <内容/ID>   - 取消完成标记
  删除 <内容/ID>       - 删除待办
  编辑 <旧内容> 改为 <新内容>
  备注 <内容>: <备注文本>
  将 <内容> 分类为 <分类名>

其他:
  clear / 清理         - 清除所有已完成
  help / 帮助          - 显示此帮助`,
      }
    }

    default:
      return { success: false, message: '❌ 未知命令' }
  }
}

/**
 * 处理 Agent 输入（解析 + 执行）
 */
export function processAgentInput(input: string): CliResult {
  const command = parseCommand(input)
  if (!command) {
    return { success: false, message: '❌ 无法解析命令，输入 "help" 查看帮助' }
  }
  return executeCommand(command)
}

// 暴露到全局供浏览器控制台使用
declare global {
  interface Window {
    todoAgent: {
      exec: (input: string) => CliResult
      help: () => string
    }
  }
}

// 在浏览器环境中自动挂载
if (typeof window !== 'undefined') {
  window.todoAgent = {
    exec: (input: string) => {
      const result = processAgentInput(input)
      console.log(result.message)
      return result
    },
    help: () => {
      const result = executeCommand({ type: 'HELP' })
      console.log(result.message)
      return result.message
    },
  }
}
