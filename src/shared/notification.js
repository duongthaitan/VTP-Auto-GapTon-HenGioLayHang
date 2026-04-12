// ============================================================
//  VTP Tool – Notification Module
//  v1.1: Fix timer leak + guard DOM an toàn
// ============================================================


window.VTPNotification = (function () {
    const COLORS = {
        info:    { bg: '#333333', text: '#ffffff' },
        success: { bg: '#28a745', text: '#ffffff' },
        error:   { bg: '#dc3545', text: '#ffffff' },
        warning: { bg: '#ffc107', text: '#212529' }
    };

    // Giữ refs tới các timer hiện tại để clearTimeout đúng khi gọi liên tiếp
    let _fadeOutTimer = null;
    let _removeTimer  = null;
    let _current      = null;


    function _clear() {
        clearTimeout(_fadeOutTimer);
        clearTimeout(_removeTimer);
        if (_current && document.body && document.body.contains(_current)) {
            _current.remove();
        }
        _current = null;
    }

    return {
        show(message, type = 'info') {
            // Dừng và xóa thông báo cũ nếu có
            _clear();

            // Guard: nếu body chưa sẵn sàng thì bỏ qua
            if (!document.body) return;

            const { bg, text } = COLORS[type] || COLORS.info;

            const notif = document.createElement('div');
            notif.id = 'vtp-toast-notif';

            Object.assign(notif.style, {
                position:        'fixed',
                top:             '20px',
                right:           '20px',
                backgroundColor: bg,
                color:           text,
                padding:         '12px 20px',
                borderRadius:    '8px',
                boxShadow:       '0 4px 12px rgba(0,0,0,0.18)',
                zIndex:          '9999999',
                fontSize:        '14px',
                fontWeight:      'bold',
                fontFamily:      'Arial, sans-serif',
                transition:      'opacity 0.3s ease, transform 0.3s ease',
                opacity:         '0',
                transform:       'translateY(-20px)',
                maxWidth:        '340px',
                wordBreak:       'break-word',
                lineHeight:      '1.4'
            });

            notif.textContent = message;
            document.body.appendChild(notif);
            _current = notif;

            // Fade in — dùng rAF để đảm bảo browser paint trước khi transition
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (!_current) return;
                    notif.style.opacity   = '1';
                    notif.style.transform = 'translateY(0)';
                });
            });

            // Fade out sau 3 giây
            _fadeOutTimer = setTimeout(() => {
                if (!_current) return;
                notif.style.opacity   = '0';
                notif.style.transform = 'translateY(-20px)';

                // Xóa sau khi animation xong (300ms)
                _removeTimer = setTimeout(() => {
                    if (document.body && document.body.contains(notif)) notif.remove();
                    if (_current === notif) _current = null;
                }, 320);
            }, 3000);
        }
    };
})();