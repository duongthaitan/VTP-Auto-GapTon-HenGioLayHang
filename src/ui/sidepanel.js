// ============================================================
//  VTP Tool – Popup Controller
//  v3.2 — Excel-driven Customer Picker
//    - Fix #28: Storage cleanup — xóa billList mồ côi khi không
//        còn isRunning (legacy từ textarea cũ)
//    - Fix #27: Re-wire delayInput — dùng làm khoảng cách giữa
//        các đơn (delay sleep), KHÔNG còn sleep tĩnh trước Tầng 2
//    - Tính năng: chọn file .xlsx → group theo TEN_KHGUI →
//        click checkbox khách → ẩn các khách khác
//    - Fix #25: Speed boost — giảm sleep tĩnh trong content/
//        sidepanel ~5s/đơn
//    - Fix #24: Sửa Giờ treo khi chuyển tab khác
//        • Tăng timeout/đơn 120s → 300s, retry busy/timeout
//    - Fix #23: chrome.storage.local.set() KHÔNG hoạt động từ
//        world:'MAIN' → waitForTabReload thay storage signal
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {

    // Fix #5: Hẳng số HTML cho các nút — tránh copy-paste, tái sử dụng
    const BTN_HTML = {
        startPlay:    `<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><polygon points="4,2 17,10 4,18"/></svg> Bắt Đầu Chạy`,
        startRunning: `<svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><path d="M21 12a9 9 0 11-3.36-7.02"/></svg> Đang chạy…`,
        kiemkePlay:   `<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><polygon points="4 2.5 17 10 4 17.5"/></svg> Chạy Kiểm Kê Tự Động`,
        kiemkeRun:    `<svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><path d="M21 12a9 9 0 11-3.36-7.02"/></svg> Đang kiểm kê...`,
        gaptonPlay:   `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="15" height="15"><path d="M17.5 13.3V6.7a1.7 1.7 0 00-.83-1.44L10.83 1.9a1.7 1.7 0 00-1.66 0L3.33 5.26A1.7 1.7 0 002.5 6.7v6.6a1.7 1.7 0 00.83 1.44l5.84 3.36a1.7 1.7 0 001.66 0l5.84-3.36A1.7 1.7 0 0017.5 13.3z"/></svg> Quét Mã Thủ Công`,
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
    //  FILE PICKER + CUSTOMER COMBO (Sửa Giờ)
    //  Thay textarea cũ — load .xlsx, group theo TEN_KHGUI,
    //  pick MA_PHIEUGUI làm bill list.
    // ════════════════════════════════════════
    const excelFileInput      = document.getElementById('excelFileInput');
    const excelFilePickBtn    = document.getElementById('excelFilePickBtn');
    const excelFilePickLabel  = document.getElementById('excelFilePickLabel');
    const filePickerSubtitle  = document.getElementById('filePickerSubtitle');
    const fileTotalCount      = document.getElementById('fileTotalCount');
    const fileInfo            = document.getElementById('fileInfo');
    const fileInfoName        = document.getElementById('fileInfoName');
    const fileInfoClear       = document.getElementById('fileInfoClear');

    const customerCard         = document.getElementById('customerCard');
    const customerSearch       = document.getElementById('customerSearch');
    const customerClear        = document.getElementById('customerClear');
    const customerList         = document.getElementById('customerList');
    const customerListHeader   = document.getElementById('customerListHeader');
    const customerResetBtn     = document.getElementById('customerResetBtn');
    const customerOrderCount   = document.getElementById('customerOrderCount');
    const customerSubtitle     = document.getElementById('customerSubtitle');

    // State trong session — không persist qua đóng Chrome
    let _customerMap      = new Map(); // Map<TEN_KHGUI, MA_PHIEUGUI[]>
    let _selectedCustomer = null;
    let _activeIdx        = -1;
    // [Fix #37] Chế độ nhập mã đơn: 'excel' (mặc định) hoặc 'paste'
    let _inputMode        = 'excel';
    let _pastedBills      = [];

    function parseBills() {
        if (_inputMode === 'paste') {
            // [Fix #38] Đọc trực tiếp từ textarea, KHÔNG qua cache _pastedBills
            // — tránh race với debounce 150ms khi user paste rồi click Start ngay.
            const ta = document.getElementById('pasteBillsInput');
            return parsePastedBills(ta ? ta.value : '');
        }
        if (!_selectedCustomer) return [];
        return _customerMap.get(_selectedCustomer) || [];
    }

    /**
     * [Fix #37] Parse nội dung textarea → mảng mã đơn.
     * Tách theo newline / phẩy / chấm phẩy / tab / khoảng trắng.
     * Chuẩn hoá NBSP→space, trim, bỏ rỗng, KHỬ TRÙNG LẶP giữ thứ tự.
     */
    function parsePastedBills(text) {
        if (!text) return [];
        const seen = new Set();
        const out = [];
        for (const tok of String(text).split(/[\s,;]+/)) {
            const cleaned = tok
                .replace(/ /g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            if (!cleaned || seen.has(cleaned)) continue;
            seen.add(cleaned);
            out.push(cleaned);
        }
        return out;
    }

    function setFileInfo(fileName, totalOrders) {
        if (fileName) {
            fileInfo.style.display = 'flex';
            fileInfoName.textContent = fileName;
            fileInfoName.title = fileName;
            excelFilePickLabel.textContent = 'Chọn file khác';
            filePickerSubtitle.textContent = `Đã load ${_customerMap.size} khách hàng`;
            fileTotalCount.textContent = `${totalOrders.toLocaleString('vi-VN')} đơn`;
            fileTotalCount.style.display = 'inline-flex';
            fileTotalCount.classList.add('has-bills');
        } else {
            fileInfo.style.display = 'none';
            fileInfoName.textContent = '—';
            excelFilePickLabel.textContent = 'Chọn file Excel';
            filePickerSubtitle.textContent = 'Chọn file để load danh sách khách';
            fileTotalCount.style.display = 'none';
        }
    }

    /**
     * Trả về danh sách khách hiển thị trên UI.
     * Khi đã chọn 1 khách → CHỈ trả về khách đó (ẩn các khách khác).
     * Khi chưa chọn → áp dụng search query, sort theo số đơn giảm dần.
     */
    function getDisplayedEntries() {
        if (_selectedCustomer && _customerMap.has(_selectedCustomer)) {
            return [[_selectedCustomer, _customerMap.get(_selectedCustomer)]];
        }
        const q = customerSearch.value.trim().toLowerCase();
        let entries = Array.from(_customerMap.entries());
        if (q) {
            entries = entries.filter(([name]) => name.toLowerCase().includes(q));
        }
        // Sort mặc định: nhiều đơn trước
        entries.sort((a, b) => b[1].length - a[1].length);
        return entries;
    }

    function highlightMatch(name, query) {
        if (!query) return null;
        const lower = name.toLowerCase();
        const q = query.toLowerCase();
        const idx = lower.indexOf(q);
        if (idx < 0) return null;
        const frag = document.createDocumentFragment();
        if (idx > 0) frag.appendChild(document.createTextNode(name.slice(0, idx)));
        const mark = document.createElement('mark');
        mark.textContent = name.slice(idx, idx + query.length);
        frag.appendChild(mark);
        if (idx + query.length < name.length) {
            frag.appendChild(document.createTextNode(name.slice(idx + query.length)));
        }
        return frag;
    }

    function renderCustomerList() {
        const entries = getDisplayedEntries();
        const total = _customerMap.size;

        // Update header text
        if (_selectedCustomer) {
            customerListHeader.textContent = `Đang chọn (${total - 1} khách khác đã ẩn)`;
            customerResetBtn.style.display = 'flex';
        } else {
            const q = customerSearch.value.trim();
            if (q) {
                customerListHeader.textContent = `${entries.length} / ${total} khách`;
            } else {
                customerListHeader.textContent = `${total} khách`;
            }
            customerResetBtn.style.display = 'none';
        }

        if (entries.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'cust-empty';
            empty.textContent = 'Không tìm thấy khách phù hợp';
            customerList.innerHTML = '';
            customerList.appendChild(empty);
            _activeIdx = -1;
            return;
        }

        const q = _selectedCustomer ? '' : customerSearch.value.trim();
        const frag = document.createDocumentFragment();
        entries.forEach(([name, bills], idx) => {
            const item = document.createElement('div');
            item.className = 'cust-item';
            item.dataset.name = name;
            item.dataset.idx = idx;
            if (name === _selectedCustomer) item.classList.add('is-selected');
            if (idx === _activeIdx) item.classList.add('is-active');

            const cb = document.createElement('span');
            cb.className = 'cust-cb';

            const nameEl = document.createElement('span');
            nameEl.className = 'cust-item-name';
            nameEl.title = name;
            const highlighted = highlightMatch(name, q);
            if (highlighted) nameEl.appendChild(highlighted);
            else nameEl.textContent = name;

            const countEl = document.createElement('span');
            countEl.className = 'cust-item-count';
            countEl.textContent = `${bills.length} đơn`;

            item.appendChild(cb);
            item.appendChild(nameEl);
            item.appendChild(countEl);
            item.addEventListener('click', () => {
                if (_selectedCustomer === name) {
                    // Click lại khách đang chọn → bỏ chọn
                    clearCustomerSelection();
                } else {
                    selectCustomer(name);
                }
            });
            frag.appendChild(item);
        });
        customerList.innerHTML = '';
        customerList.appendChild(frag);
    }

    function selectCustomer(name) {
        if (!_customerMap.has(name)) return;
        _selectedCustomer = name;
        const bills = _customerMap.get(name);
        customerOrderCount.textContent = `${bills.length} đơn`;
        customerOrderCount.style.display = 'inline-flex';
        customerOrderCount.classList.add('has-bills');
        customerSubtitle.textContent = 'Sẵn sàng chạy';
        // Khi đã chọn → xóa search query để header hiển thị rõ
        customerSearch.value = '';
        customerClear.style.display = 'none';
        renderCustomerList();
        try {
            chrome.storage.session?.set({ vtpSelectedCustomer: name });
        } catch (_) {}
    }

    function clearCustomerSelection() {
        _selectedCustomer = null;
        customerOrderCount.style.display = 'none';
        customerSubtitle.textContent = 'Chọn khách để chạy đơn';
        try { chrome.storage.session?.remove('vtpSelectedCustomer'); } catch (_) {}
        renderCustomerList();
    }

    function clearFile() {
        _customerMap = new Map();
        _selectedCustomer = null;
        excelFileInput.value = '';
        setFileInfo(null, 0);
        customerCard.style.display = 'none';
        clearCustomerSelection();
        try {
            chrome.storage.session?.remove([
                'vtpFileName', 'vtpCustomerMap', 'vtpSelectedCustomer'
            ]);
        } catch (_) {}
    }

    async function handleFileChosen(file) {
        if (!file) return;
        try {
            excelFilePickBtn.disabled = true;
            excelFilePickBtn.classList.add('is-loading');
            excelFilePickLabel.textContent = 'Đang đọc file...';
            // [Fix #32] Yield UI 1 frame để spinner kịp render trước khi
            // parse chiếm main thread (file vài MB block ~1-2s)
            await new Promise(r => requestAnimationFrame(() => r()));

            const result = await window.VTPXlsx.parseFile(file, { headerRow: 1 });

            if (!result.headers.includes('TEN_KHGUI') || !result.headers.includes('MA_PHIEUGUI')) {
                throw new Error('File thiếu cột TEN_KHGUI hoặc MA_PHIEUGUI');
            }

            _customerMap = window.VTPXlsx.groupBy(result.byHeader, 'TEN_KHGUI', 'MA_PHIEUGUI');

            if (_customerMap.size === 0) {
                throw new Error('Không tìm thấy đơn hàng nào trong file');
            }

            const totalOrders = result.byHeader.length;
            setFileInfo(file.name, totalOrders);
            customerCard.style.display = 'block';
            clearCustomerSelection();
            renderCustomerList();

            try {
                const serialized = Array.from(_customerMap.entries());
                chrome.storage.session?.set({
                    vtpFileName:    file.name,
                    vtpCustomerMap: serialized
                });
            } catch (_) {}

        } catch (err) {
            console.error('[VTP Sửa Giờ] Lỗi đọc file:', err);
            alert('Không đọc được file Excel: ' + err.message);
            clearFile();
        } finally {
            excelFilePickBtn.disabled = false;
            excelFilePickBtn.classList.remove('is-loading');
        }
    }

    // ── Wire events ──
    excelFilePickBtn.addEventListener('click', () => excelFileInput.click());
    excelFileInput.addEventListener('change', (e) => {
        const f = e.target.files?.[0];
        if (f) handleFileChosen(f);
    });
    fileInfoClear.addEventListener('click', clearFile);

    // Drag & drop trên nút chọn file
    excelFilePickBtn.addEventListener('dragover', (e) => {
        e.preventDefault();
        excelFilePickBtn.classList.add('is-dragover');
    });
    excelFilePickBtn.addEventListener('dragleave', () => {
        excelFilePickBtn.classList.remove('is-dragover');
    });
    excelFilePickBtn.addEventListener('drop', (e) => {
        e.preventDefault();
        excelFilePickBtn.classList.remove('is-dragover');
        const f = e.dataTransfer?.files?.[0];
        if (f) handleFileChosen(f);
    });

    // ════════════════════════════════════════
    //  [Fix #37] INPUT MODE TOGGLE + PASTE BILLS
    //  2 chế độ loại trừ nhau: 'excel' (file picker)  /  'paste' (textarea)
    // ════════════════════════════════════════
    const modeExcelBtn      = document.getElementById('modeExcelBtn');
    const modePasteBtn      = document.getElementById('modePasteBtn');
    const modePanelExcel    = document.getElementById('modePanelExcel');
    const modePanelPaste    = document.getElementById('modePanelPaste');
    const pasteBillsInput   = document.getElementById('pasteBillsInput');
    const pasteCountBadge   = document.getElementById('pasteCount');

    function setInputMode(mode) {
        _inputMode = (mode === 'paste') ? 'paste' : 'excel';
        const isPaste = _inputMode === 'paste';

        modePanelExcel.style.display = isPaste ? 'none' : '';
        modePanelPaste.style.display = isPaste ? '' : 'none';

        modeExcelBtn.classList.toggle('active', !isPaste);
        modePasteBtn.classList.toggle('active', isPaste);
        modeExcelBtn.setAttribute('aria-selected', String(!isPaste));
        modePasteBtn.setAttribute('aria-selected', String(isPaste));

        try { chrome.storage.session?.set({ vtpInputMode: _inputMode }); } catch (_) {}
    }

    function refreshPasteCount() {
        const n = _pastedBills.length;
        if (n > 0) {
            pasteCountBadge.textContent = `${n.toLocaleString('vi-VN')} đơn`;
            pasteCountBadge.style.display = 'inline-flex';
            pasteCountBadge.classList.add('has-bills');
        } else {
            pasteCountBadge.style.display = 'none';
        }
    }

    modeExcelBtn.addEventListener('click', () => setInputMode('excel'));
    modePasteBtn.addEventListener('click', () => setInputMode('paste'));

    // Parse textarea (debounce 150ms để không tốn CPU khi user gõ nhanh)
    let _pasteTimer = null;
    pasteBillsInput.addEventListener('input', () => {
        clearTimeout(_pasteTimer);
        _pasteTimer = setTimeout(() => {
            _pastedBills = parsePastedBills(pasteBillsInput.value);
            refreshPasteCount();
            try { chrome.storage.session?.set({ vtpPastedText: pasteBillsInput.value }); } catch (_) {}
        }, 150);
    });

    // Search (debounced)
    let _searchTimer = null;
    customerSearch.addEventListener('input', () => {
        customerClear.style.display = customerSearch.value ? 'flex' : 'none';
        // Nếu user gõ trong khi đang chọn 1 khách → coi như muốn chọn lại
        if (_selectedCustomer) {
            _selectedCustomer = null;
            customerOrderCount.style.display = 'none';
            customerSubtitle.textContent = 'Chọn khách để chạy đơn';
            try { chrome.storage.session?.remove('vtpSelectedCustomer'); } catch (_) {}
        }
        _activeIdx = -1;
        clearTimeout(_searchTimer);
        _searchTimer = setTimeout(renderCustomerList, 80);
    });
    customerSearch.addEventListener('keydown', (e) => {
        const items = customerList.querySelectorAll('.cust-item');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            _activeIdx = Math.min(_activeIdx + 1, items.length - 1);
            updateActive(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            _activeIdx = Math.max(_activeIdx - 1, 0);
            updateActive(items);
        } else if (e.key === 'Enter' && _activeIdx >= 0) {
            e.preventDefault();
            const name = items[_activeIdx]?.dataset.name;
            if (name) selectCustomer(name);
        } else if (e.key === 'Escape') {
            customerSearch.value = '';
            customerClear.style.display = 'none';
            _activeIdx = -1;
            renderCustomerList();
            customerSearch.blur();
        }
    });

    function updateActive(items) {
        items.forEach((it, i) => it.classList.toggle('is-active', i === _activeIdx));
        if (_activeIdx >= 0 && items[_activeIdx]) {
            items[_activeIdx].scrollIntoView({ block: 'nearest' });
        }
    }

    customerClear.addEventListener('click', () => {
        customerSearch.value = '';
        customerClear.style.display = 'none';
        _activeIdx = -1;
        renderCustomerList();
        customerSearch.focus();
    });

    customerResetBtn.addEventListener('click', clearCustomerSelection);

    // Restore session
    try {
        chrome.storage.session?.get(
            ['vtpFileName', 'vtpCustomerMap', 'vtpSelectedCustomer',
             'vtpInputMode', 'vtpPastedText'],
            (data) => {
                if (data?.vtpCustomerMap && data.vtpCustomerMap.length > 0) {
                    _customerMap = new Map(data.vtpCustomerMap);
                    let total = 0;
                    _customerMap.forEach(v => total += v.length);
                    setFileInfo(data.vtpFileName || 'file đã chọn', total);
                    customerCard.style.display = 'block';
                    renderCustomerList();
                    if (data.vtpSelectedCustomer && _customerMap.has(data.vtpSelectedCustomer)) {
                        selectCustomer(data.vtpSelectedCustomer);
                    }
                }
                // [Fix #37] Khôi phục mã đã dán + chế độ
                if (data?.vtpPastedText) {
                    pasteBillsInput.value = data.vtpPastedText;
                    _pastedBills = parsePastedBills(data.vtpPastedText);
                    refreshPasteCount();
                }
                if (data?.vtpInputMode === 'paste') {
                    setInputMode('paste');
                }
            }
        );
    } catch (_) {}

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
    const progressCurrent     = document.getElementById('progressCurrent');
    const progressCurrentCode = document.getElementById('progressCurrentCode');
    const statusDot    = document.querySelector('#statusChinhGio .status-dot');
    const statusMsg    = document.querySelector('#statusChinhGio .status-text');

    // ════════════════════════════════════════
    //  [Fix #43] LIVE LOG — Nhật ký thao tác real-time
    //  Content script ghi __VTP_CHINHGIO_LOG__ mỗi bước → render ở đây.
    // ════════════════════════════════════════
    const liveLogCard  = document.getElementById('liveLogCard');
    const liveLogBody  = document.getElementById('liveLogBody');
    const liveLogClear = document.getElementById('liveLogClear');
    const MAX_LOG_ITEMS = 200;
    let _lastLogKey = '';

    function escapeLog(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function appendLiveLog(entry) {
        if (!liveLogCard || !liveLogBody || !entry) return;
        liveLogCard.style.display = 'block';

        const typeClass = entry.type === 'success' ? 'is-success'
                        : entry.type === 'warning' ? 'is-warning' : '';
        const time = entry.ts
            ? new Date(entry.ts).toLocaleTimeString('vi-VN', { hour12: false })
            : '';
        const billLine = (entry.index != null && entry.total != null)
            ? `<span class="livelog-bill">Đơn ${entry.index + 1}/${entry.total} · ${escapeLog(entry.bill)}</span>`
            : '';

        const item = document.createElement('div');
        item.className = `livelog-item ${typeClass}`.trim();
        item.innerHTML =
            `<span class="livelog-step">${escapeLog(entry.step)}</span>` +
            `<div class="livelog-main">` +
                `<span class="livelog-text">${escapeLog(entry.text)}</span>` +
                billLine +
            `</div>` +
            `<span class="livelog-time">${escapeLog(time)}</span>`;

        liveLogBody.appendChild(item);
        while (liveLogBody.children.length > MAX_LOG_ITEMS) {
            liveLogBody.removeChild(liveLogBody.firstChild);
        }
        // Auto-scroll xuống mục mới nhất
        liveLogBody.scrollTop = liveLogBody.scrollHeight;
    }

    function clearLiveLog() {
        if (liveLogBody) liveLogBody.innerHTML = '';
        if (liveLogCard) liveLogCard.style.display = 'none';
        _lastLogKey = '';
        try { chrome.storage.local.remove('__VTP_CHINHGIO_LOG__'); } catch (_) {}
    }

    if (liveLogClear) liveLogClear.addEventListener('click', clearLiveLog);

    // [Fix #26] Hiển thị mã đơn đang chạy
    function setCurrentBill(bill) {
        if (!progressCurrent || !progressCurrentCode) return;
        if (bill) {
            progressCurrent.style.display = 'flex';
            progressCurrentCode.textContent = bill;
            progressCurrentCode.title = bill;
        } else {
            progressCurrent.style.display = 'none';
            progressCurrentCode.textContent = '—';
        }
    }

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
    //  [Fix #40] BÁO CÁO KẾT QUẢ — sau khi chạy xong
    // ════════════════════════════════════════
    const reportCard         = document.getElementById('reportCard');
    const reportBody         = document.getElementById('reportBody');
    const reportTabFail      = document.getElementById('reportTabFail');
    const reportTabSuccess   = document.getElementById('reportTabSuccess');
    const reportFailCount    = document.getElementById('reportFailCount');
    const reportSuccessCount = document.getElementById('reportSuccessCount');
    const reportCopyBtn      = document.getElementById('reportCopyBtn');
    const reportCopyLabel    = document.getElementById('reportCopyLabel');

    let _reportFail    = [];   // [{bill, reason}]
    let _reportSuccess = [];   // [bill]
    let _reportTab     = 'fail';

    function escapeHtml(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function renderReportBody() {
        const items = _reportTab === 'fail' ? _reportFail : _reportSuccess;
        if (items.length === 0) {
            reportBody.innerHTML = `<div class="report-empty">${
                _reportTab === 'fail'
                    ? 'Không có đơn nào thất bại 🎉'
                    : 'Chưa có đơn nào thành công'
            }</div>`;
            return;
        }
        if (_reportTab === 'fail') {
            reportBody.innerHTML = items.map((it, i) => `
                <div class="report-item is-fail">
                    <span class="report-item-num">${i + 1}</span>
                    <div class="report-item-main">
                        <span class="report-item-bill">${escapeHtml(it.bill)}</span>
                        <span class="report-item-reason">${escapeHtml(it.reason)}</span>
                    </div>
                </div>`).join('');
        } else {
            reportBody.innerHTML = items.map((bill, i) => `
                <div class="report-item is-success">
                    <span class="report-item-num">${i + 1}</span>
                    <span class="report-item-bill">${escapeHtml(bill)}</span>
                </div>`).join('');
        }
    }

    function setReportTab(tab) {
        _reportTab = (tab === 'success') ? 'success' : 'fail';
        reportTabFail.classList.toggle('active', _reportTab === 'fail');
        reportTabSuccess.classList.toggle('active', _reportTab === 'success');
        renderReportBody();
    }

    function renderReport(successList, failList) {
        _reportSuccess = successList || [];
        _reportFail    = failList    || [];
        reportFailCount.textContent    = _reportFail.length;
        reportSuccessCount.textContent = _reportSuccess.length;
        // Mặc định mở tab "Thất bại" nếu có fail, ngược lại mở "Thành công"
        setReportTab(_reportFail.length > 0 ? 'fail' : 'success');
        reportCard.style.display = 'block';
    }

    reportTabFail.addEventListener('click',    () => setReportTab('fail'));
    reportTabSuccess.addEventListener('click', () => setReportTab('success'));

    reportCopyBtn.addEventListener('click', async () => {
        const items = _reportTab === 'fail' ? _reportFail : _reportSuccess;
        if (items.length === 0) return;
        const text = _reportTab === 'fail'
            ? items.map(it => `${it.bill}\t${it.reason}`).join('\n')
            : items.join('\n');
        try {
            await navigator.clipboard.writeText(text);
            const original = reportCopyLabel.textContent;
            reportCopyLabel.textContent = '✓ Đã copy';
            setTimeout(() => { reportCopyLabel.textContent = original; }, 1400);
        } catch (e) {
            console.warn('[VTP] Copy thất bại:', e);
            alert('Không copy được vào clipboard.');
        }
    });

    // ════════════════════════════════════════
    //  RESTORE STATE — khi mở lại popup
    // ════════════════════════════════════════
    chrome.storage.local.get(['isRunning', 'currentIndex', 'billList', 'delay'], (data) => {
        // Restore delay setting
        if (data.delay) {
            delayInput.value = data.delay;
        }
        if (data.isRunning && data.billList) {
            // Đang chạy: khôi phục progress + mã đơn hiện tại
            updateProgressUI(data.currentIndex || 0, data.billList.length);
            // [Fix #26] Khôi phục mã đơn đang chạy nếu có
            const idx = data.currentIndex || 0;
            if (idx < data.billList.length) {
                setCurrentBill(data.billList[idx]);
            }
        } else if (data.billList || data.currentIndex !== undefined) {
            // [Fix #28] Không chạy mà còn billList/currentIndex cũ →
            // dọn để không gây hiểu lầm khi mở sidepanel sau này.
            chrome.storage.local.remove(['billList', 'currentIndex']);
        }
    });

    // ════════════════════════════════════════
    //  STORAGE LISTENER — cập nhật UI realtime
    //  Fix v1.1: Đọc trực tiếp từ `changes`, KHÔNG gọi storage.get() lồng nhau
    // ════════════════════════════════════════
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local') return;

        // [Fix #43] Nhật ký thao tác real-time
        if (changes.__VTP_CHINHGIO_LOG__?.newValue) {
            const entry = changes.__VTP_CHINHGIO_LOG__.newValue;
            // Dedup bằng key (ts + seq) — ts luôn tăng giữa các đơn nên
            // an toàn khi seq reset về 0 mỗi đơn mới.
            const key = `${entry.ts}-${entry.seq}`;
            if (key !== _lastLogKey) {
                _lastLogKey = key;
                appendLiveLog(entry);
            }
        }

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
            setCurrentBill(null); // [Fix #26]
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
            // [Fix #37] Thông báo theo chế độ đang dùng
            if (_inputMode === 'paste') {
                alert('Vui lòng dán ít nhất 1 mã đơn vào ô bên trên!');
            } else if (!_selectedCustomer) {
                alert('Vui lòng chọn file Excel và chọn khách hàng trước khi chạy!');
            } else {
                alert('Khách hàng đã chọn không có đơn nào.');
            }
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

        // [Fix #40] Ẩn báo cáo của phiên trước khi bắt đầu phiên mới
        if (reportCard) reportCard.style.display = 'none';

        // [Fix #43] Dọn nhật ký thao tác của phiên trước
        clearLiveLog();

        await chrome.storage.local.set({
            billList:     bills,
            delay,
            isRunning:    true,
            currentIndex: 0
        });
        updateProgressUI(0, bills.length);

        // ── Vòng lặp chính — chạy ở sidepanel (KHÔNG bị throttle) ──
        const skipList = [];
        const successList = []; // [Fix #40] thu thập mã đơn thành công để báo cáo

        // [Fix #24] Helper: inject + chờ kết quả 1 đơn, có retry khi 'busy'/'timeout'
        async function runOneBillWithRetry(bill, maxAttempts = 2) {
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                // Xóa signal cũ
                try { await chrome.storage.local.remove('__VTP_CHINHGIO_STEP_DONE__'); } catch (_) {}

                // Inject content script xử lý 1 đơn
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: mainTabId },
                        files: ['src/shared/notification.js', 'src/modules/chinhgio/chinhgio_content.js'],
                        injectImmediately: true  // [Fix #24] tránh delay khi tab background
                    });
                } catch (e) {
                    return { status: 'error', reason: 'Inject thất bại: ' + e.message };
                }

                // [Fix #24] Tăng timeout 120s → 300s vì tab background có thể chậm
                const result = await waitForChinhGioStepDone(300000);

                // 'busy' = script cũ chưa thoát (do timeout trước đó)
                // → chờ 2s rồi retry
                if (result.status === 'busy' && attempt < maxAttempts) {
                    console.warn(`[VTP Sửa Giờ] Script còn busy, chờ 2s rồi retry (lần ${attempt + 1}/${maxAttempts})`);
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                }

                // 'timeout' = đợi quá 300s mà không có signal
                // → retry 1 lần (có thể tab vừa chuyển active xong)
                if (result.status === 'timeout' && attempt < maxAttempts) {
                    console.warn(`[VTP Sửa Giờ] Timeout 300s đơn "${bill}", retry lần ${attempt + 1}/${maxAttempts}`);
                    // Reset cờ guard ở page để inject mới chạy được
                    try {
                        await chrome.scripting.executeScript({
                            target: { tabId: mainTabId },
                            func: () => { window.__VTP_CHINHGIO_RUNNING__ = false; }
                        });
                    } catch (_) {}
                    continue;
                }

                return result;
            }
            return { status: 'timeout', reason: 'Hết số lần thử' };
        }

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
            setCurrentBill(bills[i]); // [Fix #26]

            // [Fix #24] Inject + chờ kết quả với retry khi busy/timeout
            const result = await runOneBillWithRetry(bills[i], 2);
            console.log(`[VTP Sửa Giờ] Kết quả đơn ${i + 1}:`, result.status, result.bill || '');

            if (result.status === 'skipped' || result.status === 'error' || result.status === 'timeout') {
                skipList.push({
                    bill:   result.bill || bills[i],
                    reason: result.reason || (result.status === 'timeout' ? 'Quá thời gian xử lý' : 'Lỗi không xác định')
                });
                // Khi timeout: index ở storage chưa được tăng (script chưa chạy xong)
                // → tự tăng để vòng lặp không kẹt ở cùng 1 đơn
                if (result.status === 'timeout') {
                    const cur = await chrome.storage.local.get(['currentIndex']);
                    if ((cur.currentIndex || 0) <= i) {
                        await chrome.storage.local.set({ currentIndex: i + 1 });
                    }
                }
            } else if (result.status === 'success') {
                // [Fix #40] Thu thập đơn thành công để báo cáo cuối phiên
                successList.push(result.bill || bills[i]);
            }

            // Cập nhật progress
            updateProgressUI(i + 1, bills.length);

            // [Fix #27] Delay giữa các đơn — dùng giá trị user cài (giây).
            // Mặc định 4s; min 0.3s để page kịp render. Trước đây delayMs
            // được dùng làm sleep tĩnh trước Tầng 2 — đã bỏ ở Fix #25.
            if (i < bills.length - 1) {
                const gapMs = Math.max(300, ((parseInt(delayInput.value, 10) || 4) * 1000));
                await new Promise(r => setTimeout(r, gapMs));
            }
        }

        // ── Hoàn tất ──
        await chrome.storage.local.set({ isRunning: false });
        setCurrentBill(null); // [Fix #26]

        if (skipList.length === 0) {
            if (statusMsg) statusMsg.textContent      = '✅ Đã hoàn thành!';
            if (statusDot) statusDot.style.background = '#22c55e';
        } else {
            if (statusMsg) statusMsg.textContent      = `⚠️ Xong — Bỏ qua ${skipList.length} đơn`;
            if (statusDot) statusDot.style.background = '#f59e0b';
            console.warn('[VTP Sửa Giờ] Đơn bị bỏ qua:', skipList);
        }

        // [Fix #40] Hiển thị báo cáo kết quả (chỉ khi có ít nhất 1 đơn đã chạy)
        if (successList.length + skipList.length > 0) {
            renderReport(successList, skipList);
        }

        // Reset UI
        startChinhGioBtn.disabled  = false;
        startChinhGioBtn.innerHTML = BTN_HTML.startPlay;
    });

    stopChinhGioBtn.addEventListener('click', async () => {
        await chrome.storage.local.set({ isRunning: false });
        if (statusMsg) statusMsg.textContent      = 'Đã dừng.';
        if (statusDot) statusDot.style.background = '#6b7280';
        setCurrentBill(null); // [Fix #26]
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

    // ════════════════════════════════════════
    //  [Fix #44] LIVE LOG — Nhật ký thao tác Kiểm Kê Tuyến
    //  Vòng lặp tuyến chạy ngay trong sidepanel → append thẳng vào DOM,
    //  không cần qua storage như module Sửa Giờ.
    // ════════════════════════════════════════
    const routeLogCard  = document.getElementById('routeLogCard');
    const routeLogBody  = document.getElementById('routeLogBody');
    const routeLogClear = document.getElementById('routeLogClear');
    const MAX_ROUTE_LOG = 250;

    function escapeRouteLog(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /**
     * Ghi 1 dòng nhật ký Kiểm Kê.
     * @param {string|number} step  - nhãn bước (số hoặc icon)
     * @param {string} text         - mô tả thao tác
     * @param {string} [type]       - 'info' | 'success' | 'warning'
     * @param {string} [route]      - tên tuyến (hiển thị dòng phụ)
     */
    function routeLog(step, text, type = 'info', route = '') {
        if (!routeLogCard || !routeLogBody) return;
        routeLogCard.style.display = 'block';

        const typeClass = type === 'success' ? 'is-success'
                        : type === 'warning' ? 'is-warning' : '';
        const time = new Date().toLocaleTimeString('vi-VN', { hour12: false });
        const routeLine = route
            ? `<span class="livelog-bill">${escapeRouteLog(route)}</span>`
            : '';

        const item = document.createElement('div');
        item.className = `livelog-item ${typeClass}`.trim();
        item.innerHTML =
            `<span class="livelog-step">${escapeRouteLog(step)}</span>` +
            `<div class="livelog-main">` +
                `<span class="livelog-text">${escapeRouteLog(text)}</span>` +
                routeLine +
            `</div>` +
            `<span class="livelog-time">${escapeRouteLog(time)}</span>`;

        routeLogBody.appendChild(item);
        while (routeLogBody.children.length > MAX_ROUTE_LOG) {
            routeLogBody.removeChild(routeLogBody.firstChild);
        }
        routeLogBody.scrollTop = routeLogBody.scrollHeight;
    }

    function clearRouteLog() {
        if (routeLogBody) routeLogBody.innerHTML = '';
        if (routeLogCard) routeLogCard.style.display = 'none';
    }

    if (routeLogClear) routeLogClear.addEventListener('click', clearRouteLog);

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

        // [Fix #44] Dọn nhật ký phiên trước + log khởi động
        clearRouteLog();
        routeLog('▶', `Bắt đầu kiểm kê ${selectedRoutes.length} tuyến`, 'info');

        let completed  = 0;
        let errors     = [];
        let elapsedSec = 0;
        let totalScanned = 0; // [Fix #45] tổng mã đã quét qua tất cả tuyến

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
                routeLog('⏹', 'Đã dừng theo yêu cầu người dùng', 'warning');
                break;
            }

            routeProgressStatus.textContent = `[${i + 1}/${selectedRoutes.length}] Kiểm kê: ${route}`;
            setRouteStatus(route, 'running'); // Fix #4
            routeLog(`${i + 1}`, `Bắt đầu tuyến (${i + 1}/${selectedRoutes.length})`, 'info', route);

            try {
                // A: Fix #2 — dùng mainTabId, không query theo active
                tab = await chrome.tabs.get(mainTabId);

                // B: Chờ trang danh sách sẵn sàng (combobox phải xuất hiện)
                routeProgressStatus.textContent = `[${i + 1}/${selectedRoutes.length}] Chờ trang danh sách sẵn sàng...`;
                routeLog('⏳', 'Chờ trang danh sách sẵn sàng…', 'info', route);
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
                routeLog('⚙', 'Thực hiện 5 bước chọn tuyến & tạo phiếu…', 'info', route);
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
                routeLog('⏳', 'Chờ trang kiểm kê mở…', 'info', route);
                const scanPageReady = await scanPagePromise;
                if (!scanPageReady) {
                    throw new Error('Không vào được trang kiểm kê sau 90 giây');
                }
                console.log('[VTP] ✅ Trang scan đã mở');

                // Buffer nhỏ để trang render đầy đủ (tối ưu từ 2500ms)
                await new Promise(r => setTimeout(r, 500)); // [v2.5] Giảm từ 1000ms

                // H: Inject gapton_core_scan
                routeProgressStatus.textContent = `[${i + 1}/${selectedRoutes.length}] Đang quét mã: ${route}`;
                routeLog('📦', 'Đang quét mã kiểm tồn…', 'info', route);
                console.log('[VTP] Inject gapton_core_scan.js...');

                // [Fix #23] Dùng waitForTabReload thay vì chrome.storage signal
                // Lý do: chrome.storage.local.set() KHÔNG hoạt động trong world:'MAIN'
                //        (Chrome MV3: MAIN world không có quyền truy cập Extension APIs)
                // gapton_core_scan.js LUÔN gọi location.reload() khi xong (cả TH1 và TH2)
                // → Tab reload chính là tín hiệu "quét xong" đáng tin cậy nhất
                // PHẢI đăng ký TRƯỚC inject để không bỏ lỡ sự kiện reload
                await clearScanComplete(); // dọn signal cũ (backward compat)
                // [v2.1] Dọn count cũ trong localStorage TRƯỚC khi inject scan
                // → đảm bảo giá trị đọc sau reload chắc chắn của tuyến hiện tại,
                //   không nhầm count tuyến trước nếu engine không kịp ghi.
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: mainTabId }, world: 'MAIN',
                        func: () => { try { localStorage.removeItem('__VTP_LAST_SCAN_COUNT__'); } catch (_) {} }
                    });
                } catch (_) {}
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
                    routeLog('❌', 'Quét timeout sau 11 phút', 'warning', route);
                } else {
                    console.log('[VTP] ✅ Scan xong (tab đã reload):', route);
                    setRouteStatus(route, 'done');
                    // [Fix #45] Đọc số mã đã quét từ localStorage (engine ghi trước reload)
                    let scanInfo = null;
                    try {
                        const res = await chrome.scripting.executeScript({
                            target: { tabId: mainTabId }, world: 'MAIN',
                            func: () => {
                                try {
                                    const raw = localStorage.getItem('__VTP_LAST_SCAN_COUNT__');
                                    localStorage.removeItem('__VTP_LAST_SCAN_COUNT__');
                                    return raw ? JSON.parse(raw) : null;
                                } catch (_) { return null; }
                            }
                        });
                        scanInfo = res?.[0]?.result || null;
                    } catch (_) {}
                    if (scanInfo && typeof scanInfo.count === 'number') {
                        totalScanned += scanInfo.count;
                        const detail = scanInfo.empty
                            ? 'Tuyến trống — không có mã cần quét'
                            : `Đã quét ${scanInfo.count} mã`;
                        routeLog('✅', detail, 'success', route);
                    } else {
                        routeLog('✅', 'Quét xong tuyến', 'success', route);
                    }
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
                routeLog('❌', `Lỗi: ${e.message}`, 'warning', route);
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
            routeLog('⏹', `Đã dừng — hoàn thành ${completed}/${selectedRoutes.length} tuyến`, 'warning');
        } else if (errors.length === 0) {
            routeProgressStatus.textContent = `✅ Hoàn tất! Đã kiểm kê ${completed} tuyến thành công.`;
            routeLog('🎉', `Hoàn tất! ${completed} tuyến · tổng ${totalScanned} mã đã quét`, 'success');
        } else {
            routeProgressStatus.textContent =
                `⚠️ Hoàn tất ${completed} tuyến. ${errors.length} lỗi: ${errors.map(e => e.route).join(', ')}`;
            routeLog('⚠', `Hoàn tất ${completed} tuyến · tổng ${totalScanned} mã · ${errors.length} lỗi`, 'warning');
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

});