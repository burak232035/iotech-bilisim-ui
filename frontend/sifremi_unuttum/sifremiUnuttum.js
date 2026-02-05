// EmailJS ayarlarını BURADA dolduracaksın:
const EMAILJS_SERVICE_ID = "service_xm2hxp7";
const EMAILJS_TEMPLATE_ID = "template_i3g4ib7";
const EMAILJS_PUBLIC_KEY = "Gm0wsGbAs_A_ObNfX";

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("resetForm");
    if (!form) return;

    const emailInput = document.getElementById("resetEmail");
    const errorEl = document.getElementById("resetError");
    const successEl = document.getElementById("resetSuccess");

    // EmailJS'i başlat
    if (typeof emailjs !== "undefined") {
        emailjs.init(EMAILJS_PUBLIC_KEY);
    } else {
        console.error("EmailJS yüklenemedi. CDN script'ini kontrol et.");
    }

    form.addEventListener("submit", (e) => {
        e.preventDefault();

        const email = (emailInput.value || "").trim();

        if (!email) {
            showError("Lütfen e-posta adresinizi girin.");
            hideSuccess();
            return;
        }

        if (!validateEmail(email)) {
            showError("Lütfen geçerli bir e-posta adresi girin.");
            hideSuccess();
            return;
        }

        hideError();
        hideSuccess();

        // Demo için sahte bir reset linki
        const dummyToken = "DEMO_RESET_TOKEN_123";
        const resetLink = `https://akillikampus.com/sifre-sifirla?token=${dummyToken}`;

        // EmailJS template'ine gidecek parametreler:
        // ‼️ EmailJS şablonunda: {{email}}, {{reset_link}}, {{project_name}} olmalı
        const templateParams = {
            email: email,                             // To Email: {{email}}
            reset_link: resetLink,                   // Mail içi link: {{reset_link}}
            project_name: "Akıllı Kampüs Drone Sistemi" // İstersen mail içinde {{project_name}}
        };

        const submitBtn = form.querySelector("button[type='submit']");
        const originalText = submitBtn ? submitBtn.textContent : null;
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "Gönderiliyor...";
        }

        emailjs
            .send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams)
            .then((response) => {
                console.log("EmailJS response:", response);
                showSuccess(
                    "Eğer bu e-posta ile eşleşen bir hesabınız varsa, şifre sıfırlama bağlantısı e-posta adresinize gönderildi."
                );
            })
            .catch((err) => {
                console.error("EmailJS hata:", err);
                showError(
                    "İşlem sırasında bir hata oluştu. Lütfen daha sonra tekrar deneyin."
                );
            })
            .finally(() => {
                if (submitBtn && originalText) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalText;
                }
            });
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

    function showSuccess(msg) {
        if (!successEl) return;
        successEl.textContent = msg;
        successEl.hidden = false;
    }

    function hideSuccess() {
        if (!successEl) return;
        successEl.textContent = "";
        successEl.hidden = true;
    }

    function validateEmail(email) {
        const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return pattern.test(email);
    }
});