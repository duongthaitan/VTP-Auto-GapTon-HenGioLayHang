// ============================================================
//  VTP Tool – Phân Công Theo Tuyến Content Script
//  v1.0 — Tự động phân công đơn cho bưu tá trên trang
//         khai-thac-den/phan-cong-phat (ZK Framework)
//
//  Chạy ở ISOLATED world (mặc định) để dùng được chrome.storage.
//  Sidepanel điều phối: mỗi lần inject xử lý ĐÚNG 1 bưu tá, xong thì
//  sidepanel reload trang rồi inject lại cho bưu tá kế (giống module kiểm kê).
//  Nhận 1 bưu tá qua storage:
//    __VTP_PHANCONG_CURRENT__ = { group:{ shortName, bills:[...] }, index, total }
//  Báo tiến trình / kết quả qua:
//    __VTP_PHANCONG_PROGRESS__  = { current, total, postman, phase, scanned, totalBills }
//    __VTP_PHANCONG_STEP_DONE__ = { status:'done'|'error', shortName, route, scanned, totalBills, reason }
//  Kiểm tra dừng qua:
//    __VTP_PHANCONG_CANCEL__ = true
//
//  Luồng 1 bưu tá:
//    Thêm mới → chọn tuyến (Nhân viên phát) → Ghi lại
//    → quét từng mã phiếu (nhập + Quét mã vạch) → Hoàn thành
// ============================================================

