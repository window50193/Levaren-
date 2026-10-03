# LÉVAREN + PayTR / Bildirim Kurulumu

## Railway Variables

PAYTR_MERCHANT_ID=...
PAYTR_MERCHANT_KEY=...
PAYTR_MERCHANT_SALT=...
PAYTR_TEST_MODE=1
PAYTR_DEBUG_ON=1
BASE_URL=https://SENIN-RAILWAY-DOMAININ

## PayTR Bildirim URL

PayTR Mağaza Paneli > Destek & Kurulum > Ayarlar > Bildirim URL Ayarları bölümüne:

https://SENIN-RAILWAY-DOMAININ/api/payment/paytr-callback

adresini girin.

Bildirim URL'sinde üyelik/oturum koruması olmamalıdır. Uygulama PayTR hash'ini doğrular, tekrar eden merchant_oid bildirimlerini ikinci kez işleme koymaz ve yalnızca OK yanıtı döndürür.

## E-posta (Resend)

RESEND_API_KEY=re_...
EMAIL_FROM=LÉVAREN <onboarding@resend.dev>

Canlı gönderim için Resend tarafında doğrulanmış bir gönderici/domain kullanılması gerekir.

## SMS (Netgsm)

NETGSM_USERCODE=...
NETGSM_PASSWORD=...
NETGSM_HEADER=LEVAREN

Netgsm API erişimi ve gönderici başlığı hesabınızda aktif olmalıdır.

## Otomatik bildirimler

- Sipariş alındı
- Ödeme başarılı
- Ödeme başarısız
- Sipariş hazırlanıyor
- Kargoya verildi
- Teslim edildi
- İptal
- İade durumu

Admin panelindeki Bildirimler bölümünden gönderim geçmişi görüntülenebilir. Sipariş detayından manuel e-posta/SMS gönderilebilir.


## Kargo / teslimat tarafı

Mağazada kargo ücreti ve ücretsiz kargo limiti `data/site.json` içindeki `shippingFee` ve `freeShippingThreshold` değerlerinden yönetilir. Mevcut mağaza kuralı: 59,90 TL kargo; indirimler uygulandıktan sonra 1500 TL ve üzeri ücretsiz. 1500 TL altındaki indirim sonrası siparişlerde 59,90 TL alınır. Mağaza sepeti, ödeme ekranı ve sunucu tarafı sipariş hesabı aynı kuralı kullanır. Sipariş formunda teslimat adresi ve telefon zorunludur; bu bilgiler PayTR ödeme isteğine `user_address` ve `user_phone` olarak iletilir. PayTR dokümanında bu iki alanın gerekli olduğu belirtilmektedir. Ayrıca PayTR ödeme sonucunu kesinleştiren mekanizma Bildirim URL'dir; başarı/başarısızlık işlemleri callback üzerinden işlenir.

Admin panelinde sipariş detayından:
- Kargo firması
- Takip numarası
- Kargo takip bağlantısı
- Sipariş durumu (`Kargoya verildi` / `Teslim edildi` vb.)

güncellenebilir. Müşteri hesabındaki Siparişlerim bölümünde takip bilgileri ve varsa takip bağlantısı gösterilir.

**PayTR paneli:** Bildirim URL'si Railway alan adınız üzerinden `/api/payment/paytr-callback` olarak tanımlanmalıdır. Callback herkese açık olmalı ve yalnızca `OK` yanıtı vermelidir.

**Canlıya geçmeden önce:** PayTR test işlemlerinin tamamlanması ve mağaza panelinden canlı moda geçiş onayının alınması gerekir.
