# 🦁 Hayvanat Bahçesi Kaçkınları — 3D Coop

> Çitler yıkıldı, 10 hayvan kaçtı. 4 bekçi, bir kamyon ve bolca kaos.
> **Arkadaşlarınla 3D kooperatif hayvan yakalama oyunu** — strateji kur, hayvanları yakala, birbirinizi trollе.

Tek bir Node sunucusu; tarayıcıdan oynanır, kurulum gerekmez. 1–4 oyuncu, oda kodu veya davet bağlantısı ile aynı bahçede.

---

## 🚀 Çalıştırma

```bash
npm install
npm run build      # istemciyi derle (dist/)
npm start          # http://localhost:3000
```

Geliştirirken (Vite middleware, HMR kapalı):

```bash
DEV=1 npm run dev  # http://localhost:3000
```

- Ana menüden **Oda Kur** → 4 haneli oda kodu + davet bağlantısı.
- Arkadaşların aynı bağlantıyı açıp **Odaya Katıl** ile kodu girer (veya `?oda=KOD` parametreli linki açar).
- Kurucu **Turu Başlat** der. Tek başına denemek için **Tek Başına Oyna**.

---

## 🎯 Oyun döngüsü

7 dakikada **10 kaçkını** yakala. Her hayvanın bir **yakalama göstergesi** vardır; ağ attıkça dolar, %100 olunca hayvan taşıma kamyonuna gider ve puan senin olur.

| Hayvan | Puan | Davranış | Zayıflığı |
|---|---|---|---|
| 🦁 Aslan | 120 | Agresif, pençe | Yem + ağ |
| 🐯 Kaplan | 145 | Pusu kurup şarj eder | Şırınga |
| 🦍 Goril | 150 | Yakalar ve fırlatır | Uzaktan ağ |
| 🦤 Devekuşu | 95 | Çok hızlı, ürkek | Kapan / köşe |
| 🐒 Maymun | 85 | **Eşyanı çalar** | Kapan |
| 🐍 Yılan | 75 | Zehirler, yavaşlatır | Ağ (küçük hedef) |
| 🐘 Fil | 180 | Kapanları ezer, savurur | Yem + ekip |
| 🐧 Penguen | 65 | Zikzak kaçar | Kapan |
| 🦚 Tavus Kuşu | 110 | Kısa mesafe uçar | Köşeye sıkıştır |

### Strateji katmanı
- **Yem (3):** Hayvan yemeye gelir, 5 sn kıpırdamaz → ağ **2 kat** etkili.
- **Şırınga (2):** Hayvanı 6 sn yavaşlatır → ağ **+16** fazla doldurur.
- **Kapan (4):** Hayvanı 5 sn kilitler, dolum +30. Fil kapanı ezer!
- **Maytap (G):** Hayvanları korkutup kaçırır — sürüyü arkadaşına doğru sürükleyebilirsin.
- **Yorulma:** Uzun kovalamacada hayvanın nefesi kesilir, yavaşlar. Devekuşu bile yakalanır.
- **Ekip bonusu:** Yakalama anında 8 m içinde 2+ bekçi varsa **+%25 puan**.
- **Yakalama sönümü:** Hayvanı 9 sn ağlamazsan göstergesi erimeye başlar — commit et.

### 😈 Trolleme (oyunun kalbi)
| Yöntem | Etki |
|---|---|
| Ağ at (sol tık / 1) | Arkadaşın 2.6 sn ağda kalır, hayvanlar ona saldırır (hasar ×1.5) |
| Şırınga (2) | Sersemletir, ekranı döner |
| İt (V) | Sert itme + 0.85 sn sersem — aslanın önüne itmek serbest |
| Muz kabuğu (B) | Basan kayar, istisnasız herkes |
| Kapan (4) | Arkadaşın da içine düşer, 2.2 sn kilitlenir |
| Yem aşırma | Arkadaşının yemini alıp +1 yem kazanırsın |
| Maymun | Eşyanı çalar; maymunu yakalarsan eşyaların geri gelir |

