/**
 * 云端存储层 - 基于 GitHub Gist
 *
 * 替代纯 localStorage，实现多端数据同步。
 *
 * 原理：
 *   读写操作 → 先更新 localStorage（即时响应）→ 异步推送到 GitHub Gist
 *   页面加载 → 从 Gist 拉取最新数据 → 覆盖本地
 *   冲突策略：Last Write Wins + 版本号检测
 *
 * 使用方式：
 *   1. 用户在设置中填入 GitHub Personal Access Token 和 Gist ID
 *   2. 自动开启云同步，对上层 API 完全透明
 */

import type { Todo } from './todo'

// ── 类型定义 ─────────────────────────────────────

/** 云存储配置 */
export interface CloudConfig {
  token: string       // GitHub Personal Access Token (需要 gist scope)
  gistId: string      // Gist ID (已存在的或新建的)
  filename?: string   // Gist 中的文件名，默认 todos.json
}

/** 同步状态 */
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline'

/** 存储事件 */
export type CloudEventType =
  | 'status-change'
  | 'remote-update'
  | 'sync-error'
  | 'config-change'

export interface CloudEvent {
  type: CloudEventType
  status?: SyncStatus
  error?: string
  data?: unknown
}

/** 云存储事件监听器 */
type CloudEventListener = (event: CloudEvent) => void

// ── 常量 ─────────────────────────────────────────

const STORAGE_KEY_CONFIG = 'todo-cloud-config'
const DEFAULT_FILENAME = 'todos.json'
const GIST_API = 'https://api.github.com/gists'
const SYNC_DEBOUNCE_MS = 1000        // 防抖：操作后 1s 才推送
const POLL_INTERVAL_MS = 30_000      // 轮询：每 30s 检查远程更新
const MAX_RETRIES = 2                // 推送失败重试次数

// ── CloudStore 核心 ───────────────────────────────

class CloudStore {
  private config: CloudConfig | null = null
  private status: SyncStatus = 'idle'
  private listeners: CloudEventListener[] = []
  private syncTimer: ReturnType<typeof setTimeout> | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private version: number = 0         // 本地版本号（用于冲突检测）
  private remoteVersion: number = -1  // 远程版本号
  private isPushing = false           // 正在推送中（防止并发）
  private _pendingSync = false      // 有待推送的变更

  /** 是否有待同步的变更（供外部查询） */
  get hasPendingSync(): boolean { return this._pendingSync }

  // ── 配置管理 ──

