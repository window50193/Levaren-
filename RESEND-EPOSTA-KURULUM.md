# LÉVAREN — Otomatik ödeme ve sipariş e-postaları

Bu paket SMS olmadan transactional e-posta bildirimlerini kullanır.

## Akış

1. Müşteri PayTR ödeme ekranına gider.
2. PayTR başarılı ödeme callback'i doğrulanır.
3. Sipariş `Ödendi` yapılır ve stok/kupon işlemleri tamamlanır.
4. Müşteriye sipariş kodu, ürünler, toplam, kargo ve teslimat adresini içeren e-posta gönderilir.
5. `ADMIN_EMAIL` adresine ayrı bir **Yeni ödeme alındı** bildirimi gönderilir.
6. Resend idempotency anahtarları aynı sipariş/event için mükerrer gönderimi önlemeye yardımcı olur.

## Railway Environment Variables

```env
RESEND_API_KEY=re_...
EMAIL_FROM=LÉVAREN <noreply@senin-domainin.com>
ADMIN_EMAIL=siparisleri-alacagin-adres@example.com
BASE_URL=https://site-adresin.example
```

`EMAIL_FROM` için canlı kullanımda Resend üzerinde doğrulanmış bir alan adı kullanılması önerilir. API anahtarını koda veya ZIP içindeki dosyalara yazma; yalnızca Railway Variables/Environment Variables bölümüne ekle.

## Not

SMS/Netgsm zorunlu değildir ve bu sürümde ödeme bildiriminin temel kanalı e-postadır.