if (window.__VTP_PHANCONG_RUNNING__) {
    console.warn('[VTP PhânCông] Script đã đang chạy. Bỏ qua inject mới.');
} else {
    window.__VTP_PHANCONG_RUNNING__ = true;

    (async () => {
        'use strict';

        // ─── Utilities ───────────────────────────────────────────
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));

        /** Chuẩn hoá text: bỏ NBSP, gộp khoảng trắng, trim */
        const normText = (s) => (s || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();

        /** Chuẩn hoá tên để so khớp (lowercase, giữ dấu tiếng Việt) */
        const normName = (s) => normText(s).toLowerCase();

        /** Chờ điều kiện trả về truthy (poll). Trả về giá trị hoặc null nếu timeout. */
        async function waitFor(fn, timeout = 10000, poll = 200) {
            const deadline = Date.now() + timeout;
            while (Date.now() < deadline) {
                let v;
                try { v = fn(); } catch (_) { v = null; }
                if (v) return v;
                await sleep(poll);
            }
            return null;
        }

        /** Phần tử có đang hiển thị không */
        const isVisible = (el) => !!(el && el.offsetParent !== null);

        /** Tìm button.z-button theo text (mặc định chỉ lấy nút hiển thị) */
        function findButtonByText(text, mustVisible = true) {
            for (const btn of document.querySelectorAll('button.z-button')) {
                if (normText(btn.textContent) === text && (!mustVisible || isVisible(btn))) return btn;
            }
            return null;
        }

        /** Tìm nút "Thêm mới" để MỞ FORM phân công trắng.
         *  Trên trang có 2 nút "Thêm mới":
         *    (1) Khu tìm kiếm — cùng z-hbox với "Tìm kiếm"  ← ĐÚNG (mở form mới)
         *    (2) Panel "Quản lý phân công" — cùng z-hbox với "Ghi lại"
         *  Ưu tiên (1) theo đúng luồng thao tác tay của người dùng. */
        function findAddNewButton() {
            // Chỉ lấy nút "Thêm mới" ĐANG HIỂN THỊ trong cùng khối với anchor
            // (tránh nút trong hàng filter ẩn display:none).
            const addNewIn = (anchorBtn) => {
                if (!anchorBtn) return null;
                const box = anchorBtn.closest('table.z-hbox') || anchorBtn.parentElement;
                if (!box) return null;
                return Array.from(box.querySelectorAll('button.z-button'))
                    .find(b => normText(b.textContent) === 'Thêm mới' && isVisible(b)) || null;
            };
            // (1) cùng khối với "Tìm kiếm" ĐANG HIỂN THỊ
            const bySearch = addNewIn(findButtonByText('Tìm kiếm', true));
            if (bySearch) return bySearch;
            // (2) cùng khối với "Ghi lại" ĐANG HIỂN THỊ
            const byGhi = addNewIn(findButtonByText('Ghi lại', true));
            if (byGhi) return byGhi;
            // (3) fallback: nút "Thêm mới" hiển thị đầu tiên
            return Array.from(document.querySelectorAll('button.z-button'))
                .find(b => normText(b.textContent) === 'Thêm mới' && isVisible(b)) || null;
        }

        /** Tìm combobox "Nhân viên phát" (trong khối form Thông tin phân công).
         *  Toàn bộ định vị theo label/placeholder/vị trí — KHÔNG dùng ID. */
        function findEmployeeCombobox() {
            // 1) label "Nhân viên phát" → combobox gần nhất trong cùng .row
            for (const lbl of document.querySelectorAll('span.z-label')) {
                if (normText(lbl.textContent).includes('Nhân viên phát')) {
                    const row = lbl.closest('.row') || lbl.parentElement?.parentElement;
                    if (row) {
                        const cb = row.querySelector('.z-combobox');
                        if (cb) return cb;
                    }
                    // dò sang các phần tử kế tiếp nếu combobox không nằm trong cùng row
                    let sib = (lbl.closest('.col-md-3') || lbl.parentElement)?.nextElementSibling;
                    while (sib) {
                        const cb = sib.querySelector?.('.z-combobox') ||
                                   (sib.classList?.contains('z-combobox') ? sib : null);
                        if (cb) return cb;
                        sib = sib.nextElementSibling;
                    }
                }
            }
            // 2) combobox có placeholder "Chọn tuyến" đang hiển thị & KHÔNG disable
            const cands = Array.from(document.querySelectorAll('.z-combobox')).filter(cb => {
                const input = cb.querySelector('.z-combobox-input');
                return input && (input.getAttribute('placeholder') || '').includes('Chọn tuyến') &&
                       isVisible(cb) && !cb.classList.contains('z-combobox-disabled');
            });
            // Ưu tiên combobox nằm trong khối "Thông tin phân công"
            for (const cb of cands) {
                const panel = cb.closest('.panel');
                if (panel && normText(panel.textContent).includes('Thông tin phân công')) return cb;
            }
            return cands[0] || null;
        }

        /** Lấy popup đang hiển thị của 1 combobox — HOÀN TOÀN không dùng ID.
         *  ZK mở popup thường gắn class z-combobox-open và bỏ display:none,
         *  có thể là con của combobox HOẶC được gắn ra <body>. */
        function getVisiblePopup(combobox) {
            const isShown = (pp) => pp && pp.offsetHeight > 0 && getComputedStyle(pp).display !== 'none';
            // 1) popup là con trực tiếp của combobox
            if (combobox) {
                const own = combobox.querySelector('.z-combobox-popup');
                if (isShown(own)) return own;
            }
            // 2) popup đang mở bất kỳ (ưu tiên có class z-combobox-open)
            const open = Array.from(document.querySelectorAll('.z-combobox-popup.z-combobox-open'))
                .find(isShown);
            if (open) return open;
            // 3) fallback: popup nào đang hiển thị
            return Array.from(document.querySelectorAll('.z-combobox-popup')).find(isShown) || null;
        }

        /** Tên tuyến (đã bỏ prefix bưu cục) có kết thúc bằng shortName không */
        function routeMatchesShort(routeText, shortName) {
            const full = normName(routeText);
            const short = normName(shortName);
            if (!short) return false;
            return full === short || full.endsWith(' ' + short);
        }

        /** Chọn tuyến trong combobox cho 1 bưu tá. Trả {ok, route, reason}.
         *  Ưu tiên khớp CHÍNH XÁC theo group.matchedRoute (đã đối chiếu ở side panel);
         *  nếu không có thì fallback khớp theo tên rút gọn (từ cuối). */
        async function selectRoute(combobox, group) {
            const btn = combobox.querySelector('.z-combobox-button');
            if (!btn) return { ok: false, reason: 'Không tìm thấy nút mở dropdown tuyến' };
            btn.click();

            const pp = await waitFor(() => getVisiblePopup(combobox), 5000, 150);
            if (!pp) return { ok: false, reason: 'Dropdown tuyến không mở được' };
            await sleep(150);

            const itemText = (it) => it.querySelector('.z-comboitem-text')?.textContent || it.textContent;
            const items = Array.from(pp.querySelectorAll('.z-comboitem'));

            let matches = [];
            // 1) Khớp chính xác theo tuyến đã đối chiếu
            if (group.matchedRoute) {
                const target = normName(group.matchedRoute);
                matches = items.filter(it => normName(itemText(it)) === target);
            }
            // 2) Fallback: khớp theo tên rút gọn
            if (matches.length === 0) {
                matches = items.filter(it => routeMatchesShort(itemText(it), group.shortName));
            }

            if (matches.length === 0) {
                btn.click(); // đóng dropdown
                return { ok: false, reason: `Không có tuyến nào khớp tên "${group.shortName}"` };
            }
            const chosen = matches[0];
            const routeText = normText(itemText(chosen));
            if (matches.length > 1) {
                console.warn(`[VTP PhânCông] "${group.shortName}" khớp ${matches.length} tuyến, chọn tuyến đầu: ${routeText}`);
            }
            chosen.click();
            await sleep(300);
            return { ok: true, route: routeText };
        }

        /** Đặt giá trị input theo kiểu ZK (native setter + events) */
        function setInputValue(input, value) {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            input.focus();
            setter.call(input, value);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }

        /** Gửi phím Enter cho input */
        function pressEnter(input) {
            ['keydown', 'keypress', 'keyup'].forEach(evt => {
                input.dispatchEvent(new KeyboardEvent(evt, {
                    key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
                }));
            });
        }

        /** Đóng messagebox ZK nếu có (Chấp nhận / OK) */
        async function dismissMessageBox() {
            for (const btn of document.querySelectorAll('.z-messagebox-button')) {
                const t = normText(btn.textContent);
                if (t === 'Chấp nhận' || t === 'OK' || t === 'ok' || t === 'Đồng ý') {
                    btn.click();
                    await sleep(300);
                    return true;
                }
            }
            return false;
        }

        /** Tìm ô nhập "Quét mã phiếu" đang hiển thị & không bị disable */
        function findScanInput() {
            for (const inp of document.querySelectorAll('input.z-textbox[placeholder*="Nhập mã phiếu"]')) {
                if (isVisible(inp) && !inp.disabled) return inp;
            }
            return null;
        }

        /** Listbox chứa mã đã quét (header có "Mã bưu cục gốc") */
        function findScanListbox() {
            for (const box of document.querySelectorAll('.z-listbox')) {
                const headers = Array.from(box.querySelectorAll('.z-listheader-content'))
                    .map(h => normText(h.textContent));
                if (headers.some(h => h.includes('Mã bưu cục gốc')) &&
                    headers.some(h => h.includes('Mã phiếu gửi'))) {
                    if (isVisible(box)) return box;
                }
            }
            return null;
        }

        /** Đếm số dòng dữ liệu trong listbox quét mã */
        function countScanRows() {
            const box = findScanListbox();
            if (!box) return 0;
            return box.querySelectorAll('tbody[id$="-rows"] > tr.z-listitem, .z-listbox-body tr.z-listitem').length;
        }

        // ─── Báo tiến trình / kiểm tra dừng ─────────────────────
        async function report(obj) {
            try { await chrome.storage.local.set({ __VTP_PHANCONG_PROGRESS__: obj }); } catch (_) {}
            // Hiện toast trên trang để dễ theo dõi tool đang ở bước nào
            if (window.VTPNotification?.show) {
                let msg = `[${(obj.current || 0) + 1}/${obj.total}] ${obj.postman || ''}: ${obj.phase || ''}`;
                if (obj.phase === 'Quét mã' && obj.totalBills) msg += ` (${obj.scanned || 0}/${obj.totalBills})`;
                window.VTPNotification.show(msg, 'info', 2500);
            }
            console.log('[VTP PhânCông]', obj.phase, '—', obj.postman || '', obj.code || '');
        }
        async function isCancelled() {
            try {
                const d = await chrome.storage.local.get('__VTP_PHANCONG_CANCEL__');
                return d.__VTP_PHANCONG_CANCEL__ === true;
            } catch (_) { return false; }
        }

        // ─── Xử lý 1 bưu tá ──────────────────────────────────────
        async function processGroup(group, idx, total) {
            const { shortName, bills } = group;

            // 1) Thêm mới
            await report({ current: idx, total, postman: shortName, phase: 'Thêm mới phân công', scanned: 0, totalBills: bills.length });
            const addBtn = findAddNewButton();
            if (!addBtn) throw new Error('Không tìm thấy nút "Thêm mới"');
            addBtn.click();
            await sleep(600);
            await dismissMessageBox();

            // 2) Chọn tuyến (Nhân viên phát)
            await report({ current: idx, total, postman: shortName, phase: 'Chọn tuyến', scanned: 0, totalBills: bills.length });
            const combobox = await waitFor(() => {
                const cb = findEmployeeCombobox();
                // combobox phải enable (không có class disabled)
                if (cb && !cb.classList.contains('z-combobox-disabled')) return cb;
                return null;
            }, 8000, 200);
            if (!combobox) throw new Error('Không tìm thấy combobox "Nhân viên phát" đang bật');

            const sel = await selectRoute(combobox, group);
            if (!sel.ok) throw new Error(sel.reason);
            group._route = sel.route;

            // 3) Ghi lại
            await report({ current: idx, total, postman: shortName, phase: `Ghi lại (${sel.route})`, scanned: 0, totalBills: bills.length });
            const ghiBtn = findButtonByText('Ghi lại');
            if (!ghiBtn) throw new Error('Không tìm thấy nút "Ghi lại"');
            ghiBtn.click();
            await sleep(400);
            await dismissMessageBox();

            // Chờ khu vực quét mã sẵn sàng (ô nhập bật + nút Quét mã vạch hiển thị)
            const scanReady = await waitFor(() => {
                const inp = findScanInput();
                const scanBtn = findButtonByText('Quét mã vạch');
                return (inp && scanBtn) ? true : null;
            }, 12000, 250);
            if (!scanReady) throw new Error('Khu vực "Quét mã phiếu" không sẵn sàng sau khi Ghi lại');

            // 4) Quét từng mã
            let scanned = 0;
            const failedCodes = [];
            for (let b = 0; b < bills.length; b++) {
                if (await isCancelled()) throw new Error('Đã dừng theo yêu cầu');
                const code = bills[b];
                await report({ current: idx, total, postman: shortName, phase: 'Quét mã', scanned, totalBills: bills.length, code });

                const inp = findScanInput();
                if (!inp) throw new Error('Mất ô nhập mã phiếu khi đang quét');

                const before = countScanRows();
                setInputValue(inp, code);
                await sleep(150);
                pressEnter(inp);

                const scanBtn = findButtonByText('Quét mã vạch');
                if (scanBtn) scanBtn.click();

                // Chờ dòng tăng lên hoặc ô nhập được clear (báo hiệu đã nhận mã)
                const ack = await waitFor(() => {
                    if (countScanRows() > before) return true;
                    const cur = findScanInput();
                    if (cur && cur.value.trim() === '') return true;
                    return null;
                }, 6000, 150);

                await dismissMessageBox();
                if (ack) {
                    scanned++;
                } else {
                    failedCodes.push(code);
                    console.warn(`[VTP PhânCông] Mã "${code}" chưa xác nhận (timeout) → ghi nhận lỗi.`);
                }

                await sleep(120);
            }
            await report({ current: idx, total, postman: shortName, phase: 'Quét mã', scanned, totalBills: bills.length });
            group._failedCodes = failedCodes;

            // 5) Hoàn thành
            await report({ current: idx, total, postman: shortName, phase: 'Hoàn thành', scanned, totalBills: bills.length });
            const doneBtn = await waitFor(() => findButtonByText('Hoàn thành'), 6000, 200);
            if (!doneBtn) throw new Error('Không tìm thấy nút "Hoàn thành"');
            doneBtn.click();
            await sleep(800);
            await dismissMessageBox();
            await sleep(400);
            // Trang sẽ được sidepanel reload sau khi nhận tín hiệu xong.

            return { shortName, route: group._route, scanned, totalBills: bills.length, failedCodes };
        }

        /** Cố gắng đưa UI về trạng thái sạch sau lỗi */
        async function recover() {
            await dismissMessageBox();
            const backBtn = findButtonByText('Quay lại');
            if (backBtn) { backBtn.click(); await sleep(600); }
            await dismissMessageBox();
        }

        // ─── MAIN — xử lý ĐÚNG 1 bưu tá rồi báo xong ─────────────
        //  Sidepanel điều phối: reload trang giữa các bưu tá và inject lại.
        const store = await chrome.storage.local.get('__VTP_PHANCONG_CURRENT__');
        const cur = store.__VTP_PHANCONG_CURRENT__;

        if (!cur || !cur.group || !Array.isArray(cur.group.bills)) {
            await chrome.storage.local.set({
                __VTP_PHANCONG_STEP_DONE__: { status: 'error', reason: 'Không có dữ liệu bưu tá để phân công' }
            });
            window.__VTP_PHANCONG_RUNNING__ = false;
            return;
        }

        const { group, index = 0, total = 1 } = cur;
        let result;
        try {
            const res = await processGroup(group, index, total);
            result = { status: 'done', ...res };
            console.log(`[VTP PhânCông] ✅ Xong ${res.shortName} → ${res.route} (${res.scanned}/${res.totalBills} mã)`);
        } catch (e) {
            console.error(`[VTP PhânCông] ❌ Lỗi bưu tá "${group.shortName}":`, e.message);
            result = { status: 'error', shortName: group.shortName, reason: e.message };
            await recover();
        }

        await chrome.storage.local.set({ __VTP_PHANCONG_STEP_DONE__: result });
        window.__VTP_PHANCONG_RUNNING__ = false;

    })().catch(err => {
        console.error('[VTP PhânCông] Lỗi không xử lý được:', err);
        chrome.storage.local.set({
            __VTP_PHANCONG_STEP_DONE__: { status: 'error', reason: err.message }
        });
        window.__VTP_PHANCONG_RUNNING__ = false;
    });
}
