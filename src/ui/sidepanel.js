// ============================================================
//  VTP Tool – Popup Controller
//  v2.5 Critical Fix:
//    - Fix #23: chrome.storage.local.set() KHÔNG hoạt động từ world:'MAIN'
//              (Chrome MV3 không cấp Extension API cho MAIN world scripts)
//              → Thay bằng waitForTabReload: gapton_core_scan LUÔN gọi
//              location.reload() khi xong → tab reload = tín hiệu scan done
//    - Fix #22: pollScanComplete đăng ký TRƯỚC inject (giữ lại backup)
//    - Fix #21: chrome.storage.local thay vì window variable
//    - Fix #17: Bỏ double F5
//    - Fix #20: reloadAfterScanPromise đăng ký TRƯỚC inject
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {

    // Fix #5: Hẳng số HTML cho các nút — tránh copy-paste, tái sử dụng
    const BTN_HTML = {
        startPlay:    `<i class="bi bi-play-fill" style="font-size: 14px; margin-right: 4px;"></i> Bắt Đầu Chạy`,
        startRunning: `<i class="bi bi-arrow-repeat spin" style="font-size: 14px; margin-right: 4px; display: inline-block;"></i> Đang chạy…`,
        kiemkePlay:   `<i class="bi bi-play-circle-fill" style="font-size: 15px; margin-right: 4px;"></i> Chạy Kiểm Kê Tự Động`,
        kiemkeRun:    `<i class="bi bi-arrow-repeat spin" style="font-size: 14px; margin-right: 4px; display: inline-block;"></i> Đang kiểm kê...`,
        gaptonPlay:   `<i class="bi bi-qr-code-scan" style="font-size: 14px; margin-right: 4px;"></i> Quét Mã Thủ Công`,
    };

    // ════════════════════════════════════════
    //  TAB SWITCHING + Sliding Indicator
    // ════════════════════════════════════════
    const tabBtns     = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-pane');
    const tabIndicator = document.getElementById('tabIndicator');

    function updateTabIndicator(activeBtn) {
        if (!tabIndicator || !activeBtn) return;
        const nav = activeBtn.closest('.tab-nav');
        if (!nav) return;
        const navRect = nav.getBoundingClientRect();
        const btnRect = activeBtn.getBoundingClientRect();
        tabIndicator.style.width     = btnRect.width + 'px';
        tabIndicator.style.transform = `translateX(${btnRect.left - navRect.left}px)`;
    }

    // Init indicator position
    const initActiveBtn = document.querySelector('.tab-btn.active');
    requestAnimationFrame(() => updateTabIndicator(initActiveBtn));

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-selected', 'false'); // Fix #13
            });
            tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');   // Fix #13
            document.getElementById(btn.getAttribute('data-target')).classList.add('active');
            updateTabIndicator(btn);
        });
    });

    // ════════════════════════════════════════
    //  ACTION MODE SWITCHER — Sửa Giờ vs Đánh Giá 5★
    // ════════════════════════════════════════
    const modeBtnChinhGio2 = document.getElementById('modeBtnChinhGio2');
    const modeBtnDanhGia   = document.getElementById('modeBtnDanhGia');
    const billCountEl      = document.getElementById('billCount');
    const sectionTitleText = document.getElementById('sectionTitleText');

    let _actionMode  = 'chinhgio'; // 'chinhgio' | 'danhgia'
    let _excelBills  = [];         // Mã từ Excel (sau khi chọn khách)
    let _excelData   = {};         // { customerName: [codes] }

    function setActionMode(mode) {
        _actionMode = mode;
        modeBtnChinhGio2.classList.toggle('active', mode === 'chinhgio');
        modeBtnDanhGia.classList.toggle('active', mode === 'danhgia');
        // Cập nhật section title
        if (sectionTitleText) {
            sectionTitleText.textContent = mode === 'chinhgio'
                ? 'Tự động cập nhật giờ lấy hàng'
                : 'Tự động đánh giá 5★ bưu tá';
        }
    }

    modeBtnChinhGio2.addEventListener('click', () => setActionMode('chinhgio'));
    modeBtnDanhGia.addEventListener('click', () => setActionMode('danhgia'));

    // ════════════════════════════════════════
    //  parseBills() — lấy danh sách mã từ Excel
    // ════════════════════════════════════════
    function parseBills() {
        return _excelBills.slice();
    }

    function updateBillCount() {
        const bills = parseBills();
        const count = bills.length;
        const text  = `${count} mã`;
        const has   = count > 0;

        billCountEl.textContent = text;
        billCountEl.classList.toggle('has-bills', has);
    }

    // ════════════════════════════════════════
    //  EXCEL UPLOAD — Drag & Drop + Click
    // ════════════════════════════════════════
    const excelDropzone   = document.getElementById('excelDropzone');
    const excelFileInput  = document.getElementById('excelFileInput');
    const dropzoneContent = document.getElementById('dropzoneContent');
    const dropzoneLoaded  = document.getElementById('dropzoneLoaded');
    const loadedFileName  = document.getElementById('loadedFileName');
    const clearExcelBtn   = document.getElementById('clearExcelBtn');
    const customerSection = document.getElementById('customerSection');
    const customerSearch  = document.getElementById('customerSearch');
    const clearSearchBtn  = document.getElementById('clearCustomerSearch');
    const customerSummary = document.getElementById('customerSummary');
    const customerListEl  = document.getElementById('customerList');
    const selectedBillsEl = document.getElementById('selectedCustomerBills');
    const selectedNameEl  = document.getElementById('selectedCustomerName');
    const selectedListEl  = document.getElementById('selectedBillsList');
    const backToListBtn   = document.getElementById('backToListBtn');

    // ── Click dropzone to open file picker ──
    excelDropzone.addEventListener('click', (e) => {
        if (e.target.closest('.loaded-file-clear')) return; // Don't trigger on clear button
        excelFileInput.click();
    });

    // ── File input change ──
    excelFileInput.addEventListener('change', (e) => {
        if (e.target.files[0]) processExcelFile(e.target.files[0]);
    });

    // ── Drag & Drop events ──
    excelDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        excelDropzone.classList.add('drag-over');
    });
    excelDropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        excelDropzone.classList.remove('drag-over');
    });
    excelDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        excelDropzone.classList.remove('drag-over');
        const file = e.dataTransfer?.files?.[0];
        if (file) processExcelFile(file);
    });

    // ── Clear Excel ──
    clearExcelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetExcelState();
    });

    function resetExcelState() {
        _excelData  = {};
        _excelBills = [];
        excelFileInput.value = '';
        dropzoneContent.style.display = 'flex';
        dropzoneLoaded.style.display  = 'none';
        customerSection.style.display = 'none';
        selectedBillsEl.style.display = 'none';
        customerListEl.style.display  = 'flex';
        customerSearch.value = '';
        clearSearchBtn.style.display = 'none';
        updateBillCount();
    }

    // ── Process Excel File ──
    function processExcelFile(file) {
        const validExts = ['.xlsx', '.xls', '.csv'];
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!validExts.includes(ext)) {
            alert('Chỉ hỗ trợ file .xlsx, .xls hoặc .csv!');
            return;
        }

        loadedFileName.textContent = file.name;
        dropzoneContent.style.display = 'none';
        dropzoneLoaded.style.display  = 'block';

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

                if (rows.length < 2) {
                    alert('File Excel không có dữ liệu!');
                    resetExcelState();
                    return;
                }

                // Find column indices
                const headers = rows[0].map(h => String(h || '').trim());
                const maIdx   = headers.indexOf('MA_PHIEUGUI');
                const tenIdx  = headers.indexOf('TEN_KHGUI');

                if (maIdx < 0) {
                    alert('Không tìm thấy cột "MA_PHIEUGUI" trong file Excel!\n\nCác cột hiện có: ' + headers.join(', '));
                    resetExcelState();
                    return;
                }
                if (tenIdx < 0) {
                    alert('Không tìm thấy cột "TEN_KHGUI" trong file Excel!\n\nCác cột hiện có: ' + headers.join(', '));
                    resetExcelState();
                    return;
                }

                // Group by customer name
                const groups = {};
                let totalBills = 0;
                for (let i = 1; i < rows.length; i++) {
                    const row  = rows[i];
                    const name = String(row[tenIdx] || '').trim();
                    const code = String(row[maIdx]  || '').trim();
                    if (!name || !code) continue;
                    if (!groups[name]) groups[name] = [];
                    groups[name].push(code);
                    totalBills++;
                }

                if (Object.keys(groups).length === 0) {
                    alert('Không tìm thấy dữ liệu hợp lệ trong file!');
                    resetExcelState();
                    return;
                }

                _excelData = groups;
                _excelBills = []; // Clear until user picks a customer
                customerSection.style.display = 'block';
                renderCustomerList('');

                console.log(`[VTP Excel] Đã đọc ${totalBills} đơn từ ${Object.keys(groups).length} khách hàng`);
                updateBillCount();

            } catch (err) {
                console.error('[VTP Excel] Lỗi đọc file:', err);
                alert('Lỗi đọc file Excel: ' + err.message);
                resetExcelState();
            }
        };
        reader.readAsArrayBuffer(file);
    }

    // ════════════════════════════════════════
    //  CUSTOMER LIST — Render, Search, Select
    // ════════════════════════════════════════

    function renderCustomerList(filter) {
        customerListEl.innerHTML = '';
        selectedBillsEl.style.display = 'none';
        customerListEl.style.display  = 'flex';

        const entries = Object.entries(_excelData);
        const totalCustomers = entries.length;
        const totalBills = entries.reduce((sum, [_, codes]) => sum + codes.length, 0);

        // Filter
        const normalFilter = filter.toLowerCase().trim();
        const filtered = normalFilter
            ? entries.filter(([name]) => name.toLowerCase().includes(normalFilter))
            : entries;

        // Sort by bill count (descending)
        filtered.sort((a, b) => b[1].length - a[1].length);

        // Summary
        if (normalFilter) {
            customerSummary.querySelector('.summary-total').textContent =
                `Tìm thấy ${filtered.length}/${totalCustomers} khách · ${totalBills} đơn tổng`;
        } else {
            customerSummary.querySelector('.summary-total').textContent =
                `${totalCustomers} khách hàng · ${totalBills} đơn`;
        }

        if (filtered.length === 0) {
            customerListEl.innerHTML = `
                <div class="empty-state" style="padding:16px 0">
                    <p class="empty-title">Không tìm thấy khách hàng</p>
                    <p class="empty-hint">Thử từ khóa khác</p>
                </div>`;
            return;
        }

        // Add "All customers" option
        const allItem = document.createElement('div');
        allItem.className = 'customer-item';
        allItem.style.background = 'linear-gradient(135deg, var(--red-pale) 0%, var(--red-pale2) 100%)';
        allItem.style.borderColor = 'var(--red-border)';
        allItem.innerHTML = `
            <div class="customer-avatar" style="background:linear-gradient(135deg,var(--red),var(--red-hover));color:white;border-color:var(--red);">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <circle cx="10" cy="7" r="3.5"/><path d="M3 17.5c0-4 3.13-7 7-7s7 3 7 7"/>
                </svg>
            </div>
            <div class="customer-info">
                <div class="customer-name" style="color:var(--red);font-weight:700">TẤT CẢ KHÁCH HÀNG</div>
                <div class="customer-meta">${filtered.length} khách · ${filtered.reduce((s,[_,c]) => s + c.length, 0)} đơn</div>
            </div>
            <span class="customer-count-badge">${filtered.reduce((s,[_,c]) => s + c.length, 0)}</span>
            <svg class="customer-arrow" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12">
                <polyline points="7 4 13 10 7 16"/>
            </svg>`;
        allItem.addEventListener('click', () => {
            // Select ALL bills from filtered customers
            _excelBills = filtered.flatMap(([_, codes]) => codes);
            showSelectedBills('TẤT CẢ KHÁCH HÀNG', _excelBills);
        });
        customerListEl.appendChild(allItem);

        // Individual customers
        const frag = document.createDocumentFragment();
        filtered.forEach(([name, codes]) => {
            const initials = name.split(/[\s-]+/).map(w => w.charAt(0).toUpperCase()).slice(0, 2).join('');
            const item = document.createElement('div');
            item.className = 'customer-item';
            item.innerHTML = `
                <div class="customer-avatar">${initials}</div>
                <div class="customer-info">
                    <div class="customer-name">${name}</div>
                    <div class="customer-meta">${codes.length} đơn hàng</div>
                </div>
                <span class="customer-count-badge">${codes.length}</span>
                <svg class="customer-arrow" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12">
                    <polyline points="7 4 13 10 7 16"/>
                </svg>`;
            item.addEventListener('click', () => {
                _excelBills = codes.slice();
                showSelectedBills(name, codes);
            });
            frag.appendChild(item);
        });
        customerListEl.appendChild(frag);
    }

    // ── Show selected customer's bills ──
    function showSelectedBills(customerName, bills) {
        customerListEl.style.display  = 'none';
        selectedBillsEl.style.display = 'block';
        selectedNameEl.textContent    = `${customerName} (${bills.length} đơn)`;

        selectedListEl.innerHTML = '';
        const frag = document.createDocumentFragment();
        bills.forEach((code, idx) => {
            const chip = document.createElement('div');
            chip.className = 'bill-chip';
            chip.innerHTML = `
                <span class="bill-chip-num">${idx + 1}</span>
                <span class="bill-chip-code">${code}</span>`;
            frag.appendChild(chip);
        });
        selectedListEl.appendChild(frag);
        updateBillCount();
    }

    // ── Back to customer list ──
    backToListBtn.addEventListener('click', () => {
        _excelBills = [];
        selectedBillsEl.style.display = 'none';
        customerListEl.style.display  = 'flex';
        updateBillCount();
    });

    // ── Customer search (debounced) ──
    let _searchTimer = null;
    customerSearch.addEventListener('input', () => {
        const val = customerSearch.value;
        clearSearchBtn.style.display = val ? 'flex' : 'none';
        clearTimeout(_searchTimer);
        _searchTimer = setTimeout(() => renderCustomerList(val), 150);
    });

    clearSearchBtn.addEventListener('click', () => {
        customerSearch.value = '';
        clearSearchBtn.style.display = 'none';
        renderCustomerList('');
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
    const statusMsg    = document.querySelector('#statusChinhGio .status-text');

    function updateProgressUI(current, total) {
        if (total > 0) {
            progressCard.style.display   = 'block';
            const pct                    = Math.floor((current / total) * 100);
            progressBar.style.width      = pct + '%';
            progressText.textContent     = `${current} / ${total} (${pct}%)`;

            if (current >= total) {
                if (statusMsg) statusMsg.textContent      = '✅ Đã hoàn thành!';
                if (statusDot) statusDot.style.background = '#10B981';
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
        // Restore tiến trình nếu đang chạy
        if (data.isRunning && data.billList) {
            _excelBills = data.billList;
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
            if (statusDot) statusDot.style.background = '#78716C';
            // Re-enable nút Start khi script báo đã dừng
            const startBtn = document.getElementById('startChinhGioBtn');
            if (startBtn) startBtn.disabled = false;
        }
    });

    // ════════════════════════════════════════
    //  TAB 1 — SỬA GIỜ
    //  [v3.0] Vòng lặp chạy ở SIDEPANEL (extension page)
    //  → Không bị Chrome throttle khi chuyển tab
    //  → Content script chỉ xử lý 1 đơn/lần, trả kết quả qua storage
    // ════════════════════════════════════════
    const startChinhGioBtn = document.getElementById('startChinhGioBtn');
    const stopChinhGioBtn  = document.getElementById('stopChinhGioBtn');

    // Helper: chờ content script báo xong 1 đơn qua storage
    function waitForChinhGioStepDone(timeoutMs = 120000) {
        return new Promise((resolve) => {
            let resolved = false;

            const deadline = setTimeout(() => {
                if (resolved) return;
                resolved = true;
                chrome.storage.onChanged.removeListener(listener);
                resolve({ status: 'timeout' });
            }, timeoutMs);

            function listener(changes, ns) {
                if (ns !== 'local' || resolved) return;
                if (changes.__VTP_CHINHGIO_STEP_DONE__?.newValue) {
                    resolved = true;
                    clearTimeout(deadline);
                    chrome.storage.onChanged.removeListener(listener);
                    resolve(changes.__VTP_CHINHGIO_STEP_DONE__.newValue);
                }
            }
            chrome.storage.onChanged.addListener(listener);

            // Backup check (signal có thể đã set trước khi listener đăng ký)
            chrome.storage.local.get('__VTP_CHINHGIO_STEP_DONE__', (data) => {
                if (data.__VTP_CHINHGIO_STEP_DONE__ && !resolved) {
                    resolved = true;
                    clearTimeout(deadline);
                    chrome.storage.onChanged.removeListener(listener);
                    resolve(data.__VTP_CHINHGIO_STEP_DONE__);
                }
            });
        });
    }

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

        const mainTabId = tab.id;

        // Disable UI
        startChinhGioBtn.disabled  = true;
        startChinhGioBtn.innerHTML = BTN_HTML.startRunning;

        await chrome.storage.local.set({
            billList:     bills,
            delay,
            isRunning:    true,
            currentIndex: 0
        });
        updateProgressUI(0, bills.length);

        // ── Vòng lặp chính — chạy ở sidepanel (KHÔNG bị throttle) ──
        const skipList = [];

        for (let i = 0; i < bills.length; i++) {
            // Kiểm tra user bấm Dừng
            const state = await chrome.storage.local.get(['isRunning']);
            if (!state.isRunning) {
                console.log('[VTP Sửa Giờ] Người dùng bấm Dừng.');
                break;
            }

            // Cập nhật UI trên sidepanel
            if (statusMsg) statusMsg.textContent      = `Đang xử lý đơn ${i + 1} / ${bills.length}…`;
            if (statusDot) statusDot.style.background = '#f59e0b';
            updateProgressUI(i, bills.length);

            // Xóa signal cũ
            try { await chrome.storage.local.remove('__VTP_CHINHGIO_STEP_DONE__'); } catch (_) {}

            // Inject content script xử lý 1 đơn (tuỳ theo action mode)
            const contentFiles = _actionMode === 'danhgia'
                ? ['src/shared/notification.js', 'src/modules/danhgia/danhgia_content.js']
                : ['src/shared/notification.js', 'src/modules/chinhgio/chinhgio_content.js'];
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: mainTabId },
                    files: contentFiles
                });
            } catch (e) {
                console.error('[VTP] Lỗi inject:', e);
                skipList.push({ bill: bills[i], reason: 'Inject thất bại: ' + e.message });
                continue;
            }

            // Chờ content script hoàn thành 1 đơn (max 2 phút)
            const result = await waitForChinhGioStepDone(120000);
            console.log(`[VTP Sửa Giờ] Kết quả đơn ${i + 1}:`, result.status, result.bill || '');

            if (result.status === 'skipped' || result.status === 'error') {
                skipList.push({ bill: result.bill || bills[i], reason: result.reason || 'Lỗi không xác định' });
            }

            // Cập nhật progress
            updateProgressUI(i + 1, bills.length);

            // Delay giữa các đơn — chạy ở sidepanel → KHÔNG bị throttle!
            // [v3.1] Mode-dependent: đánh giá 300ms (modal-based, nhanh), sửa giờ 1000ms (form, cần buffer)
            if (i < bills.length - 1) {
                const interDelay = _actionMode === 'danhgia' ? 300 : 1000;
                await new Promise(r => setTimeout(r, interDelay));
            }
        }

        // ── Hoàn tất ──
        await chrome.storage.local.set({ isRunning: false });

        if (skipList.length === 0) {
            if (statusMsg) statusMsg.textContent      = '✅ Đã hoàn thành!';
            if (statusDot) statusDot.style.background = '#10B981';
        } else {
            if (statusMsg) statusMsg.textContent      = `⚠️ Xong — Bỏ qua ${skipList.length} đơn`;
            if (statusDot) statusDot.style.background = '#f59e0b';
            console.warn('[VTP Sửa Giờ] Đơn bị bỏ qua:', skipList);
        }

        // Reset UI
        startChinhGioBtn.disabled  = false;
        startChinhGioBtn.innerHTML = BTN_HTML.startPlay;
    });

    stopChinhGioBtn.addEventListener('click', async () => {
        await chrome.storage.local.set({ isRunning: false });
        if (statusMsg) statusMsg.textContent      = 'Đã dừng.';
        if (statusDot) statusDot.style.background = '#78716C';
        startChinhGioBtn.disabled  = false;
        startChinhGioBtn.innerHTML = BTN_HTML.startPlay;
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
    const cancelKiemKeTuyenBtn  = document.getElementById('cancelKiemKeTuyenBtn'); // Fix #1
    const routeProgressCard     = document.getElementById('routeProgressCard');
    const routeProgressBar      = document.getElementById('routeProgressBar');
    const routeProgressPct      = document.getElementById('routeProgressPct');
    const routeProgressStatus   = document.getElementById('routeProgressStatus');
    const routeElapsedEl        = document.getElementById('routeElapsedTime');     // Fix #7
    const routeEtaEl            = document.getElementById('routeEtaTime');         // Fix #7

    let loadedRoutes = []; // Danh sách tuyến đã load

    // Fix #4 + #7: Visual status — lookup bằng data-index (an toàn hơn tên)
    function setRouteStatus(routeName, status) {
        // Tìm bằng data-index nếu có, fallback bằng route name
        const idx = loadedRoutes.indexOf(routeName);
        let item = null;
        if (idx >= 0) {
            const cb = routeChecklist.querySelector(`.route-item-cb[data-index="${idx}"]`);
            if (cb) item = cb.closest('.route-item');
        }
        if (!item) return;
        item.classList.remove('is-running', 'is-done', 'is-error');

        // Xoá icon cũ
        const oldIcon = item.querySelector('.route-status-icon');
        if (oldIcon) oldIcon.remove();

        if (status === 'waiting') return;
        item.classList.add(`is-${status}`);

        // Thêm icon tương ứng
        const iconMap = { running: '⏳', done: '✅', error: '❌' };
        const icon = document.createElement('span');
        icon.className = 'route-status-icon';
        icon.textContent = iconMap[status] || '';
        item.querySelector('label')?.appendChild(icon);
    }

    function setGapTonStatus(isReady, title, desc) {
        statusBoxGapTon.className = `alert ${isReady ? 'alert-success' : 'alert-warning'}`;
        statusBoxGapTon.querySelector('.alert-icon').textContent  = isReady ? '✅' : '⚠️';
        statusBoxGapTon.querySelector('.alert-title').textContent = title;
        statusBoxGapTon.querySelector('.alert-desc').textContent  = desc;
        const dot = statusBoxGapTon.querySelector('.alert-pulse');
        if (dot) dot.style.background = isReady ? 'var(--green)' : 'var(--amber)';
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
                    <div class="empty-icon">
                        <svg viewBox="0 0 56 56" fill="none" width="32" height="32">
                            <rect x="4" y="10" width="30" height="26" rx="4" stroke="var(--red)" stroke-width="1.5" stroke-dasharray="4 2"/>
                            <path d="M34 16l8 0 5 6V36h-13V16z" stroke="var(--red)" stroke-width="1.5"/>
                            <circle cx="11" cy="42" r="4.5" stroke="var(--red)" stroke-width="1.5"/>
                            <circle cx="37" cy="42" r="4.5" stroke="var(--red)" stroke-width="1.5"/>
                        </svg>
                    </div>
                    <p class="empty-title">Chưa có dữ liệu tuyến</p>
                    <p class="empty-hint">Nhấn "Tải danh sách" để bắt đầu</p>
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
                <label class="checkbox-label">
                    <input type="checkbox" class="cb-input route-item-cb" data-index="${idx}" data-route="${route.replace(/"/g, '&quot;')}">
                    <span class="cb-box"></span>
                    <span class="route-item-num">${idx + 1}</span>
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

            // Fix #14: Lưu routes vào session storage
            try {
                if (chrome.storage.session) {
                    await chrome.storage.session.set({ vtpLoadedRoutes: routes });
                }
            } catch (_) {}

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

    // Fix #14: Restore từ session storage
    try {
        if (chrome.storage.session) {
            const sessionData = await chrome.storage.session.get(['vtpLoadedRoutes']);
            if (sessionData.vtpLoadedRoutes?.length > 0) {
                renderRouteChecklist(sessionData.vtpLoadedRoutes);
                console.log('[VTP] ↩ Restored', sessionData.vtpLoadedRoutes.length, 'tuyến từ session');
            }
        }
    } catch (_) {}

    // Fix #1: Nút hủy — set cancelToken thông qua global _vtpCancelToken
    cancelKiemKeTuyenBtn.addEventListener('click', () => {
        if (window._vtpCancelToken) window._vtpCancelToken.cancelled = true;
        cancelKiemKeTuyenBtn.disabled = true;
        routeProgressStatus.textContent = '⏹ Đang dừng sau khi hoàn thành tuyến hiện tại...';
    });

    startKiemKeTuyenBtn.addEventListener('click', async () => {
        let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.url?.includes('viettelpost') && !tab?.url?.includes('localhost')) return;

        const selectedRoutes = [];
        routeChecklist.querySelectorAll('.route-item-cb:checked').forEach(cb => {
            selectedRoutes.push(cb.getAttribute('data-route'));
        });
        if (selectedRoutes.length === 0) { alert('Vui lòng chọn ít nhất 1 tuyến!'); return; }

        // Fix #6: Confirm khi chạy >= 3 tuyến
        if (selectedRoutes.length >= 3) {
            const ok = confirm(
                `Bạn muốn tự động kiểm kê ${selectedRoutes.length} tuyến?\n\n` +
                `Bắt đầu: ${selectedRoutes[0]}\nKết thúc: ${selectedRoutes[selectedRoutes.length - 1]}\n\n` +
                `Mỗi tuyến sẽ mất vài phút. Không thao tác khác trong lúc chạy.`
            );
            if (!ok) return;
        }

        // Fix #2: Lưu mainTabId ngay — dùng get() trong vòng lặp thay vì active query
        const mainTabId = tab.id;

        // Fix #1: Tạo cancel token mới cho lần chạy này
        window._vtpCancelToken = { cancelled: false };
        const cancelToken = window._vtpCancelToken;

        // Disable UI, show cancel button
        startKiemKeTuyenBtn.disabled       = true;
        startKiemKeTuyenBtn.innerHTML      = BTN_HTML.kiemkeRun;
        cancelKiemKeTuyenBtn.style.display = 'inline-flex';
        cancelKiemKeTuyenBtn.disabled      = false;
        loadRoutesBtn.disabled             = true;
        startGapTonBtn.disabled            = true;

        routeProgressCard.style.display = 'block';
        routeProgressBar.style.width    = '0%';
        routeProgressPct.textContent    = `0 / ${selectedRoutes.length}`;
        if (routeElapsedEl) routeElapsedEl.textContent = '⏱ 00:00';
        if (routeEtaEl)     routeEtaEl.textContent     = '';

        let completed  = 0;
        let errors     = [];
        let elapsedSec = 0;

        // Fix #7: ETA / elapsed timer
        const elapsedTimer = setInterval(() => {
            elapsedSec++;
            const m = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
            const s = String(elapsedSec % 60).padStart(2, '0');
            if (routeElapsedEl) routeElapsedEl.textContent = `⏱ ${m}:${s}`;
            if (completed > 0 && routeEtaEl) {
                const avgSec = elapsedSec / completed;
                const remain = selectedRoutes.length - completed;
                const etaSec = Math.round(avgSec * remain);
                const em = String(Math.floor(etaSec / 60)).padStart(2, '0');
                const es = String(etaSec % 60).padStart(2, '0');
                routeEtaEl.textContent = `~Còn ${em}:${es}`;
            }
        }, 1000);

        // ── Helper: chờ tín hiệu scan xong qua chrome.storage.local ──
        // [Fix #21] Dùng storage thay vì window variable → tồn tại qua reload
        // [Fix #22] KHÔNG remove signal ngay lúc khởi tạo — tránh xóa mất tín hiệu
        //           đã được set nếu script scan chạy trước khi poll kịp đăng ký.
        //           Việc xóa signal cũ phải được thực hiện bởi clearScanComplete()
        //           TRƯỚC KHI inject script scan, không phải bên trong pollScanComplete.
        function pollScanComplete(timeoutMs = 600000) {
            return new Promise((resolve) => {
                let resolved = false;

                const deadline = setTimeout(() => {
                    if (resolved) return;
                    resolved = true;
                    chrome.storage.onChanged.removeListener(listener);
                    console.warn('[VTP] pollScanComplete: timeout sau', timeoutMs, 'ms');
                    resolve(false);
                }, timeoutMs);

                // Đăng ký listener TRƯỚC (tránh miss event)
                function listener(changes, namespace) {
                    if (namespace !== 'local' || resolved) return;
                    if (changes.__VTP_SCAN_COMPLETE__?.newValue === true) {
                        resolved = true;
                        clearTimeout(deadline);
                        chrome.storage.onChanged.removeListener(listener);
                        console.log('[VTP] ✅ Nhận tín hiệu __VTP_SCAN_COMPLETE__ từ storage!');
                        resolve(true);
                    }
                }
                chrome.storage.onChanged.addListener(listener);

                // Backup: kiểm tra ngay sau khi đăng ký listener
                // (phòng trường hợp storage đã được set trước khi listener đăng ký)
                chrome.storage.local.get('__VTP_SCAN_COMPLETE__', (data) => {
                    if (data.__VTP_SCAN_COMPLETE__ === true && !resolved) {
                        resolved = true;
                        clearTimeout(deadline);
                        chrome.storage.onChanged.removeListener(listener);
                        console.log('[VTP] ✅ __VTP_SCAN_COMPLETE__ đã có sẵn trong storage (backup check)!');
                        resolve(true);
                    }
                });
            });
        }

        // ── Helper: xóa tín hiệu scan trong storage ──
        async function clearScanComplete() {
            try {
                await chrome.storage.local.remove('__VTP_SCAN_COMPLETE__');
            } catch (_) {}
        }

        // ♥ HELPER: chờ trang scan mở (hỗ trợ cả full-nav và SPA)
        //   • Full-nav: URL thay đổi và tab status = complete
        //   • SPA TH1 : input.clsinputpg xuất hiện (tab có mã)
        //   • SPA TH2 : span.z-label "Hoàn thành" xuất hiện (tab trống)
        //
        // Guard: phải có __VTP_5STEPS_INJECTED__ = true để tránh false-positive
        //   Trước khi script 5 bước chạy, trang cũ có thể đang reload và các element
        //   cũ vẫn xuất hiện trong thời gian ngắn → cần kiểm tra cờ inject.
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

                // Chế độ 2: SPA – poll trang scan (hỗ trợ TH1 có mã VÀ TH2 tab trống)
                // PHẢI kiểm tra __VTP_5STEPS_INJECTED__ để tránh false-positive từ trang cũ
                const spaPoller = setInterval(async () => {
                    try {
                        const res = await chrome.scripting.executeScript({
                            target: { tabId }, world: 'MAIN',
                            func: () => {
                                const injected = !!window.__VTP_5STEPS_INJECTED__;
                                // TH1: tab có mã → input.clsinputpg tồn tại
                                const hasInput = !!document.querySelector('input.clsinputpg');
                                // TH2: tab trống → span.z-label "Hoàn thành" chỉ xuất hiện trên trang scan
                                const hasHoanThanh = Array.from(document.querySelectorAll('span.z-label'))
                                    .some(el => el.textContent.trim() === 'Hoàn thành');
                                return injected && (hasInput || hasHoanThanh);
                            }
                        });
                        if (res?.[0]?.result === true) {
                            console.log('[VTP] ♥ SPA: trang scan đã mở (TH1: input | TH2: Hoàn thành)');
                            finish(true);
                        }
                    } catch (_) {} // tab đang navigate
                }, 800); // [v2.5] Giảm từ 1200ms
            });
        }

        // ♥ HELPER: chờ trang danh sách (sau reload) sẵn sàng
        //   Điều kiện: combobox .z-combobox xuất hiện VÀ không có loading indicator
        function waitForListPageReady(tabId, timeoutMs = 45000) {
            return new Promise((resolve) => {
                const start = Date.now();
                const poller = setInterval(async () => {
                    try {
                        const res = await chrome.scripting.executeScript({
                            target: { tabId }, world: 'MAIN',
                            func: () => {
                                const hasCombobox = document.querySelectorAll('.z-combobox').length > 0;
                                const loading = document.querySelector('.z-loading-indicator, .z-apply-loading-indicator');
                                const isLoading = loading && loading.style.display !== 'none';
                                return hasCombobox && !isLoading;
                            }
                        });
                        if (res?.[0]?.result === true) {
                            clearInterval(poller);
                            resolve(true);
                        } else if (Date.now() - start >= timeoutMs) {
                            clearInterval(poller);
                            resolve(false);
                        }
                    } catch (_) {
                        if (Date.now() - start >= timeoutMs) {
                            clearInterval(poller);
                            resolve(false);
                        }
                    }
                }, 800);
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

            // Fix #1: Kiểm tra cancel trước mỗi tuyến
            if (cancelToken.cancelled) {
                console.log('[VTP] ⏹ Hủy kiểm kê theo yêu cầu người dùng.');
                break;
            }

            routeProgressStatus.textContent = `[${i + 1}/${selectedRoutes.length}] Kiểm kê: ${route}`;
            setRouteStatus(route, 'running'); // Fix #4

            try {
                // A: Fix #2 — dùng mainTabId, không query theo active
                tab = await chrome.tabs.get(mainTabId);

                // B: Chờ trang danh sách sẵn sàng (combobox phải xuất hiện)
                routeProgressStatus.textContent = `[${i + 1}/${selectedRoutes.length}] Chờ trang danh sách sẵn sàng...`;
                const listReady = await waitForListPageReady(mainTabId, 45000);
                if (!listReady) {
                    throw new Error('Trang danh sách không load được (timeout 45s). Vui lòng kiểm tra lại!');
                }
                console.log(`[VTP] ✅ Trang danh sách sẵn sàng cho tuyến: ${route}`);

                // C: Set route + clear flags (SAU khi trang sẵn sàng)
                await chrome.scripting.executeScript({
                    target: { tabId: mainTabId }, world: 'MAIN',
                    func: (name) => {
                        window.__VTP_SELECTED_ROUTE__  = name;
                        window.__VTP_SCAN_COMPLETE__   = null;
                        window.__VTP_5STEPS_DONE__     = null;
                        window.__VTP_5STEPS_INJECTED__ = null; // Reset cờ guard SPA
                    },
                    args: [route]
                });

                // D: Lấy URL hiện tại trước khi inject
                const tabInfo   = await chrome.tabs.get(mainTabId);
                const urlBefore = tabInfo.url;
                console.log('[VTP] URL trước inject:', urlBefore);

                // E: Đăng ký waitForScanPage TRƯỚC khi inject
                routeProgressStatus.textContent = `[${i + 1}/${selectedRoutes.length}] Thực hiện 5 bước: ${route}`;
                const scanPagePromise = waitForScanPage(mainTabId, urlBefore, 90000);

                // F: Inject kiemke_tuyen_auto (5 bước) + đánh dấu đã inject
                await chrome.scripting.executeScript({
                    target: { tabId: mainTabId }, world: 'MAIN',
                    files: ['src/shared/notification.js', 'src/modules/kiemke/kiemke_tuyen_auto.js']
                });
                // Đánh dấu cờ để SPA poller không bị false-positive
                await chrome.scripting.executeScript({
                    target: { tabId: mainTabId }, world: 'MAIN',
                    func: () => { window.__VTP_5STEPS_INJECTED__ = true; }
                });

                // G: Chờ trang scan mở (URL change hoặc SPA input.clsinputpg)
                routeProgressStatus.textContent = `[${i + 1}/${selectedRoutes.length}] Chờ trang kiểm kê mở...`;
                const scanPageReady = await scanPagePromise;
                if (!scanPageReady) {
                    throw new Error('Không vào được trang kiểm kê sau 90 giây');
                }
                console.log('[VTP] ✅ Trang scan đã mở');

                // Buffer nhỏ để trang render đầy đủ (tối ưu từ 2500ms)
                await new Promise(r => setTimeout(r, 500)); // [v2.5] Giảm từ 1000ms

                // H: Inject gapton_core_scan
                routeProgressStatus.textContent = `[${i + 1}/${selectedRoutes.length}] Đang quét mã: ${route}`;
                console.log('[VTP] Inject gapton_core_scan.js...');

                // [Fix #23] Dùng waitForTabReload thay vì chrome.storage signal
                // Lý do: chrome.storage.local.set() KHÔNG hoạt động trong world:'MAIN'
                //        (Chrome MV3: MAIN world không có quyền truy cập Extension APIs)
                // gapton_core_scan.js LUÔN gọi location.reload() khi xong (cả TH1 và TH2)
                // → Tab reload chính là tín hiệu "quét xong" đáng tin cậy nhất
                // PHẢI đăng ký TRƯỚC inject để không bỏ lỡ sự kiện reload
                await clearScanComplete(); // dọn signal cũ (backward compat)
                const scanCompleteViaReload = waitForTabReload(mainTabId, '', 660000); // 11 phút

                await chrome.scripting.executeScript({
                    target: { tabId: mainTabId }, world: 'MAIN',
                    files: ['src/shared/notification.js', 'src/modules/kiemke/gapton_settings.js', 'src/modules/kiemke/gapton_smart_delay.js', 'src/modules/kiemke/gapton_core_scan.js']
                });
                console.log('[VTP] Inject gapton_core_scan.js xong. Chờ tab reload (tín hiệu scan done)...');

                // I: Chờ tab reload = scan xong
                // gapton_core_scan gọi location.reload() → tab fires status:'complete'
                routeProgressStatus.textContent = `[${i + 1}/${selectedRoutes.length}] Chờ quét xong: ${route}...`;
                const scanDone = await scanCompleteViaReload;
                // Tab đã reload hoàn tất tại đây

                if (!scanDone) {
                    console.warn('[VTP] Scan timeout tuyến:', route);
                    errors.push({ route, error: 'Scan timeout sau 11 phút' });
                    setRouteStatus(route, 'error');
                } else {
                    console.log('[VTP] ✅ Scan xong (tab đã reload):', route);
                    setRouteStatus(route, 'done');
                }

                // J: Tab đã tự reload sau scan → KHÔNG waitForTabReload thêm
                // Chỉ cần chờ ổn định, vòng tiếp theo gọi waitForListPageReady
                if (i < selectedRoutes.length - 1 && !cancelToken.cancelled) {
                    if (!scanDone) {
                        // Timeout: chủ động reload để vòng tiếp theo có trang sạch
                        routeProgressStatus.textContent = `[${i + 1}/${selectedRoutes.length}] Đang reload trang...`;
                        const manualP = waitForTabReload(mainTabId, '', 20000);
                        try {
                            await chrome.scripting.executeScript({
                                target: { tabId: mainTabId }, world: 'MAIN',
                                func: () => location.reload()
                            });
                        } catch (_) {}
                        await manualP;
                    }
                    await new Promise(r => setTimeout(r, 200)); // [v2.5] Giảm từ 500ms
                }

            } catch (e) {
                console.error(`[VTP] Lỗi tuyến "${route}":`, e);
                errors.push({ route, error: e.message });
                setRouteStatus(route, 'error'); // Fix #4
                // Sau lỗi: thử reload để vòng tiếp theo có trạng thái sạch
                try {
                    const reloadPromise = waitForTabReload(mainTabId, '', 20000);
                    await chrome.scripting.executeScript({
                        target: { tabId: mainTabId }, world: 'MAIN',
                        func: () => location.reload()
                    });
                    await reloadPromise;
                    await new Promise(r => setTimeout(r, 800)); // [v2.5] Giảm từ 1500ms
                } catch (_) {}
            }

            // Cập nhật progress
            completed++;
            const pct = Math.round((completed / selectedRoutes.length) * 100);
            routeProgressBar.style.width = pct + '%';
            routeProgressPct.textContent = `${completed} / ${selectedRoutes.length}`;

            if (i < selectedRoutes.length - 1 && !cancelToken.cancelled) {
                routeProgressStatus.textContent = `✔️ Xong tuyến ${i + 1}. Chuyển sang tuyến ${i + 2}: ${selectedRoutes[i + 1]}...`;
                await new Promise(r => setTimeout(r, 200)); // [v2.5] Giảm từ 500ms
            }
        }

        // Hoàn tất — dọn dẹp
        clearInterval(elapsedTimer); // Fix #7
        if (routeEtaEl) routeEtaEl.textContent = '';
        routeProgressBar.style.width = '100%';

        if (cancelToken.cancelled) {
            routeProgressStatus.textContent = `⏹ Đã dừng. Hoàn thành ${completed}/${selectedRoutes.length} tuyến.`;
        } else if (errors.length === 0) {
            routeProgressStatus.textContent = `✅ Hoàn tất! Đã kiểm kê ${completed} tuyến thành công.`;
        } else {
            routeProgressStatus.textContent =
                `⚠️ Hoàn tất ${completed} tuyến. ${errors.length} lỗi: ${errors.map(e => e.route).join(', ')}`;
        }

        // Reset UI
        startKiemKeTuyenBtn.disabled       = false;
        startKiemKeTuyenBtn.innerHTML      = BTN_HTML.kiemkePlay; // Fix #5
        cancelKiemKeTuyenBtn.style.display = 'none';              // Fix #1
        cancelKiemKeTuyenBtn.disabled      = false;
        loadRoutesBtn.disabled             = false;
        startGapTonBtn.disabled            = false;
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
                files:  ['src/shared/notification.js', 'src/modules/kiemke/gapton_settings.js', 'src/modules/kiemke/gapton_smart_delay.js', 'src/modules/kiemke/gapton_core_scan.js']
            });
        } catch (e) {
            console.error('[VTP] Lỗi inject Kiểm Tồn:', e);
            alert('Không thể chạy script. Hãy kiểm tra lại trang ViettelPost!');
            startGapTonBtn.disabled  = false;
            startGapTonBtn.innerHTML = BTN_HTML.gaptonPlay;
            return;
        }

        // Side panel không đóng được bằng window.close()
        // Tool đã inject thành công, người dùng có thể tiếp tục xem trạng thái
        startGapTonBtn.innerHTML = BTN_HTML.gaptonPlay.replace('Quét Mã Kiểm Tồn', '✅ Đã nạp script!');
        setTimeout(() => {
            startGapTonBtn.disabled  = false;
            startGapTonBtn.innerHTML = BTN_HTML.gaptonPlay;
        }, 3000);
    });

    // ════════════════════════════════════════
    //  TAB 3 — KIỂM TRA ĐƠN
    //  Tra cứu hành trình và kiểm tra đơn chưa phân công
    // ════════════════════════════════════════

    const KTD_URL = 'https://evtp2.viettelpost.vn/?uId=tra-cuu-hanh-trinh-vip';
    const CPC_URL = 'https://evtp2.viettelpost.vn/?uId=khai-thac-den/khai-thac';

    // ── DOM refs ──
    const ktdModeSwitcher         = document.getElementById('ktdModeSwitcher');
    const ktdModeChuaPhanCong     = document.getElementById('ktdModeChuaPhanCong');
    const ktdModePhanCongTuyen     = document.getElementById('ktdModePhanCongTuyen');
    const ktdModeDonDi            = document.getElementById('ktdModeDonDi');
    const ktdCpcInstructionsCard  = document.getElementById('ktdCpcInstructionsCard');
    const ktdPctCard               = document.getElementById('ktdPctInstructionsCard');
    const ktdSectionTitleText     = document.getElementById('ktdSectionTitleText');

    const ktdDropzone        = document.getElementById('ktdDropzone');
    const ktdFileInput       = document.getElementById('ktdFileInput');
    const ktdDropzoneContent = document.getElementById('ktdDropzoneContent');
    const ktdDropzoneLoaded  = document.getElementById('ktdDropzoneLoaded');
    const ktdLoadedFileName  = document.getElementById('ktdLoadedFileName');
    const ktdClearBtn        = document.getElementById('ktdClearBtn');
    const ktdCustomerSection = document.getElementById('ktdCustomerSection');
    const ktdCustomerSearch  = document.getElementById('ktdCustomerSearch');
    const ktdClearSearch     = document.getElementById('ktdClearSearch');
    const ktdCustomerSummary = document.getElementById('ktdCustomerSummary');
    const ktdCustomerList    = document.getElementById('ktdCustomerList');
    const ktdSelectedBills   = document.getElementById('ktdSelectedBills');
    const ktdSelectedName    = document.getElementById('ktdSelectedName');
    const ktdSelectedList    = document.getElementById('ktdSelectedList');
    const ktdBackBtn         = document.getElementById('ktdBackBtn');
    const ktdBillCountEl     = document.getElementById('ktdBillCount');
    const startKtdBtn        = document.getElementById('startKiemTraDonBtn');
    const stopKtdBtn         = document.getElementById('stopKiemTraDonBtn');
    const ktdProgressCard    = document.getElementById('ktdProgressContainer');
    const ktdProgressBar     = document.getElementById('ktdProgressBar');
    const ktdProgressText    = document.getElementById('ktdProgressText');
    const ktdStatusDot       = document.querySelector('#ktdStatus .status-dot');
    const ktdStatusMsg       = document.querySelector('#ktdStatus .status-text');
    const ktdResultsCard     = document.getElementById('ktdResultsCard');
    const ktdResultsBody     = document.getElementById('ktdResultsBody');
    const ktdResultSummary   = document.getElementById('ktdResultSummary');
    const ktdExportBtn       = document.getElementById('ktdExportBtn');

    let _ktdExcelData  = {}; // { maKH: [mã phiếu gửi] }
    let _ktdBills      = []; // Danh sách mã phiếu gửi đã chọn
    let _ktdResults    = []; // Kết quả tra cứu
    let _ktdIsRunning  = false;
    let _ktdMode       = 'chuaphancong'; // 'chuaphancong' hoặc 'dondi'

    // ── Mode Switcher Events ──
    ktdModeChuaPhanCong.addEventListener('click', () => {
        if (_ktdIsRunning) return;
        _ktdMode = 'chuaphancong';
        ktdModeChuaPhanCong.classList.add('active');
        ktdModeDonDi.classList.remove('active');
        ktdModePhanCongTuyen.classList.remove('active');
        ktdCpcInstructionsCard.style.display = 'block';
        ktdExcelCard.style.display = 'none';
        ktdPctCard.style.display = 'none';
        ktdSectionTitleText.textContent = 'Kiểm tra đơn chưa phân công';
        startKtdBtn.innerHTML = '<i class="bi bi-play-fill" style="font-size: 14px;"></i> Bắt Đầu Quét';
        startKtdBtn.disabled = false;
        ktdResultsCard.style.display = 'none';
        ktdProgressCard.style.display = 'none';
        ktdStatusMsg.textContent = 'Sẵn sàng hoạt động';
        ktdStatusDot.style.background = '#10B981';
    });

    ktdModeDonDi.addEventListener('click', () => {
        if (_ktdIsRunning) return;
        _ktdMode = 'dondi';
        ktdModeDonDi.classList.add('active');
        ktdModeChuaPhanCong.classList.remove('active');
        ktdModePhanCongTuyen.classList.remove('active');
        ktdExcelCard.style.display = 'block';
        ktdCpcInstructionsCard.style.display = 'none';
        ktdPctCard.style.display = 'none';
        ktdSectionTitleText.textContent = 'Tra cứu hành trình đơn đi';
        startKtdBtn.innerHTML = '<i class="bi bi-play-fill" style="font-size: 14px;"></i> Bắt Đầu Kiểm Tra';
        ktdResultsCard.style.display = 'none';
        ktdProgressCard.style.display = 'none';
        ktdUpdateBillCount();
        if (_ktdBills.length === 0) {
            ktdStatusMsg.textContent = 'Sẵn sàng — Hãy tải file Excel';
            ktdStatusDot.style.background = '#f59e0b';
        } else {
            ktdStatusMsg.textContent = 'Sẵn sàng hoạt động';
            ktdStatusDot.style.background = '#10B981';
        }
    });

    // ════════════════════════════════════════
    //  MODE: PHÂN CÔNG THEO TUYẾN
    // ════════════════════════════════════════
    const PHANCONG_URL = 'https://evtp2.viettelpost.vn/?uId=khai-thac-den/phan-cong-phat';

    const pctDropzone        = document.getElementById('pctDropzone');
    const pctFileInput       = document.getElementById('pctFileInput');
    const pctDropzoneContent = document.getElementById('pctDropzoneContent');
    const pctDropzoneLoaded  = document.getElementById('pctDropzoneLoaded');
    const pctLoadedFileName  = document.getElementById('pctLoadedFileName');
    const pctClearBtn        = document.getElementById('pctClearBtn');
    const pctBillCount       = document.getElementById('pctBillCount');
    const pctPreview         = document.getElementById('pctPreview');
    const pctSummary         = document.getElementById('pctSummary');
    const pctGroupList       = document.getElementById('pctGroupList');
    const pctCheckBtn        = document.getElementById('pctCheckBtn');

    let _pctGroups  = []; // [{ shortName, bills:[...], matchedRoute?, _matchStatus?, _matchList? }]
    let _pctSkipped = 0;   // số dòng bỏ qua (chưa gán bưu tá)
    let _pctAlias   = {};  // { tên_gõ_đã_chuẩn_hoá: 'HBCTVT ...' } — bộ nhớ alias lâu dài
    let _pctRoutes  = [];  // danh sách tuyến đọc từ trang (phục vụ ô gõ-để-lọc)

    // Nạp alias đã lưu (tự học qua các lần dùng)
    chrome.storage.local.get('vtp_pc_alias', (d) => {
        if (d.vtp_pc_alias && typeof d.vtp_pc_alias === 'object') _pctAlias = d.vtp_pc_alias;
    });

    ktdModePhanCongTuyen.addEventListener('click', () => {
        if (_ktdIsRunning) return;
        _ktdMode = 'phancongtuyen';
        ktdModePhanCongTuyen.classList.add('active');
        ktdModeChuaPhanCong.classList.remove('active');
        ktdModeDonDi.classList.remove('active');
        ktdPctCard.style.display = 'block';
        ktdCpcInstructionsCard.style.display = 'none';
        ktdExcelCard.style.display = 'none';
        ktdSectionTitleText.textContent = 'Phân công đơn theo tuyến';
        startKtdBtn.innerHTML = '<i class="bi bi-play-fill" style="font-size: 14px;"></i> Bắt Đầu Phân Công';
        startKtdBtn.disabled = _pctGroups.length === 0;
        ktdResultsCard.style.display = 'none';
        ktdProgressCard.style.display = 'none';
        if (_pctGroups.length === 0) {
            ktdStatusMsg.textContent = 'Sẵn sàng — Hãy tải file phân công';
            ktdStatusDot.style.background = '#f59e0b';
        } else {
            ktdStatusMsg.textContent = 'Sẵn sàng hoạt động';
            ktdStatusDot.style.background = '#10B981';
        }
    });

    // ── Dropzone events ──
    pctDropzone.addEventListener('click', (e) => {
        if (e.target.closest('.loaded-file-clear')) return;
        pctFileInput.click();
    });
    pctFileInput.addEventListener('change', (e) => {
        if (e.target.files[0]) pctProcessExcel(e.target.files[0]);
    });
    pctDropzone.addEventListener('dragover', (e) => {
        e.preventDefault(); e.stopPropagation();
        pctDropzone.classList.add('drag-over');
    });
    pctDropzone.addEventListener('dragleave', (e) => {
        e.preventDefault(); e.stopPropagation();
        pctDropzone.classList.remove('drag-over');
    });
    pctDropzone.addEventListener('drop', (e) => {
        e.preventDefault(); e.stopPropagation();
        pctDropzone.classList.remove('drag-over');
        const file = e.dataTransfer?.files?.[0];
        if (file) pctProcessExcel(file);
    });
    pctClearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        pctResetState();
    });

    function pctResetState() {
        _pctGroups = [];
        _pctSkipped = 0;
        pctFileInput.value = '';
        pctDropzoneContent.style.display = 'flex';
        pctDropzoneLoaded.style.display  = 'none';
        pctPreview.style.display = 'none';
        pctGroupList.innerHTML = '';
        pctUpdateCount();
        startKtdBtn.disabled = true;
    }

    function pctUpdateCount() {
        const totalBills = _pctGroups.reduce((s, g) => s + g.bills.length, 0);
        pctBillCount.textContent = `${totalBills} mã`;
        pctBillCount.classList.toggle('has-bills', totalBills > 0);
    }

    // ── Parse Excel — nhóm mã theo cột "Tên bưu tá" ──
    function pctProcessExcel(file) {
        const validExts = ['.xlsx', '.xls', '.csv'];
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!validExts.includes(ext)) {
            alert('Chỉ hỗ trợ file .xlsx, .xls hoặc .csv!');
            return;
        }

        pctLoadedFileName.textContent    = file.name;
        pctDropzoneContent.style.display = 'none';
        pctDropzoneLoaded.style.display  = 'block';

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

                if (rows.length < 2) {
                    alert('File Excel không có dữ liệu!');
                    pctResetState();
                    return;
                }

                const headers = rows[0].map(h => String(h || '').trim());
                const buuTaIdx = headers.indexOf('Tên bưu tá');
                const maIdx    = headers.indexOf('Mã phiếu gửi');

                if (buuTaIdx < 0) {
                    alert('Không tìm thấy cột "Tên bưu tá"!\n\nCác cột hiện có: ' + headers.join(', '));
                    pctResetState();
                    return;
                }
                if (maIdx < 0) {
                    alert('Không tìm thấy cột "Mã phiếu gửi"!\n\nCác cột hiện có: ' + headers.join(', '));
                    pctResetState();
                    return;
                }

                // Gom theo tên bưu tá (bỏ dòng chưa điền tên)
                const groups = {};
                let totalBills = 0;
                let skipped = 0;
                for (let i = 1; i < rows.length; i++) {
                    const row  = rows[i];
                    const name = String(row[buuTaIdx] || '').trim();
                    const code = String(row[maIdx] || '').trim();
                    if (!code) continue;
                    if (!name) { skipped++; continue; } // chưa gán bưu tá → bỏ qua
                    if (!groups[name]) groups[name] = [];
                    if (!groups[name].includes(code)) {
                        groups[name].push(code);
                        totalBills++;
                    }
                }

                _pctGroups = Object.entries(groups).map(([shortName, bills]) => ({ shortName, bills }));

                if (_pctGroups.length === 0) {
                    alert('Không có dòng nào đã điền "Tên bưu tá"!\nHãy điền cột Tên bưu tá trước khi tải lên.');
                    pctResetState();
                    return;
                }

                _pctSkipped = skipped;
                pctRenderPreview();
                pctUpdateCount();
                startKtdBtn.disabled = false;
                ktdStatusMsg.textContent = 'Sẵn sàng hoạt động';
                ktdStatusDot.style.background = '#10B981';
                console.log(`[VTP PhânCông] Đọc ${totalBills} mã / ${_pctGroups.length} bưu tá (bỏ qua ${skipped} dòng chưa gán).`);

            } catch (err) {
                console.error('[VTP PhânCông] Lỗi đọc file:', err);
                alert('Lỗi đọc file Excel: ' + err.message);
                pctResetState();
            }
        };
        reader.readAsArrayBuffer(file);
    }

    function pctRenderPreview() {
        pctPreview.style.display = 'block';
        const totalBills = _pctGroups.reduce((s, g) => s + g.bills.length, 0);
        let summary = `${_pctGroups.length} bưu tá · ${totalBills} mã`
            + (_pctSkipped ? ` · bỏ qua ${_pctSkipped} dòng chưa gán` : '');

        const checked = _pctGroups.some(g => g._matchStatus);
        if (checked) {
            const ok   = _pctGroups.filter(g => g._matchStatus === 'ok').length;
            const warn = _pctGroups.filter(g => g._matchStatus === 'warn').length;
            const fail = _pctGroups.filter(g => g._matchStatus === 'fail').length;
            summary += `  —  ✓ ${ok}   ⚠️ ${warn}   ❌ ${fail}`;
        }
        pctSummary.textContent = summary;

        pctGroupList.innerHTML = '';
        const frag = document.createDocumentFragment();
        // Đưa các mục cần xử lý (❌ rồi ⚠️) lên đầu cho dễ thấy
        const rank = s => (s === 'fail' ? 0 : s === 'warn' ? 1 : 2);
        _pctGroups
            .slice()
            .sort((a, b) => {
                const r = rank(a._matchStatus) - rank(b._matchStatus);
                return r !== 0 ? r : b.bills.length - a.bills.length;
            })
            .forEach(g => frag.appendChild(pctBuildGroupItem(g)));
        pctGroupList.appendChild(frag);
    }

    // ── Dựng 1 dòng bưu tá + khu xử lý ⚠️/❌ (dùng textContent → an toàn XSS) ──
    function pctBuildGroupItem(g) {
        const wrap = document.createElement('div');
        wrap.className = 'customer-item';
        wrap.style.flexDirection = 'column';
        wrap.style.alignItems = 'stretch';
        if (g._matchStatus === 'ok')   wrap.style.borderColor = 'var(--green)';
        if (g._matchStatus === 'warn') wrap.style.borderColor = 'var(--amber)';
        if (g._matchStatus === 'fail') wrap.style.borderColor = 'var(--red)';

        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;';
        const info = document.createElement('div');
        info.className = 'customer-info';
        info.style.flex = '1';
        const n = document.createElement('div');
        n.className = 'customer-name';
        n.textContent = g.shortName;
        const m = document.createElement('div');
        m.className = 'customer-meta';
        if (g._matchStatus === 'ok') {
            m.textContent = `${g.bills.length} mã → ${g.matchedRoute}`;
            m.style.color = 'var(--green)';
        } else if (g._matchStatus === 'warn') {
            m.textContent = `${g.bills.length} mã · ⚠️ chọn đúng tuyến:`;
            m.style.color = 'var(--amber)';
        } else if (g._matchStatus === 'fail') {
            m.textContent = `${g.bills.length} mã · ❌ chưa khớp — gõ tìm tuyến:`;
            m.style.color = 'var(--red)';
        } else {
            m.textContent = `${g.bills.length} mã`;
        }
        info.appendChild(n);
        info.appendChild(m);
        const badge = document.createElement('span');
        badge.className = 'customer-count-badge';
        badge.textContent = g.bills.length;
        row.appendChild(info);
        row.appendChild(badge);
        wrap.appendChild(row);

        // ⚠️ khớp nhiều tuyến → chỉ hiện ĐÚNG các ứng viên đã khớp (2–3 nút)
        if (g._matchStatus === 'warn') {
            const box = document.createElement('div');
            box.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;';
            (g._matchList || []).forEach(rt => {
                box.appendChild(pctMakeButton(rt, 'var(--amber)', () => pctResolveGroup(g, rt)));
            });
            wrap.appendChild(box);
        }
        // ❌ không khớp → ô gõ-để-lọc trong TOÀN BỘ tuyến (không hiện dropdown dài)
        else if (g._matchStatus === 'fail') {
            wrap.appendChild(pctBuildSearchBox(g));
        }
        return wrap;
    }

    function pctMakeButton(label, borderColor, onClick) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.style.cssText = `text-align:left;padding:5px 10px;border:1px solid ${borderColor};`
            + 'background:var(--white);color:var(--tx-primary);border-radius:8px;font-size:11.5px;cursor:pointer;';
        b.addEventListener('click', onClick);
        return b;
    }

    function pctBuildSearchBox(g) {
        const box = document.createElement('div');
        box.style.cssText = 'margin-top:6px;';
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.placeholder = 'Gõ vài ký tự để tìm bưu tá…';
        inp.style.cssText = 'width:100%;padding:6px 8px;border:1px solid var(--red);border-radius:6px;font-size:12px;box-sizing:border-box;';
        const results = document.createElement('div');
        results.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-top:4px;max-height:150px;overflow-y:auto;';
        const render = () => {
            const q = pctFold(inp.value);
            results.innerHTML = '';
            if (!q) return;
            const found = _pctRoutes.filter(r => pctFold(r).includes(q)).slice(0, 8);
            if (found.length === 0) {
                const e = document.createElement('div');
                e.textContent = 'Không tìm thấy';
                e.style.cssText = 'font-size:11px;color:var(--tx-muted);padding:4px;';
                results.appendChild(e);
                return;
            }
            found.forEach(rt => results.appendChild(
                pctMakeButton(rt, 'var(--border)', () => pctResolveGroup(g, rt))
            ));
        };
        inp.addEventListener('input', render);
        box.appendChild(inp);
        box.appendChild(results);
        return box;
    }

    // ── Người dùng chốt tuyến cho 1 bưu tá → lưu alias + re-render ──
    function pctResolveGroup(g, route) {
        g.matchedRoute = route;
        g._matchStatus = 'ok';
        g._matchList = [route];
        pctSaveAlias(g.shortName, route);
        pctRenderPreview();
        const fail = _pctGroups.filter(x => x._matchStatus === 'fail').length;
        const warn = _pctGroups.filter(x => x._matchStatus === 'warn').length;
        if (fail === 0 && warn === 0) {
            ktdStatusMsg.textContent = `✅ Đã khớp đủ ${_pctGroups.length} bưu tá — sẵn sàng phân công.`;
            ktdStatusDot.style.background = '#10B981';
        }
    }

    // ── Chuẩn hoá & khớp tên (có bỏ dấu + alias tự học) ──
    function pctNormName(s) {
        return (s || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    }
    function pctStripDiacritics(s) {
        return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd').replace(/Đ/g, 'd');
    }
    function pctFold(s) { return pctStripDiacritics(pctNormName(s)); } // lowercase + bỏ dấu

    function pctSaveAlias(name, route) {
        const key = pctNormName(name);
        if (!key || !route) return;
        _pctAlias[key] = route;
        try { chrome.storage.local.set({ vtp_pc_alias: _pctAlias }); } catch (_) {}
    }

    // Khớp 1 bưu tá → { status:'ok'|'warn'|'fail', route, list, learn }
    function pctMatchGroup(routes, shortName) {
        const key = pctNormName(shortName);
        if (!key) return { status: 'fail', route: null, list: [] };

        // 1) Alias đã nhớ (và tuyến vẫn còn trên trang)
        if (_pctAlias[key] && routes.includes(_pctAlias[key])) {
            return { status: 'ok', route: _pctAlias[key], list: [_pctAlias[key]] };
        }
        // 2) Khớp còn dấu theo từ cuối
        let m = routes.filter(r => {
            const f = pctNormName(r);
            return f === key || f.endsWith(' ' + key);
        });
        if (m.length === 1) return { status: 'ok', route: m[0], list: m, learn: true };
        if (m.length > 1)  return { status: 'warn', route: null, list: m };
        // 3) Khớp bỏ dấu theo từ cuối (bắt trường hợp gõ thiếu dấu)
        const fk = pctFold(shortName);
        m = routes.filter(r => {
            const f = pctFold(r);
            return f === fk || f.endsWith(' ' + fk);
        });
        if (m.length === 1) return { status: 'ok', route: m[0], list: m, learn: true };
        if (m.length > 1)  return { status: 'warn', route: null, list: m };
        return { status: 'fail', route: null, list: [] };
    }

    // ── Đọc danh sách tuyến (combobox "Chọn tuyến NVBH") từ trang phân công ──
    async function pctReadRoutesFromPage(tabId) {
        try {
            const res = await chrome.scripting.executeScript({
                target: { tabId },
                func: () => {
                    const norm = s => (s || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
                    const set = new Set();
                    document.querySelectorAll('.z-combobox').forEach(cb => {
                        const inp = cb.querySelector('.z-combobox-input');
                        const ph = inp ? (inp.getAttribute('placeholder') || '') : '';
                        if (ph.includes('Chọn tuyến')) {
                            cb.querySelectorAll('.z-comboitem-text').forEach(el => {
                                const t = norm(el.textContent);
                                if (t) set.add(t);
                            });
                        }
                    });
                    return Array.from(set);
                }
            });
            return res?.[0]?.result || [];
        } catch (_) {
            return [];
        }
    }

    // ── Đối chiếu tên bưu tá ↔ tuyến (bấm nút) ──
    async function pctRunCheck() {
        if (_pctGroups.length === 0) { alert('Hãy tải file phân công trước!'); return; }

        let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) { alert('Không tìm thấy tab trình duyệt!'); return; }

        pctCheckBtn.disabled = true;
        const oldHtml = pctCheckBtn.innerHTML;
        pctCheckBtn.innerHTML = '<i class="bi bi-arrow-repeat spin" style="font-size: 14px;"></i> Đang đọc tuyến…';

        // Mở trang phân công nếu chưa ở đó
        if (!tab.url?.includes('khai-thac-den/phan-cong-phat')) {
            const navP = waitForPcTabReload(tab.id, 45000);
            await chrome.tabs.update(tab.id, { url: PHANCONG_URL });
            await navP;
            await new Promise(r => setTimeout(r, 2000));
            tab = await chrome.tabs.get(tab.id);
        }
        // Chờ trang sẵn sàng rồi đọc tuyến
        await waitForPcPageReady(tab.id, 30000);
        const routes = await pctReadRoutesFromPage(tab.id);

        pctCheckBtn.disabled = false;
        pctCheckBtn.innerHTML = oldHtml;

        if (routes.length === 0) {
            alert('Không đọc được danh sách tuyến. Đảm bảo đang ở trang "Phân công phát" và trang đã tải xong.');
            return;
        }

        _pctRoutes = routes; // lưu cho ô gõ-để-lọc

        // Khớp từng bưu tá (alias → còn dấu → bỏ dấu); tự học khi khớp duy nhất
        _pctGroups.forEach(g => {
            const res = pctMatchGroup(routes, g.shortName);
            g._matchStatus = res.status;
            g._matchList   = res.list;
            g.matchedRoute = res.route;
            if (res.status === 'ok' && res.learn) pctSaveAlias(g.shortName, res.route);
        });

        pctRenderPreview();

        const fail = _pctGroups.filter(g => g._matchStatus === 'fail').length;
        const warn = _pctGroups.filter(g => g._matchStatus === 'warn').length;
        if (fail === 0 && warn === 0) {
            ktdStatusMsg.textContent = `✅ Đối chiếu xong — tất cả ${_pctGroups.length} bưu tá khớp tuyến.`;
            ktdStatusDot.style.background = '#10B981';
        } else {
            ktdStatusMsg.textContent = `⚠️ Đối chiếu: ${warn} cảnh báo, ${fail} không tìm thấy — nên sửa file trước khi chạy.`;
            ktdStatusDot.style.background = '#f59e0b';
        }
    }

    pctCheckBtn.addEventListener('click', pctRunCheck);

    // ── Helper: chờ content script phân công báo xong 1 BƯU TÁ ──
    function waitForPhanCongStepDone(timeoutMs = 660000) { // 11 phút
        return new Promise((resolve) => {
            let resolved = false;
            const deadline = setTimeout(() => {
                if (resolved) return;
                resolved = true;
                chrome.storage.onChanged.removeListener(listener);
                resolve({ status: 'timeout' });
            }, timeoutMs);

            function listener(changes, ns) {
                if (ns !== 'local' || resolved) return;
                if (changes.__VTP_PHANCONG_PROGRESS__?.newValue) {
                    pctRenderProgress(changes.__VTP_PHANCONG_PROGRESS__.newValue);
                }
                if (changes.__VTP_PHANCONG_STEP_DONE__?.newValue) {
                    resolved = true;
                    clearTimeout(deadline);
                    chrome.storage.onChanged.removeListener(listener);
                    resolve(changes.__VTP_PHANCONG_STEP_DONE__.newValue);
                }
            }
            chrome.storage.onChanged.addListener(listener);

            chrome.storage.local.get('__VTP_PHANCONG_STEP_DONE__', (d) => {
                if (d.__VTP_PHANCONG_STEP_DONE__ && !resolved) {
                    resolved = true;
                    clearTimeout(deadline);
                    chrome.storage.onChanged.removeListener(listener);
                    resolve(d.__VTP_PHANCONG_STEP_DONE__);
                }
            });
        });
    }

    // ── Helper: chờ trang phân công sẵn sàng (nút "Thêm mới" hiển thị, hết loading) ──
    function waitForPcPageReady(tabId, timeoutMs = 45000) {
        return new Promise((resolve) => {
            const start = Date.now();
            const poller = setInterval(async () => {
                try {
                    const res = await chrome.scripting.executeScript({
                        target: { tabId },
                        func: () => {
                            const norm = s => (s || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
                            const hasThemMoi = Array.from(document.querySelectorAll('button.z-button'))
                                .some(b => norm(b.textContent) === 'Thêm mới' && b.offsetParent !== null);
                            const loading = document.querySelector('.z-loading-indicator, .z-apply-loading-indicator');
                            const isLoading = loading && loading.style.display !== 'none' && loading.offsetParent !== null;
                            return hasThemMoi && !isLoading;
                        }
                    });
                    if (res?.[0]?.result === true) { clearInterval(poller); resolve(true); }
                    else if (Date.now() - start >= timeoutMs) { clearInterval(poller); resolve(false); }
                } catch (_) {
                    if (Date.now() - start >= timeoutMs) { clearInterval(poller); resolve(false); }
                }
            }, 700);
        });
    }

    // ── Helper: chờ tab reload hoàn tất ──
    function waitForPcTabReload(tabId, timeoutMs = 30000) {
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve(false);
            }, timeoutMs);
            const listener = (tid, changeInfo) => {
                if (tid !== tabId || changeInfo.status !== 'complete') return;
                clearTimeout(timer);
                chrome.tabs.onUpdated.removeListener(listener);
                resolve(true);
            };
            chrome.tabs.onUpdated.addListener(listener);
        });
    }

    function pctRenderProgress(p) {
        if (!p) return;
        const total = p.total || _pctGroups.length;
        let msg = `[${(p.current || 0) + 1}/${total}] ${p.postman || ''} — ${p.phase || ''}`;
        if (p.phase === 'Quét mã' && p.totalBills) {
            msg += ` (${p.scanned || 0}/${p.totalBills})`;
        }
        ktdStatusMsg.textContent = msg;
        ktdStatusDot.style.background = '#f59e0b';
    }

    // ── Báo cáo cuối phiên: gom mã quét lỗi theo từng bưu tá ──
    function pctRenderRunReport() {
        pctPreview.style.display = 'block';
        const totalBills   = _pctGroups.reduce((s, g) => s + g.bills.length, 0);
        const totalScanned = _pctGroups.reduce((s, g) => s + ((g._runScanned) || 0), 0);
        const totalFailed  = _pctGroups.reduce((s, g) => s + ((g._runFailed?.length) || 0), 0);
        pctSummary.textContent = `Kết quả: đã quét ${totalScanned}/${totalBills} mã · ${totalFailed} mã lỗi`;

        pctGroupList.innerHTML = '';

        // Nút copy toàn bộ mã lỗi (kèm tên bưu tá) nếu có
        if (totalFailed > 0) {
            const allFailed = _pctGroups.flatMap(g => (g._runFailed || []).map(c => `${g.shortName}\t${c}`));
            const copyAll = pctMakeButton(`📋 Copy tất cả ${totalFailed} mã lỗi`, 'var(--red)', () => {
                if (navigator.clipboard?.writeText) {
                    navigator.clipboard.writeText(allFailed.join('\n'))
                        .then(() => { copyAll.textContent = '✓ Đã copy vào clipboard'; })
                        .catch(() => {});
                }
            });
            copyAll.style.marginBottom = '6px';
            pctGroupList.appendChild(copyAll);
        }

        const frag = document.createDocumentFragment();
        // Nhóm có lỗi hiển thị lên trước
        _pctGroups
            .slice()
            .sort((a, b) => ((b._runFailed?.length) || 0) - ((a._runFailed?.length) || 0))
            .forEach(g => frag.appendChild(pctBuildReportItem(g)));
        pctGroupList.appendChild(frag);
    }

    function pctBuildReportItem(g) {
        const failed = g._runFailed || [];
        const wrap = document.createElement('div');
        wrap.className = 'customer-item';
        wrap.style.flexDirection = 'column';
        wrap.style.alignItems = 'stretch';
        if (g._runStatus === 'error') wrap.style.borderColor = 'var(--red)';
        else if (failed.length > 0)   wrap.style.borderColor = 'var(--amber)';
        else                          wrap.style.borderColor = 'var(--green)';

        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;';
        const info = document.createElement('div');
        info.className = 'customer-info';
        info.style.flex = '1';
        const n = document.createElement('div');
        n.className = 'customer-name';
        n.textContent = g.shortName + (g.matchedRoute ? ` → ${g.matchedRoute}` : '');
        const m = document.createElement('div');
        m.className = 'customer-meta';
        if (g._runStatus === 'error') {
            m.textContent = `❌ Lỗi: ${g._runReason || 'không xác định'} (0/${g._runTotal || g.bills.length})`;
            m.style.color = 'var(--red)';
        } else if (failed.length > 0) {
            m.textContent = `⚠️ ${g._runScanned}/${g._runTotal} mã vào · ${failed.length} mã lỗi`;
            m.style.color = 'var(--amber)';
        } else {
            m.textContent = `✅ ${g._runScanned}/${g._runTotal} mã — đủ`;
            m.style.color = 'var(--green)';
        }
        info.appendChild(n);
        info.appendChild(m);
        const badge = document.createElement('span');
        badge.className = 'customer-count-badge';
        badge.textContent = failed.length ? `${failed.length} lỗi` : '✓';
        row.appendChild(info);
        row.appendChild(badge);
        wrap.appendChild(row);

        // Danh sách mã lỗi (chip monospace) — dùng textContent, an toàn XSS
        if (failed.length > 0) {
            const box = document.createElement('div');
            box.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;';
            failed.forEach(code => {
                const chip = document.createElement('span');
                chip.textContent = code;
                chip.style.cssText = 'font-family:Consolas,monospace;font-size:11px;padding:2px 6px;'
                    + 'background:var(--red-pale);color:var(--red);border:1px solid var(--red-border);border-radius:4px;';
                box.appendChild(chip);
            });
            wrap.appendChild(box);
        }
        return wrap;
    }

    // 🚀 CHẠY PHÂN CÔNG TỰ ĐỘNG — sidepanel điều phối, 1 bưu tá/lần + reload
    async function runKtdPhanCongTuyen() {
        if (_pctGroups.length === 0) {
            alert('Vui lòng tải file phân công (đã điền cột Tên bưu tá)!');
            return;
        }

        const totalBills = _pctGroups.reduce((s, g) => s + g.bills.length, 0);
        const problems = _pctGroups.filter(g => g._matchStatus === 'fail' || g._matchStatus === 'warn');
        let warnLine = '';
        if (problems.length > 0) {
            warnLine = `\n⚠️ CẢNH BÁO: ${problems.length} bưu tá chưa khớp tuyến chắc chắn `
                + `(${problems.map(g => g.shortName).join(', ')}). Nên bấm "Đối chiếu" và sửa file trước.\n`;
        }
        const ok = confirm(
            `Phân công ${totalBills} mã cho ${_pctGroups.length} bưu tá?\n${warnLine}\n` +
            _pctGroups.map(g => `• ${g.shortName}: ${g.bills.length} mã`).join('\n') +
            `\n\nKhông thao tác chuột/bàn phím khi tool đang chạy.`
        );
        if (!ok) return;

        let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) { alert('Không tìm thấy tab trình duyệt!'); return; }

        _ktdIsRunning = true;
        startKtdBtn.disabled = true;
        startKtdBtn.innerHTML = '<i class="bi bi-arrow-repeat spin" style="font-size: 14px;"></i> Đang phân công…';
        ktdProgressCard.style.display = 'block';
        ktdProgressBar.style.width = '0%';
        ktdProgressText.textContent = `0 / ${_pctGroups.length} bưu tá`;
        ktdResultsCard.style.display = 'none';
        ktdStatusMsg.textContent = 'Đang mở trang phân công phát…';
        ktdStatusDot.style.background = '#f59e0b';

        // Điều hướng tới trang phân công phát nếu chưa ở đó
        if (!tab.url?.includes('khai-thac-den/phan-cong-phat')) {
            const navP = waitForPcTabReload(tab.id, 45000);
            await chrome.tabs.update(tab.id, { url: PHANCONG_URL });
            await navP;
            await new Promise(r => setTimeout(r, 2000)); // chờ ZK render
            tab = await chrome.tabs.get(tab.id);
        }
        const mainTabId = tab.id;

        // Dọn tín hiệu cũ
        try {
            await chrome.storage.local.remove([
                '__VTP_PHANCONG_STEP_DONE__', '__VTP_PHANCONG_PROGRESS__',
                '__VTP_PHANCONG_CANCEL__', '__VTP_PHANCONG_CURRENT__'
            ]);
        } catch (_) {}

        const assigned = [];
        const errors = [];
        const total = _pctGroups.length;

        // Dọn kết quả phiên trước (nếu chạy lại)
        _pctGroups.forEach(g => {
            delete g._runStatus; delete g._runScanned;
            delete g._runTotal;  delete g._runFailed; delete g._runReason;
        });

        // ── Vòng lặp từng bưu tá ──
        for (let i = 0; i < total; i++) {
            if (!_ktdIsRunning) break;
            const g = _pctGroups[i];

            ktdProgressBar.style.width = Math.round((i / total) * 100) + '%';
            ktdProgressText.textContent = `${i} / ${total} bưu tá`;
            ktdStatusMsg.textContent = `[${i + 1}/${total}] ${g.shortName}: chuẩn bị…`;

            // Chờ trang sẵn sàng (form phân công)
            const ready = await waitForPcPageReady(mainTabId, 45000);
            if (!ready) {
                errors.push({ shortName: g.shortName, reason: 'Trang phân công không sẵn sàng (timeout)' });
                continue;
            }

            // Nạp bưu tá hiện tại + đăng ký chờ xong TRƯỚC khi inject
            try { await chrome.storage.local.remove('__VTP_PHANCONG_STEP_DONE__'); } catch (_) {}
            await chrome.storage.local.set({ __VTP_PHANCONG_CURRENT__: { group: g, index: i, total } });
            const stepPromise = waitForPhanCongStepDone(660000);

            try {
                await chrome.scripting.executeScript({
                    target: { tabId: mainTabId },
                    files: ['src/shared/notification.js', 'src/modules/donchpc/phancong_content.js']
                });
            } catch (e) {
                console.error('[VTP PhânCông] Inject thất bại:', e);
                errors.push({ shortName: g.shortName, reason: 'Inject lỗi: ' + e.message });
                continue;
            }

            const res = await stepPromise;
            if (res.status === 'done') {
                assigned.push(res);
                g._runStatus  = 'done';
                g._runScanned = res.scanned || 0;
                g._runTotal   = res.totalBills || g.bills.length;
                g._runFailed  = res.failedCodes || [];
                console.log(`[VTP PhânCông] ✅ ${g.shortName} → ${res.route} (${res.scanned}/${res.totalBills} mã, lỗi ${g._runFailed.length})`);
            } else {
                errors.push({ shortName: res.shortName || g.shortName, reason: res.reason || 'Lỗi/timeout' });
                g._runStatus  = 'error';
                g._runScanned = 0;
                g._runTotal   = g.bills.length;
                g._runFailed  = g.bills.slice(); // cả nhóm coi như chưa vào
                g._runReason  = res.reason || 'Lỗi/timeout';
                console.warn(`[VTP PhânCông] ❌ ${g.shortName}:`, res.reason);
            }

            ktdProgressBar.style.width = Math.round(((i + 1) / total) * 100) + '%';
            ktdProgressText.textContent = `${i + 1} / ${total} bưu tá`;

            // Reload trang để về trạng thái sạch cho bưu tá kế tiếp (trừ bưu tá cuối)
            if (i < total - 1 && _ktdIsRunning) {
                ktdStatusMsg.textContent = `[${i + 1}/${total}] Xong ${g.shortName} — tải lại trang…`;
                try {
                    const reloadP = waitForPcTabReload(mainTabId, 30000);
                    await chrome.scripting.executeScript({
                        target: { tabId: mainTabId }, func: () => location.reload()
                    });
                    await reloadP;
                } catch (_) {}
                await new Promise(r => setTimeout(r, 800));
            }
        }

        // ── Hoàn tất ──
        _ktdIsRunning = false;
        startKtdBtn.disabled = false;
        startKtdBtn.innerHTML = '<i class="bi bi-play-fill" style="font-size: 14px;"></i> Bắt Đầu Phân Công';
        ktdProgressBar.style.width = '100%';

        const totalFailed = _pctGroups.reduce((s, g) => s + ((g._runFailed?.length) || 0), 0);

        if (errors.length === 0 && totalFailed === 0) {
            ktdStatusMsg.textContent = `✅ Hoàn tất! Đã phân công ${assigned.length} bưu tá, không có mã lỗi.`;
            ktdStatusDot.style.background = '#10B981';
        } else {
            ktdStatusMsg.textContent = `⚠️ Xong ${assigned.length} bưu tá · ${totalFailed} mã lỗi`
                + (errors.length ? ` · ${errors.length} bưu tá lỗi` : '') + ' — xem báo cáo bên dưới.';
            ktdStatusDot.style.background = '#f59e0b';
            console.warn('[VTP PhânCông] Lỗi bưu tá:', errors);
        }

        // Hiện báo cáo chi tiết (gom mã lỗi theo bưu tá)
        pctRenderRunReport();

        try {
            await chrome.storage.local.remove([
                '__VTP_PHANCONG_CURRENT__', '__VTP_PHANCONG_PROGRESS__', '__VTP_PHANCONG_STEP_DONE__'
            ]);
        } catch (_) {}
    }

    // ── Excel Upload events ──
    ktdDropzone.addEventListener('click', (e) => {
        if (e.target.closest('.loaded-file-clear')) return;
        ktdFileInput.click();
    });
    ktdFileInput.addEventListener('change', (e) => {
        if (e.target.files[0]) ktdProcessExcel(e.target.files[0]);
    });
    ktdDropzone.addEventListener('dragover', (e) => {
        e.preventDefault(); e.stopPropagation();
        ktdDropzone.classList.add('drag-over');
    });
    ktdDropzone.addEventListener('dragleave', (e) => {
        e.preventDefault(); e.stopPropagation();
        ktdDropzone.classList.remove('drag-over');
    });
    ktdDropzone.addEventListener('drop', (e) => {
        e.preventDefault(); e.stopPropagation();
        ktdDropzone.classList.remove('drag-over');
        const file = e.dataTransfer?.files?.[0];
        if (file) ktdProcessExcel(file);
    });

    ktdClearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        ktdResetState();
    });

    function ktdResetState() {
        _ktdExcelData = {};
        _ktdBills     = [];
        ktdFileInput.value = '';
        ktdDropzoneContent.style.display = 'flex';
        ktdDropzoneLoaded.style.display  = 'none';
        ktdCustomerSection.style.display = 'none';
        ktdSelectedBills.style.display   = 'none';
        ktdCustomerList.style.display    = 'flex';
        ktdCustomerSearch.value          = '';
        ktdClearSearch.style.display     = 'none';
        ktdUpdateBillCount();
        startKtdBtn.disabled = true;
    }

    function ktdUpdateBillCount() {
        const count = _ktdBills.length;
        ktdBillCountEl.textContent = `${count} mã`;
        ktdBillCountEl.classList.toggle('has-bills', count > 0);
        startKtdBtn.disabled = count === 0;
    }

    // ── Parse Excel — Group by Mã khách hàng ──
    function ktdProcessExcel(file) {
        const validExts = ['.xlsx', '.xls', '.csv'];
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!validExts.includes(ext)) {
            alert('Chỉ hỗ trợ file .xlsx, .xls hoặc .csv!');
            return;
        }

        ktdLoadedFileName.textContent    = file.name;
        ktdDropzoneContent.style.display = 'none';
        ktdDropzoneLoaded.style.display  = 'block';

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

                if (rows.length < 2) {
                    alert('File Excel không có dữ liệu!');
                    ktdResetState();
                    return;
                }

                const headers = rows[0].map(h => String(h || '').trim());
                const maPhieuIdx = headers.indexOf('Mã phiếu gửi');
                const maKHIdx    = headers.indexOf('Mã khách hàng');

                if (maPhieuIdx < 0) {
                    alert('Không tìm thấy cột "Mã phiếu gửi" trong file!\n\nCác cột hiện có: ' + headers.join(', '));
                    ktdResetState();
                    return;
                }
                if (maKHIdx < 0) {
                    alert('Không tìm thấy cột "Mã khách hàng" trong file!\n\nCác cột hiện có: ' + headers.join(', '));
                    ktdResetState();
                    return;
                }

                // Group by Mã khách hàng, deduplicate Mã phiếu gửi
                const groups = {};
                let totalBills = 0;
                for (let i = 1; i < rows.length; i++) {
                    const row  = rows[i];
                    const maKH = String(row[maKHIdx] || '').trim();
                    const code = String(row[maPhieuIdx] || '').trim();
                    if (!maKH || !code) continue;
                    if (!groups[maKH]) groups[maKH] = [];
                    if (!groups[maKH].includes(code)) {
                        groups[maKH].push(code);
                        totalBills++;
                    }
                }

                if (Object.keys(groups).length === 0) {
                    alert('Không tìm thấy dữ liệu hợp lệ trong file!');
                    ktdResetState();
                    return;
                }

                _ktdExcelData = groups;
                _ktdBills     = [];
                ktdCustomerSection.style.display = 'block';
                ktdRenderCustomerList('');

                console.log(`[VTP KTĐ] Đã đọc ${totalBills} đơn từ ${Object.keys(groups).length} khách hàng`);
                ktdUpdateBillCount();

            } catch (err) {
                console.error('[VTP KTĐ] Lỗi đọc file:', err);
                alert('Lỗi đọc file Excel: ' + err.message);
                ktdResetState();
            }
        };
        reader.readAsArrayBuffer(file);
    }

    // ── Customer list render ──
    function ktdRenderCustomerList(filter) {
        ktdCustomerList.innerHTML = '';
        ktdSelectedBills.style.display = 'none';
        ktdCustomerList.style.display  = 'flex';

        const entries = Object.entries(_ktdExcelData);
        const totalCustomers = entries.length;
        const totalBills = entries.reduce((sum, [_, codes]) => sum + codes.length, 0);

        const normalFilter = filter.toLowerCase().trim();
        const filtered = normalFilter
            ? entries.filter(([maKH]) => maKH.toLowerCase().includes(normalFilter))
            : entries;

        filtered.sort((a, b) => b[1].length - a[1].length);

        // Summary
        const summaryEl = ktdCustomerSummary.querySelector('.summary-total');
        if (normalFilter) {
            summaryEl.textContent = `Tìm thấy ${filtered.length}/${totalCustomers} KH · ${totalBills} đơn tổng`;
        } else {
            summaryEl.textContent = `${totalCustomers} mã khách hàng · ${totalBills} đơn`;
        }

        if (filtered.length === 0) {
            ktdCustomerList.innerHTML = `
                <div class="empty-state" style="padding:16px 0">
                    <p class="empty-title">Không tìm thấy mã khách hàng</p>
                    <p class="empty-hint">Thử từ khóa khác</p>
                </div>`;
            return;
        }

        // "All" option
        const allItem = document.createElement('div');
        allItem.className = 'customer-item';
        allItem.style.background = 'linear-gradient(135deg, var(--green-bg) 0%, var(--green-pale) 100%)';
        allItem.style.borderColor = 'var(--green)';
        const allCount = filtered.reduce((s, [_, c]) => s + c.length, 0);
        allItem.innerHTML = `
            <div class="customer-avatar" style="background:linear-gradient(135deg,var(--green),#059669);color:white;border-color:var(--green);">
                <i class="bi bi-people-fill" style="font-size: 13px;"></i>
            </div>
            <div class="customer-info">
                <div class="customer-name" style="color:var(--green);font-weight:700">TẤT CẢ KHÁCH HÀNG</div>
                <div class="customer-meta">${filtered.length} KH · ${allCount} đơn</div>
            </div>
            <span class="customer-count-badge" style="background:var(--green-bg);color:var(--green);border-color:var(--green-pale);">${allCount}</span>
            <svg class="customer-arrow" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12">
                <polyline points="7 4 13 10 7 16"/>
            </svg>`;
        allItem.addEventListener('click', () => {
            _ktdBills = filtered.flatMap(([_, codes]) => codes);
            ktdShowSelectedBills('TẤT CẢ KHÁCH HÀNG', _ktdBills);
        });
        ktdCustomerList.appendChild(allItem);

        // Individual customers
        const frag = document.createDocumentFragment();
        filtered.forEach(([maKH, codes]) => {
            const item = document.createElement('div');
            item.className = 'customer-item';
            item.innerHTML = `
                <div class="customer-avatar">${maKH.slice(-2).toUpperCase()}</div>
                <div class="customer-info">
                    <div class="customer-name">${maKH}</div>
                    <div class="customer-meta">${codes.length} đơn hàng</div>
                </div>
                <span class="customer-count-badge">${codes.length}</span>
                <svg class="customer-arrow" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12">
                    <polyline points="7 4 13 10 7 16"/>
                </svg>`;
            item.addEventListener('click', () => {
                _ktdBills = codes.slice();
                ktdShowSelectedBills(maKH, codes);
            });
            frag.appendChild(item);
        });
        ktdCustomerList.appendChild(frag);
    }

    function ktdShowSelectedBills(name, bills) {
        ktdCustomerList.style.display  = 'none';
        ktdSelectedBills.style.display = 'block';
        ktdSelectedName.textContent    = `${name} (${bills.length} đơn)`;

        ktdSelectedList.innerHTML = '';
        const frag = document.createDocumentFragment();
        bills.forEach((code, idx) => {
            const chip = document.createElement('div');
            chip.className = 'bill-chip';
            chip.innerHTML = `
                <span class="bill-chip-num">${idx + 1}</span>
                <span class="bill-chip-code">${code}</span>`;
            frag.appendChild(chip);
        });
        ktdSelectedList.appendChild(frag);
        ktdUpdateBillCount();
    }

    ktdBackBtn.addEventListener('click', () => {
        _ktdBills = [];
        ktdSelectedBills.style.display = 'none';
        ktdCustomerList.style.display  = 'flex';
        ktdUpdateBillCount();
    });

    // ── Customer search ──
    let _ktdSearchTimer = null;
    ktdCustomerSearch.addEventListener('input', () => {
        const val = ktdCustomerSearch.value;
        ktdClearSearch.style.display = val ? 'flex' : 'none';
        clearTimeout(_ktdSearchTimer);
        _ktdSearchTimer = setTimeout(() => ktdRenderCustomerList(val), 150);
    });
    ktdClearSearch.addEventListener('click', () => {
        ktdCustomerSearch.value = '';
        ktdClearSearch.style.display = 'none';
        ktdRenderCustomerList('');
    });

    // ── Helper: chờ content script quét CPC trả kết quả ──
    function waitForKtdCpcStepDone(timeoutMs = 120000) {
        return new Promise((resolve) => {
            let resolved = false;
            const deadline = setTimeout(() => {
                if (resolved) return;
                resolved = true;
                chrome.storage.onChanged.removeListener(listener);
                resolve({ status: 'timeout', reason: 'Timeout sau ' + (timeoutMs / 1000) + 's' });
            }, timeoutMs);

            function listener(changes, ns) {
                if (ns !== 'local' || resolved) return;
                if (changes.__VTP_KTD_CPC_STEP_DONE__?.newValue) {
                    resolved = true;
                    clearTimeout(deadline);
                    chrome.storage.onChanged.removeListener(listener);
                    resolve(changes.__VTP_KTD_CPC_STEP_DONE__.newValue);
                }
            }
            chrome.storage.onChanged.addListener(listener);

            chrome.storage.local.get('__VTP_KTD_CPC_STEP_DONE__', (data) => {
                if (data.__VTP_KTD_CPC_STEP_DONE__ && !resolved) {
                    resolved = true;
                    clearTimeout(deadline);
                    chrome.storage.onChanged.removeListener(listener);
                    resolve(data.__VTP_KTD_CPC_STEP_DONE__);
                }
            });
        });
    }

    // ── Helper: chờ content script tra cứu hành trình trả kết quả ──
    function waitForKtdStepDone(timeoutMs = 60000) {
        return new Promise((resolve) => {
            let resolved = false;
            const deadline = setTimeout(() => {
                if (resolved) return;
                resolved = true;
                chrome.storage.onChanged.removeListener(listener);
                resolve({ status: 'timeout', reason: 'Timeout sau ' + (timeoutMs / 1000) + 's' });
            }, timeoutMs);

            function listener(changes, ns) {
                if (ns !== 'local' || resolved) return;
                if (changes.__VTP_KTD_STEP_DONE__?.newValue) {
                    resolved = true;
                    clearTimeout(deadline);
                    chrome.storage.onChanged.removeListener(listener);
                    resolve(changes.__VTP_KTD_STEP_DONE__.newValue);
                }
            }
            chrome.storage.onChanged.addListener(listener);

            // Backup check
            chrome.storage.local.get('__VTP_KTD_STEP_DONE__', (data) => {
                if (data.__VTP_KTD_STEP_DONE__ && !resolved) {
                    resolved = true;
                    clearTimeout(deadline);
                    chrome.storage.onChanged.removeListener(listener);
                    resolve(data.__VTP_KTD_STEP_DONE__);
                }
            });
        });
    }

    // ── Phân loại trạng thái cho status pill ──
    function getStatusClass(trangThai) {
        const t = (trangThai || '').toLowerCase();
        if (t.includes('thành công') || t.includes('đã phát') || t.includes('hoàn thành'))
            return 's-success';
        if (t.includes('đang giao') || t.includes('đang vận chuyển') || t.includes('phân công'))
            return 's-info';
        if (t.includes('chờ') || t.includes('bàn giao') || t.includes('đã nhận') || t.includes('nhập doanh thu'))
            return 's-warning';
        if (t.includes('hủy') || t.includes('trả lại') || t.includes('lỗi') || t.includes('không'))
            return 's-error';
        return 's-warning';
    }

    // ── Phân tích địa chỉ → tách cấp Xã/Phường và Huyện/Quận ──
    //  Địa chỉ VN chuẩn: "số nhà đường, [thôn/ấp], xã/phường, [huyện/quận], tỉnh"
    //  Sau sáp nhập nhiều nơi bỏ cấp huyện → "..., xã, tỉnh".
    //  Chiến lược: ưu tiên nhận theo TIỀN TỐ text (bền vững), fallback theo
    //  vị trí cột. KHÔNG match thôn/ấp/tổ ở cấp xã (fix bug nhóm bị lệch).
    function parseAddressAdmin(address) {
        if (!address) return { xa: '', huyen: '' };
        const parts = address.replace(/ /g, ' ').split(',')
            .map(p => p.trim()).filter(Boolean);
        if (parts.length === 0) return { xa: '', huyen: '' };

        const startsWithAny = (str, prefixes) => {
            const lower = str.toLowerCase();
            return prefixes.some(p => lower.startsWith(p));
        };
        const XA_PREFIX    = ['xã ', 'xa ', 'phường ', 'phuong ', 'thị trấn ', 'thi tran '];
        const HUYEN_PREFIX = ['huyện ', 'huyen ', 'quận ', 'quan ', 'thị xã ', 'thi xa '];

        // ── Tìm cấp Xã theo tiền tố (duyệt ngược) ──
        let xaIdx = -1;
        for (let i = parts.length - 1; i >= 0; i--) {
            if (startsWithAny(parts[i], XA_PREFIX)) { xaIdx = i; break; }
        }

        let xa = xaIdx >= 0 ? parts[xaIdx] : '';
        let huyen = '';

        // ── Tìm cấp Huyện ──
        // Cấp huyện LUÔN nằm ngay sau xã (địa chỉ chuẩn: xã, huyện, tỉnh).
        // Lấy theo VỊ TRÍ đáng tin hơn quét tiền tố — tránh bắt nhầm cấp tỉnh
        // "TP.HCM" thành huyện. Phần cuối luôn là tỉnh nên bỏ.
        if (xaIdx >= 0) {
            // parts[xaIdx+1] chỉ là huyện nếu SAU nó còn phần khác (tỉnh);
            // nếu xaIdx+1 là phần cuối → đó là tỉnh → không có huyện.
            if (xaIdx + 1 <= parts.length - 2) {
                huyen = parts[xaIdx + 1];
            }
        } else {
            // Không có tiền tố xã → thử tìm huyện theo tiền tố
            for (let i = parts.length - 1; i >= 0; i--) {
                if (startsWithAny(parts[i], HUYEN_PREFIX)) { huyen = parts[i]; break; }
            }
        }

        // ── Fallback theo vị trí khi thiếu tiền tố xã ──
        // Địa chỉ chuẩn: [..., xã, huyện, tỉnh] → xã=len-3, huyện=len-2
        if (!xa && parts.length >= 3) {
            xa = parts[parts.length - 3];
            if (!huyen) huyen = parts[parts.length - 2];
        }

        return { xa, huyen };
    }

    // Giữ tương thích: trả về cấp xã dạng chuỗi
    function extractWards(address) {
        return parseAddressAdmin(address).xa;
    }

    // ── Render kết quả vào bảng ──
    function ktdRenderResult(result, idx) {
        const tr = document.createElement('tr');
        const statusClass = result.status === 'error'
            ? 's-error'
            : getStatusClass(result.trangThai);
        const statusText = result.status === 'error'
            ? `Lỗi: ${result.reason || 'Không xác định'}`
            : result.trangThai;

        tr.innerHTML = `
            <td>${idx + 1}</td>
            <td><span class="ktd-code-text">${result.bill}</span></td>
            <td><span class="ktd-status-pill ${statusClass}">${statusText}</span></td>
            <td><span class="ktd-note-text">${result.tenNhan || '—'}</span></td>
            <td><span class="ktd-note-text">${result.diaChiNhan || '—'}</span></td>
            <td><span class="ktd-time-text">${result.thoiGian || '—'}</span></td>
            <td><span class="ktd-note-text">${result.noiDung || '—'}</span></td>
            <td><span class="ktd-note-text">${result.ghiChu || '—'}</span></td>`;
        ktdResultsBody.appendChild(tr);
    }

    // ── START Button ──
    startKtdBtn.addEventListener('click', async () => {
        if (_ktdMode === 'chuaphancong') {
            await runKtdChuaPhanCong();
        } else if (_ktdMode === 'phancongtuyen') {
            await runKtdPhanCongTuyen();
        } else {
            await runKtdDonDiExcel();
        }
    });

    // 🚀 CHỨC NĂNG MỚI: QUÉT & TRA CỨU ĐƠN CHƯA PHÂN CÔNG
    async function runKtdChuaPhanCong() {
        // Tìm tab đang active
        let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
            alert('Không tìm thấy tab trình duyệt phù hợp!');
            return;
        }

        _ktdIsRunning = true;
        startKtdBtn.disabled = true;
        startKtdBtn.innerHTML = `<i class="bi bi-arrow-repeat spin" style="font-size: 14px;"></i> Đang quét mã…`;
        ktdProgressCard.style.display = 'block';
        ktdProgressBar.style.width = '10%';
        ktdProgressText.textContent = '0 / 0';
        ktdResultsCard.style.display = 'none';
        ktdResultsBody.innerHTML = '';

        if (ktdStatusMsg) ktdStatusMsg.textContent = 'Đang chuyển trang Khai thác đến…';
        if (ktdStatusDot) ktdStatusDot.style.background = '#f59e0b';

        // ═══════════════════════════════════════════
        // PHA 1: Quét danh sách mã đơn tại trang Khai thác
        // ═══════════════════════════════════════════
        if (!tab.url?.includes('khai-thac-den/khai-thac')) {
            await chrome.tabs.update(tab.id, { url: CPC_URL });
            await new Promise((resolve) => {
                const listener = (tabId, changeInfo) => {
                    if (tabId === tab.id && changeInfo.status === 'complete') {
                        chrome.tabs.onUpdated.removeListener(listener);
                        resolve();
                    }
                };
                chrome.tabs.onUpdated.addListener(listener);
            });
            await new Promise(r => setTimeout(r, 2500)); // Chờ render ZK Framework
            tab = await chrome.tabs.get(tab.id);
        }

        const mainTabId = tab.id;

        try {
            await chrome.storage.local.remove('__VTP_KTD_CPC_STEP_DONE__');
        } catch (_) {}

        // Inject script quét đơn chưa phân công
        try {
            await chrome.scripting.executeScript({
                target: { tabId: mainTabId },
                files: ['src/shared/notification.js', 'src/modules/kiemtradon/kiemtradon_content.js']
            });
        } catch (e) {
            console.error('[VTP CPC] Inject quét CPC thất bại:', e);
            ktdStatusMsg.textContent = 'Lỗi: Không thể chạy script quét đơn. Hãy tải lại trang.';
            ktdStatusDot.style.background = '#EE0033';
            startKtdBtn.disabled = false;
            startKtdBtn.innerHTML = '<i class="bi bi-play-fill" style="font-size: 14px;"></i> Bắt Đầu Quét';
            _ktdIsRunning = false;
            return;
        }

        // Chờ script quét xong (max 120s)
        const scanResult = await waitForKtdCpcStepDone(120000);
        if (scanResult.status === 'error' || scanResult.status === 'timeout') {
            ktdStatusMsg.textContent = `Lỗi quét mã: ${scanResult.reason || 'Timeout'}`;
            ktdStatusDot.style.background = '#EE0033';
            startKtdBtn.disabled = false;
            startKtdBtn.innerHTML = '<i class="bi bi-play-fill" style="font-size: 14px;"></i> Bắt Đầu Quét';
            _ktdIsRunning = false;
            return;
        }

        const scrapedBills = scanResult.bills || [];
        if (scrapedBills.length === 0) {
            ktdStatusMsg.textContent = 'Không tìm thấy đơn nào chưa phân công!';
            ktdStatusDot.style.background = '#10B981';
            startKtdBtn.disabled = false;
            startKtdBtn.innerHTML = '<i class="bi bi-play-fill" style="font-size: 14px;"></i> Bắt Đầu Quét';
            _ktdIsRunning = false;
            return;
        }

        console.log(`[VTP CPC] Quét được ${scrapedBills.length} đơn. Bắt đầu Phase 2: Tra cứu địa chỉ...`);
        
        // ═══════════════════════════════════════════
        // PHA 2: Chuyển sang trang tra cứu để lấy địa chỉ nhận
        // ═══════════════════════════════════════════
        ktdProgressBar.style.width = '30%';
        ktdProgressText.textContent = `0 / ${scrapedBills.length}`;
        ktdStatusMsg.textContent = `Đã tìm thấy ${scrapedBills.length} đơn. Đang chuyển sang trang tra cứu hành trình…`;

        await chrome.tabs.update(mainTabId, { url: KTD_URL });
        await new Promise((resolve) => {
            const listener = (tabId, changeInfo) => {
                if (tabId === tab.id && changeInfo.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve();
                }
            };
            chrome.tabs.onUpdated.addListener(listener);
        });
        await new Promise(r => setTimeout(r, 2000)); // Chờ trang tra cứu render

        _ktdResults = [];
        ktdResultsCard.style.display = 'block';

        const skipList = [];

        for (let i = 0; i < scrapedBills.length; i++) {
            if (!_ktdIsRunning) break;

            const billData = scrapedBills[i];
            const billCode = billData.billCode;

            ktdStatusMsg.textContent = `Tra cứu địa chỉ ${i + 1}/${scrapedBills.length}: ${billCode}`;
            const pct = 30 + Math.floor((i / scrapedBills.length) * 70);
            ktdProgressBar.style.width = pct + '%';
            ktdProgressText.textContent = `${i} / ${scrapedBills.length} (${pct}%)`;

            try {
                await chrome.storage.local.remove('__VTP_KTD_STEP_DONE__');
            } catch (_) {}
            await chrome.storage.local.set({ __VTP_KTD_CURRENT_BILL__: billCode });

            // Inject script tra cứu hành trình dondi
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: mainTabId },
                    files: ['src/shared/notification.js', 'src/modules/kiemtradon/kiemtradon_dondi_content.js']
                });
            } catch (e) {
                console.error('[VTP CPC] Inject tra cứu thất bại:', e);
                const failRow = {
                    status: 'error',
                    bill: billCode,
                    reason: 'Inject tra cứu lỗi: ' + e.message,
                    tenNhan: billData.recipient || '',
                    diaChiNhan: ''
                };
                _ktdResults.push(failRow);
                ktdRenderResult(failRow, _ktdResults.length - 1);
                skipList.push(failRow);
                continue;
            }

            const lookupResult = await waitForKtdStepDone(45000);
            console.log(`[VTP CPC] Tra cứu mã ${billCode}:`, lookupResult.status);

            const finalResult = {
                status: lookupResult.status,
                bill: billCode,
                trangThai: lookupResult.trangThai || 'Không rõ',
                tenNhan: lookupResult.tenNhan || billData.recipient || '',
                diaChiNhan: lookupResult.diaChiNhan || '',
                thoiGian: lookupResult.thoiGian || '',
                noiDung: lookupResult.noiDung || '',
                ghiChu: lookupResult.ghiChu || '',
                reason: lookupResult.reason || ''
            };

            _ktdResults.push(finalResult);
            ktdRenderResult(finalResult, _ktdResults.length - 1);

            if (lookupResult.status === 'error' || lookupResult.status === 'timeout') {
                skipList.push(finalResult);
            }

            // Cập nhật tiến độ
            const pctDone = 30 + Math.floor(((i + 1) / scrapedBills.length) * 70);
            ktdProgressBar.style.width = pctDone + '%';
            ktdProgressText.textContent = `${i + 1} / ${scrapedBills.length} (${pctDone}%)`;
            ktdResultSummary.textContent = `${_ktdResults.length} đơn đã tra cứu`;

            if (i < scrapedBills.length - 1 && _ktdIsRunning) {
                await new Promise(r => setTimeout(r, 100));
            }
        }

        // ═══════════════════════════════════════════
        // PHA 3: Tự động sắp xếp (Sort) theo cấp Xã/Phường
        // ═══════════════════════════════════════════
        if (_ktdIsRunning && _ktdResults.length > 0) {
            ktdStatusMsg.textContent = 'Đang sắp xếp danh sách đơn theo cấp Xã…';
            _ktdResults = sortResultsByWard(_ktdResults);

            // Re-render bảng kết quả theo thứ tự đã sắp xếp
            ktdResultsBody.innerHTML = '';
            _ktdResults.forEach((res, idx) => {
                ktdRenderResult(res, idx);
            });
        }

        // Hoàn tất
        _ktdIsRunning = false;
        ktdProgressBar.style.width = '100%';
        startKtdBtn.disabled = false;
        startKtdBtn.innerHTML = '<i class="bi bi-play-fill" style="font-size: 14px;"></i> Bắt Đầu Quét';

        if (skipList.length === 0) {
            ktdStatusMsg.textContent = `✅ Hoàn thành! Quét và tra cứu ${_ktdResults.length} đơn.`;
            ktdStatusDot.style.background = '#10B981';
        } else {
            ktdStatusMsg.textContent = `⚠️ Xong — ${skipList.length}/${scrapedBills.length} đơn tra cứu lỗi`;
            ktdStatusDot.style.background = '#f59e0b';
        }

        // Tự động kích hoạt nút Xuất Excel luôn để người dùng tải file về
        ktdExportBtn.click();

        try {
            await chrome.storage.local.remove(['__VTP_KTD_CURRENT_BILL__', '__VTP_KTD_STEP_DONE__', '__VTP_KTD_CPC_STEP_DONE__']);
        } catch (_) {}
    }

    // 🚀 CHỨC NĂNG CŨ: KIỂM TRA ĐƠN ĐI TỪ EXCEL
    async function runKtdDonDiExcel() {
        const bills = _ktdBills.slice();
        if (bills.length === 0) {
            alert('Vui lòng chọn khách hàng để lấy danh sách mã phiếu gửi!');
            return;
        }

        let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.url?.includes('evtp2.viettelpost.vn')) {
            await chrome.tabs.update(tab.id, { url: KTD_URL });
            await new Promise((resolve) => {
                const listener = (tabId, changeInfo) => {
                    if (tabId === tab.id && changeInfo.status === 'complete') {
                        chrome.tabs.onUpdated.removeListener(listener);
                        resolve();
                    }
                };
                chrome.tabs.onUpdated.addListener(listener);
            });
            await new Promise(r => setTimeout(r, 2000));
            tab = await chrome.tabs.get(tab.id);
        }

        const mainTabId = tab.id;
        _ktdIsRunning  = true;
        _ktdResults    = [];

        startKtdBtn.disabled  = true;
        startKtdBtn.innerHTML = `<i class="bi bi-arrow-repeat spin" style="font-size: 14px;"></i> Đang kiểm tra…`;
        ktdResultsCard.style.display    = 'block';
        ktdResultsBody.innerHTML        = '';
        ktdProgressCard.style.display   = 'block';
        ktdProgressBar.style.width      = '0%';
        ktdProgressText.textContent     = `0 / ${bills.length}`;
        if (ktdStatusMsg) ktdStatusMsg.textContent = `Đang kiểm tra 0/${bills.length}…`;
        if (ktdStatusDot) ktdStatusDot.style.background = '#f59e0b';

        const skipList = [];

        for (let i = 0; i < bills.length; i++) {
            if (!_ktdIsRunning) break;

            const bill = bills[i];

            if (ktdStatusMsg) ktdStatusMsg.textContent = `Đang tra cứu ${i + 1}/${bills.length}: ${bill}`;
            const pct = Math.floor((i / bills.length) * 100);
            ktdProgressBar.style.width  = pct + '%';
            ktdProgressText.textContent = `${i} / ${bills.length} (${pct}%)`;

            try { await chrome.storage.local.remove('__VTP_KTD_STEP_DONE__'); } catch (_) {}
            await chrome.storage.local.set({ __VTP_KTD_CURRENT_BILL__: bill });

            try {
                await chrome.scripting.executeScript({
                    target: { tabId: mainTabId },
                    files: ['src/shared/notification.js', 'src/modules/kiemtradon/kiemtradon_dondi_content.js']
                });
            } catch (e) {
                console.error('[VTP KTĐ] Lỗi inject:', e);
                const errResult = { status: 'error', bill, reason: 'Inject thất bại: ' + e.message };
                _ktdResults.push(errResult);
                ktdRenderResult(errResult, _ktdResults.length - 1);
                skipList.push(errResult);
                continue;
            }

            const result = await waitForKtdStepDone(60000);
            _ktdResults.push(result);
            ktdRenderResult(result, _ktdResults.length - 1);

            if (result.status === 'error' || result.status === 'timeout') {
                skipList.push(result);
            }

            const pctDone = Math.floor(((i + 1) / bills.length) * 100);
            ktdProgressBar.style.width  = pctDone + '%';
            ktdProgressText.textContent = `${i + 1} / ${bills.length} (${pctDone}%)`;
            ktdResultSummary.textContent = `${_ktdResults.length} đơn đã kiểm tra`;

            if (i < bills.length - 1 && _ktdIsRunning) {
                await new Promise(r => setTimeout(r, 100));
            }
        }

        _ktdIsRunning = false;
        ktdProgressBar.style.width = '100%';
        startKtdBtn.disabled  = false;
        startKtdBtn.innerHTML = `<i class="bi bi-play-fill" style="font-size: 14px;"></i> Bắt Đầu Kiểm Tra`;

        if (skipList.length === 0) {
            if (ktdStatusMsg) ktdStatusMsg.textContent = `✅ Hoàn thành! Đã kiểm tra ${_ktdResults.length} đơn.`;
            if (ktdStatusDot) ktdStatusDot.style.background = '#10B981';
        } else {
            if (ktdStatusMsg) ktdStatusMsg.textContent = `⚠️ Xong — ${skipList.length}/${bills.length} đơn lỗi`;
            if (ktdStatusDot) ktdStatusDot.style.background = '#f59e0b';
        }

        try { await chrome.storage.local.remove(['__VTP_KTD_CURRENT_BILL__', '__VTP_KTD_STEP_DONE__']); } catch (_) {}
    }

    // ── Sắp xếp kết quả 2 cấp: Huyện/Quận → Xã/Phường ──
    //  Cache kết quả parse vào từng phần tử (_xa, _huyen) để render + export
    //  tái dùng, không parse lại nhiều lần.
    function sortResultsByWard(results) {
        results.forEach(r => {
            const admin = parseAddressAdmin(r.diaChiNhan || '');
            r._xa    = admin.xa;
            r._huyen = admin.huyen;
        });

        // So sánh 1 cấp, đẩy giá trị rỗng xuống cuối
        const cmp = (x, y) => {
            const a = (x || '').toLowerCase();
            const b = (y || '').toLowerCase();
            if (!a && b) return 1;
            if (a && !b) return -1;
            if (!a && !b) return 0;
            return a.localeCompare(b, 'vi');
        };

        return results.slice().sort((a, b) => {
            const byHuyen = cmp(a._huyen, b._huyen);
            if (byHuyen !== 0) return byHuyen;
            return cmp(a._xa, b._xa);
        });
    }

    // ── STOP Button ──
    stopKtdBtn.addEventListener('click', () => {
        _ktdIsRunning = false;
        // Báo content script phân công dừng sau bưu tá hiện tại
        try { chrome.storage.local.set({ __VTP_PHANCONG_CANCEL__: true }); } catch (_) {}
        if (ktdStatusMsg) ktdStatusMsg.textContent = 'Đã dừng.';
        if (ktdStatusDot) ktdStatusDot.style.background = '#78716C';
        startKtdBtn.disabled  = false;
        const stopLabels = {
            chuaphancong:  'Bắt Đầu Quét',
            phancongtuyen: 'Bắt Đầu Phân Công',
            dondi:         'Bắt Đầu Kiểm Tra'
        };
        startKtdBtn.innerHTML =
            `<i class="bi bi-play-fill" style="font-size: 14px;"></i> ${stopLabels[_ktdMode] || 'Bắt Đầu'}`;
    });

    // ── Helper: tạo worksheet từ mảng 2 chiều + auto-fit độ rộng cột ──
    function buildSheet(wsData) {
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = wsData[0].map((h, colIdx) => {
            let maxLen = String(h || '').length;
            wsData.slice(1).forEach(row => {
                const cellLen = String(row[colIdx] || '').length;
                if (cellLen > maxLen) maxLen = cellLen;
            });
            return { wch: Math.min(maxLen + 4, 60) };
        });
        return ws;
    }

    // ── Helper: đọc cấp Xã/Huyện của 1 kết quả (dùng cache nếu có) ──
    function getAdmin(r) {
        if (r._xa !== undefined && r._huyen !== undefined) {
            return { xa: r._xa, huyen: r._huyen };
        }
        const admin = parseAddressAdmin(r.diaChiNhan || '');
        r._xa = admin.xa;
        r._huyen = admin.huyen;
        return admin;
    }

    // ── Parse mã phiếu gửi theo lô (F) ──
    //  Mã theo lô có dạng <base>-<index>F<total>, ví dụ:
    //    146353703557-5F5  → kiện thứ 5 trong lô gồm 5 kiện (base = 146353703557)
    //    146353703557-1F3  → kiện thứ 1 trong lô gồm 3 kiện
    //  Trả về { base, index, total } hoặc null nếu mã không theo lô.
    function parseLotCode(code) {
        const m = String(code).toUpperCase().match(/^(.*?)-?(\d+)F(\d+)$/);
        if (!m) return null;
        const base  = m[1].replace(/-+$/, '');
        const index = parseInt(m[2], 10);
        const total = parseInt(m[3], 10);
        if (!base || !total) return null;
        return { base, index, total };
    }

    // ── Kiểm tra "đủ lô" cho danh sách mã phiếu gửi ──
    //  Gom các mã cùng lô (cùng base) rồi so số kiện thu được với tổng số
    //  kiện của lô. Trả về Map: billCode -> chuỗi trạng thái.
    //    • Mã không theo lô        → không set (cột để trống)
    //    • Đã thu đủ số kiện        → "Đủ lô (n/total)"
    //    • Còn thiếu kiện           → "Thiếu (n/total)"
    function computeLotStatus(codes) {
        const parsed = new Map(); // billCode -> { base, index, total }
        const lots   = new Map(); // base -> { total, indices:Set }

        codes.forEach(code => {
            const info = parseLotCode(code);
            if (!info) return;
            parsed.set(code, info);
            if (!lots.has(info.base)) {
                lots.set(info.base, { total: info.total, indices: new Set() });
            }
            const lot = lots.get(info.base);
            lot.total = Math.max(lot.total, info.total); // phòng dữ liệu lệch
            lot.indices.add(info.index);
        });

        const result = new Map();
        parsed.forEach((info, code) => {
            const lot  = lots.get(info.base);
            const have = lot.indices.size;
            result.set(code, have >= lot.total
                ? `Đủ lô (${have}/${lot.total})`
                : `Thiếu (${have}/${lot.total})`);
        });
        return result;
    }

    // ── EXPORT Button — Xuất file .xlsx (dùng SheetJS) ──
    ktdExportBtn.addEventListener('click', () => {
        if (_ktdResults.length === 0) {
            alert('Chưa có kết quả để xuất!');
            return;
        }

        const wb = XLSX.utils.book_new();
        let fileNamePrefix;

        if (_ktdMode === 'chuaphancong') {
            // ── Tính trạng thái "đủ lô F" cho toàn bộ mã phiếu gửi ──
            const lotStatusMap = computeLotStatus(_ktdResults.map(r => r.bill || ''));

            // ── Sheet 1: danh sách đơn ──
            // STT | Mã phiếu gửi | Tên bưu tá | Họ tên người nhận | Địa chỉ nhận | Check đủ lô F
            //  • "Tên bưu tá" để TRỐNG — người dùng tự điền tên rút gọn (Nam, Hoài...)
            //    rồi tải lại file này ở tab "Phân Công Tuyến" để phân công tự động.
            const header1 = ['STT', 'Mã phiếu gửi', 'Tên bưu tá', 'Họ tên người nhận', 'Địa chỉ nhận', 'Check đủ lô F'];
            const rows1 = _ktdResults.map((r, idx) => {
                return [
                    idx + 1,
                    r.bill || '',
                    '',                 // Tên bưu tá — để trống cho người dùng điền
                    r.tenNhan || '',    // Họ tên người nhận
                    r.diaChiNhan || '',
                    lotStatusMap.get(r.bill || '') || ''
                ];
            });
            XLSX.utils.book_append_sheet(wb, buildSheet([header1, ...rows1]), 'Đơn chưa phân công');

            fileNamePrefix = 'VTP_DonChuaPhanCong';
        } else {
            // ── Đơn Đi (Excel) — giữ nguyên định dạng cũ ──
            const header = ['STT', 'Mã phiếu gửi', 'Trạng thái đơn', 'Tên khách nhận', 'Địa chỉ nhận', 'Thời gian', 'Nội dung', 'Ghi chú'];
            const rows = _ktdResults.map((r, idx) => [
                idx + 1,
                r.bill || '',
                r.status === 'error'
                    ? `Lỗi: ${r.reason || 'Không xác định'}`
                    : (r.trangThai || ''),
                r.tenNhan || '',
                r.diaChiNhan || '',
                r.thoiGian || '',
                r.noiDung || '',
                r.ghiChu || ''
            ]);
            XLSX.utils.book_append_sheet(wb, buildSheet([header, ...rows]), 'Hành trình đơn đi');
            fileNamePrefix = 'VTP_HanhTrinhDonDi';
        }

        const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbOut], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });

        const link = document.createElement('a');
        link.href     = URL.createObjectURL(blob);
        link.download = `${fileNamePrefix}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    });

});