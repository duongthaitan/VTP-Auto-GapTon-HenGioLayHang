# 📐 Quy Tắc Code – VTP Tool All-in-One
> Mọi thay đổi code trong project này phải tuân theo các quy tắc dưới đây.

---

## 1. Ngôn ngữ & Nền tảng

- **Chrome Extension Manifest V3** — Không dùng background scripts kiểu persistent, dùng `chrome.scripting.executeScript` thay thế.
- **Vanilla JS** — Không dùng framework (React, Vue...). Không import thư viện ngoài.
- **CSS thuần** — Không dùng Tailwind hay Bootstrap. Tất cả style viết trong `popup.css`.
- **Google Fonts: Inter** — Font chữ tiêu chuẩn cho toàn bộ UI.

---

## 2. Cấu trúc File

```
d:\Tool_Auto\
├── manifest.json            # Cấu hình extension
├── popup.html               # Giao diện popup
├── popup.css                # Style toàn bộ popup
├── popup.js                 # Logic điều khiển popup
├── notification.js          # Toast notification (inject vào tab)
├── chinhgio_content.js      # Content script: Tab Sửa Giờ
├── gapton_core_scan.js      # Content script: Tab Kiểm Tồn (lõi)
├── gapton_settings.js       # Cài đặt prefix (inject MAIN world)
├── gapton_smart_delay.js    # Hàm chờ thông minh (MutationObserver)
├── screenshots/             # Ảnh chụp UI để báo cáo
└── .agent/                  # Quy tắc code dành cho AI agent
    └── rules.md
```

**Quy tắc đặt tên file:**
- Content script của một tính năng: `<tenTinhNang>_content.js`
- Module dùng chung: `<tenTinhNang>_<chucNang>.js`
- Không dùng tiếng Việt có dấu trong tên file.

---

## 3. JavaScript – Quy Tắc Bắt Buộc

### 3.1 Async / Await
```js
// ✅ ĐÚNG — luôn dùng await khi gọi Chrome API
const result = await chrome.storage.local.get(['key']);

// ❌ SAI — không dùng callback lồng nhau
chrome.storage.local.get(['key'], (result) => { ... });
```

### 3.2 Error Handling
```js
// ✅ ĐÚNG — bọc chrome.scripting.executeScript trong try/catch
try {
    await chrome.scripting.executeScript({ ... });
} catch (e) {
    console.error('[VTP] Lỗi inject script:', e);
    alert('Thông báo lỗi cho user!');
}

// ❌ SAI — gọi không có await và không xử lý lỗi
chrome.scripting.executeScript({ ... });
```

### 3.3 Optional Chaining
```js
// ✅ ĐÚNG — dùng optional chaining cho thuộc tính có thể undefined
if (tab?.url?.includes('viettelpost')) { ... }

// ❌ SAI — crash nếu tab.url là undefined
if (tab.url.includes('viettelpost')) { ... }
```

### 3.4 Vòng lặp — Dùng while thay vì đệ quy
```js
// ✅ ĐÚNG — vòng lặp while cho xử lý hàng loạt
async function runAutomation() {
    while (true) {
        const data = await chrome.storage.local.get([...]);
        if (!data.isRunning) break;
        // ... xử lý ...
    }
}

// ❌ SAI — đệ quy tích lũy call stack với danh sách lớn
async function processNext() {
    // ...
    processNext(); // tự gọi lại
}
```

### 3.5 Guard Flag chống inject nhiều lần
```js
// ✅ ĐÚNG — mọi content script cần có guard ở đầu file
if (window.__VTP_SCRIPT_RUNNING__) {
    console.warn('[VTP] Script đã chạy, bỏ qua.');
} else {
    window.__VTP_SCRIPT_RUNNING__ = true;
    // ... code chính ...
    // Reset khi kết thúc:
    window.__VTP_SCRIPT_RUNNING__ = false;
}
```

### 3.6 DOM Waiting — Dùng MutationObserver thay vì setInterval
```js
// ✅ ĐÚNG — hiệu quả hơn, không busy-wait
const waitForElement = (selector, timeout = 8000) => {
    return new Promise((resolve) => {
        if (document.querySelector(selector)) return resolve(document.querySelector(selector));
        const observer = new MutationObserver(() => {
            const el = document.querySelector(selector);
            if (el) { observer.disconnect(); resolve(el); }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => { observer.disconnect(); resolve(null); }, timeout);
    });
};

// ❌ SAI — polling liên tục tốn CPU
setInterval(() => {
    if (document.querySelector(selector)) { clearInterval(id); ... }
}, 100);
```

