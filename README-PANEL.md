# LÉVAREN Admin Paneli — Final Sürüm

## Özellikler
- Dashboard / ciro / sipariş istatistikleri
- Sipariş listeleme, arama, filtreleme ve CSV dışa aktarma
- Sipariş durumu ve ödeme durumu yönetimi
- Kargo firması + takip numarası
- Müşteri yönetimi
- Ürün ve stok yönetimi
- Kupon yönetimi (sipariş başına yalnızca 1 kod)
- E-posta ve SMS bildirim geçmişi
- Sipariş detayından manuel e-posta/SMS gönderimi
- Mağaza ayarları
- Admin giriş rate-limit koruması

## Ödeme
PayTR iFrame API kullanılır. Kart bilgileri LÉVAREN veritabanına kaydedilmez. Ödeme sonucu PayTR Bildirim URL'sinden doğrulanır.

## Stok
Stok, ödeme başarılı olduğunda düşer. Ödeme başarısız olduğunda düşmez. İptal/iade tamamlandığında daha önce düşülmüş stok geri eklenir.

## Bildirim sağlayıcıları
E-posta: Resend API
SMS: Netgsm REST API
API anahtarlarını Railway Variables içinde tutun; kaynak koda koymayın.
