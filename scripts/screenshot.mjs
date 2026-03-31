import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { readFile } from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 简单的静态文件服务器
async function startServer() {
  const server = createServer(async (req, res) => {
    const url = req.url === '/' ? '/index.html' : req.url;
    const filePath = path.join(__dirname, '../dist', url.replace('/todos', ''));
    
    try {
      const content = await readFile(filePath);
      const ext = path.extname(filePath);
      const contentType = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css'
      }[ext] || 'text/plain';
      
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  return new Promise((resolve) => {
    server.listen(3456, () => {
      console.log('Server running on http://localhost:3456');
      resolve(server);
    });
  });
}

(async () => {
  const server = await startServer();
  
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }
  });
  const page = await context.newPage();

  // 加载本地服务器
  await page.goto('http://localhost:3456');

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
  console.log('✓ screenshot-main.png');

  // 截图 2: 编辑状态（双击第二个待办）
  await page.dblclick('.todo-item:nth-child(2) .todo-text');
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.resolve(__dirname, '../docs/screenshot-edit.png'),
    fullPage: true
  });
  console.log('✓ screenshot-edit.png');

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
  console.log('✓ screenshot-menu.png');

  await browser.close();
  server.close();
  console.log('\nAll screenshots saved to docs/ folder');
})();
