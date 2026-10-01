# LÉVAREN V6 — Yönetim Paneli

## Railway değişkenleri
Panel için Railway > Variables bölümüne şunları ekleyin:

- `JWT_SECRET` = uzun, rastgele bir gizli değer
- `ADMIN_EMAIL` = yönetici giriş e-postası
- `ADMIN_PASSWORD` = güçlü yönetici şifresi

Panel adresi: `https://SENIN-DOMAININ/admin`

Örnek:
- e-posta: `admin@levaren.com`
- şifre: Railway'de sizin belirlediğiniz güçlü şifre

## Panelde bulunanlar

- Genel bakış: toplam ciro, bugünkü ciro, aylık ciro, sipariş sayısı, müşteri sayısı, ortalama sepet
- Son 30 gün ciro grafiği
- Sipariş durum dağılımı
- En çok satılan ürünler
- Sipariş arama ve durum filtresi
- Sipariş detay ekranı
- Sipariş durumu değiştirme
- Ödeme durumu değiştirme
- Kargo firması ve takip numarası
- Müşteri notu ve yönetici notu
- Sipariş CSV dışa aktarma
- Ürün ekleme/düzenleme/silme
- Ürün fiyatı, eski fiyat, stok, beden, açıklama, görsel yolu ve yeni etiketi
- Müşteri listesi ve müşteri detayları
- Müşteri sipariş geçmişi
- Müşteri hesabını aktifleştirme/pasifleştirme
- İndirim kodu ekleme/düzenleme/silme
- Yüzde veya sabit TL indirim
- Minimum sepet tutarı
- Kupon kullanım limiti ve kullanım sayacı
- Kupon aktif/pasif kontrolü
- Mağaza adı, destek e-postası ve duyuru metni
- Kargo ücreti ve ücretsiz kargo alt limiti
- Bakım modu alanı

## Önemli veri notu
Bu sürüm mevcut projenin JSON tabanlı veri yapısını korur. Railway üzerinde kalıcı sipariş/müşteri verisi için sonraki aşamada Railway PostgreSQL + migration yapılması önerilir. Panel arayüzü ve API katmanı bunun için ayrıştırılmıştır.
