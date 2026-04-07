/**
 * 旧的命令行解析器 - 仅保留给 todo-api.ts 的 exec() 内部使用
 * 新代码应直接使用 todoApi 的结构化 API
 */

import type { CliCommand } from './agent-cli.ts'

// 分类名称映射
const CATEGORY_ALIASES: Record<string, string> = {
  'work': 'work', '工作': 'work', '办公': 'work', 'job': 'work',
  'personal': 'personal', '生活': 'personal', '私人': 'personal', 'home': 'personal',
  'study': 'study', '学习': 'study', '读书': 'study', 'school': 'study',
  'health': 'health', '健康': 'health', '运动': 'health', 'fitness': 'health',
}

export function parseCommand(input: string): CliCommand | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  if (/^help$|^帮助$|^\?$|^--help$|^\-h$/i.test(trimmed)) return { type: 'HELP' }
  if (/^list$|^ls$|^显示$|^列出$|^查看所有$/i.test(trimmed)) return { type: 'LIST', filter: 'all' }
  if (/^active$|^待办$|^未完成$|^待完成$/i.test(trimmed)) return { type: 'LIST', filter: 'active' }
  if (/^completed$|^已完成$|^完成$/i.test(trimmed)) return { type: 'LIST', filter: 'completed' }
  if (/^clear$|^清理$|^清除已完成$|^clear completed$/i.test(trimmed)) return { type: 'CLEAR_COMPLETED' }

  const addMatch = trimmed.match(/^(?:添加|add|新建|new|create|\+)\s+(.+)$/i)
  if (addMatch) return parseAddContent(addMatch[1].trim())

  const completeMatch = trimmed.match(/^(?:完成|done|check|tick|✓|✔)\s+(.+)$/i)
  if (completeMatch) return { type: 'COMPLETE', idOrText: completeMatch[1].trim() }

  const uncompleteMatch = trimmed.match(/^(?:取消完成|uncheck|undo)\s+(.+)$/i)
  if (uncompleteMatch) return { type: 'UNCOMPLETE', idOrText: uncompleteMatch[1].trim() }

  const deleteMatch = trimmed.match(/^(?:删除|delete|del|remove|rm|-)\s+(.+)$/i)
  if (deleteMatch) return { type: 'DELETE', idOrText: deleteMatch[1].trim() }

  const editMatch = trimmed.match(/^(?:编辑|edit|修改|update)\s+(.+?)\s+(?:改为|to|成|->)\s+(.+)$/i)
  if (editMatch) return { type: 'EDIT', idOrText: editMatch[1].trim(), newText: editMatch[2].trim() }

  const categoryMatch = trimmed.match(/^(?:将|set)?\s*(.+?)\s*(?:分类为|分类|category|归类为)\s*(.+)$/i)
  if (categoryMatch) {
    const cat = CATEGORY_ALIASES[categoryMatch[2].trim()] || categoryMatch[2].trim()
    return { type: 'SET_CATEGORY', idOrText: categoryMatch[1].trim(), category: cat }
  }

  const notesMatch = trimmed.match(/^(?:备注|note)\s+(.+?)[:：]\s*(.+)$/i) ||
                     trimmed.match(/^(.+?)\s*(?:的备注|的笔记|notes?)[:：]\s*(.+)$/i)
  if (notesMatch) return { type: 'SET_NOTES', idOrText: notesMatch[1].trim(), notes: notesMatch[2].trim() }

  return parseAddContent(trimmed)
}

function parseAddContent(content: string): CliCommand {
  let text = content
  let category: string | undefined
  let notes: string | undefined

  const catMatch = content.match(/[#\[]([^#\[\]\n]+)[#\]]/)
  if (catMatch) {
    category = CATEGORY_ALIASES[catMatch[1].trim()] || catMatch[1].trim()
    text = text.replace(catMatch[0], '').trim()
  }

  const notesPattern = new RegExp('[@(（【]([^@(（【\\n]+)[@)）】]')
  const notesMatch = content.match(notesPattern)
  if (notesMatch) {
    notes = notesMatch[1].trim()
    text = text.replace(notesMatch[0], '').trim()
  }

  text = text.replace(/\s+/g, ' ').trim()
  return { type: 'ADD', text, category, notes }
}
