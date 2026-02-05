document.getElementById("mailBtn").addEventListener("click", function () {
    const email = "iotechbilisim@outlook.com";
    const subject = "Akıllı Kampüs Drone Sistemi Hakkında";
    const body = "Merhaba,\n\nAkıllı Kampüs Drone Sistemi ile ilgili iletişime geçmek istiyorum.";

    window.location.href =
        `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
});