### Co-op
- **Yerde kalan** arkadaşını 3 m içinde **E'ye basılı tutarak** kaldırırsın (+40 puan).
- Herkes yerde kalırsa **kurtarma ekibi** gelir: herkes kalkar ama **-30 saniye**.
- Tek başınaysan yerde 8 sn sonra kendi kalkarsın.

---

## ⌨️ Kontroller

| Tuş | İşlev |
|---|---|
| `W A S D` | Hareket · `Shift` koş |
| Fare | Bakış (tıkla → fare kilidi; kilitlenmezse **sağ tıkla sürükle** veya **ok tuşları**) |
| `Sol Tık` / `1` | Ağ |
| `2` / `3` / `4` | Şırınga / Yem / Kapan |
| `V` `B` `G` | İt / Muz kabuğu / Maytap |
| `E` (basılı) | Arkadaşını kaldır |
| `Z X C F T` | Hızlı duygu ifadeleri (yardım, gülme, pardon, benim, izle) |
| `M` | Harita büyüt · `H` yardım · `P` ses · `Esc` fareyi bırak |

Mobilde: sol yarı sürükle = yürü, sağ yarı sürükle = bak, alt slotlara dokun = araç.

---

## 🧱 Teknik yapı

```
server/index.js     HTTP statik sunucu + WebSocket oda yönetimi (tek port)
server/sim.js       Yetkili oyun simülasyonu: hayvan AI, çarpışma, yakalama, trolleme
shared/config.js    Hayvan/araç/denge ayarları (sunucu + istemci ortak)
shared/map.js       Harita verisi + çarpışma çözümü (ortak, deterministik)
src/game.js         İstemci döngüsü: yerel hareket, interpolasyon, kamera, efektler
src/world.js        Prosedürel hayvanat bahçesi (çit, ağaç, tabela, gölet, kamyon)
src/models.js       Prosedürel düşük poligon hayvan ve bekçi modelleri
src/hud.js          HUD, minimap, akış, sonuç ekranı
src/effects.js      Parçacıklar, konfeti, şok dalgaları
src/audio.js        WebAudio ile sentezlenmiş ses efektleri (dosya yok)
src/input.js        Klavye / fare / pointer-lock / dokunmatik
tools/              Geliştirici testleri (aşağıya bak)
```

- **Sunucu yetkili:** Hayvanlar, isabetler, yakalamalar ve puanlar sunucuda hesaplanır; istemci sadece hareketini önerir (hız sınırı + duvar doğrulaması ile).
- 30 Hz simülasyon, 15 Hz snapshot; istemci interpolasyon + yerel hareket tahmini.
- Tüm görseller ve sesler kodla üretilir — hiçbir dış varlık yok.

### Geliştirici testleri
```bash
node tools/rendertest.mjs     # 3D sahne/modelleri tarayıcısız kurar (API hatalarını yakalar)
node tools/staticcheck.mjs    # DOM id'leri, HUD metotları, olay eşleşmeleri
node tools/simtest.mjs 60     # sunucuya bağlanıp 60 sn otomatik oynar (sunucu açık olmalı)
node tools/mptest.mjs         # iki oyuncu + trolleme testi
node tools/revivetest.mjs     # yaralı arkadaşı kaldırma testi
ROUND_TIME=20 node server/index.js   # kısa tur (test için)
```

---

## 💡 Taktik notlar

1. **Devekuşu ve tavus kuşunu** kovalamak zaman kaybı: yem at, kapana sür.
2. **Fil'e tek başına** yaklaşma; yem + iki kişi + kapan.
3. **Maymun** elinde araç yoksa ağını 5 sn kilitler — yanında kapan taşı.
4. Hayvanı **duvar önünde sıkıştır**, sonra ağ. Kaçarken yavaşlar.
5. Arkadaşın ağa dolandıysa **hemen kaldır** — ama önce gülmek serbest.
