// ============================================================
//  VTP Tool – Popup Controller
//  v1.2 Fixes:
//    - Fix inject trùng: disable nút Start ngay khi click
//    - Fix storage.onChanged: đọc giá trị trực tiếp từ `changes`, không gọi storage.get() lồng
//    - Fix delay restore: lưu và restore giá trị delay từ storage
//    - Fix debounce updateBillCount: tránh re-render khi paste dữ liệu lớn
//    - Fix GapTon button: disable khi đang chạy
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {

    // ════════════════════════════════════════
    //  TAB SWITCHING
    // ════════════════════════════════════════
    const tabBtns     = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

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
            billCountEl.style.color = 'var(--red)';
        } else {
            billCountEl.textContent = 'Chưa có mã nào';
            billCountEl.style.color = 'var(--text-3)';
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
        startChinhGioBtn.disabled    = true;
        startChinhGioBtn.textContent = '⏳ Đang chạy…';

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
            startChinhGioBtn.disabled    = false;
            startChinhGioBtn.textContent = '▶ Bắt Đầu Chạy';
            alert('Không thể chạy script. Hãy đảm bảo bạn đang mở đúng trang ViettelPost!');
        }
    });

    stopChinhGioBtn.addEventListener('click', async () => {
        await chrome.storage.local.set({ isRunning: false });
        if (statusMsg) statusMsg.textContent      = 'Đã dừng.';
        if (statusDot) statusDot.style.background = '#6b7280';
        startChinhGioBtn.disabled    = false;
        startChinhGioBtn.textContent = '▶ Bắt Đầu Chạy';
    });

    // ════════════════════════════════════════
    //  TAB 2 — KIỂM TỒN
    // ════════════════════════════════════════
    const statusBoxGapTon = document.getElementById('statusBoxGapTon');
    const startGapTonBtn  = document.getElementById('startGapTonBtn');

    function setGapTonStatus(isReady, title, desc) {
        statusBoxGapTon.className                                       = `page-check ${isReady ? 'ready' : 'not-ready'}`;
        statusBoxGapTon.querySelector('.page-check-icon').textContent   = isReady ? '✅' : '⚠️';
        statusBoxGapTon.querySelector('.page-check-title').textContent  = title;
        statusBoxGapTon.querySelector('.page-check-desc').textContent   = desc;
        startGapTonBtn.disabled = !isReady;
    }

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.url?.includes('viettelpost')) {
            setGapTonStatus(true, 'Sẵn sàng hoạt động', 'Trang ViettelPost đã được phát hiện');
        } else {
            setGapTonStatus(false, 'Chưa sẵn sàng', 'Vui lòng mở trang ViettelPost!');
        }
    } catch (err) {
        setGapTonStatus(false, 'Lỗi xác định trang', err.message);
    }

    startGapTonBtn.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.url?.includes('viettelpost')) return;

        // Disable button ngay để tránh inject trùng
        startGapTonBtn.disabled    = true;
        startGapTonBtn.textContent  = '⏳  Đang nạp hệ thống…';

        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                world:  'MAIN',
                files:  ['notification.js', 'gapton_settings.js', 'gapton_smart_delay.js', 'gapton_core_scan.js']
            });
        } catch (e) {
            console.error('[VTP] Lỗi inject script Kiểm Tồn:', e);
            alert('Không thể chạy script. Hãy kiểm tra lại trang ViettelPost!');
            startGapTonBtn.disabled    = false;
            startGapTonBtn.textContent = '🚀  CHẠY KIỂM TỒN';
            return;
        }

        window.close();
    });

});