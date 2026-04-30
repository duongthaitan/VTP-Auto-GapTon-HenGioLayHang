/**
 * VTP Test Server – giả lập trang ViettelPost nội bộ
 * Chạy: node server.js
 * URL : http://localhost:3000/viettelpost/kiem-ke-buu-pham
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = 3000;
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js'  : 'application/javascript',
    '.css' : 'text/css',
    '.png' : 'image/png',
    '.ico' : 'image/x-icon',
};

const server = http.createServer((req, res) => {
    // Strip query string
    let urlPath = req.url.split('?')[0];
    let filePath;

    // Route: /src/ hoặc /assets/ -> Serve từ project root (2 cấp lên từ __dirname)
    if (urlPath.startsWith('/src/') || urlPath.startsWith('/assets/')) {
        filePath = path.join(__dirname, '..', '..', urlPath);
    } 
    // Route: /  hoặc  /viettelpost/kiem-ke-buu-pham  → page1
    else if (urlPath === '/' || urlPath === '/viettelpost/kiem-ke-buu-pham' || urlPath === '/viettelpost') {
        filePath = path.join(__dirname, '/page1_list.html');
    }
    // Route: /viettelpost/scan  → page2
    else if (urlPath === '/viettelpost/scan') {
        filePath = path.join(__dirname, '/page2_scan.html');
    }
    // Route: /viettelpost/scan-empty  → page3 (tab chưa kiểm kê trống)
    else if (urlPath === '/viettelpost/scan-empty') {
        filePath = path.join(__dirname, '/page3_scan_empty.html');
    }
    // Route: /viettelpost/hoan-thanh  → page4 (test Hoàn thành)
    else if (urlPath === '/viettelpost/hoan-thanh') {
        filePath = path.join(__dirname, '/page4_hoan_thanh.html');
    }
    // Route: /tests/kiemke-modules → test runner cho module kiểm kê
    else if (urlPath === '/tests/kiemke-modules') {
        filePath = path.join(__dirname, '/kiemke_modules_test.html');
    } else {
        filePath = path.join(__dirname, urlPath);
    }

    const ext = path.extname(filePath);

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end(`404 Not Found: ${urlPath}`);
            return;
        }
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`\n✅ VTP Test Server đang chạy tại:`);
    console.log(`   http://localhost:${PORT}/viettelpost/kiem-ke-buu-pham`);
    console.log(`   http://localhost:${PORT}/viettelpost/scan`);
    console.log(`   http://localhost:${PORT}/viettelpost/scan-empty  ← TEST: tab trống`);
    console.log(`   http://localhost:${PORT}/viettelpost/hoan-thanh  ← TEST: Hoàn thành (3 kịch bản)`);
    console.log(`\nNhấn Ctrl+C để dừng.\n`);
});
