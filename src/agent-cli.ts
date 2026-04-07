/**
 * @deprecated 请使用 todo-api.ts
 * 
 * 此文件保留向后兼容。
 * 新代码应直接 import from './todo-api'
 */

export {
  todoApi,
  processAgentInput,
  type AddTodoParams,
  type UpdateTodoParams,
  type ListFilter,
  type ApiResult,
  type TodoJson,
  type ChangeType,
  type ChangeCallback,
} from './todo-api'

// 向后兼容的 CliCommand 类型（旧版）
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

// 向后兼容的 CliResult
export interface CliResult {
  success: boolean
  message: string
  todos?: unknown[]
  affectedCount?: number
}
