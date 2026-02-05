document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("registerForm");
    if (!form) return;

    const fullNameInput = document.getElementById("fullName");
    const emailInput = document.getElementById("email");
    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");
    const confirmPasswordInput = document.getElementById("confirmPassword");
    const roleSelect = document.getElementById("role");
    const acceptKvkkCheckbox = document.getElementById("acceptKvkk");
    const errorEl = document.getElementById("registerError");

    form.addEventListener("submit", (e) => {
        e.preventDefault();

        const fullName = fullNameInput.value.trim();
        const email = emailInput.value.trim();
        const username = usernameInput.value.trim();
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;
        const role = roleSelect.value;
        const acceptedKvkk = acceptKvkkCheckbox.checked;

        // Basit kontroller
        if (!fullName || !email || !username || !password || !confirmPassword || !role) {
            showError("Lütfen tüm alanları doldurun.");
            return;
        }

        if (password.length < 6) {
            showError("Şifre en az 6 karakter olmalıdır.");
            return;
        }

        if (password !== confirmPassword) {
            showError("Şifre ve şifre tekrarı uyuşmuyor.");
            return;
        }

        if (!acceptedKvkk) {
            showError("Devam etmek için KVKK ve gizlilik koşullarını kabul etmelisiniz.");
            return;
        }

        // Hata yoksa mesajı temizle
        hideError();

        // Demo amaçlı: kullanıcı bilgilerini localStorage'a yazıp, giriş sayfasına yönlendirebiliriz.
        // Gerçek projede bu noktada backend'e POST isteği atarsın.
        const userData = {
            fullName,
            email,
            username,
            role,
            createdAt: new Date().toISOString()
        };

        try {
            const existing = JSON.parse(localStorage.getItem("akilliKampusUsers") || "[]");
            existing.push(userData);
            localStorage.setItem("akilliKampusUsers", JSON.stringify(existing));
        } catch (err) {
            console.error("Kullanıcı kaydedilirken hata:", err);
        }

        alert("Kayıt başarılı! Şimdi giriş yapabilirsiniz.");
        window.location.href = "giris.html";
    });

    function showError(msg) {
        if (!errorEl) return;
        errorEl.textContent = msg;
        errorEl.hidden = false;
    }

    function hideError() {
        if (!errorEl) return;
        errorEl.textContent = "";
        errorEl.hidden = true;
    }
});