### 3.7 Tránh sleep() mù — Chờ sự kiện có điều kiện
```js
// ✅ ĐÚNG — chờ có điều kiện thoát
let waited = 0;
while (waited < 6000) {
    await sleep(300);
    waited += 300;
    if (!document.querySelector('button.select-down')) break; // form đã đóng
}

// ❌ SAI — sleep cứng không kiểm tra kết quả
await sleep(3000);
```

---

## 4. CSS – Quy Tắc Bắt Buộc

### 4.1 Dùng CSS Custom Properties (Design Tokens)
```css
/* ✅ ĐÚNG — khai báo biến trong :root, dùng xuyên suốt */
:root {
    --red: #d4002d;
    --font: 'Inter', system-ui, sans-serif;
}
.btn-primary { background: var(--red); }

/* ❌ SAI — hard-code màu rải rác */
.btn-primary { background: #d4002d; }
```

### 4.2 Không dùng Inline Style trong HTML
```html
<!-- ✅ ĐÚNG -->
<span class="delay-label">Độ trễ:</span>

<!-- ❌ SAI -->
<span style="font-size: 13px; color: #444;">Độ trễ:</span>
```

### 4.3 Naming Convention cho CSS Class
- Dùng **kebab-case**: `.delay-card`, `.status-pill`, `.progress-fill`
- Nhóm theo component: `.page-check`, `.page-check-icon`, `.page-check-title`
- Prefix `vtp-` cho các element inject vào trang web: `#vtp-auto-ext-ui`, `.vtp-prefix-remove`

---

## 5. HTML – Quy Tắc Bắt Buộc

- Dùng **semantic HTML5**: `<header>`, `<nav>`, `<section>`, `<button>` (không dùng `<div>` cho button)
- Mọi `<input>` phải có `aria-label` hoặc `<label for="">`
- Mọi `<button>` tương tác phải có `title` hoặc `aria-label` mô tả hành động
- Không lồng inline style trong HTML

---

## 6. Security – Bắt Buộc

### 6.1 host_permissions phải tối thiểu
```json
// ✅ ĐÚNG — chỉ cấp quyền cho domain cần thiết
"host_permissions": [
    "*://*.viettelpost.vn/*",
    "*://*.viettelpost.com.vn/*"
]

// ❌ SAI — quá rộng, vi phạm nguyên tắc least privilege
"host_permissions": ["<all_urls>"]
```

### 6.2 Không eval() hay innerHTML không kiểm soát
```js
// ❌ SAI
element.innerHTML = userInput; // XSS risk

// ✅ ĐÚNG
element.textContent = userInput;
```

---

## 7. Chrome Storage – Quy Ước

| Key | Kiểu | Mô tả |
|-----|------|-------|
| `isRunning` | `boolean` | Tool Sửa Giờ đang chạy hay không |
| `billList` | `string[]` | Danh sách mã vận đơn |
| `currentIndex` | `number` | Chỉ số đang xử lý |
| `delay` | `number` | Số giây trễ tĩnh |

- Luôn `await` khi đọc/ghi storage.
- Không dùng `localStorage` trong extension context (chỉ dùng trong MAIN world nếu buộc phải).

---

## 8. Logging – Quy Ước Console

```js
// Prefix [VTP] cho mọi log liên quan đến extension
console.log('[VTP] Đang xử lý:', billCode);
console.warn('[VTP] Cảnh báo:', message);
console.error('[VTP] Lỗi:', error.message);
```

---

## 9. Comment – Quy Tắc

- Comment bằng tiếng Việt cho logic nghiệp vụ quan trọng.
- Không để lại commented-out code trong production. Nếu cần giữ lại, ghi rõ lý do.
- Dùng comment `// BƯỚC X:` để đánh dấu các bước trong automation flow.

---

## 10. Git – Quy Ước Commit

```
feat: mô tả tính năng mới
fix: mô tả bug đã sửa
refactor: cải thiện code không thay đổi chức năng
style: thay đổi giao diện/CSS
docs: cập nhật tài liệu
```

Ví dụ:
```
feat: them stepper button +/- cho delay setting
fix: guard chong inject script nhieu lan
refactor: chuyen de quy sang while loop
style: nang cap UI theo chuan Inter font + design tokens
```
