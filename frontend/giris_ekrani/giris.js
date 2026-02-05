document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("loginForm");
    if (!loginForm) return; // Diğer sayfaları bozmamak için güvenlik önlemi

    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");
    const rememberMe = document.getElementById("rememberMe");
    const errorEl = document.getElementById("loginError");

    loginForm.addEventListener("submit", (e) => {
        e.preventDefault();

        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        // Demo kullanıcı (ileride backend'e bağlanabilir)
        const validUser = "admin";
        const validPass = "admin123";

        const isValid = username === validUser && password === validPass;

        if (!isValid) {
            if (errorEl) {
                errorEl.hidden = false;
                errorEl.textContent = "Hatalı kullanıcı adı veya şifre.";
            }
            return;
        }

        // Hata mesajı gizle
        if (errorEl) {
            errorEl.hidden = true;
        }

        // Beni hatırla
        if (rememberMe && rememberMe.checked) {
            localStorage.setItem("akilliKampusUser", username);
        } else {
            localStorage.removeItem("akilliKampusUser");
        }

        // BAŞARILI GİRİŞ: Dashboard'a yönlendir
        window.location.href = "../harita/harita.html";
    });
});