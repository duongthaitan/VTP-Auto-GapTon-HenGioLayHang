// ============================================================
//  VTP Tool – Popup Controller
//  v1.4 Changes:
//    - Thêm chức năng chọn tuyến kiểm kê (checklist)
//    - Load danh sách tuyến từ combobox trên trang VTP
//    - Sau kiểm kê tuyến (5 bước), tự động inject gapton_core_scan
//    - Sau scan xong: F5 trang → chờ về trang danh sách → tuyến kế tiếp
//    - Giữ nguyên chức năng quét mã cũ
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {

    // ════════════════════════════════════════
    //  TAB SWITCHING
    // ════════════════════════════════════════
    const tabBtns     = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-pane');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.getAttribute('data-target')).classList.add('active');
        });
    });

    // ════════════════════════════════════════
    //  TEXTAREA — Live bill count (debounced)
    // ════════════════════════════════════════
    const billListEl  = document.getElementById('billList');
    const billCountEl = document.getElementById('billCount');

    function parseBills() {
        return billListEl.value.split('\n').map(b => b.trim()).filter(b => b !== '');
    }

    function updateBillCount() {
        const bills = parseBills();
        if (bills.length > 0) {
            billCountEl.textContent = `${bills.length} mã`;
            billCountEl.classList.add('has-bills');
        } else {
            billCountEl.textContent = '0 mã';
            billCountEl.classList.remove('has-bills');
        }
    }

    // Debounce 120ms — tránh re-render khi user paste lớn hoặc gõ nhanh
    let _billCountTimer = null;
    billListEl.addEventListener('input', () => {
        clearTimeout(_billCountTimer);
        _billCountTimer = setTimeout(updateBillCount, 120);
    });

    // ════════════════════════════════════════
    //  DELAY STEPPER (+/−)
    // ════════════════════════════════════════
    const delayInput = document.getElementById('delay');

    document.getElementById('delayPlus').addEventListener('click', () => {
        delayInput.value = Math.min(parseInt(delayInput.value || 1) + 1, 30);
    });
    document.getElementById('delayMinus').addEventListener('click', () => {
        delayInput.value = Math.max(parseInt(delayInput.value || 2) - 1, 1);
    });

    // ════════════════════════════════════════
    //  PROGRESS BAR — helpers
    // ════════════════════════════════════════
    const progressCard = document.getElementById('progressContainer');
    const progressBar  = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const statusDot    = document.querySelector('#statusChinhGio .status-dot');
    const statusMsg    = document.querySelector('#statusChinhGio .status-msg');

    function updateProgressUI(current, total) {
        if (total > 0) {
            progressCard.style.display   = 'block';
            const pct                    = Math.floor((current / total) * 100);
            progressBar.style.width      = pct + '%';
            progressText.textContent     = `${current} / ${total} (${pct}%)`;

            if (current >= total) {
                if (statusMsg) statusMsg.textContent      = '✅ Đã hoàn thành!';
                if (statusDot) statusDot.style.background = '#22c55e';
            } else {
                if (statusMsg) statusMsg.textContent      = `Đang xử lý đơn ${current + 1} / ${total}…`;
                if (statusDot) statusDot.style.background = '#f59e0b';
            }
        } else {
            progressCard.style.display = 'none';
        }
    }

    // ════════════════════════════════════════
    //  RESTORE STATE — khi mở lại popup
    // ════════════════════════════════════════
    chrome.storage.local.get(['isRunning', 'currentIndex', 'billList', 'delay'], (data) => {
        // Restore delay setting
        if (data.delay) {
            delayInput.value = data.delay;
        }
        // Restore bill list và tiến trình nếu đang chạy
        if (data.isRunning && data.billList) {
            billListEl.value = data.billList.join('\n');
            updateBillCount();
            updateProgressUI(data.currentIndex || 0, data.billList.length);
        }
    });

    // ════════════════════════════════════════
    //  STORAGE LISTENER — cập nhật UI realtime
    //  Fix v1.1: Đọc trực tiếp từ `changes`, KHÔNG gọi storage.get() lồng nhau
    // ════════════════════════════════════════
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local') return;

        // Cập nhật tiến trình khi currentIndex thay đổi
        if (changes.currentIndex) {
            // Lấy giá trị mới nhất từ changes, không cần get() thêm
            chrome.storage.local.get(['isRunning', 'billList'], (data) => {
                if (data.isRunning && data.billList) {
                    updateProgressUI(changes.currentIndex.newValue, data.billList.length);
                }
            });
        }

        // Cập nhật trạng thái khi dừng
        if (changes.isRunning && changes.isRunning.newValue === false) {
            if (statusMsg) statusMsg.textContent      = 'Đã dừng.';
            if (statusDot) statusDot.style.background = '#6b7280';
            // Re-enable nút Start khi script báo đã dừng
            const startBtn = document.getElementById('startChinhGioBtn');
            if (startBtn) startBtn.disabled = false;
        }
    });

    // ════════════════════════════════════════
    //  TAB 1 — SỬA GIỜ
    // ════════════════════════════════════════
    const startChinhGioBtn = document.getElementById('startChinhGioBtn');
    const stopChinhGioBtn  = document.getElementById('stopChinhGioBtn');

    startChinhGioBtn.addEventListener('click', async () => {
        const bills = parseBills();
        const delay = parseInt(delayInput.value) || 4;

        if (bills.length === 0) {
            alert('Vui lòng dán ít nhất 1 mã vận đơn!');
            return;
        }

        let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.url) {
            alert('Không thể xác định trang hiện tại. Hãy mở trình duyệt và thử lại!');
            return;
        }

        // Fix inject trùng: Disable ngay lập tức trước khi inject
        startChinhGioBtn.disabled  = true;
        startChinhGioBtn.innerHTML = '⏳ Đang chạy…';

        await chrome.storage.local.set({
            billList:     bills,
            delay,
            isRunning:    true,
            currentIndex: 0
        });
        updateProgressUI(0, bills.length);

        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['notification.js', 'chinhgio_content.js']
            });
        } catch (e) {
            console.error('[VTP] Lỗi inject script:', e);
            await chrome.storage.local.set({ isRunning: false });
            // Re-enable nút nếu lỗi
            startChinhGioBtn.disabled  = false;
            startChinhGioBtn.innerHTML = '<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><polygon points="4,2 16,10 4,18"/></svg> Bắt Đầu Chạy';
            alert('Không thể chạy script. Hãy đảm bảo bạn đang mở đúng trang ViettelPost!');
        }
    });

    stopChinhGioBtn.addEventListener('click', async () => {
        await chrome.storage.local.set({ isRunning: false });
        if (statusMsg) statusMsg.textContent      = 'Đã dừng.';
        if (statusDot) statusDot.style.background = '#6b7280';
        startChinhGioBtn.disabled  = false;
        startChinhGioBtn.innerHTML = '<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><polygon points="4,2 16,10 4,18"/></svg> Bắt Đầu Chạy';
    });

    // ════════════════════════════════════════
    //  TAB 2 — KIỂM TỒN
    // ════════════════════════════════════════
    const statusBoxGapTon       = document.getElementById('statusBoxGapTon');
    const startGapTonBtn        = document.getElementById('startGapTonBtn');
    const loadRoutesBtn         = document.getElementById('loadRoutesBtn');
    const routeChecklist        = document.getElementById('routeChecklist');
    const routeSelectAllWrap    = document.getElementById('routeSelectAllWrap');
    const routeSelectAllCb      = document.getElementById('routeSelectAll');
    const routeCounterEl        = document.getElementById('routeCounter');
    const startKiemKeTuyenBtn   = document.getElementById('startKiemKeTuyenBtn');
    const routeProgressCard     = document.getElementById('routeProgressCard');
    const routeProgressBar      = document.getElementById('routeProgressBar');
    const routeProgressPct      = document.getElementById('routeProgressPct');
    const routeProgressStatus   = document.getElementById('routeProgressStatus');

    let loadedRoutes = []; // Danh sách tuyến đã load

    function setGapTonStatus(isReady, title, desc) {
        statusBoxGapTon.className                                       = `conn-status ${isReady ? 'ready' : 'not-ready'}`;
        statusBoxGapTon.querySelector('.conn-icon').textContent          = isReady ? '✅' : '⚠️';
        statusBoxGapTon.querySelector('.conn-title').textContent         = title;
        statusBoxGapTon.querySelector('.conn-desc').textContent          = desc;
        startGapTonBtn.disabled      = !isReady;
        loadRoutesBtn.disabled       = !isReady;
    }

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.url?.includes('viettelpost') || tab?.url?.includes('localhost')) {
            setGapTonStatus(true, 'Sẵn sàng hoạt động', 'Trang ViettelPost đã được phát hiện');
        } else {
            setGapTonStatus(false, 'Chưa sẵn sàng', 'Vui lòng mở trang ViettelPost!');
        }
    } catch (err) {
        setGapTonStatus(false, 'Lỗi xác định trang', err.message);
    }

    // ── Cập nhật số tuyến đã chọn ──
    function updateSelectedCount() {
        const checked = routeChecklist.querySelectorAll('.route-item-cb:checked');
        const count   = checked.length;
        routeCounterEl.textContent = `${count} tuyến`;
        startKiemKeTuyenBtn.disabled = count === 0;

        // Cập nhật select all checkbox state
        if (loadedRoutes.length > 0) {
            routeSelectAllCb.checked       = (count === loadedRoutes.length);
            routeSelectAllCb.indeterminate = (count > 0 && count < loadedRoutes.length);
        }

        // Toggle class is-checked trên items
        routeChecklist.querySelectorAll('.route-item').forEach(item => {
            const cb = item.querySelector('.route-item-cb');
            if (cb) item.classList.toggle('is-checked', cb.checked);
        });
    }

    // ── Render checklist từ danh sách tuyến ──
    function renderRouteChecklist(routes) {
        loadedRoutes = routes;
        routeChecklist.innerHTML = '';

        if (routes.length === 0) {
            routeChecklist.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 48 48" fill="none" stroke="#D1D5DB" stroke-width="1.5" width="44" height="44">
                        <rect x="2" y="8" width="28" height="24" rx="3"/>
                        <path d="M30 14l7.5 0 4 5V32h-11.5V14z"/>
                        <circle cx="9" cy="36" r="4"/><circle cx="34" cy="36" r="4"/>
                    </svg>
                    <p class="empty-title">Không tìm thấy tuyến nào</p>
                    <p class="empty-hint">Đảm bảo đang ở trang kiểm kê bưu phẩm</p>
                </div>`;
            routeSelectAllWrap.style.display = 'none';
            startKiemKeTuyenBtn.disabled = true;
            return;
        }

        routeSelectAllWrap.style.display = 'block';

        const frag = document.createDocumentFragment();
        routes.forEach((route, idx) => {
            const item = document.createElement('div');
            item.className = 'route-item';
            item.innerHTML = `
                <label class="checkbox-label" style="width:100%;">
                    <input type="checkbox" class="cb-input route-item-cb" data-index="${idx}" data-route="${route}">
                    <span class="cb-box"></span>
                    <span class="route-item-text">${route}</span>
                </label>`;

            const cb = item.querySelector('.route-item-cb');
            cb.addEventListener('change', updateSelectedCount);
            frag.appendChild(item);
        });

        routeChecklist.appendChild(frag);
        updateSelectedCount();
    }

    // ── Select All toggle ──
    routeSelectAllCb.addEventListener('change', () => {
        const isChecked = routeSelectAllCb.checked;
        routeChecklist.querySelectorAll('.route-item-cb').forEach(cb => {
            cb.checked = isChecked;
        });
        updateSelectedCount();
    });

    // ── Load Routes — inject script vào trang VTP để đọc combobox ──
    loadRoutesBtn.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.url?.includes('viettelpost') && !tab?.url?.includes('localhost')) {
            alert('Vui lòng mở trang ViettelPost kiểm kê trước!');
            return;
        }

        loadRoutesBtn.disabled = true;
        loadRoutesBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;">
                <path d="M21 12a9 9 0 11-3.36-7.02"/>
                <polyline points="21 3 21 9 15 9"/>
            </svg>
            Đang tải...`;

        try {
            // Inject script để đọc combobox trên trang VTP
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                world: 'MAIN',
                func: () => {
                    // Bước 1: Tìm combobox kiểm kê
                    const comboboxes = document.querySelectorAll('.z-combobox');
                    let targetCombobox = null;

                    for (const cb of comboboxes) {
                        const input = cb.querySelector('.z-combobox-input');
                        if (input) {
                            const placeholder = input.getAttribute('placeholder') || '';
                            const value = input.value || '';
                            if (placeholder.includes('Hình thức kiểm kê') ||
                                value.includes('Kiểm kê') ||
                                value.includes('kiểm kê') ||
                                value.includes('Kiểm') ||
                                value.includes('bưu cục')) {
                                targetCombobox = cb;
                                break;
                            }
                        }
                    }

                    if (!targetCombobox) {
                        // Fallback: lấy combobox đầu tiên
                        for (const cb of comboboxes) {
                            if (cb.querySelector('.z-combobox-input')) {
                                targetCombobox = cb;
                                break;
                            }
                        }
                    }

                    if (!targetCombobox) return { error: 'Không tìm thấy ô chọn hình thức kiểm kê!' };

                    // Bước 2: Click mở dropdown
                    const dropdownBtn = targetCombobox.querySelector('.z-combobox-button');
                    if (dropdownBtn) dropdownBtn.click();

                    // Bước 3: Chờ nhỏ rồi đọc items
                    return new Promise(resolve => {
                        setTimeout(() => {
                            const routes = [];
                            const popups = document.querySelectorAll('.z-combobox-popup');

                            for (const popup of popups) {
                                if (popup.style.display === 'none' || popup.offsetHeight === 0) continue;
                                const items = popup.querySelectorAll('.z-comboitem');
                                items.forEach(item => {
                                    const textEl = item.querySelector('.z-comboitem-text');
                                    if (textEl) {
                                        const text = textEl.textContent.replace(/\u00A0/g, ' ').trim();
                                        if (text) routes.push(text);
                                    }
                                });
                                if (routes.length > 0) break;
                            }

                            // Đóng dropdown (click lại hoặc click body)
                            if (dropdownBtn) dropdownBtn.click();

                            resolve({ routes });
                        }, 1500);
                    });
                }
            });

            const data = results?.[0]?.result;
            if (data?.error) {
                alert(data.error);
                return;
            }

            const routes = data?.routes || [];
            if (routes.length === 0) {
                alert('Không tìm thấy tuyến nào! Đảm bảo bạn đang ở trang kiểm kê bưu phẩm.');
                return;
            }

            renderRouteChecklist(routes);

        } catch (e) {
            console.error('[VTP] Lỗi load routes:', e);
            alert('Lỗi khi tải danh sách tuyến: ' + e.message);
        } finally {
            loadRoutesBtn.disabled = false;
            loadRoutesBtn.innerHTML = `
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="15" height="15">
                    <polyline points="19 3.5 19 8.5 14 8.5"/>
                    <polyline points="1 16.5 1 11.5 6 11.5"/>
                    <path d="M3 7.5a7.5 7.5 0 0 1 12.19-2.78L19 8.5M1 11.5l3.81 3.78A7.5 7.5 0 0 0 17 12.5"/>
                </svg>
                Tải danh sách tuyến từ VTP`;
        }
    });

    // ════════════════════════════════════════
    //  CHẠY KIỂM KÊ TUYẾN
    //  Luồng mỗi tuyến:
    //   A) Set __VTP_SELECTED_ROUTE__
    //   B) Đăng ký waitForScanPage() TRƯỚC khi inject
    //   C) Inject kiemke_tuyen_auto.js (5 bước)
    //   D) Chờ trang scan mở (URL change hoặc input.clsinputpg xuất hiện)
    //   E) Inject gapton_core_scan.js → quét tự động
    //   F) Poll __VTP_SCAN_COMPLETE__ chờ scan xong
    //   G) Navigate về trang danh sách → lặp tuyến kế tiếp
    // ════════════════════════════════════════
    startKiemKeTuyenBtn.addEventListener('click', async () => {
        let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.url?.includes('viettelpost') && !tab?.url?.includes('localhost')) return;

        const selectedRoutes = [];
        routeChecklist.querySelectorAll('.route-item-cb:checked').forEach(cb => {
            selectedRoutes.push(cb.getAttribute('data-route'));
        });
        if (selectedRoutes.length === 0) { alert('Vui lòng chọn ít nhất 1 tuyến!'); return; }

        // Disable UI
        startKiemKeTuyenBtn.disabled  = true;
        startKiemKeTuyenBtn.innerHTML = '⏳ Đang kiểm kê...';
        loadRoutesBtn.disabled          = true;
        startGapTonBtn.disabled         = true;

        routeProgressCard.style.display = 'block';
        routeProgressBar.style.width    = '0%';
        routeProgressPct.textContent    = `0 / ${selectedRoutes.length}`;

        let completed = 0;
        let errors    = [];

        // ── Helper: poll biến global trên trang ──
        function pollPageVar(tabId, varName, intervalMs, timeoutMs) {
            return new Promise((resolve) => {
                const start = Date.now();
                const check = async () => {
                    try {
                        const res = await chrome.scripting.executeScript({
                            target: { tabId }, world: 'MAIN',
                            func: (v) => window[v] || null, args: [varName]
                        });
                        const val = res?.[0]?.result;
                        if (val) { resolve(val); return; }
                    } catch (_) { /* tab đang navigate – bỏ qua */ }
                    if (Date.now() - start >= timeoutMs) { resolve(null); return; }
                    setTimeout(check, intervalMs);
                };
                setTimeout(check, intervalMs);
            });
        }

        // ── Helper: xóa biến global trên trang ──
        async function clearPageVar(tabId, varName) {
            try {
                await chrome.scripting.executeScript({
                    target: { tabId }, world: 'MAIN',
                    func: (v) => { delete window[v]; }, args: [varName]
                });
            } catch (_) {}
        }

        // ♥ HELPER MỚI: chờ trang scan mở (hỗ trợ cả full-nav và SPA)
        //   • Full-nav: URL thay đổi và tab status = complete
        //   • SPA     : URL giữ nguyên nhưng input.clsinputpg xuất hiện
        function waitForScanPage(tabId, urlBefore, timeoutMs = 90000) {
            return new Promise((resolve) => {
                let done = false;
                function finish(val) {
                    if (done) return; done = true;
                    clearTimeout(deadline);
                    clearInterval(spaPoller);
                    chrome.tabs.onUpdated.removeListener(navListener);
                    resolve(val);
                }
                const deadline = setTimeout(() => finish(false), timeoutMs);

                // Chế độ 1: Full-nav – URL thay đổi
                const navListener = (tid, changeInfo, updatedTab) => {
                    if (tid !== tabId || changeInfo.status !== 'complete') return;
                    const newUrl = updatedTab.url || '';
                    if (newUrl && newUrl !== urlBefore) {
                        console.log('[VTP] ♥ Tab navigated:', newUrl);
                        finish(true);
                    }
                };
                chrome.tabs.onUpdated.addListener(navListener);

                // Chế độ 2: SPA – poll input.clsinputpg
                const spaPoller = setInterval(async () => {
                    try {
                        const res = await chrome.scripting.executeScript({
                            target: { tabId }, world: 'MAIN',
                            func: () => !!document.querySelector('input.clsinputpg')
                        });
                        if (res?.[0]?.result === true) {
                            console.log('[VTP] ♥ SPA: input.clsinputpg xuất hiện');
                            finish(true);
                        }
                    } catch (_) {} // tab đang navigate
                }, 1200);
            });
        }

        // ── Helper: chờ tab reload hoàn tất ──
        function waitForTabReload(tabId, urlKeyword, timeoutMs = 30000) {
            return new Promise((resolve) => {
                const timer = setTimeout(() => {
                    chrome.tabs.onUpdated.removeListener(listener); resolve(false);
                }, timeoutMs);
                const listener = (tid, changeInfo, updated) => {
                    if (tid !== tabId || changeInfo.status !== 'complete') return;
                    if (!urlKeyword || (updated.url || '').includes(urlKeyword)) {
                        clearTimeout(timer);
                        chrome.tabs.onUpdated.removeListener(listener);
                        resolve(true);
                    }
                };
                chrome.tabs.onUpdated.addListener(listener);
            });
        }

        // ════════════════════════════════════════
        //  VÒNG LẶP CHÍNH — từng tuyến
        // ════════════════════════════════════════
        for (let i = 0; i < selectedRoutes.length; i++) {
            const route = selectedRoutes[i];
            routeProgressStatus.textContent = `[${i + 1}/${selectedRoutes.length}] Kiểm kê: ${route}`;

            try {
                // A: Set route + clear flags
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id }, world: 'MAIN',
                    func: (name) => {
                        window.__VTP_SELECTED_ROUTE__ = name;
                        window.__VTP_SCAN_COMPLETE__  = null;
                        window.__VTP_5STEPS_DONE__    = null;
                    },
                    args: [route]
                });

                // B: Lấy URL hiện tại trước khi inject
                const tabInfo   = await chrome.tabs.get(tab.id);
                const urlBefore = tabInfo.url;
                console.log('[VTP] URL trước inject:', urlBefore);

                // C: Đăng ký waitForScanPage TRƯỚC khi inject
                routeProgressStatus.textContent = `[${i + 1}/${selectedRoutes.length}] Thực hiện 5 bước: ${route}`;
                const scanPagePromise = waitForScanPage(tab.id, urlBefore, 90000);

                // D: Inject kiemke_tuyen_auto (5 bước)
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id }, world: 'MAIN',
                    files: ['notification.js', 'kiemke_tuyen_auto.js']
                });

                // E: Chờ trang scan mở (URL change hoặc SPA input.clsinputpg)
                routeProgressStatus.textContent = `[${i + 1}/${selectedRoutes.length}] Chờ trang kiểm kê mở...`;
                const scanPageReady = await scanPagePromise;
                if (!scanPageReady) {
                    throw new Error('Không vào được trang kiểm kê sau 90 giây');
                }
                console.log('[VTP] ✅ Trang scan đã mở');

                // Buffer nhỏ để trang render đầy đủ
                await new Promise(r => setTimeout(r, 2500));

                // F: Inject gapton_core_scan
                routeProgressStatus.textContent = `[${i + 1}/${selectedRoutes.length}] Đang quét mã: ${route}`;
                console.log('[VTP] Inject gapton_core_scan.js...');
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id }, world: 'MAIN',
                    files: ['notification.js', 'gapton_settings.js', 'gapton_smart_delay.js', 'gapton_core_scan.js']
                });

                // G: Poll __VTP_SCAN_COMPLETE__ (timeout 30 phút)
                routeProgressStatus.textContent = `[${i + 1}/${selectedRoutes.length}] Chờ quét xong: ${route}...`;
                console.log('[VTP] Chờ __VTP_SCAN_COMPLETE__...');
                const scanDone = await pollPageVar(tab.id, '__VTP_SCAN_COMPLETE__', 3000, 1800000);
                await clearPageVar(tab.id, '__VTP_SCAN_COMPLETE__');

                if (!scanDone) {
                    console.warn('[VTP] Scan timeout tuyến:', route);
                    errors.push({ route, error: 'Scan timeout' });
                } else {
                    console.log('[VTP] ✅ Scan xong:', route);
                }

                // H: Navigate về trang danh sách
                routeProgressStatus.textContent = `[${i + 1}/${selectedRoutes.length}] Tải lại trang...`;
                const reloadPromise = waitForTabReload(tab.id, '', 30000);
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id }, world: 'MAIN',
                    func: () => {
                        // Mock localhost: navigate về trang danh sách
                        if (location.hostname === 'localhost') {
                            location.href = '/viettelpost/kiem-ke-buu-pham';
                        } else {
                            // VTP thật (SPA): reload cả trang
                            location.reload();
                        }
                    }
                });
                await reloadPromise;
                await new Promise(r => setTimeout(r, 3000));

            } catch (e) {
                console.error(`[VTP] Lỗi tuyến "${route}":`, e);
                errors.push({ route, error: e.message });
            }

            // Cập nhật progress
            completed++;
            const pct = Math.round((completed / selectedRoutes.length) * 100);
            routeProgressBar.style.width = pct + '%';
            routeProgressPct.textContent = `${completed} / ${selectedRoutes.length}`;

            if (i < selectedRoutes.length - 1) {
                routeProgressStatus.textContent = `✔️ Xong tuyến ${i + 1}. Chuyển tuyến ${i + 2}...`;
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        // Hoàn tất
        routeProgressBar.style.width = '100%';
        if (errors.length === 0) {
            routeProgressStatus.textContent = `✅ Hoàn tất! Đã kiểm kê ${completed} tuyến thành công.`;
        } else {
            routeProgressStatus.textContent =
                `⚠️ Hoàn tất ${completed} tuyến. ${errors.length} lỗi: ${errors.map(e => e.route).join(', ')}`;
        }

        startKiemKeTuyenBtn.disabled  = false;
        startKiemKeTuyenBtn.innerHTML = '<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><polygon points="4 2.5 16 10 4 17.5 4 2.5"/></svg> Chạy Kiểm Kê Tự Động';
        loadRoutesBtn.disabled        = false;
        startGapTonBtn.disabled       = false;
    });

    // ════════════════════════════════════════
    //  NÚT QUÉT MÃ CŨ (Core Scan)
    // ════════════════════════════════════════
    startGapTonBtn.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.url?.includes('viettelpost') && !tab?.url?.includes('localhost')) return;

        startGapTonBtn.disabled  = true;
        startGapTonBtn.innerHTML = '⏳ Đang nạp hệ thống…';

        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                world:  'MAIN',
                files:  ['notification.js', 'gapton_settings.js', 'gapton_smart_delay.js', 'gapton_core_scan.js']
            });
        } catch (e) {
            console.error('[VTP] Lỗi inject Kiểm Tồn:', e);
            alert('Không thể chạy script. Hãy kiểm tra lại trang ViettelPost!');
            startGapTonBtn.disabled  = false;
            startGapTonBtn.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="15" height="15"><path d="M17.5 13.3V6.7a1.7 1.7 0 00-.83-1.44L10.83 1.9a1.7 1.7 0 00-1.66 0L3.33 5.26A1.7 1.7 0 002.5 6.7v6.6a1.7 1.7 0 00.83 1.44l5.84 3.36a1.7 1.7 0 001.66 0l5.84-3.36A1.7 1.7 0 0017.5 13.3z"/></svg> Quét Mã Kiểm Tồn';
            return;
        }

        window.close();
    });

});