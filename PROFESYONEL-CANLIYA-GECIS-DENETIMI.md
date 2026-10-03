# LÉVAREN — Canlıya Geçiş Son Denetimi

## Bu pakette kontrol edilenler
- PayTR iFrame ödeme token akışı
- PayTR callback hash doğrulaması
- Callback'in giriş gerektirmemesi
- Callback'in yalnızca `OK` yanıtı vermesi
- Callback tutar eşleşmesi
- Tekrarlanan başarılı callback'lerde çift stok/kupon işleminin engellenmesi
- Ödeme tutarı = ürünler - indirim + kargo hesabı
- Kargo: 59,90 TL; indirim sonrası 1.500 TL ve üzeri ücretsiz
- Teslimat adresi ve telefon zorunluluğu
- Admin sipariş reddi
- Kargo firması / takip no / takip URL'si
- E-posta/SMS bildirim altyapısı
- Mobil/PC responsive ürün galerileri
- Hakkımızda, İletişim, Kargo/Teslimat, İptal/İade, Mesafeli Satış, Gizlilik ve KVKK sayfaları
- Güvenlik başlıkları ve Content Security Policy
- Admin ve müşteri girişlerinde rate limiting

## Canlıya geçmeden önce Railway değişkenleri
`JWT_SECRET` uzun ve rastgele bir değer olmalı.
`ADMIN_PASSWORD_HASH` kullanılması önerilir; varsayılan şifre kullanılmamalıdır.
`PAYTR_MERCHANT_ID`, `PAYTR_MERCHANT_KEY`, `PAYTR_MERCHANT_SALT` gerçek değerlerle girilmelidir.
`BASE_URL` sitenin HTTPS adresi olmalıdır.
`PAYTR_TEST_MODE=0` yalnızca PayTR mağaza panelinde canlı mod onaylandıktan sonra yapılmalıdır.
`PAYTR_DEBUG_ON=0` canlı ortamda önerilir.
Resend ve Netgsm değişkenleri bildirimlerin gerçekten gönderilmesi için doldurulmalıdır.

## PayTR paneli
PayTR Mağaza Paneli > Destek & Kurulum > Ayarlar > Bildirim URL alanına sitenin HTTPS adresiyle birlikte:
`/api/payment/paytr-callback`
eklenmelidir.

Callback endpoint'i oturum istememelidir ve PayTR'nin POST isteğine yalnızca `OK` döndürmelidir.

## Hukuki bilgi
Bu sayfalardaki işletme unvanı, vergi bilgileri, MERSİS/ETBİS bilgileri ve iade adresi gibi alanlar işletmenin gerçek resmi bilgileriyle yetkili kişi tarafından son kez kontrol edilmelidir.
