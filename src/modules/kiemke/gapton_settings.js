// ============================================================
//  VTP Tool – Settings Module
//  v1.1: In-memory cache để tránh JSON.parse trong vòng lặp nóng
// ============================================================
window.VTPSettings = (function () {
    const DEFAULT_PREFIXES = ['SHOPEE', 'VTP', 'VGI', 'PKE', 'KMS', 'PSL', 'TPO'];
    const STORAGE_KEY = 'vtp_custom_prefixes';

    // Cache trong bộ nhớ — tránh JSON.parse(localStorage) mỗi vòng lặp
    let _cache = null;

    function _load() {
        if (_cache !== null) return _cache;
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            _cache = saved ? JSON.parse(saved) : DEFAULT_PREFIXES.slice();
        } catch (e) {
            console.warn('[VTPSettings] Lỗi đọc prefix, dùng mặc định:', e);
            _cache = DEFAULT_PREFIXES.slice();
        }
        return _cache;
    }

    function _save(prefixes) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(prefixes));
        } catch (e) {
            console.warn('[VTPSettings] Lỗi lưu prefix:', e);
        }
        _cache = prefixes; // Cập nhật cache ngay (không cần đọc lại)
    }

    return {
        getPrefixes() {
            return _load();
        },

        addPrefix(prefix) {
            prefix = prefix.toUpperCase().trim();
            if (!prefix) return false;
            const current = _load();
            if (current.includes(prefix)) return false;
            current.push(prefix);
            _save(current);
            return true;
        },

        removePrefix(prefix) {
            const updated = _load().filter(p => p !== prefix);
            _save(updated);
        },

        /** Xoá toàn bộ cache (dùng khi cần force reload từ localStorage) */
        invalidateCache() {
            _cache = null;
        }
    };
})();