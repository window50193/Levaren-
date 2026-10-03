# PayTR + Kargo Canlıya Geçiş Kontrol Listesi

Bu paket PayTR ödeme akışını ve mağaza tarafındaki kargo/takip akışını içerir.

## PayTR tarafı

1. Railway Variables içine `PAYTR_MERCHANT_ID`, `PAYTR_MERCHANT_KEY`, `PAYTR_MERCHANT_SALT` ve `BASE_URL` girilmeli.
2. PayTR Mağaza Paneli > Destek & Kurulum > Ayarlar bölümündeki Bildirim URL alanına:
   `https://SENIN-DOMAININ/api/payment/paytr-callback`
   yazılmalı.
3. Bildirim URL oturum/giriş koruması altında olmamalı.
4. Callback yalnızca `OK` yanıtı vermeli; uygulama zaten hash doğrulaması ve tekrar eden bildirim kontrolü yapıyor.
5. Test işlemleri tamamlandıktan sonra PayTR mağaza panelindeki canlıya geçiş süreci tamamlanmalı.
6. Canlı kullanımda `PAYTR_TEST_MODE` değerini mağaza durumunuzla uyumlu şekilde kontrol edin.

## Teslimat / kargo tarafı

- Checkout'ta telefon numarası zorunludur.
- Checkout'ta teslimat adresi zorunludur.
- Sunucu tarafında adres 400 karakter, telefon 20 karakter sınırlarıyla kontrol edilir.
- Siparişe kargo ücreti hesaplanır.
- `1500 TL` ve üzeri siparişlerde ücretsiz kargo uygulanır.
- Admin sipariş detayında kargo firması, takip numarası ve takip bağlantısı girilebilir.
- Müşteri hesabındaki Siparişlerim bölümünde kargo bilgileri ve takip bağlantısı gösterilir.
- Sipariş durumu `Kargoya verildi` ve `Teslim edildi` olarak güncellenebilir.
- CSV sipariş çıktısında kargo firması, takip numarası ve takip bağlantısı bulunur.

## Önemli

PayTR bir kargo firması değildir. Otomatik kargo barkodu/etiketi veya taşıyıcı API entegrasyonu için seçilecek kargo firmasının API hesabı ve erişim bilgileri ayrıca gerekir. Bu paket, manuel takip numarası ve takip bağlantısı ile çalışan kargo yönetimini hazırlar.

## Site bilgi sayfaları

- Kargo ve Teslimat
- Mesafeli Satış Sözleşmesi
- Gizlilik Politikası
- İletişim

Hukuki metinlerde işletmenin gerçek şirket/unvan/vergi/MERSİS/ETBİS ve iade bilgileri canlıya geçmeden önce yetkili kişi tarafından doldurulup kontrol edilmelidir.
