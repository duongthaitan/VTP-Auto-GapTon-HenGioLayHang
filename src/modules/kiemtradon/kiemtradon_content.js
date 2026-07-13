// ============================================================
//  VTP Tool – Kiểm Tra Đơn Chưa Phân Công Content Script
//  v1.0 — Quét tự động danh sách đơn chưa phân công trên trang Khai thác
// ============================================================

if (window.__VTP_KTD_CPC_RUNNING__) {
    console.warn('[VTP KTĐ-CPC] Script đã đang chạy. Bỏ qua inject mới.');
    chrome.storage.local.set({ __VTP_KTD_CPC_STEP_DONE__: { status: 'busy' } });
} else {
    window.__VTP_KTD_CPC_RUNNING__ = true;

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Chờ loading indicator biến mất
    async function waitForLoadingDone(timeout = 15000) {
        await sleep(200);
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const loading = document.querySelector('.z-loading-indicator, .z-apply-loading-indicator, .z-listbox-loading');
            const isLoading = loading && loading.style.display !== 'none' && loading.offsetParent !== null;
            if (!isLoading) break;
            await sleep(150);
        }
        await sleep(400); // Chờ thêm buffer nhỏ để DOM render ổn định
    }

    // Click tab theo text
    async function clickTabByText(text) {
        const tabs = document.querySelectorAll('.z-tab');
        let target = null;
        for (const tab of tabs) {
            const textEl = tab.querySelector('.z-tab-text') || tab;
            const txt = (textEl.textContent || '').trim();
            if (txt.includes(text)) {
                target = tab.querySelector('.z-tab-content') || tab;
                break;
            }
        }
        if (target) {
            console.log(`[VTP KTĐ-CPC] Đã tìm thấy tab "${text}", tiến hành click.`);
            target.click();
            return true;
        }
        return false;
    }

    // ── Chuẩn hoá text: bỏ NBSP + gộp khoảng trắng ──
    function normText(str) {
        return (str || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Tìm và click nút Tìm kiếm
    async function clickSearchButton() {
        const buttons = document.querySelectorAll('button.z-button');
        let target = null;
        for (const btn of buttons) {
            const txt = normText(btn.textContent).toLowerCase();
            if ((txt === 'tìm kiếm' || txt === 'tìmkiếm' || txt.includes('tìm kiếm')) && btn.offsetParent !== null) {
                target = btn;
                break;
            }
        }
        if (target) {
            console.log('[VTP KTĐ-CPC] Đã tìm thấy nút "Tìm kiếm", tiến hành click.');
            target.click();
            return true;
        }
        return false;
    }

    // ── Đọc nhãn tiêu đề theo TỪNG cột (1 phần tử/cột) ──
    //  ZK render mỗi cột là 1 <th class="z-listheader"> chứa 1
    //  <div class="z-listheader-content">. Lấy text từ div con để tránh
    //  đếm trùng (selector gộp th + div sẽ nhân đôi số phần tử → lệch index).
    //  ID (rAdUvg...) đổi sau mỗi lần load nên KHÔNG dùng ID — chỉ dùng
    //  vị trí cột + nhãn text để nhận diện.
    function getHeaderLabels(listbox) {
        const ths = listbox.querySelectorAll('th.z-listheader');
        return Array.from(ths).map(th => {
            const cave = th.querySelector('.z-listheader-content');
            return normText(cave ? cave.textContent : th.textContent);
        });
    }

    // Tìm bảng danh sách chứa cột "Mã phiếu gửi"
    //  ZK giữ NHIỀU tab trong DOM cùng lúc → có thể có >1 listbox cùng
    //  header. Ưu tiên bảng ĐANG HIỂN THỊ + CÓ DỮ LIỆU để tránh chọn nhầm
    //  bảng ẩn/rỗng (nguyên nhân ra 0 mã).
    function findTargetListbox() {
        const candidates = [];
        for (const box of document.querySelectorAll('.z-listbox')) {
            const headers = getHeaderLabels(box);
            if (headers.some(h => h.includes('Mã phiếu gửi'))) {
                candidates.push(box);
            }
        }
        if (candidates.length === 0) return null;
        if (candidates.length === 1) return candidates[0];

        // Ưu tiên 1: bảng visible + có ít nhất 1 dòng dữ liệu
        for (const box of candidates) {
            if (box.offsetParent !== null && box.querySelector('.z-listitem')) {
                return box;
            }
        }
        // Ưu tiên 2: bảng visible bất kỳ
        for (const box of candidates) {
            if (box.offsetParent !== null) return box;
        }
        // Fallback: cái đầu tiên
        return candidates[0];
    }

    // ── Nhận diện mã phiếu gửi THEO MẪU NỘI DUNG (không theo cột) ──
    //  ID ZK (rAdUvg / xLgWvg...) và cả chỉ số cột đều có thể đổi, nên ta
    //  nhận mã giống cách nhận nút "Tìm kiếm": dựa vào chính nội dung ô.
    //
    //  Mẫu mã VTP thực tế:
    //    145910395544 · PKE1462205132 · VTPVN9039815294
    //    146353703557-5F5 · 1457630070631P1 · SHOPEEVTPVN266481276095Z
    //
    //  Đặc trưng phân biệt với các cột khác trong cùng dòng:
    //    - Ngày gửi / Thời gian nhận  → chứa "/" (dd/mm/yyyy)  → loại
    //    - Trọng lượng (60,000)       → chứa ","              → loại
    //    - Người nhận (Võ ... (868769))→ có dấu cách           → loại
    //    - STT / Dịch vụ / Bưu cục    → quá ngắn hoặc ít chữ số → loại
    //  ⇒ Mã hợp lệ: không dấu cách, không "/" ",", dài ≥ 10, và
    //    chứa ≥ 8 chữ số (dấu hiệu mạnh nhất — bưu cục/dịch vụ gần như
    //    không có số).
    function isValidBillCode(text) {
        const code = normText(text).replace(/\s+/g, '');
        if (code.length < 10 || code.length > 50) return false;
        if (/[\/,]/.test(code)) return false;                 // ngày giờ, trọng lượng
        if (!/^[A-Za-z0-9._\-]+$/.test(code)) return false;   // ký tự lạ → loại
        const digitCount = (code.match(/\d/g) || []).length;
        return digitCount >= 8;                               // mã luôn nhiều chữ số
    }

    // ── Người nhận: ô có dấu cách kèm mã trong ngoặc "(868769)" ──
    function looksLikeRecipient(text) {
        const t = normText(text);
        return t.length > 0 && /\s/.test(t) && /\(\d+\)/.test(t);
    }

    // Lấy danh sách mã từ bảng — quét mẫu trên từng dòng
    function getBillsFromListbox(listbox) {
        if (!listbox) return [];

        const rows = listbox.querySelectorAll('.z-listitem');
        const bills = [];
        const seen = new Set();

        rows.forEach(row => {
            // Đọc text mọi ô trong dòng (không phụ thuộc chỉ số cột)
            const cells = Array.from(row.querySelectorAll('td.z-listcell')).map(td => {
                const cave = td.querySelector('.z-listcell-content');
                return normText(cave ? cave.textContent : td.textContent);
            });
            if (cells.length === 0) return;

            // Mã phiếu gửi = ô ĐẦU TIÊN khớp mẫu mã trong dòng
            const billCode = cells.find(isValidBillCode);
            if (!billCode || seen.has(billCode)) return;

            // Người nhận = ô khớp mẫu "tên (mã)"; nếu không có, để trống
            const recipient = cells.find(looksLikeRecipient) || '';

            seen.add(billCode);
            bills.push({ billCode, recipient });
        });

        return bills;
    }

    // ── Tìm phần tử .z-paging ĐÚNG cho listbox đã cho ──
    //  ZK Framework có thể render .z-paging:
    //    1. Bên TRONG .z-listbox (child)
    //    2. Là sibling ngay sau .z-listbox
    //    3. Trong cùng parent container
    //    4. Trong cùng .z-tabpanel (khi có nhiều tab)
    //  Trang CPC có NHIỀU tab ẩn → phải chọn đúng paging.
    function findPagingForListbox(listbox) {
        if (!listbox) return null;

        // Chiến lược 1: Bên trong listbox
        let paging = listbox.querySelector('.z-paging');
        if (paging) {
            console.log('[VTP KTĐ-CPC] Paging: tìm thấy bên trong listbox');
            return paging;
        }

        // Chiến lược 2: Sibling ngay sau listbox
        let sibling = listbox.nextElementSibling;
        while (sibling) {
            if (sibling.classList?.contains('z-paging')) {
                console.log('[VTP KTĐ-CPC] Paging: tìm thấy là sibling của listbox');
                return sibling;
            }
            // Có thể nằm sâu 1 tầng trong sibling
            paging = sibling.querySelector?.('.z-paging');
            if (paging) {
                console.log('[VTP KTĐ-CPC] Paging: tìm thấy trong sibling container');
                return paging;
            }
            sibling = sibling.nextElementSibling;
        }

        // Chiến lược 3: Trong cùng parent trực tiếp
        const parent = listbox.parentElement;
        if (parent) {
            for (const child of parent.children) {
                if (child !== listbox && child.classList?.contains('z-paging')) {
                    console.log('[VTP KTĐ-CPC] Paging: tìm thấy trong cùng parent');
                    return child;
                }
            }
            paging = parent.querySelector('.z-paging');
            if (paging) {
                console.log('[VTP KTĐ-CPC] Paging: tìm thấy qua parent.querySelector');
                return paging;
            }
        }

        // Chiến lược 4: Trong cùng .z-tabpanel (quan trọng khi nhiều tab)
        const tabPanel = listbox.closest('.z-tabpanel');
        if (tabPanel) {
            paging = tabPanel.querySelector('.z-paging');
            if (paging) {
                console.log('[VTP KTĐ-CPC] Paging: tìm thấy trong cùng z-tabpanel');
                return paging;
            }
        }

        // Chiến lược 5: Global — chỉ lấy paging VISIBLE (tránh chọn nhầm tab ẩn)
        for (const p of document.querySelectorAll('.z-paging')) {
            if (p.offsetParent !== null) {
                console.log('[VTP KTĐ-CPC] Paging: fallback global visible');
                return p;
            }
        }

        console.warn('[VTP KTĐ-CPC] Paging: KHÔNG tìm thấy phần tử .z-paging nào');
        return null;
    }

    // ── Đọc thông tin trang hiện tại / tổng số trang từ paging UI ──
    //  HTML cấu trúc:
    //    <input class="z-paging-input" value="1">
    //    <span class="z-paging-text"> / 10</span>
    function getPagingInfo(paging) {
        if (!paging) return { current: 1, total: 1 };
        const input = paging.querySelector('.z-paging-input');
        const span  = paging.querySelector('.z-paging-text');
        const current = input ? parseInt(input.value, 10) || 1 : 1;
        let total = 1;
        if (span) {
            const match = normText(span.textContent).match(/\/\s*(\d+)/);
            if (match) total = parseInt(match[1], 10) || 1;
        }
        return { current, total };
    }

    // Click lật trang tiếp theo
    //  [v1.1 FIX] Không dùng document.querySelector('.z-paging') trực tiếp
    //  vì trang CPC có nhiều tab ẩn → chọn nhầm paging → không lật trang đúng.
    //  Dùng findPagingForListbox() với 5 chiến lược scope.
    function clickNextPage(listbox) {
        if (!listbox) return false;

        const paging = findPagingForListbox(listbox);
        if (!paging) {
            console.warn('[VTP KTĐ-CPC] clickNextPage: không tìm thấy paging');
            return false;
        }

        // Đọc thông tin trang để log
        const info = getPagingInfo(paging);
        console.log(`[VTP KTĐ-CPC] clickNextPage: đang ở trang ${info.current}/${info.total}`);

        // Nếu đã ở trang cuối → không lật nữa
        if (info.current >= info.total) {
            console.log('[VTP KTĐ-CPC] clickNextPage: đã ở trang cuối');
            return false;
        }

        // Tìm nút Next — dùng class CSS (không phụ thuộc ID động)
        const nextBtn = paging.querySelector('a.z-paging-next, .z-paging-next');
        if (!nextBtn) {
            console.warn('[VTP KTĐ-CPC] clickNextPage: không tìm thấy nút .z-paging-next');
            return false;
        }

        if (nextBtn.hasAttribute('disabled') || nextBtn.classList.contains('z-disabled')) {
            console.log('[VTP KTĐ-CPC] clickNextPage: nút Next bị disabled');
            return false;
        }

        console.log(`[VTP KTĐ-CPC] clickNextPage: click Next (trang ${info.current} → ${info.current + 1})`);
        nextBtn.click();
        return true;
    }

    // Chờ trang mới load xong
    //  [v1.1 FIX] Tách waitForLoadingDone ra khỏi vòng lặp poll để tránh
    //  inner timeout (6s) ăn hết outer timeout (10s) → chỉ poll được 1 lần.
    //  Luồng mới: chờ loading xong TRƯỚC → rồi poll nội dung thay đổi.
    async function waitForNextPageLoaded(listbox, oldFirstCode, timeout = 15000) {
        const start = Date.now();

        // Bước 1: Chờ loading indicator xuất hiện rồi biến mất (1 lần)
        await sleep(200); // Buffer nhỏ để ZK bắt đầu request
        await waitForLoadingDone(10000);

        // Bước 2: Poll nội dung — chờ mã đầu tiên thay đổi
        while (Date.now() - start < timeout) {
            // Re-find listbox phòng trường hợp ZK thay thế DOM element
            const currentListbox = findTargetListbox() || listbox;
            const currentBills = getBillsFromListbox(currentListbox);
            if (currentBills.length > 0 && currentBills[0].billCode !== oldFirstCode) {
                console.log(`[VTP KTĐ-CPC] Trang mới đã load: mã đầu = ${currentBills[0].billCode}`);
                return true;
            }
            await sleep(200);
        }

        console.warn('[VTP KTĐ-CPC] waitForNextPageLoaded: timeout sau', timeout, 'ms');
        return false;
    }

    // ── Chờ bảng danh sách xuất hiện VÀ có ít nhất 1 mã hợp lệ ──
    //  Sau khi bấm Tìm kiếm, ZK cần thời gian render rows → nếu đọc quá
    //  sớm sẽ ra 0 mã. Poll cho tới khi có dữ liệu hoặc báo "không có".
    async function waitForBillsReady(timeout = 12000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const listbox = findTargetListbox();
            if (listbox) {
                if (getBillsFromListbox(listbox).length > 0) return listbox;
                // Bảng có emptybody hiển thị = thật sự không có đơn
                const empty = listbox.querySelector('.z-listbox-emptybody-content');
                if (empty && empty.offsetParent !== null &&
                    normText(empty.textContent).length > 0) {
                    return listbox; // trả về để vòng ngoài đọc ra 0 mã
                }
            }
            await sleep(250);
        }
        return findTargetListbox();
    }

    async function runScan() {
        try {
            console.log('[VTP KTĐ-CPC] Bắt đầu tự động chuyển tab...');
            
            // Bước 2: Click tab "Quét phân công"
            const tab1 = await clickTabByText('Quét phân công');
            if (!tab1) {
                throw new Error('Không tìm thấy tab "Quét phân công". Đảm bảo bạn đang ở trang Khai thác!');
            }
            await waitForLoadingDone();

            // Bước 3: Click tab "Danh sách đơn nhận về"
            const tab2 = await clickTabByText('Danh sách đơn nhận về');
            if (!tab2) {
                throw new Error('Không tìm thấy tab "Danh sách đơn nhận về"');
            }
            await waitForLoadingDone();

            // Click nút Tìm kiếm để load dữ liệu
            console.log('[VTP KTĐ-CPC] Tiến hành click nút Tìm kiếm...');
            const hasClickedSearch = await clickSearchButton();
            if (hasClickedSearch) {
                await waitForLoadingDone();
            } else {
                console.warn('[VTP KTĐ-CPC] Không tìm thấy nút Tìm kiếm trên giao diện.');
            }

            // Chờ bảng render xong (tránh đọc lúc chưa có rows → 0 mã)
            await waitForBillsReady(12000);

            const allBills = [];
            let hasNext = true;
            let page = 1;

            // Log thông tin paging ban đầu
            const initListbox = findTargetListbox();
            if (initListbox) {
                const initPaging = findPagingForListbox(initListbox);
                const initInfo = getPagingInfo(initPaging);
                console.log(`[VTP KTĐ-CPC] Paging detected: ${initInfo.current}/${initInfo.total} trang. Paging element:`, initPaging ? 'FOUND' : 'NOT FOUND');
            }

            while (hasNext) {
                const listbox = findTargetListbox();
                if (!listbox) {
                    console.warn('[VTP KTĐ-CPC] Không tìm thấy bảng danh sách đơn.');
                    break;
                }

                const pageBills = getBillsFromListbox(listbox);
                console.log(`[VTP KTĐ-CPC] Trang ${page}: tìm thấy ${pageBills.length} đơn. Tổng tích lũy: ${allBills.length + pageBills.length}`);
                
                if (pageBills.length === 0) {
                    console.log('[VTP KTĐ-CPC] Trang trống, dừng quét.');
                    break; // Hết dữ liệu
                }

                // Add và lọc trùng
                pageBills.forEach(item => {
                    if (!allBills.some(b => b.billCode === item.billCode)) {
                        allBills.push(item);
                    }
                });

                const oldFirstCode = pageBills[0].billCode;

                // Click trang tiếp theo
                if (clickNextPage(listbox)) {
                    page++;
                    console.log(`[VTP KTĐ-CPC] Đã click Next. Chờ trang ${page} load...`);
                    const loaded = await waitForNextPageLoaded(listbox, oldFirstCode);
                    if (!loaded) {
                        console.warn(`[VTP KTĐ-CPC] Trang ${page} không load được sau timeout. Tổng đã quét: ${allBills.length} đơn.`);
                        break;
                    }
                } else {
                    console.log(`[VTP KTĐ-CPC] Đã ở trang cuối (trang ${page}). Kết thúc quét.`);
                    hasNext = false; // Hết trang
                }
            }

            console.log(`[VTP KTĐ-CPC] Hoàn tất quét danh sách đơn. Tổng cộng: ${allBills.length} đơn.`);
            return { status: 'success', bills: allBills };

        } catch (err) {
            console.error('[VTP KTĐ-CPC] Lỗi:', err);
            return { status: 'error', reason: err.message };
        }
    }

    runScan()
        .then(result => {
            window.__VTP_KTD_CPC_RUNNING__ = false;
            chrome.storage.local.set({ __VTP_KTD_CPC_STEP_DONE__: result });
        })
        .catch(err => {
            window.__VTP_KTD_CPC_RUNNING__ = false;
            chrome.storage.local.set({
                __VTP_KTD_CPC_STEP_DONE__: { status: 'error', reason: err.message }
            });
        });
}
