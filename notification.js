window.VTPNotification = {
    show: function(message, type = 'info') {
        // Xóa thông báo cũ nếu đang hiện
        let oldNotif = document.getElementById('vtp-toast-notif');
        if (oldNotif) oldNotif.remove();

        // Tạo element thông báo mới
        const notif = document.createElement('div');
        notif.id = 'vtp-toast-notif';
        
        // Thiết lập màu sắc theo loại thông báo
        let bgColor = '#333333'; // Mặc định (info)
        let textColor = '#ffffff';
        if (type === 'success') bgColor = '#28a745'; // Xanh lá
        if (type === 'error') bgColor = '#dc3545';   // Đỏ
        if (type === 'warning') {                    // Vàng
            bgColor = '#ffc107';
            textColor = '#212529';
        }

        // CSS inline cho thông báo
        Object.assign(notif.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            backgroundColor: bgColor,
            color: textColor,
            padding: '12px 20px',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: '9999999',
            fontSize: '14px',
            fontWeight: 'bold',
            fontFamily: 'Arial, sans-serif',
            transition: 'opacity 0.3s ease, transform 0.3s ease',
            opacity: '0',
            transform: 'translateY(-20px)'
        });

        notif.innerText = message;
        document.body.appendChild(notif);

        // Hiệu ứng hiện ra (Fade In)
        setTimeout(() => { 
            notif.style.opacity = '1'; 
            notif.style.transform = 'translateY(0)';
        }, 10);

        // Tự động mờ đi và xóa sau 3 giây (Fade Out)
        setTimeout(() => {
            notif.style.opacity = '0';
            notif.style.transform = 'translateY(-20px)';
            setTimeout(() => {
                if (document.body.contains(notif)) notif.remove();
            }, 300);
        }, 3000);
    }
};