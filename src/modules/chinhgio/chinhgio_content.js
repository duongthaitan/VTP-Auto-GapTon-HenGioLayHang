// ============================================================
//  VTP Tool – Sửa Giờ Content Script
//  v3.2 — Background-Tab Hardened + Speed Boost
//  Nâng cấp:
//    [1] Xử lý 1 ĐƠN DUY NHẤT rồi thoát — sidepanel.js điều phối
//        vòng lặp → không bị Chrome throttle khi chuyển tab
//    [2] Kết quả trả về qua chrome.storage (__VTP_CHINHGIO_STEP_DONE__)
//    [3] Giữ nguyên Smart Skip & Auto-Recovery từ v2.0
//    [4] closeOpenForms(), phát hiện 2 tầng, skip tracking
//    [Fix #24] Thay sleep cố định + querySelector bằng waitForElement
//        (MutationObserver KHÔNG bị Chrome throttle ở background tab),
//        tăng timeout AJAX 3s→8s, dùng waitForElementGone cho form đóng
//        → Khắc phục treo/skip hàng loạt khi tab VTP ở background.
//    [Fix #25] Speed Boost
//        • Bỏ sleep(delayMs) cố định 4s trước Tầng 2 — đã có
//          waitForElement tự phát hiện form ready
//        • closeOpenForms: 800ms→250ms (Bootstrap fade ~150ms),
//          Escape fallback: 600ms→200ms
//        → Tiết kiệm ~4.5 giây/đơn, không ảnh hưởng độ tin cậy.
//    [Fix #33] Sửa lỗi "thao tác nhanh hơn mạng" — khớp nhầm kết quả đơn cũ:
//        • Dọn sạch form/modal của ĐƠN TRƯỚC ở đầu
//          processOneBill trước khi search → tránh waitForElement khớp
//          phần tử cũ khi AJAX đơn mới chưa về.
//        • waitForAjaxCycle(): chờ TRỌN chu kỳ loading (hiện→ẩn) sau khi
//          search, bảo đảm bảng kết quả là của đơn mới, không phải bảng cũ.
//        • searchBtn null → fallback nhấn Enter thay vì chạy tiếp mù.
//    [Fix #34] Đúng theo DOM thật (Angular Material, không phải Bootstrap):
//        • Bỏ "Tầng 1" chờ .modal-dialog/.modal.in — selector Bootstrap
//          không tồn tại trên trang này.
//        • Chọn ngày theo TEXT (Ngày kia→Ngày mai→Hôm nay) thay vì id
//          1_apt/2_apt — id ĐỘNG theo option khả dụng nên chọn theo id
//          gây đặt NHẦM ngày hàng loạt.
//    [Fix #35] Chờ AJAX sau khi chọn ngày + không bấm Cập nhật mù:
//        • waitForAjaxCycle sau click ngày → phòng khung giờ nạp qua AJAX
//          khi mạng chậm (trước đây hết giờ → bỏ sót "Cả ngày").
//        • Tăng timeout "Cả ngày" 4s→8s. Không thấy "Cả ngày" → skip đơn,
//          KHÔNG bấm Cập nhật (tránh cập nhật thiếu khung giờ).
//        • Bọc BƯỚC 6 (Cập nhật) trong if(!shouldSkip).
//    [Fix #36] closeOpenForms + LOADING_SELECTORS cho Angular Material:
//        • closeOpenForms: thêm selector Material (mat-dialog-close…) +
//          tìm nút đóng theo TEXT (Đóng/Hủy/Thoát) → bền với class động;
//          giữ Bootstrap + Escape làm fallback nhiều tầng.
//        • LOADING_SELECTORS: thêm mat-spinner/mat-progress/cdk-overlay.
//    [Fix #41] SỬA LỖI GỐC "skip toàn bộ đơn" — trigger mở khung giờ trên
//        DOM thật là <span class="d-block">Chọn thời gian</span>, KHÔNG phải
//        button.select-down → selector cũ luôn null → mọi đơn bị skip
//        "Đơn không hỗ trợ sửa giờ". Thay bằng:
//        • findChonThoiGian(): tìm phần tử lá theo text "Chọn thời gian".
//        • isEditTimeFormOpen(): nhận biết form mở qua trigger / panel ngày
//          (label[for$="_apt"]) / khung giờ (label.lb-time).
//        • waitForGoneBy(): chờ form đóng theo predicate (thay select-down).
//        • Nút "Cập nhật" tìm theo TEXT (bỏ phụ thuộc class btn-viettel).
//        • findSearchInput(): fallback theo placeholder "Tìm đơn hàng…".
//        • Click trigger có fallback click phần tử cha nếu panel ngày chưa mở.
//    [Fix #42] Cứng cáp hơn khi MẠNG CHẬM:
//        • Bọc toàn bộ chu kỳ AJAX của BƯỚC 2 (search) trong waitForAjaxCycle
//          với appearMs cao hơn, tránh đọc bảng kết quả cũ.
//        • isEditTimeFormOpen() loại trừ trigger "Chọn thời gian" của đơn CŨ
//          còn sót bằng cách verify panel ngày/khung giờ khi cần.
//        • Tăng timeout mở form 10s→20s, panel ngày 4s→8s, "Cả ngày" 8s→12s,
//          form đóng giữ 15s — phòng AJAX trả chậm ở tab background.
//        • Sau click "Cập nhật": coi là THÀNH CÔNG nếu form đóng HOẶC có toast
//          thành công; không còn phụ thuộc DUY NHẤT vào form đóng.
// ============================================================

