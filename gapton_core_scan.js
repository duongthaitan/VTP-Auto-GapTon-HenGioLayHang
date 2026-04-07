(async () => {
    const inputField = document.querySelector('input.clsinputpg');
    if (!inputField) {
        window.VTPNotification.show("LỖI: Không tìm thấy ô nhập Mã kiện (.clsinputpg)!", 'error');
        return;
    }

    if (typeof $ !== 'undefined') $(inputField).off("cut copy paste keypress");

    function getValidCodes() {
        const cells = document.querySelectorAll('.z-listcell-content');
        let data = [];
        let validPrefixes = window.VTPSettings ? window.VTPSettings.getPrefixes() : ['SHOPEE', 'VTP', 'PKE', 'KMS', 'PSL', 'TPO'];

        cells.forEach(cell => {
            const code = cell.innerText.trim().replace(/\s+/g, '');
            if (code.length >= 8) {
                const isStandard = /^[a-zA-Z0-9-]{8,40}$/.test(code);
                const hasPrefix = validPrefixes.some(p => code.toUpperCase().startsWith(p));
                if (isStandard || hasPrefix) data.push({ element: cell, code: code });
            }
        });
        return data;
    }

    function clickNextPage() {
        const nextBtn = document.querySelector('.z-paging-next');
        if (!nextBtn || nextBtn.hasAttribute('disabled') || nextBtn.classList.contains('z-disabled')) return false;
        nextBtn.click(); return true;
    }

    if (getValidCodes().length === 0) {
        window.VTPNotification.show("Không tìm thấy mã phiếu gửi hợp lệ nào trên màn hình!", 'error');
        return;
    }

    let extUI = document.getElementById('vtp-auto-ext-ui');
    if (extUI) extUI.remove();

    extUI = document.createElement('div');
    extUI.id = 'vtp-auto-ext-ui';
    extUI.innerHTML = `
        <div style="position: fixed; bottom: 30px; right: 30px; width: 360px; background: #ffffff; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.1); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; z-index: 999999; overflow: hidden; animation: slideUpIn 0.3s ease-out forwards; display: flex; flex-direction: column; border: 1px solid #dee2e6;">
            <div style="background: #ee0033; padding: 14px 20px; color: white; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #cc002b;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <h3 style="margin: 0; font-size: 15px; font-weight: 600; text-transform: uppercase;">Kiểm Kê Tự Động</h3>
                </div>
                <button id="vtp-btn-close" style="background: none; border: none; color: white; cursor: pointer; font-size: 22px; line-height: 1; padding: 0;">&times;</button>
            </div>
            <div style="display: flex; border-bottom: 1px solid #dee2e6; background: #f8f9fa;">
                <button id="vtp-tab-progress" style="flex: 1; padding: 10px 0; background: none; border: none; border-bottom: 2px solid #00857f; color: #00857f; font-weight: bold; cursor: pointer; font-size: 13px;">Đang Xử Lý</button>
                <button id="vtp-tab-history" style="flex: 1; padding: 10px 0; background: none; border: none; border-bottom: 2px solid transparent; color: #6c757d; font-weight: bold; cursor: pointer; font-size: 13px;">Lịch Sử (0)</button>
                <button id="vtp-tab-settings" style="flex: 1; padding: 10px 0; background: none; border: none; border-bottom: 2px solid transparent; color: #6c757d; font-weight: bold; cursor: pointer; font-size: 13px;">⚙️ Cài Đặt</button>
            </div>
            <div id="vtp-view-progress" style="padding: 24px 20px;">
                <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 15px;">
                    <span style="font-weight: 500; font-size: 15px; color: #333;">Đã quét tổng cộng:</span>
                    <span id="vtp-current-count" style="border-radius: 60%; padding: 3px 14px; background: #fff; border: 1px solid #666; color: #882831; text-align: center; font-weight: bold; font-size: 16px; margin-left: 10px;">0</span>
                </div>
                
                <div style="width: 100%; background: #e9ecef; border-radius: 6px; height: 10px; margin-bottom: 5px; overflow: hidden; box-shadow: inset 0 1px 2px rgba(0,0,0,0.1);">
                    <div id="vtp-real-progress-bar" style="width: 0%; background: linear-gradient(90deg, #00857f, #20c997); height: 100%; transition: width 0.3s ease-out; border-radius: 6px;"></div>
                </div>
                <div id="vtp-progress-text" style="text-align: right; font-size: 11px; color: #6c757d; margin-bottom: 15px; font-weight: 600;">0 / 0 mã (Đang tính toán...)</div>

                <div id="vtp-status-container" style="background: #e8f4f8; border: 1px solid #b8daff; border-radius: 6px; padding: 12px 15px; display: flex; align-items: center; gap: 12px; margin-bottom: 15px;">
                    <div id="vtp-status-text" style="font-size: 14px; color: #004085; font-weight: 600;">Hệ thống đang khởi động...</div>
                </div>
                <button id="vtp-btn-pause" style="width: 100%; padding: 10px; background: #ffc107; color: #212529; border: 1px solid #ffb300; border-radius: 4px; font-weight: bold; cursor: pointer;">Tạm dừng</button>
            </div>
            <div id="vtp-view-history" style="display: none; padding: 15px 20px; background: #f8f9fa;">
                <button id="vtp-btn-export" style="width: 100%; margin-bottom: 12px; padding: 10px; background: #28a745; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">Xuất file Excel</button>
                <div id="vtp-history-list" style="max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;"></div>
            </div>
            <div id="vtp-view-settings" style="display: none; padding: 15px 20px; background: #f8f9fa;">
                <div style="display: flex; gap: 8px; margin-bottom: 15px;">
                    <input id="vtp-input-prefix" type="text" placeholder="Nhập đầu mã..." style="flex: 1; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; text-transform: uppercase;">
                    <button id="vtp-btn-add-prefix" style="padding: 8px 15px; background: #00857f; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Thêm</button>
                </div>
                <div id="vtp-prefix-list" style="display: flex; flex-wrap: wrap; gap: 6px; max-height: 120px; overflow-y: auto;"></div>
            </div>
        </div>
    `;
    document.body.appendChild(extUI);

    let isPaused = false;
    let isStopped = false;
    let processedCount = 0;      // Tổng số mã đã quét từ lúc bật tool
    let processedCodesList = new Set();
    let currentPage = 1;
    let exportDataArray = [];

    // Biến cho Thanh tiến trình
    let totalOnPage = 0;         // Tổng số mã trên trang hiện tại
    let processedOnPage = 0;     // Số mã đã quét trên trang hiện tại

    const countEl = document.getElementById('vtp-current-count');
    const statusContainer = document.getElementById('vtp-status-container');
    const statusEl = document.getElementById('vtp-status-text');
    const progressBarEl = document.getElementById('vtp-real-progress-bar');
    const progressTextEl = document.getElementById('vtp-progress-text');

    const tabs = {
        btnProgress: document.getElementById('vtp-tab-progress'),
        btnHistory: document.getElementById('vtp-tab-history'),
        btnSettings: document.getElementById('vtp-tab-settings'),
        viewProgress: document.getElementById('vtp-view-progress'),
        viewHistory: document.getElementById('vtp-view-history'),
        viewSettings: document.getElementById('vtp-view-settings')
    };

    function switchTab(activeTabName) {
        ['Progress', 'History', 'Settings'].forEach(name => {
            if (name === activeTabName) {
                tabs['view' + name].style.display = 'block';
                tabs['btn' + name].style.borderBottomColor = '#00857f';
                tabs['btn' + name].style.color = '#00857f';
            } else {
                tabs['view' + name].style.display = 'none';
                tabs['btn' + name].style.borderBottomColor = 'transparent';
                tabs['btn' + name].style.color = '#6c757d';
            }
        });
    }

    tabs.btnProgress.onclick = () => switchTab('Progress');
    tabs.btnHistory.onclick = () => switchTab('History');
    tabs.btnSettings.onclick = () => switchTab('Settings');

    const prefixListEl = document.getElementById('vtp-prefix-list');
    const inputPrefixEl = document.getElementById('vtp-input-prefix');

    function renderPrefixes() {
        if (!window.VTPSettings) return;
        prefixListEl.innerHTML = '';
        window.VTPSettings.getPrefixes().forEach(prefix => {
            const tag = document.createElement('div');
            tag.style = "background: #e9ecef; border: 1px solid #ced4da; padding: 3px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; color: #495057; display: flex; align-items: center; gap: 5px;";
            tag.innerHTML = `<span>${prefix}</span> <span class="vtp-prefix-remove" data-val="${prefix}" style="cursor: pointer; color: #dc3545;">&times;</span>`;
            prefixListEl.appendChild(tag);
        });
        document.querySelectorAll('.vtp-prefix-remove').forEach(btn => {
            btn.onclick = (e) => {
                window.VTPSettings.removePrefix(e.target.getAttribute('data-val'));
                renderPrefixes();
            };
        });
    }

    document.getElementById('vtp-btn-add-prefix').onclick = () => {
        if (window.VTPSettings && window.VTPSettings.addPrefix(inputPrefixEl.value)) {
            inputPrefixEl.value = ''; renderPrefixes();
        } else window.VTPNotification.show('Mã trống hoặc đã tồn tại!', 'error');
    };
    renderPrefixes();

    document.getElementById('vtp-btn-pause').onclick = () => {
        isPaused = !isPaused;
        const btn = document.getElementById('vtp-btn-pause');
        if (isPaused) {
            btn.innerText = "Tiếp tục"; btn.style.background = "#007bff"; btn.style.color = "white";
            statusEl.innerText = "Đã tạm dừng";
        } else {
            btn.innerText = "Tạm dừng"; btn.style.background = "#ffc107"; btn.style.color = "#212529";
        }
    };

    document.getElementById('vtp-btn-close').onclick = () => { isStopped = true; extUI.remove(); };

    const historyListEl = document.getElementById('vtp-history-list');
    document.getElementById('vtp-btn-export').onclick = () => {
        if (exportDataArray.length === 0) return window.VTPNotification.show("Chưa có dữ liệu!", 'warning');
        let csv = "\uFEFFSTT,Mã Kiện,Trạng Thái,Thời Gian Quét,Vị Trí\n";
        exportDataArray.forEach(r => csv += `${r.stt},${r.code},${r.status},${r.time},Trang ${r.page}\n`);
        const link = document.createElement("a");
        link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        link.download = `VTP_KiemKe_${Date.now()}.csv`;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    };

    await new Promise(r => setTimeout(r, 600));

    // --- VÒNG LẶP XỬ LÝ SIÊU TỐC ---
    while (!isStopped) {
        while (isPaused && !isStopped) await new Promise(r => setTimeout(r, 200));
        if (isStopped) break;

        // TỐI ƯU 1: Tìm mã trực tiếp từ DOM (Tránh lỗi Stale Element)
        const allCodesOnPage = getValidCodes();
        const pendingCodes = allCodesOnPage.filter(item => !processedCodesList.has(item.code));

        // Khởi tạo tổng số mã trên trang nếu là trang mới
        if (totalOnPage === 0) {
            totalOnPage = allCodesOnPage.length;
        }

        // Cập nhật số lượng đã xử lý thực tế
        processedOnPage = totalOnPage - pendingCodes.length;

        // Cập nhật UI Thanh tiến trình trước khi xử lý
        let percent = totalOnPage === 0 ? 0 : Math.round((processedOnPage / totalOnPage) * 100);
        progressBarEl.style.width = percent + '%';
        progressTextEl.innerText = `${processedOnPage} / ${totalOnPage} mã (Trang ${currentPage})`;

        // Luôn lấy phần tử đầu tiên chưa được quét trên DOM hiện tại
        let target = pendingCodes.length > 0 ? pendingCodes[0] : null;

        if (!target) {
            statusEl.innerHTML = `Đang lật trang...`;
            // Fix #7: Cache kết quả thay vì gọi getValidCodes() 2 lần
            const codesForOldRef = getValidCodes();
            const oldFirstCode = codesForOldRef.length > 0 ? codesForOldRef[0].code : "";

            if (clickNextPage()) {
                currentPage++;
                if (window.VTPSmartDelay && window.VTPSmartDelay.waitForPageLoad) {
                    await window.VTPSmartDelay.waitForPageLoad(oldFirstCode, 8000);
                } else await new Promise(r => setTimeout(r, 3000));

                // Fix #8: Reset cả totalOnPage lẫn processedOnPage để tránh hiển thị sai
                totalOnPage = 0;
                processedOnPage = 0;
                continue;
            } else {
                // Hết trang để lật, update thanh full 100%
                progressBarEl.style.width = '100%';
                break;
            }
        }

        const { element, code } = target;
        processedCodesList.add(code);
        processedCount++;

        countEl.innerText = processedCount;
        statusContainer.style.background = "#e8f4f8";
        statusContainer.style.borderColor = "#b8daff";
        statusEl.innerHTML = `Trang ${currentPage} - Đang xử lý: <b style="letter-spacing: 0.5px;">${code}</b>`;

        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.style.backgroundColor = "#ffc107";

        inputField.focus();

        // TỐI ƯU 2: Native Injector
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        nativeInputValueSetter.call(inputField, code);

        inputField.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        inputField.dispatchEvent(new Event('change', { bubbles: true }));

        // TỐI ƯU 3: Độ trễ siêu thấp 10ms
        if (window.VTPSmartDelay) await window.VTPSmartDelay.sleep(10);
        else await new Promise(r => setTimeout(r, 10));

        ['keydown', 'keypress', 'keyup'].forEach(evt => {
            inputField.dispatchEvent(new KeyboardEvent(evt, { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        });

        element.style.backgroundColor = "#28a745";

        // TỐI ƯU 4: Radar mục tiêu đơn
        let isSuccess = false;
        if (window.VTPSmartDelay) {
            isSuccess = await window.VTPSmartDelay.waitUntilCodeProcessed(code, element, 15000);
        } else {
            let checkTime = 0;
            while (checkTime < 15000) {
                await new Promise(r => setTimeout(r, 200)); checkTime += 200;
                if (!document.body.contains(element)) { isSuccess = true; break; }
            }
        }

        const timeScanned = new Date().toLocaleTimeString();
        let statusString = "";

        // Cập nhật Thanh tiến trình sau khi quét xong 1 mã
        let percentUpdate = totalOnPage === 0 ? 0 : Math.round(((processedOnPage + 1) / totalOnPage) * 100);
        progressBarEl.style.width = percentUpdate + '%';
        progressTextEl.innerText = `${processedOnPage + 1} / ${totalOnPage} mã (Trang ${currentPage})`;

        if (!isSuccess) {
            element.style.backgroundColor = "#dc3545";
            statusString = "Lỗi / Timeout";
            const item = document.createElement('div');
            item.innerHTML = `<span style="color:#dc3545; font-weight:600;">${code} (Lỗi mạng)</span>`;
            historyListEl.prepend(item);
            if (window.VTPSmartDelay) await window.VTPSmartDelay.sleep(300);
        } else {
            statusString = "Hoàn Thành";
            const item = document.createElement('div');
            item.innerHTML = `<span style="color:#28a745; font-weight:600;">${code} <span style="font-weight:normal; color:#6c757d; font-size:11px;">(Trang ${currentPage})</span></span>`;
            historyListEl.prepend(item);
        }

        exportDataArray.push({ stt: processedCount, code: code, page: currentPage, time: timeScanned, status: statusString });
        tabs.btnHistory.innerText = `Lịch Sử (${processedCount})`;

        if (window.VTPSmartDelay) await window.VTPSmartDelay.sleep(150);
    }

    // Khi kết thúc toàn bộ
    if (!isStopped) {
        progressBarEl.style.width = '100%';
        progressBarEl.style.background = 'linear-gradient(90deg, #28a745, #20c997)';

        statusContainer.style.background = "#d4edda";
        statusEl.style.color = "#155724";
        statusEl.innerHTML = `✅ Hoàn tất: <b>${processedCount}</b> bưu phẩm!`;
        document.getElementById('vtp-btn-pause').style.display = 'none';
    }
})();