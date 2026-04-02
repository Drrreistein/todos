#!/usr/bin/env python3
"""
E2E Test: Agent CLI 功能测试
测试通过 Agent CLI 面板增删改查待办事项
"""

import subprocess
import sys
import time

def run_test():
    """运行 Agent CLI E2E 测试"""
    
    print("=" * 60)
    print("E2E Test: Agent CLI")
    print("=" * 60)
    
    # 启动开发服务器
    print("\n[1/6] 启动开发服务器...")
    server = subprocess.Popen(
        ["npm", "run", "dev"],
        cwd="/Users/a1-6/WorkBuddy/20260331112226/projects/todo-app",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    
    # 等待服务器启动
    time.sleep(3)
    
    try:
        # 使用 Playwright 进行测试
        print("[2/6] 运行 Playwright 测试...")
        
        test_script = """
const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // 清空 localStorage
    await page.goto('http://localhost:5173/todos/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    
    console.log('✓ 页面加载完成');
    
    // 测试 1: Agent 面板显示
    const agentPanel = await page.locator('.agent-panel');
    await agentPanel.waitFor({ state: 'visible' });
    console.log('✓ Agent 面板已显示');
    
    // 测试 2: 添加待办（通过 Agent CLI）
    const agentInput = page.locator('.agent-input');
    await agentInput.fill('添加测试任务 #工作 @测试备注');
    await agentInput.press('Enter');
    
    // 等待结果显示
    await page.waitForTimeout(500);
    const result = await page.locator('.agent-result').textContent();
    console.log('Agent 结果:', result);
    
    if (!result.includes('已添加') && !result.includes('测试任务')) {
        throw new Error('添加命令执行失败');
    }
    console.log('✓ 通过 Agent CLI 添加待办成功');
    
    // 验证待办已添加到列表
    await page.waitForTimeout(500);
    const todoText = await page.locator('.todo-text').first().textContent();
    if (todoText !== '测试任务') {
        throw new Error(`待办内容不匹配: ${todoText}`);
    }
    console.log('✓ 待办已正确添加到列表');
    
    // 测试 3: 列出待办
    await agentInput.fill('list');
    await agentInput.press('Enter');
    await page.waitForTimeout(500);
    const listResult = await page.locator('.agent-result').textContent();
    if (!listResult.includes('测试任务')) {
        throw new Error('列出命令未显示待办');
    }
    console.log('✓ list 命令工作正常');
    
    // 测试 4: 完成待办
    await agentInput.fill('完成 测试任务');
    await agentInput.press('Enter');
    await page.waitForTimeout(500);
    const completeResult = await page.locator('.agent-result').textContent();
    if (!completeResult.includes('已完成')) {
        throw new Error('完成命令执行失败');
    }
    console.log('✓ 完成命令工作正常');
    
    // 验证待办已完成
    const completedTodo = await page.locator('.todo-item.completed').first();
    await completedTodo.waitFor({ state: 'visible' });
    console.log('✓ 待办已标记为完成');
    
    // 测试 5: 编辑待办
    await agentInput.fill('编辑 测试任务 改为 修改后的任务');
    await agentInput.press('Enter');
    await page.waitForTimeout(500);
    const editResult = await page.locator('.agent-result').textContent();
    if (!editResult.includes('已修改')) {
        throw new Error('编辑命令执行失败');
    }
    console.log('✓ 编辑命令工作正常');
    
    // 测试 6: 删除待办
    await agentInput.fill('删除 修改后的任务');
    await agentInput.press('Enter');
    await page.waitForTimeout(500);
    const deleteResult = await page.locator('.agent-result').textContent();
    if (!deleteResult.includes('已删除')) {
        throw new Error('删除命令执行失败');
    }
    console.log('✓ 删除命令工作正常');
    
    // 验证待办已删除
    await page.waitForTimeout(500);
    const emptyState = await page.locator('.empty-state').isVisible().catch(() => false);
    const todoCount = await page.locator('.todo-item').count();
    if (!emptyState && todoCount > 0) {
        throw new Error('待办未被删除');
    }
    console.log('✓ 待办已正确删除');
    
    // 测试 7: 帮助命令
    await agentInput.fill('help');
    await agentInput.press('Enter');
    await page.waitForTimeout(500);
    const helpResult = await page.locator('.agent-result').textContent();
    if (!helpResult.includes('帮助') && !helpResult.includes('添加')) {
        throw new Error('帮助命令未显示帮助信息');
    }
    console.log('✓ help 命令工作正常');
    
    await browser.close();
    console.log('\\n✅ 所有测试通过！');
})();
"""
        
        # 写入测试脚本
        with open('/tmp/agent-cli-test.js', 'w') as f:
            f.write(test_script)
        
        # 运行测试
        result = subprocess.run(
            ['node', '/tmp/agent-cli-test.js'],
            capture_output=True,
            text=True,
            timeout=60
        )
        
        print(result.stdout)
        if result.stderr:
            print("STDERR:", result.stderr)
        
        if result.returncode != 0:
            print("❌ 测试失败")
            return False
            
        print("\n" + "=" * 60)
        print("✅ 所有 E2E 测试通过！")
        print("=" * 60)
        return True
        
    finally:
        # 关闭服务器
        print("\n[6/6] 关闭开发服务器...")
        server.terminate()
        server.wait()

if __name__ == "__main__":
    success = run_test()
    sys.exit(0 if success else 1)