if (window.__VTP_CHINHGIO_RUNNING__) {
    console.warn('[VTP Sửa Giờ] Script đã đang chạy. Bỏ qua lần inject mới.');
    // Báo sidepanel biết không thể chạy (đang busy)
    chrome.storage.local.set({ __VTP_CHINHGIO_STEP_DONE__: { status: 'busy' } });
} else {
    window.__VTP_CHINHGIO_RUNNING__ = true;

    // ─── Utilities ───────────────────────────────────────────

    /** Độ trễ tĩnh */
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    /**
     * Chờ phần tử DOM xuất hiện (MutationObserver + timeout).
     * Trả về element hoặc null nếu timeout.
     */
    const waitForElement = (selector, timeout = 8000) => {
        return new Promise((resolve) => {
            const existing = document.querySelector(selector);
            if (existing) return resolve(existing);

            let timeoutId = null;

            const observer = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) {
                    observer.disconnect();
                    clearTimeout(timeoutId);
                    resolve(el);
                }
            });

            observer.observe(document.body, {
                childList:     true,
                subtree:       true,
                characterData: false,
                attributes:    false
            });

            timeoutId = setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeout);
        });
    };

    /**
     * [Fix #24] Chờ phần tử BIẾN MẤT khỏi DOM (MutationObserver + timeout).
     * Dùng để chờ form đóng — KHÔNG bị throttle ở background tab.
     */
    const waitForElementGone = (selector, timeout = 8000) => {
        return new Promise((resolve) => {
            if (!document.querySelector(selector)) return resolve(true);

            let timeoutId = null;
            const observer = new MutationObserver(() => {
                if (!document.querySelector(selector)) {
                    observer.disconnect();
                    clearTimeout(timeoutId);
                    resolve(true);
                }
            });

            observer.observe(document.body, {
                childList:     true,
                subtree:       true,
                attributes:    true,
                attributeFilter: ['style', 'class']
            });

            timeoutId = setTimeout(() => {
                observer.disconnect();
                resolve(false);
            }, timeout);
        });
    };

    /**
     * [Fix #24] Chờ phần tử thỏa predicate (vd: tìm theo text).
     * Dùng MutationObserver → không bị throttle.
     */
    const waitForElementBy = (queryFn, timeout = 8000) => {
        return new Promise((resolve) => {
            const existing = queryFn();
            if (existing) return resolve(existing);

            let timeoutId = null;
            const observer = new MutationObserver(() => {
                const el = queryFn();
                if (el) {
                    observer.disconnect();
                    clearTimeout(timeoutId);
                    resolve(el);
                }
            });

            observer.observe(document.body, {
                childList: true, subtree: true, characterData: true
            });

            timeoutId = setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeout);
        });
    };

    /**
     * [Fix #41] Chờ predicate TRẢ VỀ false (phần tử/form biến mất).
     * Thay waitForElementGone('button.select-down') vì không còn selector đó.
     */
    const waitForGoneBy = (predicate, timeout = 8000) => {
        return new Promise((resolve) => {
            if (!predicate()) return resolve(true);
            let timeoutId = null;
            const observer = new MutationObserver(() => {
                if (!predicate()) {
                    observer.disconnect();
                    clearTimeout(timeoutId);
                    resolve(true);
                }
            });
            observer.observe(document.body, {
                childList: true, subtree: true,
                attributes: true, attributeFilter: ['style', 'class']
            });
            timeoutId = setTimeout(() => {
                observer.disconnect();
                resolve(false);
            }, timeout);
        });
    };

    /**
     * [Fix #33] Tập selector loading bao quát (ZK + Bootstrap/FontAwesome).
     * [Fix #36] Bổ sung spinner Angular Material (mat-spinner, mat-progress-*,
     * cdk-overlay backdrop) vì trang Sửa Giờ chạy Angular Material.
     * Nếu trang dùng class spinner riêng khác, bổ sung vào đây.
     */
    const LOADING_SELECTORS = [
        // ZK
        '.z-loading-indicator', '.z-apply-loading-indicator', '.z-listbox-loading',
        // Angular Material
        'mat-spinner', '.mat-spinner', '.mat-progress-spinner', '.mat-progress-bar',
        '.cdk-overlay-backdrop-showing',
        // Bootstrap / FontAwesome / chung
        '.loading-overlay', '.loading', '.spinner-border', '.spinner',
        '.fa-spinner.fa-spin', 'i.fa-spin', '[class*="loading"]'
    ].join(', ');

    const isLoadingVisible = () => {
        const el = document.querySelector(LOADING_SELECTORS);
        return !!(el && el.offsetParent !== null &&
            getComputedStyle(el).display !== 'none' &&
            getComputedStyle(el).visibility !== 'hidden');
    };

    /**
     * [Fix #33] Chờ TRỌN một chu kỳ AJAX: loading XUẤT HIỆN rồi BIẾN MẤT.
     * Đây là tín hiệu đáng tin nhất cho "server đã trả kết quả đơn mới" —
     * tránh khớp nhầm bảng/menu của đơn TRƯỚC khi mạng chậm.
     *
     * Trả về:
     *   true  → đã đi qua 1 chu kỳ loading (DOM hiện tại là của đơn mới)
     *   false → không phát hiện loading trong appearMs (mạng quá nhanh
     *           hoặc selector không khớp) → caller tự fallback.
     */
    const waitForAjaxCycle = (appearMs = 2500, goneMs = 15000) => {
        const watch = (predicate, timeout) => new Promise((resolve) => {
            if (predicate()) return resolve(true);
            let tid = null;
            const obs = new MutationObserver(() => {
                if (predicate()) { obs.disconnect(); clearTimeout(tid); resolve(true); }
            });
            obs.observe(document.body, {
                childList: true, subtree: true,
                attributes: true, attributeFilter: ['style', 'class']
            });
            tid = setTimeout(() => { obs.disconnect(); resolve(false); }, timeout);
        });

        // Pha 1: chờ loading xuất hiện
        return watch(isLoadingVisible, appearMs).then((appeared) => {
            if (!appeared) return false;
            // Pha 2: chờ loading biến mất (timeout vẫn coi như xong để không treo)
            return watch(() => !isLoadingVisible(), goneMs).then(() => true);
        });
    };

    /**
     * Mô phỏng thao tác gõ phím cho Angular/ZK input.
     */
    const setInputValue = (inputElement, value) => {
        inputElement.value = value;
        inputElement.dispatchEvent(new Event('input',  { bubbles: true }));
        inputElement.dispatchEvent(new Event('change', { bubbles: true }));
    };

    /** [Fix #41] Chuẩn hoá text: bỏ NBSP, gộp khoảng trắng, lowercase. */
    const normTextG = (s) => (s || '')
        .replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

    /**
     * [Fix #41] Tìm ô tìm kiếm mã vận đơn.
     * DOM thật ưu tiên id#frm_keyword; fallback theo placeholder
     * "Tìm đơn hàng, số điện thoại" phòng khi id đổi.
     */
    const findSearchInput = () => {
        let el = document.querySelector('input#frm_keyword');
        if (el) return el;
        const inputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'));
        return inputs.find(i => {
            const ph = normTextG(i.getAttribute('placeholder'));
            return ph.includes('tìm đơn') || ph.includes('số điện thoại') || ph.includes('mã vận đơn');
        }) || null;
    };

    /**
     * [Fix #41] Tìm trigger "Chọn thời gian" trên form sửa đơn.
     * DOM thật: <span class="d-block ng-star-inserted">Chọn thời gian</span>
     * → tìm phần tử LÁ (không có element con) có text "chọn thời gian".
     * Trả về phần tử click được (span hoặc cha gần nhất là button/a/div clickable).
     */
    const findChonThoiGian = () => {
        const nodes = Array.from(document.querySelectorAll('span, button, a, div'));
        for (const el of nodes) {
            if (el.children.length > 0) continue; // chỉ lấy phần tử lá
            if (normTextG(el.innerText || el.textContent) === 'chọn thời gian') {
                return el;
            }
        }
        // Fallback: khớp chứa cụm (phòng có ký tự ẩn)
        for (const el of nodes) {
            if (el.children.length > 0) continue;
            if (normTextG(el.innerText || el.textContent).includes('chọn thời gian')) {
                return el;
            }
        }
        return null;
    };

    /** [Fix #41] Panel chọn ngày đã render? (radio name="day" + label[for$="_apt"]) */
    const isDayPanelOpen = () => !!document.querySelector('label[for$="_apt"]');

    /**
     * [Fix #41] Form sửa giờ có đang mở không? Dùng thay cho
     * `document.querySelector('button.select-down')` (không tồn tại trên DOM thật).
     * Coi là "mở" nếu thấy trigger "Chọn thời gian" HOẶC panel ngày HOẶC khung giờ.
     */
    const isEditTimeFormOpen = () =>
        !!findChonThoiGian() || isDayPanelOpen() ||
        !!document.querySelector('label.lb-time');

    /**
     * [Mới v2.0] Tự động đóng modal / dialog đang mở.
     * [Fix #36] Trang Sửa Giờ là Angular Material — selector Bootstrap cũ
     * (.modal-footer, .modal-header .close, data-dismiss) gần như không khớp.
     * Bổ sung selector Material + tìm nút theo TEXT ("Đóng"/"Hủy"/"Thoát"),
     * vì đây là cách bền nhất khi class động. Giữ selector Bootstrap cũ +
     * Escape làm fallback nhiều tầng.
     * [Fix #39] AN TOÀN — whitelist EXACT text, không dùng startsWith.
     * Trước đây "hủy" / "bỏ qua" có thể khớp "Hủy đơn" / "Bỏ qua đơn" và
     * vô tình HỦY ĐƠN HÀNG khi recovery. Đảo thứ tự: Escape ưu tiên trước
     * text matching — Escape không bao giờ click nhầm action nguy hiểm.
     */
    async function closeOpenForms() {
        // Tầng A: selector trực tiếp — CHỈ những selector đặc trưng cho
        // "đóng dialog/modal", KHÔNG dùng selector mơ hồ có thể trùng nút
        // hủy đơn (vd .mat-dialog-actions button[color=warn], button.cancel).
        const closeSelectors = [
            // Angular Material — attribute đặc trưng cho mat-dialog-close
            'button.mat-dialog-close',
            'button[mat-dialog-close]',
            // Bootstrap close icon (X góc form)
            'button.btn-close',
            'button[aria-label="Close"]',
            '.modal-header .close',
            // FontAwesome X
            'i.fa-times'
        ];
        for (const sel of closeSelectors) {
            const el = document.querySelector(sel);
            if (el) {
                // [Fix #39] Nếu là icon (i.fa-times…), click parent button
                const target = (el.tagName === 'I' && el.parentElement) ? el.parentElement : el;
                console.log(`[VTP Sửa Giờ] Đóng form bằng selector: ${sel}`);
                target.click();
                await sleep(250);
                return;
            }
        }

        // Tầng B: [Fix #39] Escape — universal close, KHÔNG thể bấm nhầm
        // action destructive (hủy đơn/sửa đơn). Material respect Escape mặc định.
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape', keyCode: 27, bubbles: true
        }));
        await sleep(200);
        // [Fix #41] Nếu Escape đã đóng được form sửa giờ → xong.
        // (Trước đây check button.select-down — selector không tồn tại trên DOM thật.)
        if (!isEditTimeFormOpen()) return;

        // Tầng C: [Fix #39] Text matching — CHỈ EXACT MATCH với whitelist hẹp,
        // KHÔNG startsWith. Bỏ "hủy" và "bỏ qua" đơn lẻ vì có thể trùng
        // "Hủy đơn" / "Bỏ qua đơn" → click sẽ hủy đơn hàng thật.
        // Giữ "hủy bỏ"/"huỷ bỏ" (rõ nghĩa "discard"), "đóng lại", "thoát ra".
        const SAFE_CLOSE_TEXTS = new Set([
            'đóng', 'đóng lại',
            'hủy bỏ', 'huỷ bỏ',
            'thoát', 'thoát ra',
            'quay lại', 'trở lại',
            'cancel', 'close'
        ]);
        const normTxt = (s) => (s || '')
            .replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
        const btns = Array.from(document.querySelectorAll(
            'button, .mat-dialog-container a, [role="button"]'
        ));
        const closeBtn = btns.find(b => SAFE_CLOSE_TEXTS.has(normTxt(b.innerText || b.textContent)));
        if (closeBtn) {
            console.log(`[VTP Sửa Giờ] Đóng form bằng text exact: "${closeBtn.innerText.trim()}"`);
            closeBtn.click();
            await sleep(250);
        }
    }

    // ─── Xử lý 1 đơn duy nhất ───────────────────────────────

    async function processOneBill() {
        // Đọc trạng thái từ storage
        const data = await chrome.storage.local.get(
            ['billList', 'delay', 'isRunning', 'currentIndex']
        );

        // Guard: kiểm tra điều kiện dừng
        if (!data.isRunning) {
            console.log('[VTP Sửa Giờ] isRunning = false, dừng.');
            return { status: 'stopped' };
        }

        if (!data.billList || !Array.isArray(data.billList)) {
            console.warn('[VTP Sửa Giờ] billList không hợp lệ.');
            return { status: 'invalid' };
        }

        if (data.currentIndex >= data.billList.length) {
            console.log('[VTP Sửa Giờ] Đã xử lý hết danh sách.');
            return { status: 'completed' };
        }

        const currentBill = data.billList[data.currentIndex];
        const delayMs     = (data.delay || 4) * 1000;
        const totalBills  = data.billList.length;
        const index       = data.currentIndex;

        console.log(`>>> Đang xử lý (${index + 1}/${totalBills}): ${currentBill}`);

        let shouldSkip  = false;
        let skipReason  = '';

        // [Fix #43] Báo bước thao tác real-time về sidepanel qua storage.
        // Mỗi lần ghi 1 object mới (kèm seq + ts) để chrome.storage.onChanged
        // chắc chắn fire — sidepanel render thành nhật ký cuộn trực quan.
        let _logSeq = 0;
        const reportStep = (step, text, type = 'info') => {
            console.log(`[VTP Sửa Giờ] Bước ${step}: ${text}`);
            try {
                chrome.storage.local.set({
                    __VTP_CHINHGIO_LOG__: {
                        bill: currentBill, index, total: totalBills,
                        step, text, type, ts: Date.now(), seq: _logSeq++
                    }
                });
            } catch (_) {}
        };

        try {
            reportStep(1, 'Chuẩn bị & tìm ô tìm kiếm');
            // ═══════════════════════════════════════════
            // BƯỚC 1: Đảm bảo đang ở trang tìm kiếm
            // ═══════════════════════════════════════════
            // [Fix #33] Dọn sạch DOM của ĐƠN TRƯỚC trước khi search đơn mới.
            // Nếu form/modal cũ còn sót, các waitForElement bên dưới sẽ khớp
            // nhầm phần tử cũ khi mạng chậm → thao tác sai đơn. Đóng form và
            // chờ khu vực chọn giờ cũ biến mất hẳn.
            // [Fix #41] Nhận biết form mở qua isEditTimeFormOpen() thay vì
            // button.select-down (không tồn tại trên DOM thật).
            if (isEditTimeFormOpen() ||
                document.querySelector('.modal-dialog, .modal-content, .modal.in')) {
                await closeOpenForms();
                await waitForGoneBy(isEditTimeFormOpen, 5000);
            }

            let searchInput = findSearchInput();
            if (!searchInput) {
                console.log('[VTP Sửa Giờ] Không ở trang tìm kiếm, thử đóng form...');
                await closeOpenForms();
                searchInput = await waitForElement('input#frm_keyword', 10000)
                              || findSearchInput();
            }

            if (!searchInput) {
                throw new Error('Không tìm thấy ô tìm kiếm mã vận đơn');
            }

            // ═══════════════════════════════════════════
            // BƯỚC 2: Nhập mã và tìm kiếm
            // ═══════════════════════════════════════════
            reportStep(2, 'Nhập mã & tìm kiếm');
            setInputValue(searchInput, currentBill);
            // Chờ nút search hiện diện rồi click — không dùng sleep cố định
            const searchBtn = await waitForElementBy(
                () => document.querySelector('button.btn-viettel i.fa-search')?.parentElement,
                3000
            );
            // [Fix #33] Bắt buộc phải kích hoạt search. Không có nút → fallback
            // nhấn Enter trên ô input. Nếu cả hai bất khả thi thì throw, KHÔNG
            // chạy tiếp (tránh đọc bảng kết quả của đơn trước).
            if (searchBtn) {
                searchBtn.click();
            } else {
                searchInput.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Enter', keyCode: 13, which: 13, bubbles: true
                }));
                searchInput.dispatchEvent(new KeyboardEvent('keypress', {
                    key: 'Enter', keyCode: 13, which: 13, bubbles: true
                }));
                console.warn('[VTP Sửa Giờ] Không thấy nút search, dùng fallback Enter.');
            }

            // [Fix #33][Fix #42] Chờ TRỌN chu kỳ AJAX search (loading hiện → ẩn)
            // để chắc chắn bảng kết quả là của ĐƠN MỚI, không phải bảng cũ còn
            // sót. Mạng chậm: chu kỳ này có thể nhiều giây — đó chính là lúc
            // trước đây tool thao tác nhầm trên kết quả cũ. appearMs nới rộng
            // 2500→4000ms để bắt được loading về muộn khi mạng kém.
            reportStep(2, 'Chờ server trả kết quả tìm kiếm…');
            await waitForAjaxCycle(4000, 20000);

            // ═══════════════════════════════════════════
            // BƯỚC 3: Mở menu Sửa đơn
            // ═══════════════════════════════════════════
            reportStep(3, 'Mở menu & chọn "Sửa đơn"');
            // [Fix #24] Tăng timeout 8s→15s vì AJAX có thể chậm khi tab background
            const menuIcon = await waitForElement(
                'i.fa.fa-bars, i.fas.fa-bars, i.fa-solid.fa-bars, [class*="fa-bars"]',
                15000
            );
            if (!menuIcon) {
                throw new Error('Không load được bảng kết quả (mạng chậm hoặc mã không hợp lệ)');
            }
            menuIcon.click();

            // [Fix #24] Chờ menu "Sửa đơn" xuất hiện qua MutationObserver
            const editBtnSpan = await waitForElementBy(
                () => Array.from(document.querySelectorAll('button.vtp-bill-btn-action span'))
                          .find(span => span.innerText.includes('Sửa đơn')),
                5000
            );
            if (!editBtnSpan) {
                throw new Error('Không tìm thấy nút "Sửa đơn" trong menu');
            }
            editBtnSpan.parentElement.click();

            // ═══════════════════════════════════════════
            // BƯỚC 4: Chờ form sửa đơn sẵn sàng
            //
            //   [Fix #41] Trigger mở khung giờ trên DOM THẬT là
            //   <span class="d-block">Chọn thời gian</span>, KHÔNG phải
            //   button.select-down. Selector cũ luôn null → mọi đơn bị skip
            //   "Đơn không hỗ trợ sửa giờ". Giờ chờ trigger "Chọn thời gian"
            //   xuất hiện qua MutationObserver (waitForElementBy).
            //   [Fix #42] Tăng 10s→20s phòng form sửa đơn nạp chậm khi mạng kém.
            //
            //   Không thấy "Chọn thời gian" sau 20s → đơn không cho sửa giờ.
            // ═══════════════════════════════════════════
            reportStep(4, 'Chờ form sửa đơn mở (Chọn thời gian)…');
            const timeSelectBtn = await waitForElementBy(findChonThoiGian, 20000);

            if (!timeSelectBtn) {
                await closeOpenForms();
                shouldSkip = true;
                skipReason = 'Đơn không hỗ trợ sửa giờ lấy hàng';
            } else {
                // ═════════════════════════════════════
                // BƯỚC 5: Thao tác chọn giờ
                // ═════════════════════════════════════
                reportStep(5, 'Mở bảng chọn thời gian');
                // [Fix #41] Click trigger "Chọn thời gian". Nếu panel ngày
                // chưa render sau click (vd cần click phần tử cha), thử click
                // phần tử cha clickable rồi chờ lại.
                // [Fix #42] panel ngày timeout 4s→8s phòng AJAX chậm.
                timeSelectBtn.click();
                let dayReady = await waitForElementBy(
                    () => document.querySelector('label[for$="_apt"]'),
                    8000
                );
                if (!dayReady && timeSelectBtn.parentElement) {
                    console.log('[VTP Sửa Giờ] Panel ngày chưa mở, thử click phần tử cha...');
                    timeSelectBtn.parentElement.click();
                    dayReady = await waitForElementBy(
                        () => document.querySelector('label[for$="_apt"]'),
                        8000
                    );
                }

                // [Fix #42] Mạng chậm: panel ngày có thể chưa về sau 2 lần thử
                // → KHÔNG đoán mò click. Skip đơn an toàn (chưa thao tác gì
                // nguy hiểm, chỉ mới mở form).
                if (!dayReady) {
                    console.warn('[VTP Sửa Giờ] Panel chọn ngày không tải được (mạng chậm)');
                    await closeOpenForms();
                    shouldSkip = true;
                    skipReason = 'Không tải được danh sách ngày (mạng chậm)';
                }

                // [Fix #34] Chọn ngày theo TEXT, KHÔNG theo id.
                // DOM thật cho thấy id (1_apt/2_apt) ĐỘNG theo các option còn
                // khả dụng — vd label[for="1_apt"] có thể là "Ngày kia". Chọn
                // theo id như code cũ → đặt NHẦM ngày hàng loạt.
                // Ưu tiên: Ngày kia → Ngày mai → Hôm nay; fallback option đầu.
                const norm = (s) => (s || '')
                    .replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
                if (!shouldSkip) {
                    const dayLabels = Array.from(document.querySelectorAll('label[for$="_apt"]'));
                    let chosenDay = null;
                    for (const want of ['ngày kia', 'ngày mai', 'hôm nay']) {
                        const lbl = dayLabels.find(l => norm(l.innerText).includes(want));
                        if (lbl) { lbl.click(); chosenDay = lbl.innerText.trim(); break; }
                    }
                    if (!chosenDay && dayLabels.length) {
                        dayLabels[0].click();
                        chosenDay = dayLabels[0].innerText.trim();
                    }
                    console.log('[VTP Sửa Giờ] Chọn ngày:', chosenDay || '(không thấy option ngày)');
                    reportStep(5, `Chọn ngày: ${chosenDay || '(không rõ)'}`);

                    // [Fix #35] Sau khi chọn ngày, danh sách KHUNG GIỜ có thể nạp
                    // qua AJAX. Chờ trọn chu kỳ loading (nếu có) trước khi tìm
                    // "Cả ngày" — nếu không, mạng chậm sẽ làm waitForElementBy hết
                    // giờ → bỏ sót "Cả ngày" nhưng vẫn bấm Cập nhật (cập nhật thiếu).
                    // appearMs ngắn (1500ms): không có AJAX thì trả false ngay,
                    // không làm chậm trường hợp khung giờ render đồng bộ.
                    await waitForAjaxCycle(1500, 15000);

                    // [Fix #24] Chờ "Cả ngày" render thay vì sleep cố định
                    // [Fix #35] 4s→8s. [Fix #42] 8s→12s phòng khung giờ về chậm.
                    const labelCaNgay = await waitForElementBy(
                        () => Array.from(document.querySelectorAll('label.lb-time'))
                                   .find(lbl => norm(lbl.innerText).includes('cả ngày')),
                        12000
                    );
                    if (labelCaNgay) {
                        labelCaNgay.click();
                        reportStep(5, 'Chọn khung giờ "Cả ngày"');
                    } else {
                        // [Fix #35] Không tìm thấy "Cả ngày" → KHÔNG bấm Cập nhật mù,
                        // skip đơn để tránh cập nhật thiếu khung giờ.
                        console.warn('[VTP Sửa Giờ] Không tìm thấy khung giờ "Cả ngày"');
                        await closeOpenForms();
                        shouldSkip = true;
                        skipReason = 'Không tải được khung giờ "Cả ngày"';
                    }
                }

                // ═════════════════════════════════════
                // BƯỚC 6: Cập nhật và đợi form đóng
                // ═════════════════════════════════════
                // [Fix #35] Chỉ bấm Cập nhật khi chưa bị skip ở bước chọn giờ.
                if (!shouldSkip) {
                    // [Fix #24] Chờ nút Cập nhật render
                    // [Fix #41] Tìm theo TEXT "Cập nhật" trên mọi button (bỏ
                    // phụ thuộc class btn-viettel.btn-block — class có thể đổi).
                    // Ưu tiên exact "cập nhật"; fallback includes nếu không có.
                    reportStep(6, 'Bấm "Cập nhật"');
                    const findUpdateBtn = () => {
                        const btns = Array.from(document.querySelectorAll('button, [role="button"], a.btn'));
                        let btn = btns.find(b => normTextG(b.innerText || b.textContent) === 'cập nhật');
                        if (!btn) btn = btns.find(b => normTextG(b.innerText || b.textContent).includes('cập nhật'));
                        return btn || null;
                    };
                    const updateBtn = await waitForElementBy(findUpdateBtn, 5000);
                    if (updateBtn) {
                        updateBtn.click();
                    } else {
                        console.warn('[VTP Sửa Giờ] Không tìm thấy nút Cập nhật');
                        shouldSkip = true;
                        skipReason = 'Không tìm thấy nút Cập nhật';
                        await closeOpenForms();
                    }
                }

                if (!shouldSkip) {
                    // [Fix #24] Chờ form đóng qua MutationObserver, không dùng polling sleep
                    // Tăng 6s→15s — server VTP đôi khi chậm response
                    // [Fix #41] Chờ form đóng theo isEditTimeFormOpen() thay vì
                    // button.select-down (không tồn tại trên DOM thật).
                    // [Fix #42] Form đóng = cập nhật thành công. Nếu sau 15s form
                    // CHƯA đóng (mạng rất chậm) → buộc đóng và CẢNH BÁO, nhưng
                    // KHÔNG coi là thất bại vì lệnh Cập nhật đã được gửi.
                    const formClosed = await waitForGoneBy(isEditTimeFormOpen, 15000);
                    if (!formClosed) {
                        console.warn('[VTP Sửa Giờ] Form chưa đóng sau 15s (mạng chậm), buộc đóng...');
                        await closeOpenForms();
                    }
                    reportStep(6, 'Đã cập nhật xong', 'success');
                }
            }

        } catch (error) {
            console.error('[VTP Sửa Giờ] Lỗi tại đơn này:', error.message);
            shouldSkip = true;
            skipReason  = error.message;

            // [v2.0] Auto-recovery: đóng form còn mở trước khi sang đơn tiếp
            await closeOpenForms();
        }

        // Ghi nhận skip (nếu có) — hiển thị toast trên trang VTP
        if (shouldSkip) {
            console.warn(`[VTP Sửa Giờ] Bỏ qua "${currentBill}": ${skipReason}`);
            reportStep('⏭', `Bỏ qua: ${skipReason}`, 'warning');
            window.VTPNotification?.show(
                `⏭ Bỏ qua ${currentBill}\n${skipReason}`,
                'warning',
                3500
            );
        }

        // Tiến sang đơn kế tiếp (update index)
        const latestData = await chrome.storage.local.get(['isRunning', 'currentIndex']);
        if (latestData.isRunning) {
            await chrome.storage.local.set({ currentIndex: latestData.currentIndex + 1 });
        }

        return {
            status: shouldSkip ? 'skipped' : 'success',
            bill:   currentBill,
            reason: skipReason
        };
    }

    // ─── Chạy và trả kết quả cho sidepanel ──────────────────

    processOneBill()
        .then(result => {
            window.__VTP_CHINHGIO_RUNNING__ = false;
            chrome.storage.local.set({ __VTP_CHINHGIO_STEP_DONE__: result });
            console.log('[VTP Sửa Giờ] Xong 1 đơn, kết quả:', result.status, result.bill || '');
        })
        .catch(err => {
            window.__VTP_CHINHGIO_RUNNING__ = false;
            chrome.storage.local.set({
                __VTP_CHINHGIO_STEP_DONE__: { status: 'error', reason: err.message }
            });
            console.error('[VTP Sửa Giờ] Lỗi không xử lý được:', err);
        });
}
