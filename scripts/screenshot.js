const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }
  });
  const page = await context.newPage();

  // 加载本地构建的文件
  const filePath = path.resolve(__dirname, '../dist/index.html');
  await page.goto(`file://${filePath}`);

  // 等待页面加载完成
  await page.waitForSelector('.app');

  // 添加一些示例数据
  await page.fill('.todo-input', '完成项目文档编写');
  await page.press('.todo-input', 'Enter');
  await page.fill('.todo-input', '回复客户邮件');
  await page.press('.todo-input', 'Enter');
  await page.fill('.todo-input', '准备周会汇报');
  await page.press('.todo-input', 'Enter');
  
  // 标记一个为完成
  await page.click('.todo-item:first-child .checkbox-btn');

  // 等待动画完成
  await page.waitForTimeout(500);

  // 截图 1: 主界面
  await page.screenshot({
    path: path.resolve(__dirname, '../docs/screenshot-main.png'),
    fullPage: true
  });

  // 截图 2: 编辑状态（双击第二个待办）
  await page.dblclick('.todo-item:nth-child(2) .todo-text');
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.resolve(__dirname, '../docs/screenshot-edit.png'),
    fullPage: true
  });

  // 取消编辑
  await page.press('.todo-edit-input', 'Escape');
  await page.waitForTimeout(300);

  // 截图 3: 数据菜单
  await page.click('.data-menu-trigger');
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.resolve(__dirname, '../docs/screenshot-menu.png'),
    fullPage: true
  });

  await browser.close();
  console.log('Screenshots saved to docs/ folder');
})();
