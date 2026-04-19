// ============================================================
//  VTP Tool – Kiểm Tồn Core Scan
//  v1.1 Performance & Stability Fixes:
//    - Fix O(n²): Không dùng .filter() lại toàn bộ mỗi vòng
//    - Fix memory leak: Giới hạn history list tối đa MAX_HISTORY mục
//    - Fix double getValidCodes(): Dùng lại biến allCodesOnPage đã có
//    - Fix isStopped guard: Kiểm tra sau mỗi await quan trọng
//    - Cache VTPSettings.getPrefixes() (đã xử lý trong gapton_settings.js)
// ============================================================
(async () => {
    const MAX_HISTORY = 80; // Giới hạn số mục trong history để tránh memory leak

    // ── BƯỚC 6: Click tab "Bưu phẩm chưa kiểm kê" ──
    // Phải switch tab TRƯỚC, vì input.clsinputpg chỉ xuất hiện khi ở tab chưa kiểm kê
    // Mặc định trang scan mở ở tab "Bưu phẩm đã kiểm kê" → phải chuyển sang tab chưa kiểm kê
    //
    // ZK framework tab structure:
    //   <ul class="z-tabs-content">
    //     <li class="z-tab">
    //       <a class="z-tab-content">
    //         <span class="z-tab-text" title="Bưu phẩm chưa kiểm kê">...</span>
    //       </a>
    //     </li>
    //   </ul>
    //
    // QUAN TRỌNG: Phải click vào <a class="z-tab-content"> hoặc <li class="z-tab">
    //   KHÔNG được click vào <ul> cha (selector [class*="tab"] match cả <ul>!)
    async function switchToUnscannedTab() {
        let clickTarget = null;
        let parentLi    = null;

        // ── Chiến lược 1 (Chính xác nhất): Tìm <span class="z-tab-text"> có title/text chứa "chưa kiểm kê"
        const tabTextSpans = document.querySelectorAll('.z-tab-text');
        for (const span of tabTextSpans) {
            const title = (span.getAttribute('title') || '').trim();
            const txt   = (span.textContent || '').trim();
            if (title.includes('chưa kiểm kê') || txt.includes('chưa kiểm kê') ||
                title.includes('Chưa kiểm kê') || txt.includes('Chưa kiểm kê')) {
                // Navigate lên đúng element click được theo cấu trúc ZK
                const anchor = span.closest('a.z-tab-content') || span.closest('a');
                parentLi     = span.closest('li.z-tab') || span.closest('li');
                clickTarget  = anchor || parentLi || span;
                break;
            }
        }

        // ── Chiến lược 2 (Fallback): Tìm <a class="z-tab-content"> chứa text "chưa kiểm kê"
        if (!clickTarget) {
            const tabAnchors = document.querySelectorAll('a.z-tab-content');
            for (const a of tabAnchors) {
                const txt = (a.innerText || a.textContent || '').trim();
                if (txt.includes('chưa kiểm kê') || txt.includes('Chưa kiểm kê')) {
                    clickTarget = a;
                    parentLi    = a.closest('li.z-tab') || a.closest('li');
                    break;
                }
            }
        }

        // ── Chiến lược 3 (Last resort): Tìm <li class="z-tab"> chứa text "chưa kiểm kê"
        if (!clickTarget) {
            const tabLis = document.querySelectorAll('li.z-tab');
            for (const li of tabLis) {
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

        // Kiểm tra nếu tab đã được chọn sẵn → không cần click
        if (parentLi && parentLi.classList.contains('z-tab-selected')) {
            console.log('[VTP Core] ✅ Tab "Bưu phẩm chưa kiểm kê" đã được chọn sẵn – bỏ qua click');
            return true;
        }

        console.log('[VTP Core] Clicking tab chưa kiểm kê:', clickTarget.tagName, clickTarget.className);
        clickTarget.click();

        // Đợi nội dung tab mới load (tối đa 10 giây, poll mỗi 500ms)
        const deadline = Date.now() + 10000;
        while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 500));

            // Xác nhận tab đã thực sự chuyển (class z-tab-selected phải ở đúng li)
            const refreshLi = parentLi || clickTarget.closest('li.z-tab');
            if (refreshLi && refreshLi.classList.contains('z-tab-selected')) {
                console.log('[VTP Core] ✅ Tab chưa kiểm kê đã chuyển thành công (z-tab-selected)');
                // Chờ thêm 1 giây để nội dung tab render xong
                await new Promise(r => setTimeout(r, 1000));
                return true;
            }
        }

        console.log('[VTP Core] ⚠️ Đã click tab nhưng chưa xác nhận z-tab-selected. Tiếp tục...');
        return true;
    }

    // Chạy bước 6 TRƯỚC KHI kiểm tra input (input chỉ xuất hiện sau khi ở đúng tab)
    await switchToUnscannedTab();

    // Chờ input.clsinputpg xuất hiện sau khi đổi tab (tối đa 10 giây)
    let inputField = null;
    const inputDeadline = Date.now() + 10000;
    while (Date.now() < inputDeadline) {
        inputField = document.querySelector('input.clsinputpg');
        if (inputField) break;
        await new Promise(r => setTimeout(r, 400));
    }

    if (!inputField) {
        window.VTPNotification.show('LỖI: Không tìm thấy ô nhập Mã kiện (.clsinputpg)! Hãy kiểm tra lại trang.', 'error');
        window.__VTP_SCAN_COMPLETE__ = false;
        return;
    }

    // Tắt các event jQuery can thiệp vào input (sau khi đổi tab vì DOM có thể thay đổi)
    if (typeof $ !== 'undefined') $(inputField).off('cut copy paste keypress');

    // Chờ thêm 800ms để trang ổn định sau khi đổi tab
    await new Promise(r => setTimeout(r, 800));

    // ── Lấy danh sách mã hợp lệ trên trang hiện tại ──
    // Fix #9: Dùng Set để deduplicate – tránh mã xuất hiện 2+ lần
    //         (vd: header row + data row của ZK grid render trùng)
    function getValidCodes() {
        const cells        = document.querySelectorAll('.z-listcell-content');
        const validPrefixes = window.VTPSettings
            ? window.VTPSettings.getPrefixes()  // dùng cache từ gapton_settings v1.1
            : ['SHOPEE', 'VTP', 'VGI', 'PKE', 'KMS', 'PSL', 'TPO'];

        const data = [];
        const seen = new Set(); // Deduplicate: tránh progress tính sai
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

    // ── Lật trang tiếp theo ──
    function clickNextPage() {
        const nextBtn = document.querySelector('.z-paging-next');
        if (!nextBtn || nextBtn.hasAttribute('disabled') || nextBtn.classList.contains('z-disabled')) return false;
        nextBtn.click();
        return true;
    }

    // ── Helper: tìm và click nút "Hoàn thành" (span.z-label) ──
    // Selector ưu tiên: span.z-label chứa đúng text "Hoàn thành"
    async function clickHoanThanh() {
        let btn = null;

        // Chiến lược 1 (chính xác nhất): span.z-label có text "Hoàn thành"
        for (const el of document.querySelectorAll('span.z-label')) {
            if ((el.textContent || '').trim() === 'Hoàn thành') { btn = el; break; }
        }

        // Chiến lược 2: bất kỳ element lá nào có text "Hoàn thành"
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

        console.log('[VTP Core] ✅ Click "Hoàn thành":', btn.id || btn.className);
        btn.click();
        return true;
    }

    // ── Kiểm tra ban đầu: tab "Bưu phẩm chưa kiểm kê" trống ──
    // Trường hợp 1: không có mã hợp lệ nào (getValidCodes() = 0)
    // Trường hợp 2: có emptybody "Đã kiểm kê hết toàn bộ phiếu gửi!"
    const emptyBody = document.querySelector('.z-listbox-emptybody-content');
    const isAlreadyDone = emptyBody && (emptyBody.textContent || '').includes('Đã kiểm kê hết');

    if (getValidCodes().length === 0 || isAlreadyDone) {
        console.log('[VTP Core] Tab chưa kiểm kê trống hoặc đã kiểm kê hết – tự động hoàn thành...');
        if (window.VTPNotification?.show) {
            window.VTPNotification.show(
                isAlreadyDone ? 'Đã kiểm kê hết – Tự động hoàn thành...' : 'Không có bưu phẩm – Tự động hoàn thành...',
                'info'
            );
        }

        await new Promise(r => setTimeout(r, 1500));
        await clickHoanThanh();

        window.__VTP_SCAN_COMPLETE__ = true;
        console.log('[VTP Core] ✅ Set __VTP_SCAN_COMPLETE__ = true (tab trống)');
        await new Promise(r => setTimeout(r, 3000));
        location.reload();
        return;
    }


    // ── Xây UI (xóa instance cũ nếu có) ──
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

    // ── State ──
    let isPaused         = false;
    let isStopped        = false;
    let processedCount   = 0;
    let processedCodeSet = new Set(); // Dùng Set để tra cứu O(1)
    let currentPage      = 1;
    let exportDataArray  = [];
    let totalOnPage      = 0;

    // ── DOM refs ──
    const countEl          = document.getElementById('vtp-current-count');
    const statusContainer  = document.getElementById('vtp-status-container');
    const statusEl         = document.getElementById('vtp-status-text');
    const progressBarEl    = document.getElementById('vtp-real-progress-bar');
    const progressTextEl   = document.getElementById('vtp-progress-text');
    const historyListEl    = document.getElementById('vtp-history-list');
    const pauseBtn         = document.getElementById('vtp-btn-pause');

    // ── Tab switching ──
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
            tabs['view' + name].style.display        = isActive ? 'block' : 'none';
            tabs['btn'  + name].style.borderBottomColor = isActive ? '#00857f' : 'transparent';
            tabs['btn'  + name].style.color             = isActive ? '#00857f' : '#6c757d';
        });
    }

    tabs.btnProgress.onclick = () => switchTab('Progress');
    tabs.btnHistory.onclick  = () => switchTab('History');
    tabs.btnSettings.onclick = () => switchTab('Settings');

    // ── Prefix settings ──
    const prefixListEl  = document.getElementById('vtp-prefix-list');
    const inputPrefixEl = document.getElementById('vtp-input-prefix');

    function renderPrefixes() {
        if (!window.VTPSettings) return;
        prefixListEl.innerHTML = '';
        // Dùng DocumentFragment để tránh nhiều lần layout reflow
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
            window.VTPNotification.show('Mã trống hoặc đã tồn tại!', 'error');
        }
    };
    renderPrefixes();

    // ── Pause / Stop / Export ──
    pauseBtn.onclick = () => {
        isPaused = !isPaused;
        if (isPaused) {
            pauseBtn.textContent     = 'Tiếp tục';
            pauseBtn.style.background = '#007bff';
            pauseBtn.style.color      = 'white';
            statusEl.textContent      = 'Đã tạm dừng';
        } else {
            pauseBtn.textContent     = 'Tạm dừng';
            pauseBtn.style.background = '#ffc107';
            pauseBtn.style.color      = '#212529';
        }
    };

    document.getElementById('vtp-btn-close').onclick = () => {
        isStopped = true;
        extUI.remove();
    };

    document.getElementById('vtp-btn-export').onclick = () => {
        if (exportDataArray.length === 0) {
            return window.VTPNotification.show('Chưa có dữ liệu!', 'warning');
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

        // Fix memory leak: xóa mục cuối khi vượt quá giới hạn
        while (historyListEl.children.length > MAX_HISTORY) {
            historyListEl.removeChild(historyListEl.lastChild);
        }
    }

    // ── Helper: cập nhật thanh tiến trình ──
    function updateProgress(done, total) {
        const pct = total === 0 ? 0 : Math.round((done / total) * 100);
        progressBarEl.style.width  = pct + '%';
        progressTextEl.textContent = `${done} / ${total} mã (Trang ${currentPage})`;
    }

    await new Promise(r => setTimeout(r, 600));

    // ════════════════════════════════════════
    //  VÒNG LẶP XỬ LÝ CHÍNH
    // ════════════════════════════════════════
    while (!isStopped) {
        // Chờ nếu đang pause
        while (isPaused && !isStopped) await new Promise(r => setTimeout(r, 200));
        if (isStopped) break;

        // ── Lấy mã trên trang (một lần duy nhất mỗi vòng) ──
        const allCodesOnPage = getValidCodes();

        // Khởi tạo tổng mã trang mới
        if (totalOnPage === 0) totalOnPage = allCodesOnPage.length;

        // Fix O(n²): Thay vì .filter() lại toàn bộ Set mỗi vòng,
        // dùng vòng for để tìm phần tử đầu tiên chưa quét → O(n) worst case
        let target = null;
        for (const item of allCodesOnPage) {
            if (!processedCodeSet.has(item.code)) {
                target = item;
                break;
            }
        }

        const processedOnPage = totalOnPage - (target ? allCodesOnPage.filter(i => !processedCodeSet.has(i.code)).length : 0);
        updateProgress(processedOnPage, totalOnPage);

        // ── Không còn mã chưa quét trên trang → lật trang ──
        if (!target) {
            statusEl.textContent = 'Đang lật trang...';

            // Fix double getValidCodes(): Dùng allCodesOnPage đã có (không gọi lại)
            const oldFirstCode = allCodesOnPage.length > 0 ? allCodesOnPage[0].code : '';

            if (clickNextPage()) {
                currentPage++;
                if (window.VTPSmartDelay?.waitForPageLoad) {
                    await window.VTPSmartDelay.waitForPageLoad(oldFirstCode, 8000);
                } else {
                    await new Promise(r => setTimeout(r, 3000));
                }
                // Reset bộ đếm trang
                totalOnPage = 0;
                continue;
            } else {
                // Hết trang → hoàn thành
                progressBarEl.style.width = '100%';
                break;
            }
        }

        // ── Xử lý mã ──
        if (isStopped) break; // Guard trước khi bắt đầu xử lý
        const { element, code } = target;
        processedCodeSet.add(code);
        processedCount++;

        countEl.textContent                  = processedCount;
        statusContainer.style.background     = '#e8f4f8';
        statusContainer.style.borderColor    = '#b8daff';
        statusEl.innerHTML                   = `Trang ${currentPage} - Đang xử lý: <b style="letter-spacing:0.5px;">${code}</b>`;

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

        if (isStopped) break; // Guard sau await dài

        // ── Cập nhật UI sau khi quét xong 1 mã ──
        const timeScanned  = new Date().toLocaleTimeString();
        const totalDone    = totalOnPage - allCodesOnPage.filter(i => !processedCodeSet.has(i.code)).length;
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

    // ── Hoàn thành ──
    if (!isStopped) {
        progressBarEl.style.width      = '100%';
        progressBarEl.style.background = 'linear-gradient(90deg, #28a745, #20c997)';
        statusContainer.style.background = '#d4edda';
        statusEl.style.color             = '#155724';
        statusEl.innerHTML               = `✅ Hoàn tất: <b>${processedCount}</b> bưu phẩm! Đang bấm Hoàn thành...`;
        pauseBtn.style.display           = 'none';

        // Click nút "Hoàn thành" sau khi quét xong toàn bộ mã
        const clicked = await clickHoanThanh();
        if (!clicked) {
            console.warn('[VTP Core Scan] ⚠️ Không tìm thấy nút Hoàn thành – tiếp tục báo xong');
        }

        // Báo hiệu cho sidepanel biết scan đã xong → sidepanel F5 và chuyển tuyến tiếp theo
        window.__VTP_SCAN_COMPLETE__ = true;
        console.log('[VTP Core Scan] ✅ Scan hoàn tất – đã set __VTP_SCAN_COMPLETE__ = true');
    }
})();