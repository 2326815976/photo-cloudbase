// 本地 UI 回归：页面和资源由 Next 开发服务器提供，API 全部在本机替换。
// 启动 Next（3136）后运行本文件；标准输入输入 ready / error 切换配置响应。
const http = require('node:http');
let mode = 'error';
process.stdin.on('data', (chunk) => {
  const next = String(chunk).trim();
  if (['ready', 'error'].includes(next)) { mode = next; console.log(`runtime mode: ${mode}`); }
});
const runtime = {
  navItems: [{ pageKey: 'profile', label: '我的', guestLabel: '我的', href: '/profile', iconKey: 'profile', isHomeEntry: true }],
  homePath: '/profile',
  pageAccessItems: [
    { pageKey: 'login', routePath: '/login', publishState: 'online' },
    { pageKey: 'profile', routePath: '/profile', publishState: 'online' },
  ],
  source: 'database',
};
http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost:3137').pathname;
  if (pathname.startsWith('/api/') || pathname.startsWith('/auth/')) {
    console.log(`${request.method} ${pathname} (${mode})`);
    let status = 200;
    let payload = { data: null, error: null };
    if (pathname === '/api/page-center/runtime') {
      status = mode === 'error' ? 500 : 200;
      payload = mode === 'error' ? { error: '运行时配置读取失败' } : runtime;
    } else if (pathname === '/api/auth/session') {
      payload = { data: { user: null }, error: null };
    } else if (pathname === '/api/health/ready') {
      payload = { ready: true };
    } else if (pathname.startsWith('/api/assets/')) {
      status = 404;
    }
    request.resume();
    response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify(payload));
    return;
  }
  const upstream = http.request({
    hostname: '127.0.0.1', port: 3136, path: request.url, method: request.method,
    headers: { ...request.headers, host: 'localhost:3137' },
  }, (incoming) => {
    response.writeHead(incoming.statusCode, incoming.headers);
    incoming.pipe(response);
  });
  upstream.on('error', () => { response.writeHead(502); response.end('Next dev server unavailable'); });
  request.pipe(upstream);
}).listen(3137, '127.0.0.1', () => console.log('UI fixture: http://localhost:3137/login (error mode)'));