  /** 从 localStorage 加载配置 */
  loadConfig(): CloudConfig | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CONFIG)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (parsed.token && parsed.gistId) {
        this.config = parsed
        this.emit({ type: 'config-change', data: this.config })
        return this.config
      }
    } catch { /* ignore */ }
    return null
  }

  /** 保存配置到 localStorage 并激活云同步 */
  saveConfig(config: CloudConfig): void {
    this.config = config
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config))
    this.emit({ type: 'config-change', data: config })

    // 如果之前没有配置，现在有了 → 启动轮询
    if (!this.pollTimer) {
      this.startPolling()
    }

    // 立即执行一次拉取
    void this.pull()
  }

  /** 清除配置并停止同步 */
  clearConfig(): void {
    this.config = null
    localStorage.removeItem(STORAGE_KEY_CONFIG)
    this.stopPolling()
    this.setStatus('idle')
    this.emit({ type: 'config-change', data: null })
  }

  getConfig(): CloudConfig | null {
    return this.config
  }

  // ── 状态管理 ──

  getStatus(): SyncStatus {
    return this.status
  }

  isEnabled(): boolean {
    return !!(this.config?.token && this.config?.gistId)
  }

  private setStatus(status: SyncStatus): void {
    if (this.status === status) return
    this.status = status
    this.emit({ type: 'status-change', status })
  }

  // ── 事件系统 ──

  onEvent(listener: CloudEventListener): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener)
    }
  }

  private emit(event: CloudEvent): void {
    for (const cb of this.listeners) {
      try { cb(event) } catch { /* ignore */ }
    }
  }

  // ── 核心同步方法 ──

  /**
   * 推送数据到云端（带防抖）
   * 每次 localStorage 写入后调用此方法
   */
  push(todos: Todo[]): void {
    if (!this.isEnabled()) return

    this._pendingSync = true
    this.version++

    // 防抖：取消之前的定时器，重新计时
    if (this.syncTimer) {
      clearTimeout(this.syncTimer)
    }

    this.syncTimer = setTimeout(() => {
      void this.doPush(todos)
    }, SYNC_DEBOUNCE_MS)
  }

  /**
   * 从云端拉取最新数据
   * 返回 null 表示无更新或出错，返回数组表示有新数据需合并
   */
  async pull(): Promise<Todo[] | null> {
    if (!this.isEnabled()) return null

    this.setStatus('syncing')
    try {
      const result = await this.fetchGist()
      if (!result) return null

      const { content, remoteVersion: rv } = result

      // 远程没变化
      if (rv === this.remoteVersion && rv >= 0) {
        this.setStatus('synced')
        return null
      }

      // 首次拉取 或 远程有新版本
      this.remoteVersion = rv
      const parsed = this.parseContent(content)

      if (parsed && parsed.length > 0) {
        this.setStatus('synced')
        this.version = rv
        this.emit({ type: 'remote-update', status: 'synced', data: parsed })
        return parsed
      }

      this.setStatus('synced')
      return null
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.setStatus('error')
      this.emit({ type: 'sync-error', error: msg })
      console.warn('[CloudStore] pull failed:', msg)
      return null
    }
  }

  // ── 内部实现 ──

  private async doPush(todos: Todo[], retryCount = 0): Promise<void> {
    if (!this.isEnabled() || this.isPushing) return

    this.isPushing = true
    this.setStatus('syncing')

    try {
      await this.updateGist(todos)
      this.remoteVersion = this.version
      this._pendingSync = false
      this.setStatus('synced')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (retryCount < MAX_RETRIES) {
        // 指数退避重试
        const delay = 1000 * Math.pow(2, retryCount)
        console.warn(`[CloudStore] push retry ${retryCount + 1} in ${delay}ms`)
        await new Promise(r => setTimeout(r, delay))
        await this.doPush(todos, retryCount + 1)
        return
      }
      this.setStatus('error')
      this.emit({ type: 'sync-error', error: msg })
      console.error('[CloudStore] push failed:', msg)
    } finally {
      this.isPushing = false
    }
  }

  private getFilename(): string {
    return this.config?.filename || DEFAULT_FILENAME
  }

  private getHeaders(): HeadersInit {
    return {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `Bearer ${this.config!.token}`,
      'User-Agent': 'todo-app-cloud-sync',
      'X-GitHub-Api-Version': '2022-11-28',
    }
  }

  /** 获取 Gist 内容和版本信息 */
  private async fetchGist(): Promise<{ content: string; remoteVersion: number } | null> {
    const url = `${GIST_API}/${this.config!.gistId}`
    const resp = await fetch(url, { headers: this.getHeaders() })

    if (resp.status === 404) {
      throw new Error(`Gist not found (${this.config!.gistId}). 请检查 Gist ID 是否正确。`)
    }
    if (resp.status === 401 || resp.status === 403) {
      throw new Error(`GitHub 认证失败 (HTTP ${resp.status})。请检查 Token 是否有效且有 gist 权限。`)
    }
    if (!resp.ok) {
      throw new Error(`GitHub API 错误: HTTP ${resp.status}`)
    }

    const gist = await resp.json() as { files?: Record<string, unknown>; updated_at?: string }
    const filename = this.getFilename()
    const file = gist.files?.[filename] as { content?: string } | undefined

    if (!file || !file.content) {
      // Gist 存在但文件为空 → 返回空内容
      return { content: '[]', remoteVersion: 0 }
    }

    // 用 Gist 的 updated_at 作为简单版本标识
    const updatedAt = gist.updated_at || ''
    const remoteVersion = updatedAt ? new Date(updatedAt).getTime() : Date.now()

    return { content: String(file.content), remoteVersion }
  }

  /** 更新 Gist 内容 */
  private async updateGist(todos: Todo[]): Promise<void> {
    const filename = this.getFilename()
    const content = JSON.stringify(todos, null, 2)
    const body = {
      description: '📋 Todos 云端同步数据 (auto-sync)',
      files: {
        [filename]: {
          content,
        },
      },
    }

    const resp = await fetch(`${GIST_API}/${this.config!.gistId}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    })

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      throw new Error(`Gist 更新失败: HTTP ${resp.status} — ${errText}`)
    }
  }

  private parseContent(content: string): Todo[] | null {
    try {
      const data = JSON.parse(content)
      if (!Array.isArray(data)) return null
      // 基本校验
      const valid = data.every(
        (item: unknown) =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as Record<string, unknown>).id === 'string' &&
          typeof (item as Record<string, unknown>).text === 'string'
      )
      return valid ? (data as Todo[]) : null
    } catch {
      return null
    }
  }

  // ── 轮询 ──

  private startPolling(): void {
    if (this.pollTimer) return
    this.pollTimer = setInterval(() => {
      if (this.isEnabled()) {
        void this.pull()
      }
    }, POLL_INTERVAL_MS)
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    if (this.syncTimer) {
      clearTimeout(this.syncTimer)
      this.syncTimer = null
    }
  }

  /** 清理资源（组件卸载时调用） */
  destroy(): void {
    this.stopPolling()
    this.listeners = []
  }
}

// ── 导出单例 ───────────────────────────────────────

export const cloudStore = new CloudStore()

/** 全局暴露（供调试和控制台使用） */
if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).cloudStore = cloudStore
}
