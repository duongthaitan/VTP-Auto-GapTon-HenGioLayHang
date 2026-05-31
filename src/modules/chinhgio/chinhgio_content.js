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
//    [Fix #46] SỬA LỖI click ngày/giờ KHÔNG ăn (DOM Angular thật):
//        • Trigger là <button class="select-down"><span>Chọn thời gian</span></button>
//          → findChonThoiGian trả về <button> (Angular gắn handler trên button),
//          không click span lá nữa.
//        • Các <label for$="_apt"> / label.lb-time LUÔN có sẵn trong DOM kể cả
//          khi panel ẩn → chờ theo "đang HIỂN THỊ" (offsetParent), không theo
//          "tồn tại". Trước đây resolve ngay → click khi option còn ẩn → trượt.
//        • selectOption(): click thẳng <input> liên kết (getElementById vì id
//          "1_apt" bắt đầu bằng số) + dispatch input/change cho Angular reactive,
//          rồi click cả <label> → chắc chắn radio được chọn.
//        • Lọc dayLabels/labelCaNgay theo isVisible() để không bắt option ẩn.
//    [Fix #47] SỬA TIẾP "chọn không ăn" — id radio TRÙNG giữa các đơn:
//        • Angular render mỗi đơn/panel bộ radio cùng id (1_apt, 1_op) →
//          getElementById trả phần tử ĐẦU TIÊN (panel ẩn của đơn khác) → click
//          sai chỗ. findAssociatedInput() tìm input THEO NGỮ CẢNH label
//          (sibling trước → parent → li), không dùng id global.
//        • fireClick(): phát đủ chuỗi pointerdown/mousedown/mouseup/click cho
//          zone.js bắt; verify input.checked, chưa được thì click lại.
//        • Log chẩn đoán: liệt kê option ngày & khung giờ hiển thị + trạng thái
//          checked → nếu vẫn lỗi, Console sẽ cho biết chính xác nguyên nhân.
//    [Fix #48] ĐÚNG CẤU TRÚC THẬT (theo ảnh giao diện): popup chọn thời gian
//        gồm 2 TAB ngày ("Ngày mai" | "Ngày kia") ở đầu, MỖI TAB có 1 danh
//        sách khung giờ riêng ("Tối"/"Cả ngày"/"Sáng"/"Chiều"):
//        • Trình tự: mở trigger → CLICK tab "Ngày kia" → CHỜ danh sách giờ của
//          tab cập nhật (waitForAjaxCycle + buffer) → CLICK "Cả ngày" hiển thị.
//        • isVisible() viết lại dùng getClientRects()+computed style (offsetParent
//          không đáng tin trong popup position:absolute → từng tóm nhầm option
//          của tab ẩn).
//        • findDayTab(): tìm tab ngày theo text khi không có label[for$="_apt"].
//        • selectOption(): set input.checked=true + native click + chuỗi chuột.
//    [Fix #49] DOM ĐẦY ĐỦ xác nhận: popup là <div.dropdown-menu> (display:none
//        khi đóng) chứa <ul.tab-header> 2 radio NGÀY input[name="day"] (id *_apt)
//        và <ul.tab-list> radio KHUNG GIỜ input[name="time"] (id *_op).
//        • LỖI GỐC: lọc theo isVisible() — popup display:none → label 0 client
//          rect → bị loại sạch → không tìm thấy ngày/giờ → skip. BỎ lọc visible.
//        • pickRadioByText(groupName, wantList): chọn radio THẲNG theo
//          input[name=...], map text qua label[for=id]; set checked=true +
//          native click + click label + dispatch change → Angular nhận, KHÔNG
//          phụ thuộc CSS hiển thị. Chờ radio TỒN TẠI (không cần hiển thị).
//        • Trình tự: trigger → input[name="day"]("Ngày kia") → chờ AJAX khung
//          giờ → input[name="time"]("Cả ngày"). Verify .checked + log từng radio.
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
     * DOM thật: <button class="form-control select-down"><span>Chọn thời gian</span></button>
     * [Fix #46] Trả về <button> CLICK ĐƯỢC (không phải span lá) — Angular gắn
     * handler trên button, click span đôi khi không mở dropdown.
     * Ưu tiên: button.select-down → button chứa text → button cha của span text.
     */
    const findChonThoiGian = () => {
        // Ưu tiên 1: button.select-down (DOM thật)
        const directBtn = document.querySelector('button.select-down');
        if (directBtn) return directBtn;
        // Ưu tiên 2: button có text "chọn thời gian"
        const btns = Array.from(document.querySelectorAll('button'));
        for (const b of btns) {
            if (normTextG(b.innerText || b.textContent) === 'chọn thời gian') return b;
        }
        // Ưu tiên 3: phần tử lá text "chọn thời gian" → lấy button cha nếu có
        const nodes = Array.from(document.querySelectorAll('span, a, div'));
        for (const el of nodes) {
            if (el.children.length > 0) continue;
            if (normTextG(el.innerText || el.textContent) === 'chọn thời gian') {
                return el.closest('button') || el;
            }
        }
        // Fallback: khớp chứa cụm (phòng có ký tự ẩn)
        for (const el of nodes) {
            if (el.children.length > 0) continue;
            if (normTextG(el.innerText || el.textContent).includes('chọn thời gian')) {
                return el.closest('button') || el;
            }
        }
        return null;
    };

    /**
     * [Fix #46][Fix #48] Một phần tử có đang HIỂN THỊ (interactive) không.
     * Dùng getClientRects().length (đáng tin hơn offsetParent trong popup
     * position:fixed/absolute — offsetParent có thể null dù phần tử vẫn hiện)
     * kết hợp computed display/visibility.
     */
    const isVisible = (el) => {
        if (!el) return false;
        if (el.getClientRects().length === 0) return false;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
        return true;
    };

    /**
     * [Fix #49] Lấy popup chọn thời gian ĐANG MỞ.
     * DOM thật: <div class="dropdown-menu show"> chứa ul.tab-header (2 tab ngày)
     * và ul.tab-list (danh sách khung giờ). Mọi truy vấn ngày/giờ PHẢI scope
     * vào đây để tránh bắt nhầm radio TRÙNG ID của đơn/popup khác trong trang.
     */
    const getOpenDropdown = () => {
        const menus = Array.from(document.querySelectorAll('.dropdown-menu.show, .dropdown-menu'));
        // Ưu tiên menu có .tab-header + .tab-list và đang hiển thị
        for (const m of menus) {
            if (m.querySelector('.tab-header') && m.querySelector('.tab-list') && isVisible(m)) {
                return m;
            }
        }
        // Fallback: menu hiển thị có input[name="day"] hoặc input[name="time"]
        for (const m of menus) {
            if (isVisible(m) && (m.querySelector('input[name="day"]') || m.querySelector('input[name="time"]'))) {
                return m;
            }
        }
        return null;
    };

    /**
     * [Fix #49] Tìm <input> radio theo TEXT của label, SCOPE trong 1 container.
     * Click thẳng input (Angular RadioControlValueAccessor lắng nghe trên input),
     * tránh hoàn toàn bẫy <label for> + id trùng toàn cục.
     * @param scope     container (dropdown đang mở)
     * @param nameAttr  'day' | 'time'
     * @param wantNorm  text đã normalize cần khớp (vd 'ngày kia', 'cả ngày')
     */
    const findRadioByLabelText = (scope, nameAttr, wantNorm) => {
        if (!scope) return null;
        const items = Array.from(scope.querySelectorAll(`input[name="${nameAttr}"]`));
        for (const input of items) {
            // label đi kèm: sibling sau input, hoặc trong cùng <li>
            let label = input.nextElementSibling;
            if (!label || label.tagName !== 'LABEL') {
                label = input.closest('li')?.querySelector('label') || null;
            }
            const txt = normTextG(label ? (label.innerText || label.textContent) : '');
            if (txt === wantNorm || txt.includes(wantNorm)) {
                return { input, label, text: (label?.innerText || '').trim() };
            }
        }
        return null;
    };

    /**
     * [Fix #48] Tìm tab ngày ("Ngày mai"/"Ngày kia") theo text và click để
     * kích hoạt. DOM thật: popup có 2 tab ở đầu, mỗi tab 1 danh sách khung giờ.
     * Trả về phần tử tab nếu tìm thấy.
     */
    const findDayTab = (wantNorm) => {
        // Tab thường là <a>/<li>/<div> chứa text ngày, KHÔNG phải label[for]
        const nodes = Array.from(document.querySelectorAll('a, li, div, span, button'));
        return nodes.find(el =>
            el.children.length <= 1 &&
            isVisible(el) &&
            normTextG(el.innerText || el.textContent) === wantNorm
        ) || null;
    };

    /**
     * [Fix #47] Tìm <input> liên kết với label THEO NGỮ CẢNH (cùng cụm),
     * KHÔNG dùng getElementById global.
     * Lý do: Angular render mỗi đơn/panel một bộ radio TRÙNG id (1_apt, 1_op…)
     * → getElementById trả phần tử ĐẦU TIÊN trong trang (có thể là panel ẩn của
     * đơn khác) → click không tác động panel đang mở.
     * Ưu tiên tìm input gần label nhất: sibling trước → trong parent → trong li.
     */
    const findAssociatedInput = (label) => {
        if (!label) return null;
        // 1. input đứng ngay trước label (DOM: <input id><label for>)
        let prev = label.previousElementSibling;
        if (prev && prev.tagName === 'INPUT') return prev;
        // 2. input trong cùng parent
        let input = label.parentElement?.querySelector('input[type="radio"], input');
        if (input) return input;
        // 3. input trong <li> cha
        const li = label.closest('li, .form-group, div');
        if (li) {
            input = li.querySelector('input[type="radio"], input');
            if (input) return input;
        }
        // 4. fallback cuối: getElementById (chấp nhận id bắt đầu bằng số)
        const forId = label.getAttribute('for');
        if (forId) return document.getElementById(forId);
        return null;
    };

    /**
     * [Fix #46][Fix #47] Chọn 1 option ngày/giờ một cách CHẮC CHẮN cho Angular.
     * - Tìm input theo ngữ cảnh label (findAssociatedInput) → tránh id trùng.
     * - Phát đủ chuỗi sự kiện chuột (pointerdown/mousedown/mouseup/click) trên
     *   CẢ input lẫn label — Angular (zone.js) đôi khi chỉ nhận đúng chuỗi này.
     * - Verify input.checked; chưa checked thì click lại label 1 lần.
     * Trả về input (để caller verify) hoặc null.
     */
    const fireClick = (el) => {
        if (!el) return;
        try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (_) {}
        for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
            try {
                el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
            } catch (_) { /* pointerdown có thể không hỗ trợ → bỏ qua */ }
        }
    };

    const selectOption = (label) => {
        if (!label) return null;
        try { label.scrollIntoView({ block: 'nearest' }); } catch (_) {}
        const input = findAssociatedInput(label);
        // 1) Ưu tiên thao tác trên input THEO NGỮ CẢNH (tránh id trùng):
        //    set checked + native .click() (đảm bảo Angular nhận 'change').
        if (input) {
            try {
                if ('checked' in input) input.checked = true;
                input.click(); // native click → trình duyệt tự fire change
            } catch (_) {}
            input.dispatchEvent(new Event('input',  { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        // 2) Native click trên label (cho tab/handler lắng nghe click trên label)
        try { label.click(); } catch (_) {}
        // 3) Chuỗi sự kiện chuột đầy đủ trên label (cho zone.js)
        fireClick(label);
        return input;
    };

    /**
     * [Fix #49] Chọn 1 radio (đã có sẵn input + label từ findRadioByLabelText).
     * Thao tác trực tiếp trên INPUT — đây là phần tử Angular thực sự lắng nghe.
     * Set checked + native click + dispatch change, rồi click label dự phòng,
     * cuối cùng verify input.checked. Trả về true nếu đã chọn được.
     */
    const selectRadio = (entry) => {
        if (!entry || !entry.input) return false;
        const { input, label } = entry;
        try { (label || input).scrollIntoView({ block: 'nearest' }); } catch (_) {}
        try {
            input.checked = true;
            input.click();
            input.dispatchEvent(new Event('input',  { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (_) {}
        // Dự phòng: chuỗi chuột trên label (một số UI bắt click ở label)
        if (label) fireClick(label);
        // Verify
        if ('checked' in input && !input.checked) {
            try { input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
        }
        return ('checked' in input) ? input.checked : true;
    };

    /**
     * [Fix #46] Panel chọn ngày đã MỞ & HIỂN THỊ chưa?
     * Các <label for$="_apt"> luôn nằm sẵn trong DOM kể cả khi panel ẩn,
     * nên phải kiểm tra offsetParent (hiển thị) — không chỉ tồn tại.
     */
    const isDayPanelOpen = () =>
        Array.from(document.querySelectorAll('label[for$="_apt"]')).some(isVisible);

    /** [Fix #46] Có label khung giờ ("Cả ngày"…) đang hiển thị chưa? */
    const isTimePanelOpen = () =>
        Array.from(document.querySelectorAll('label.lb-time')).some(isVisible);

    /**
     * [Fix #41] Form sửa giờ có đang mở không? Dùng thay cho
     * `document.querySelector('button.select-down')` (không tồn tại trên DOM thật).
     * Coi là "mở" nếu thấy trigger "Chọn thời gian" HOẶC panel ngày HOẶC khung giờ.
     */
    const isEditTimeFormOpen = () =>
        !!findChonThoiGian() || isDayPanelOpen() || isTimePanelOpen();

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
                //   [Fix #48] Cấu trúc THẬT (theo ảnh): popup có 2 TAB ngày
                //   ("Ngày mai" | "Ngày kia") ở đầu; mỗi tab có 1 danh sách
                //   khung giờ riêng ("Tối", "Cả ngày", "Sáng", "Chiều").
                //   Trình tự đúng: mở trigger → CLICK tab "Ngày kia" → CHỜ danh
                //   sách giờ của tab đó cập nhật → CLICK "Cả ngày" (đang hiển thị).
                // ═════════════════════════════════════
                const norm = (s) => (s || '')
                    .replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

                reportStep(5, 'Mở bảng chọn thời gian');
                // [Fix #49] DOM THẬT (đầy đủ): trigger <button.select-down> mở
                // <div.dropdown-menu> chứa:
                //   <ul.tab-header>: 2 radio NGÀY  → input[name="day"] (id *_apt)
                //   <ul.tab-list>  : radio KHUNG GIỜ → input[name="time"] (id *_op)
                // Cả hai luôn có trong DOM. KHÔNG lọc theo isVisible (popup
                // display:none → mọi label 0 rect → lọc nhầm sạch → đó là lý do
                // trước đây skip). Thao tác THẲNG trên radio input: set checked
                // + dispatch change → Angular reactive form nhận, bất kể CSS.
                timeSelectBtn.click();
                await sleep(120);

                // Helper: chọn 1 radio theo text label, trong nhóm name chỉ định.
                const pickRadioByText = (groupName, wantList) => {
                    const inputs = Array.from(document.querySelectorAll(`input[name="${groupName}"]`));
                    const entry = (inp) => {
                        let txt = '';
                        if (inp.id) {
                            const lb = document.querySelector(`label[for="${CSS.escape(inp.id)}"]`);
                            if (lb) txt = lb.innerText || lb.textContent || '';
                        }
                        if (!txt) {
                            const lb = inp.parentElement?.querySelector('label');
                            if (lb) txt = lb.innerText || lb.textContent || '';
                        }
                        return norm(txt);
                    };
                    const all = inputs.map(inp => ({ inp, txt: entry(inp) }));
                    console.log(`[VTP Sửa Giờ] Radio[name=${groupName}]:`,
                        all.map(e => `${e.inp.id}="${e.txt}"`).join(' | ') || '(rỗng)');
                    let picked = null;
                    for (const want of wantList) {
                        const found = all.find(e => e.txt.includes(want));
                        if (found) { picked = found; break; }
                    }
                    if (!picked && all.length) picked = all[0]; // fallback option đầu
                    if (!picked) return { ok: false, picked: null, label: null };

                    const inp = picked.inp;
                    const lbl = inp.id ? document.querySelector(`label[for="${CSS.escape(inp.id)}"]`) : null;
                    try { if ('checked' in inp) inp.checked = true; } catch (_) {}
                    try { inp.click(); } catch (_) {}      // native → browser fire change
                    if (lbl) { try { lbl.click(); } catch (_) {} fireClick(lbl); }
                    inp.dispatchEvent(new Event('input',  { bubbles: true }));
                    inp.dispatchEvent(new Event('change', { bubbles: true }));
                    return { ok: ('checked' in inp ? inp.checked : true), picked: inp, label: picked.txt };
                };

                // Chờ radio ngày xuất hiện trong DOM (không cần "hiển thị")
                const dayReady = await waitForElementBy(
                    () => (document.querySelector('input[name="day"]') ? true : null),
                    15000
                );
                if (!dayReady) {
                    console.warn('[VTP Sửa Giờ] Không thấy radio ngày (input[name="day"])');
                    await closeOpenForms();
                    shouldSkip = true;
                    skipReason = 'Không tải được danh sách ngày';
                }

                // ── 5a: Chọn NGÀY (Ngày kia → Ngày mai → Hôm nay) ──
                if (!shouldSkip) {
                    const dayRes = pickRadioByText('day', ['ngày kia', 'ngày mai', 'hôm nay']);
                    console.log('[VTP Sửa Giờ] Chọn ngày:', dayRes.label || '(không thấy)', '| checked =', dayRes.ok);
                    reportStep(5, `Chọn ngày: ${dayRes.label || '(không rõ)'}`);

                    // ── 5b: Chờ danh sách KHUNG GIỜ cập nhật theo ngày vừa chọn ──
                    await waitForAjaxCycle(1200, 15000);
                    await sleep(250);

                    // ── 5c: Chọn "Cả ngày" ──
                    const timeReady = await waitForElementBy(
                        () => (document.querySelector('input[name="time"]') ? true : null),
                        12000
                    );
                    if (timeReady) {
                        const timeRes = pickRadioByText('time', ['cả ngày']);
                        if (timeRes.label && timeRes.label.includes('cả ngày')) {
                            console.log('[VTP Sửa Giờ] Chọn "Cả ngày" | checked =', timeRes.ok);
                            reportStep(5, 'Chọn khung giờ "Cả ngày"');
                        } else {
                            console.warn('[VTP Sửa Giờ] Không thấy đúng "Cả ngày", chỉ có:', timeRes.label);
                            await closeOpenForms();
                            shouldSkip = true;
                            skipReason = 'Không tải được khung giờ "Cả ngày"';
                        }
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
