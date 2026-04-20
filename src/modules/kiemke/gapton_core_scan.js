// ============================================================
//  VTP Tool – Kiểm Tồn Core Scan
//  v1.3 Reliability Fix
//    TH1: Tab "chưa kiểm kê" có mã → scan tự động → click Hoàn thành → 2s → F5
//    TH2: Tab "chưa kiểm kê" trống → click Hoàn thành → 2s → F5
//
//  Thay đổi so với v1.2:
//    [+] waitForTabContentReady(): Chờ nội dung tab load đúng cách
//        thay vì setTimeout cứng 1s → tránh false-positive TH2
//    [+] isUnscannedTabEmpty(): Kiểm tra visibility của <td> cha
//        (.z-listbox-emptybody-content có thể tồn tại nhưng bị ẩn)
//    [+] Hỗ trợ nhiều selector empty-state (ZK + test server)
//    [+] Guard chống inject lại khi scan đang chạy
// ============================================================
if (window.__VTP_CORE_SCAN_RUNNING__) {
    console.warn('[VTP Core] Script đã đang chạy. Bỏ qua inject mới.');
} else {
window.__VTP_CORE_SCAN_RUNNING__ = true;

(async () => {
    const MAX_HISTORY = 80;

    // ════════════════════════════════════════════════════════════
    //  HELPER: Switch sang tab "Bưu phẩm chưa kiểm kê"
    //  3 chiến lược fallback theo cấu trúc ZK Framework
    // ════════════════════════════════════════════════════════════
    async function switchToUnscannedTab() {
        let clickTarget = null;
        let parentLi    = null;

        // Chiến lược 1: span.z-tab-text có title/text "chưa kiểm kê"
        for (const span of document.querySelectorAll('.z-tab-text')) {
            const title = (span.getAttribute('title') || '').trim();
            const txt   = (span.textContent || '').trim();
            if (title.includes('chưa kiểm kê') || txt.includes('chưa kiểm kê') ||
                title.includes('Chưa kiểm kê') || txt.includes('Chưa kiểm kê')) {
                const anchor = span.closest('a.z-tab-content') || span.closest('a');
                parentLi     = span.closest('li.z-tab') || span.closest('li');
                clickTarget  = anchor || parentLi || span;
                break;
            }
        }

        // Chiến lược 2: a.z-tab-content chứa text "chưa kiểm kê"
        if (!clickTarget) {
            for (const a of document.querySelectorAll('a.z-tab-content')) {
                const txt = (a.innerText || a.textContent || '').trim();
                if (txt.includes('chưa kiểm kê') || txt.includes('Chưa kiểm kê')) {
                    clickTarget = a;
                    parentLi    = a.closest('li.z-tab') || a.closest('li');
                    break;
                }
            }
        }

        // Chiến lược 3: li.z-tab chứa text "chưa kiểm kê"
        if (!clickTarget) {
            for (const li of document.querySelectorAll('li.z-tab')) {
                const txt = (li.innerText || li.textContent || '').trim();
                if (txt.includes('chưa kiểm kê') || txt.includes('Chưa kiểm kê')) {
                    clickTarget = li;
                    parentLi    = li;
                    break;
                }
            }
        }

        if (!clickTarget) {
            console.warn('[VTP Core] ❌ Không tìm thấy tab "Bưu phẩm chưa kiểm kê" – tiếp tục với tab hiện tại');
            return false;
        }

        // Tab đã được chọn sẵn → không cần click
        if (parentLi && parentLi.classList.contains('z-tab-selected')) {
            console.log('[VTP Core] ✅ Tab "Bưu phẩm chưa kiểm kê" đã được chọn sẵn');
            return true;
        }

        console.log('[VTP Core] Clicking tab chưa kiểm kê:', clickTarget.tagName, clickTarget.className);
        clickTarget.click();

        // Đợi z-tab-selected xuất hiện (tối đa 10s, poll 500ms)
        const deadline = Date.now() + 10000;
        while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 500));
            const refreshLi = parentLi || clickTarget.closest('li.z-tab');
            if (refreshLi && refreshLi.classList.contains('z-tab-selected')) {
                console.log('[VTP Core] ✅ Tab chưa kiểm kê đã chuyển (z-tab-selected)');
                await new Promise(r => setTimeout(r, 1000)); // Buffer render
                return true;
            }
        }

        console.log('[VTP Core] ⚠️ Đã click tab nhưng chưa xác nhận z-tab-selected. Tiếp tục...');
        return true;
    }

    // ════════════════════════════════════════════════════════════
    //  HELPER: Chờ nội dung tab "chưa kiểm kê" load xong
    //  Trả về: 'has_codes' | 'empty' | 'timeout'
    //
    //  Logic:
    //    Phase 1 – Chờ loading indicator biến mất (tối đa 5s)
    //    Phase 2 – Poll xác định trạng thái:
    //      • Có mã hợp lệ → 'has_codes'
    //      • Empty body element hiển thị → 'empty'
    //      • Hết timeout → 'timeout'
    // ════════════════════════════════════════════════════════════
    async function waitForTabContentReady(timeoutMs = 10000) {
        const start = Date.now();

        // Phase 1: Chờ loading indicator biến mất
        const loadDeadline = start + 5000;
        while (Date.now() < loadDeadline) {
            const loading = document.querySelector(
                '.z-loading-indicator, .z-apply-loading-indicator, .z-listbox-loading'
            );
            const isLoading = loading &&
                loading.style.display !== 'none' &&
                loading.offsetParent !== null;
            if (!isLoading) break;
            await new Promise(r => setTimeout(r, 300));
        }

        // Phase 2: Poll cho đến khi xác định được trạng thái
        while (Date.now() - start < timeoutMs) {
            await new Promise(r => setTimeout(r, 350));

            // Kiểm tra có mã hợp lệ → TH1
            if (getValidCodes().length > 0) {
                console.log('[VTP Core] waitForTabContentReady → has_codes');
                return 'has_codes';
            }

            // Kiểm tra empty state (nhiều cách để hỗ trợ cả ZK và test page)
            if (isUnscannedTabEmpty()) {
                console.log('[VTP Core] waitForTabContentReady → empty');
                return 'empty';
            }
        }

        console.warn('[VTP Core] waitForTabContentReady → timeout sau', timeoutMs, 'ms');
        return 'timeout';
    }

    // ════════════════════════════════════════════════════════════
    //  HELPER: Xác định tab "chưa kiểm kê" có trống không
    //  Hỗ trợ 3 cách hiển thị empty state:
    //    1. ZK: .z-listbox-emptybody-content bên trong <td> hiển thị
    //    2. ZK: emptybody <td> có display='table-cell'
    //    3. Fallback: .empty-state text / text tổng quát
    // ════════════════════════════════════════════════════════════
    function isUnscannedTabEmpty() {
        // Cách 1: ZK listbox emptybody element
        const emptyBodyEl = document.querySelector('.z-listbox-emptybody-content');
        if (emptyBodyEl) {
            const parentTd = emptyBodyEl.closest('td');
            if (parentTd) {
                // Nếu parentTd bị ẩn (display:none) → list CÓ data, không phải empty
                const tdDisplay = parentTd.style.display;
                const computed  = getComputedStyle(parentTd).display;
                const isHidden  = tdDisplay === 'none' || computed === 'none';
                if (!isHidden) {
                    console.log('[VTP Core] Empty: .z-listbox-emptybody-content visible');
                    return true;
                }
            } else {
                // Không có td cha → element tồn tại là đủ
                console.log('[VTP Core] Empty: .z-listbox-emptybody-content (no td parent)');
                return true;
            }
        }

        // Cách 2: td[id$="-empty"] có display:table-cell (cấu trúc ZK chuẩn)
        const emptyTd = document.querySelector('td[id$="-empty"]');
        if (emptyTd) {
            const tdDisplay = emptyTd.style.display || getComputedStyle(emptyTd).display;
            if (tdDisplay !== 'none' && tdDisplay !== '') {
                console.log('[VTP Core] Empty: td[id$="-empty"] visible, text:', emptyTd.textContent.trim().slice(0, 50));
                return true;
            }
        }

        // Cách 3: .empty-state class (test server fallback)
        const emptyStateEl = document.querySelector('.empty-state');
        if (emptyStateEl && emptyStateEl.offsetParent !== null) {
            console.log('[VTP Core] Empty: .empty-state visible');
            return true;
        }

        return false;
    }

    // ════════════════════════════════════════════════════════════
    //  HELPER: Lấy danh sách mã hợp lệ trên trang
    //  Dùng Set để deduplicate (tránh ZK render trùng)
    // ════════════════════════════════════════════════════════════
    function getValidCodes() {
        const cells         = document.querySelectorAll('.z-listcell-content');
        const validPrefixes = window.VTPSettings
            ? window.VTPSettings.getPrefixes()
            : ['SHOPEE', 'VTP', 'VGI', 'PKE', 'KMS', 'PSL', 'TPO'];

        const data = [];
        const seen = new Set();
        cells.forEach(cell => {
            const code = cell.innerText.trim().replace(/\s+/g, '');
            if (code.length >= 8 && !seen.has(code)) {
                const isStandard = /^[a-zA-Z0-9.\-_\/+]{8,50}$/.test(code);
                const hasPrefix  = validPrefixes.some(p => code.toUpperCase().startsWith(p));
                if (isStandard || hasPrefix) {
                    seen.add(code);
                    data.push({ element: cell, code });
                }
            }
        });
        return data;
    }

    // ════════════════════════════════════════════════════════════
    //  HELPER: Lật trang tiếp theo
    // ════════════════════════════════════════════════════════════
    function clickNextPage() {
        const nextBtn = document.querySelector('.z-paging-next');
        if (!nextBtn || nextBtn.hasAttribute('disabled') || nextBtn.classList.contains('z-disabled')) return false;
        nextBtn.click();
        return true;
    }

    // ════════════════════════════════════════════════════════════
    //  HELPER: Click nút "Hoàn thành"
    //  Chiến lược 1: span.z-label text = "Hoàn thành"
    //  Chiến lược 2: Bất kỳ element lá nào có text "Hoàn thành"
    // ════════════════════════════════════════════════════════════
    async function clickHoanThanh() {
        let btn = null;

        // Chiến lược 1: span.z-label đúng text
        for (const el of document.querySelectorAll('span.z-label')) {
            if ((el.textContent || '').trim() === 'Hoàn thành') { btn = el; break; }
        }

        // Chiến lược 2: Bất kỳ element lá nào
        if (!btn) {
            for (const el of document.querySelectorAll('span, a, button')) {
                if (el.children.length === 0 && (el.textContent || '').trim() === 'Hoàn thành') {
                    btn = el; break;
                }
            }
        }

        if (!btn) {
            console.warn('[VTP Core] ⚠️ Không tìm thấy nút "Hoàn thành"');
            return false;
        }

        console.log('[VTP Core] ✅ Click "Hoàn thành":', btn.id || btn.tagName, btn.className);
        btn.click();
        return true;
    }

    // ════════════════════════════════════════════════════════════
    //  MAIN FLOW – BƯỚC 1: Switch sang tab "chưa kiểm kê"
    // ════════════════════════════════════════════════════════════
    await switchToUnscannedTab();
    await new Promise(r => setTimeout(r, 800)); // Buffer render sau tab switch

    // ════════════════════════════════════════════════════════════
    //  MAIN FLOW – BƯỚC 2: Xác định trạng thái tab
    // ════════════════════════════════════════════════════════════
    const tabState = await waitForTabContentReady(10000);
    console.log('[VTP Core] Tab state sau load:', tabState);

    // ════════════════════════════════════════════════════════════
    //  TRƯỜNG HỢP 2 (TH2): Tab trống hoặc "Đã kiểm kê hết"
    //  Điều kiện: tabState = 'empty' hoặc 'timeout'
    //  Hành động: Click Hoàn thành → đợi 2s → F5
    // ════════════════════════════════════════════════════════════
    if (tabState === 'empty' || tabState === 'timeout') {
        // Lấy thông điệp từ empty body element nếu có
        const emptyBodyEl   = document.querySelector('.z-listbox-emptybody-content, .empty-state');
        const emptyText     = emptyBodyEl ? emptyBodyEl.textContent.trim() : '';
        const msg = emptyText
            ? emptyText
            : (tabState === 'timeout'
                ? 'Không tải được danh sách – tự động hoàn thành...'
                : 'Không có bưu phẩm chưa kiểm kê – Tự động hoàn thành...');

        console.log('[VTP Core] TH2 –', msg);
        if (window.VTPNotification?.show) window.VTPNotification.show(msg, 'info');

        await new Promise(r => setTimeout(r, 1500)); // Đợi trang ổn định
        await clickHoanThanh();

        // Báo hiệu scan xong → sidepanel sẽ chuyển tuyến tiếp
        window.__VTP_SCAN_COMPLETE__ = true;
        console.log('[VTP Core] ✅ __VTP_SCAN_COMPLETE__ = true (TH2: tab trống)');
        await new Promise(r => setTimeout(r, 2000)); // Đợi 2s
        location.reload();                            // F5 → sidepanel chuyển tuyến tiếp
        window.__VTP_CORE_SCAN_RUNNING__ = false;
        return;
    }

    // ════════════════════════════════════════════════════════════
    //  TRƯỜNG HỢP 1 (TH1): Có mã cần quét → Tìm ô nhập mã
    //  input.clsinputpg chỉ tồn tại khi tab có mã
    // ════════════════════════════════════════════════════════════
    let inputField = null;
    const inputDeadline = Date.now() + 10000;
    while (Date.now() < inputDeadline) {
        inputField = document.querySelector('input.clsinputpg');
        if (inputField) break;
        await new Promise(r => setTimeout(r, 400));
    }

    if (!inputField) {
        if (window.VTPNotification?.show)
            window.VTPNotification.show('LỖI: Không tìm thấy ô nhập Mã kiện (.clsinputpg)!', 'error');
        console.error('[VTP Core] ❌ Không tìm thấy input.clsinputpg sau 10s');
        window.__VTP_SCAN_COMPLETE__ = false;
        window.__VTP_CORE_SCAN_RUNNING__ = false;
        return;
    }

    // Tắt event jQuery can thiệp vào input
    if (typeof $ !== 'undefined') $(inputField).off('cut copy paste keypress');
    await new Promise(r => setTimeout(r, 800));

    // ── Xây UI overlay (xóa instance cũ nếu có) ──────────────
    let extUI = document.getElementById('vtp-auto-ext-ui');
    if (extUI) extUI.remove();

    extUI = document.createElement('div');
    extUI.id = 'vtp-auto-ext-ui';
    extUI.innerHTML = `
        <div style="position:fixed;bottom:30px;right:30px;width:360px;background:#ffffff;border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,0.15),0 1px 3px rgba(0,0,0,0.1);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;z-index:999999;overflow:hidden;animation:slideUpIn 0.3s ease-out forwards;display:flex;flex-direction:column;border:1px solid #dee2e6;">
            <div style="background:#ee0033;padding:14px 20px;color:white;display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #cc002b;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <h3 style="margin:0;font-size:15px;font-weight:600;text-transform:uppercase;">Kiểm Kê Tự Động</h3>
                </div>
                <button id="vtp-btn-close" style="background:none;border:none;color:white;cursor:pointer;font-size:22px;line-height:1;padding:0;">&times;</button>
            </div>
            <div style="display:flex;border-bottom:1px solid #dee2e6;background:#f8f9fa;">
                <button id="vtp-tab-progress" style="flex:1;padding:10px 0;background:none;border:none;border-bottom:2px solid #00857f;color:#00857f;font-weight:bold;cursor:pointer;font-size:13px;">Đang Xử Lý</button>
                <button id="vtp-tab-history"  style="flex:1;padding:10px 0;background:none;border:none;border-bottom:2px solid transparent;color:#6c757d;font-weight:bold;cursor:pointer;font-size:13px;">Lịch Sử (0)</button>
                <button id="vtp-tab-settings" style="flex:1;padding:10px 0;background:none;border:none;border-bottom:2px solid transparent;color:#6c757d;font-weight:bold;cursor:pointer;font-size:13px;">⚙️ Cài Đặt</button>
            </div>
            <div id="vtp-view-progress" style="padding:24px 20px;">
                <div style="display:flex;align-items:center;justify-content:center;margin-bottom:15px;">
                    <span style="font-weight:500;font-size:15px;color:#333;">Đã quét tổng cộng:</span>
                    <span id="vtp-current-count" style="border-radius:60%;padding:3px 14px;background:#fff;border:1px solid #666;color:#882831;text-align:center;font-weight:bold;font-size:16px;margin-left:10px;">0</span>
                </div>
                <div style="width:100%;background:#e9ecef;border-radius:6px;height:10px;margin-bottom:5px;overflow:hidden;box-shadow:inset 0 1px 2px rgba(0,0,0,0.1);">
                    <div id="vtp-real-progress-bar" style="width:0%;background:linear-gradient(90deg,#00857f,#20c997);height:100%;transition:width 0.3s ease-out;border-radius:6px;"></div>
                </div>
                <div id="vtp-progress-text" style="text-align:right;font-size:11px;color:#6c757d;margin-bottom:15px;font-weight:600;">0 / 0 mã (Đang tính...)</div>
                <div id="vtp-status-container" style="background:#e8f4f8;border:1px solid #b8daff;border-radius:6px;padding:12px 15px;display:flex;align-items:center;gap:12px;margin-bottom:15px;">
                    <div id="vtp-status-text" style="font-size:14px;color:#004085;font-weight:600;">Hệ thống đang khởi động...</div>
                </div>
                <button id="vtp-btn-pause" style="width:100%;padding:10px;background:#ffc107;color:#212529;border:1px solid #ffb300;border-radius:4px;font-weight:bold;cursor:pointer;">Tạm dừng</button>
            </div>
            <div id="vtp-view-history" style="display:none;padding:15px 20px;background:#f8f9fa;">
                <button id="vtp-btn-export" style="width:100%;margin-bottom:12px;padding:10px;background:#28a745;color:white;border:none;border-radius:4px;font-weight:bold;cursor:pointer;">Xuất file Excel (CSV)</button>
                <div id="vtp-history-list" style="max-height:180px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;"></div>
            </div>
            <div id="vtp-view-settings" style="display:none;padding:15px 20px;background:#f8f9fa;">
                <div style="display:flex;gap:8px;margin-bottom:15px;">
                    <input id="vtp-input-prefix" type="text" placeholder="Nhập đầu mã..." style="flex:1;padding:8px;border:1px solid #ced4da;border-radius:4px;text-transform:uppercase;">
                    <button id="vtp-btn-add-prefix" style="padding:8px 15px;background:#00857f;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">Thêm</button>
                </div>
                <div id="vtp-prefix-list" style="display:flex;flex-wrap:wrap;gap:6px;max-height:120px;overflow-y:auto;"></div>
            </div>
        </div>
    `;
    document.body.appendChild(extUI);

    // ── State ─────────────────────────────────────────────────
    let isPaused         = false;
    let isStopped        = false;
    let processedCount   = 0;
    let processedCodeSet = new Set();
    let currentPage      = 1;
    let exportDataArray  = [];
    let totalOnPage      = 0;

    // ── DOM refs ───────────────────────────────────────────────
    const countEl         = document.getElementById('vtp-current-count');
    const statusContainer = document.getElementById('vtp-status-container');
    const statusEl        = document.getElementById('vtp-status-text');
    const progressBarEl   = document.getElementById('vtp-real-progress-bar');
    const progressTextEl  = document.getElementById('vtp-progress-text');
    const historyListEl   = document.getElementById('vtp-history-list');
    const pauseBtn        = document.getElementById('vtp-btn-pause');

    // ── Tab switching trong UI overlay ────────────────────────
    const tabs = {
        btnProgress:  document.getElementById('vtp-tab-progress'),
        btnHistory:   document.getElementById('vtp-tab-history'),
        btnSettings:  document.getElementById('vtp-tab-settings'),
        viewProgress: document.getElementById('vtp-view-progress'),
        viewHistory:  document.getElementById('vtp-view-history'),
        viewSettings: document.getElementById('vtp-view-settings')
    };

    function switchTab(active) {
        ['Progress', 'History', 'Settings'].forEach(name => {
            const isActive = name === active;
            tabs['view' + name].style.display           = isActive ? 'block' : 'none';
            tabs['btn'  + name].style.borderBottomColor = isActive ? '#00857f' : 'transparent';
            tabs['btn'  + name].style.color             = isActive ? '#00857f' : '#6c757d';
        });
    }

    tabs.btnProgress.onclick = () => switchTab('Progress');
    tabs.btnHistory.onclick  = () => switchTab('History');
    tabs.btnSettings.onclick = () => switchTab('Settings');

    // ── Prefix settings ────────────────────────────────────────
    const prefixListEl  = document.getElementById('vtp-prefix-list');
    const inputPrefixEl = document.getElementById('vtp-input-prefix');

    function renderPrefixes() {
        if (!window.VTPSettings) return;
        prefixListEl.innerHTML = '';
        const frag = document.createDocumentFragment();
        window.VTPSettings.getPrefixes().forEach(prefix => {
            const tag = document.createElement('div');
            tag.style.cssText = 'background:#e9ecef;border:1px solid #ced4da;padding:3px 8px;border-radius:12px;font-size:12px;font-weight:bold;color:#495057;display:flex;align-items:center;gap:5px;';
            tag.innerHTML     = `<span>${prefix}</span> <span class="vtp-prefix-remove" data-val="${prefix}" style="cursor:pointer;color:#dc3545;">&times;</span>`;
            frag.appendChild(tag);
        });
        prefixListEl.appendChild(frag);
        prefixListEl.querySelectorAll('.vtp-prefix-remove').forEach(btn => {
            btn.onclick = (e) => {
                window.VTPSettings.removePrefix(e.target.getAttribute('data-val'));
                renderPrefixes();
            };
        });
    }

    document.getElementById('vtp-btn-add-prefix').onclick = () => {
        if (window.VTPSettings && window.VTPSettings.addPrefix(inputPrefixEl.value)) {
            inputPrefixEl.value = '';
            renderPrefixes();
        } else {
            window.VTPNotification?.show('Mã trống hoặc đã tồn tại!', 'error');
        }
    };
    renderPrefixes();

    // ── Pause / Stop / Export ──────────────────────────────────
    pauseBtn.onclick = () => {
        isPaused = !isPaused;
        if (isPaused) {
            pauseBtn.textContent      = 'Tiếp tục';
            pauseBtn.style.background = '#007bff';
            pauseBtn.style.color      = 'white';
            statusEl.textContent      = 'Đã tạm dừng';
        } else {
            pauseBtn.textContent      = 'Tạm dừng';
            pauseBtn.style.background = '#ffc107';
            pauseBtn.style.color      = '#212529';
        }
    };

    document.getElementById('vtp-btn-close').onclick = () => {
        isStopped = true;
        extUI.remove();
        window.__VTP_CORE_SCAN_RUNNING__ = false;
    };

    document.getElementById('vtp-btn-export').onclick = () => {
        if (exportDataArray.length === 0) {
            return window.VTPNotification?.show('Chưa có dữ liệu!', 'warning');
        }
        let csv = '\uFEFFSTT,Mã Kiện,Trạng Thái,Thời Gian Quét,Vị Trí\n';
        exportDataArray.forEach(r => {
            csv += `${r.stt},${r.code},${r.status},${r.time},Trang ${r.page}\n`;
        });
        const link = document.createElement('a');
        link.href     = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        link.download = `VTP_KiemKe_${Date.now()}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // ── Helper: thêm mục vào history (giới hạn MAX_HISTORY) ──
    function addHistoryItem(html) {
        const item = document.createElement('div');
        item.innerHTML = html;
        historyListEl.prepend(item);
        while (historyListEl.children.length > MAX_HISTORY) {
            historyListEl.removeChild(historyListEl.lastChild);
        }
    }

    // ── Helper: cập nhật thanh tiến trình ─────────────────────
    function updateProgress(done, total) {
        const pct = total === 0 ? 0 : Math.round((done / total) * 100);
        progressBarEl.style.width  = pct + '%';
        progressTextEl.textContent = `${done} / ${total} mã (Trang ${currentPage})`;
    }

    await new Promise(r => setTimeout(r, 600));

    // ════════════════════════════════════════════════════════════
    //  VÒNG LẶP XỬ LÝ CHÍNH (TH1)
    // ════════════════════════════════════════════════════════════
    while (!isStopped) {
        while (isPaused && !isStopped) await new Promise(r => setTimeout(r, 200));
        if (isStopped) break;

        // Lấy mã trên trang (một lần duy nhất mỗi vòng)
        const allCodesOnPage = getValidCodes();

        // Khởi tạo tổng mã trang mới
        if (totalOnPage === 0) totalOnPage = allCodesOnPage.length;

        // Tìm mã đầu tiên chưa quét — O(n) worst case
        let target = null;
        for (const item of allCodesOnPage) {
            if (!processedCodeSet.has(item.code)) { target = item; break; }
        }

        const remaining      = target ? allCodesOnPage.filter(i => !processedCodeSet.has(i.code)).length : 0;
        const processedOnPage = totalOnPage - remaining;
        updateProgress(processedOnPage, totalOnPage);

        // Không còn mã chưa quét trên trang → lật trang
        if (!target) {
            statusEl.textContent = 'Đang lật trang...';
            const oldFirstCode   = allCodesOnPage.length > 0 ? allCodesOnPage[0].code : '';

            if (clickNextPage()) {
                currentPage++;
                if (window.VTPSmartDelay?.waitForPageLoad) {
                    await window.VTPSmartDelay.waitForPageLoad(oldFirstCode, 8000);
                } else {
                    await new Promise(r => setTimeout(r, 3000));
                }
                totalOnPage = 0;
                continue;
            } else {
                // Hết trang → thoát vòng lặp để bấm Hoàn thành
                progressBarEl.style.width = '100%';
                break;
            }
        }

        // Xử lý mã
        if (isStopped) break;
        const { element, code } = target;
        processedCodeSet.add(code);
        processedCount++;

        countEl.textContent               = processedCount;
        statusContainer.style.background  = '#e8f4f8';
        statusContainer.style.borderColor = '#b8daff';
        statusEl.innerHTML                = `Trang ${currentPage} - Đang xử lý: <b style="letter-spacing:0.5px;">${code}</b>`;

        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.style.backgroundColor = '#ffc107';
        inputField.focus();

        // Native value setter (bypass React/Angular controlled input)
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(inputField, code);
        inputField.dispatchEvent(new Event('input',  { bubbles: true, composed: true }));
        inputField.dispatchEvent(new Event('change', { bubbles: true }));

        if (window.VTPSmartDelay) await window.VTPSmartDelay.sleep(10);
        else await new Promise(r => setTimeout(r, 10));

        ['keydown', 'keypress', 'keyup'].forEach(evt => {
            inputField.dispatchEvent(new KeyboardEvent(evt, {
                key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true
            }));
        });

        element.style.backgroundColor = '#28a745';

        // Chờ xác nhận xử lý xong
        let isSuccess = false;
        if (window.VTPSmartDelay) {
            isSuccess = await window.VTPSmartDelay.waitUntilCodeProcessed(code, element, 15000);
        } else {
            let elapsed = 0;
            while (elapsed < 15000) {
                await new Promise(r => setTimeout(r, 200));
                elapsed += 200;
                if (!document.body.contains(element)) { isSuccess = true; break; }
            }
        }

        if (isStopped) break;

        // Cập nhật UI sau khi quét xong 1 mã
        const timeScanned = new Date().toLocaleTimeString();
        const totalDone   = totalOnPage - allCodesOnPage.filter(i => !processedCodeSet.has(i.code)).length;
        updateProgress(totalDone, totalOnPage);

        if (!isSuccess) {
            element.style.backgroundColor = '#dc3545';
            addHistoryItem(`<span style="color:#dc3545;font-weight:600;">${code} (Lỗi / Timeout)</span>`);
            exportDataArray.push({ stt: processedCount, code, page: currentPage, time: timeScanned, status: 'Lỗi / Timeout' });
            if (window.VTPSmartDelay) await window.VTPSmartDelay.sleep(300);
        } else {
            addHistoryItem(
                `<span style="color:#28a745;font-weight:600;">${code} ` +
                `<span style="font-weight:normal;color:#6c757d;font-size:11px;">(Trang ${currentPage})</span></span>`
            );
            exportDataArray.push({ stt: processedCount, code, page: currentPage, time: timeScanned, status: 'Hoàn Thành' });
        }

        tabs.btnHistory.textContent = `Lịch Sử (${processedCount})`;
        if (window.VTPSmartDelay) await window.VTPSmartDelay.sleep(150);
    }

    // ════════════════════════════════════════════════════════════
    //  TH1 – HOÀN THÀNH: Đã scan xong toàn bộ mã
    //  → Click Hoàn thành → đợi 2s → F5 → sidepanel chuyển tuyến tiếp
    // ════════════════════════════════════════════════════════════
    if (!isStopped) {
        progressBarEl.style.width        = '100%';
        progressBarEl.style.background   = 'linear-gradient(90deg, #28a745, #20c997)';
        statusContainer.style.background = '#d4edda';
        statusEl.style.color             = '#155724';
        statusEl.innerHTML               = `✅ Hoàn tất: <b>${processedCount}</b> bưu phẩm! Đang bấm Hoàn thành...`;
        pauseBtn.style.display           = 'none';

        const clicked = await clickHoanThanh();
        if (!clicked) {
            console.warn('[VTP Core] ⚠️ Không tìm thấy nút Hoàn thành');
        }

        // Báo hiệu cho sidepanel → đợi 2s → F5
        window.__VTP_SCAN_COMPLETE__ = true;
        console.log('[VTP Core] ✅ Scan hoàn tất – __VTP_SCAN_COMPLETE__ = true. Đợi 2s rồi F5...');
        await new Promise(r => setTimeout(r, 2000));
        window.__VTP_CORE_SCAN_RUNNING__ = false;
        location.reload();
    } else {
        window.__VTP_CORE_SCAN_RUNNING__ = false;
    }

})();
}