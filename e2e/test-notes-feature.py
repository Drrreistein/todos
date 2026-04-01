"""E2E 测试：验证待办详情展开/编辑功能"""
from playwright.sync_api import sync_playwright

def test_notes_feature():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1280, 'height': 800})
        
        # 1. 打开页面
        page.goto('http://localhost:5173/todos/')
        page.wait_for_load_state('networkidle')
        
        # 2. 添加一条待办
        input_box = page.locator('[aria-label="新建待办事项"]')
        input_box.fill('写文章')
        input_box.press('Enter')
        
        # 3. 验证待办出现在列表中
        todo_item = page.locator('.todo-text:has-text("写文章")')
        assert todo_item.is_visible(), "待办事项应显示在列表中"
        
        # 4. 悬停待办，验证展开按钮出现
        todo_item.hover()
        expand_btn = page.locator('[aria-label="展开详情"]')
        assert expand_btn.is_visible(), "悬停时应显示展开按钮"
        
        # 5. 点击展开按钮
        expand_btn.click()
        
        # 6. 验证 textarea 出现
        textarea = page.locator('[aria-label="待办详情"]')
        assert textarea.is_visible(), "点击展开后应显示 textarea"
        
        # 7. 输入详情文本
        textarea.fill("灵感来源：xxx\n参考资料：yyy")
        
        # 8. 验证有详情标记出现
        note_indicator = page.locator('.note-indicator')
        assert note_indicator.is_visible(), "输入详情后应显示详情标记"
        
        # 9. 点击收起按钮
        collapse_btn = page.locator('[aria-label="收起详情"]')
        collapse_btn.click()
        
        # 10. 验证 textarea 收起，但详情标记仍在
        assert not textarea.is_visible(), "收起后 textarea 应隐藏"
        assert note_indicator.is_visible(), "收起后详情标记应仍显示"
        
        # 11. 刷新页面，验证数据持久化
        page.reload()
        page.wait_for_load_state('networkidle')
        
        # 12. 验证待办和详情标记仍在
        todo_item = page.locator('.todo-text:has-text("写文章")')
        assert todo_item.is_visible(), "刷新后待办应仍存在"
        note_indicator = page.locator('.note-indicator')
        assert note_indicator.is_visible(), "刷新后详情标记应仍存在"
        
        # 13. 展开验证详情内容
        todo_item.hover()
        expand_btn = page.locator('[aria-label="展开详情"]')
        expand_btn.click()
        textarea = page.locator('[aria-label="待办详情"]')
        assert "灵感来源：xxx" in textarea.input_value(), "刷新后详情内容应保留"
        
        print("✅ 所有测试通过！")
        browser.close()

if __name__ == '__main__':
    test_notes_feature()
