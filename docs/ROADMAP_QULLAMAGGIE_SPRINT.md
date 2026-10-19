# Roadmap: Qullamaggie & Sprint Momentum Trading Motoru

Bu doküman, SmartAnalyser / Metrixfolio platformunun kısa vadeli momentum ve sprint hisselerini (Qullamaggie / Minervini / O'Neil tarzı) yakalama yeteneğini üst seviyeye taşımak için planlanan mimari geliştirmeleri içerir.

---

## 1. Episodic Pivot (EP) / Katalizör Tespiti
* **Problem:** Mevcut sistem, büyük kazanç raporu veya haberle sıçrayan hisseleri "EMA10'dan çok uzaklaştı (`ext_pct > 0.05`)" diyerek eliyor. Oysa en büyük sprintler bu gap-up sonrası konsolidasyonlardan doğar.
* **Çözüm:**
  * **Gap & Go Tespiti:** Seans açılışında veya günlük kapanışta $\%10\text{--}30+$ gap-up ve $RVOL \ge 3.0$ yapan hisseleri etiketleme (`status: 'episodic_pivot'`).
  * **Post-EP Consolidation:** Bu hisselerin gap sonrasında 3-10 gün boyunca EMA10/EMA20 üzerinde oluşturduğu yüksek bayrakları (High Tight Flag) ayrı bir radar listesinde takip etme.

---

## 2. Gelişmiş Volatilite Daralması (VCP - Volatility Contraction Pattern)
* **Problem:** Mevcut `tightness_score` sadece son 10 günün bar genişliğini önceki 20 günle kıyaslıyor.
* **Çözüm:**
  * **Direnç Hattı (Pivot Highs):** Konsolidasyon tepelerinin yatay bir tavan (flat ceiling) oluşturup oluşturmadığını tespit etme.
  * **Daralma Kademeleri:** Sol taraftan sağ tarafa doğru dalga boylarının küçülmesi (Örn: Dalga 1: $\%15$, Dalga 2: $\%7$, Dalga 3: $\%3$).
  * **Hacim Kuruması (Dry-Up):** Kırılım öncesi son 3 günde hacmin 20 günlük ortalamanın $\%50$'sinin altına düşmesi.

---

## 3. Sektör & Endüstri Göreceli Gücü (Top-Down RS)
* **Problem:** Hissenin RS değeri sadece SPY ile kıyaslanıyor. Hissenin lider bir sektörde olup olmadığı bilinmiyor.
* **Çözüm:**
  * Sektör ETF'lerinin (XLK, SMH, XBI, XLE vb.) SPY'a göre RS puanları hesaplanacak.
  * Hissenin kendi sektörüne göre RS'i ölçülecek.
  * "Lider Sektörün Lider Hissesi" (Leader in Leading Industry) eşleşmesine +10 puan bonus verilecek.

---

## 4. Multi-Timeframe (Haftalık Grafik Onayı)
* **Problem:** Günlükte iyi görünen bir hisse haftalıkta düşüş trendinde (düşen SMA30 altında) olabilir.
* **Çözüm:**
  * Haftalık grafikte hissenin 10 haftalık ve 30 haftalık hareketli ortalamaların üzerinde olması (Stage 2 Uptrend) şartı eklenecek.

---

## 5. Al-Sat Karar Desteği & Risk Motoru (Execution Cockpit)
* **Problem:** Sistem sadece bir puan veriyor; giriş noktası, stop seviyesi ve adet bilgisi trader'a bırakılıyor.
* **Çözüm:**
  * **Pivot Buy Point:** Konsolidasyon tavanı $+ \$0.05$ (Alım tetikleyicisi).
  * **Stop-Loss Level:** Dünün en düşüğü veya EMA10 altı (Risk mesafesi $\% ve \$$ olarak).
  * **Risk/Reward (R:R):** 2R ve 3R kâr realizasyon hedefleri.
  * **Position Sizing Calculator:** Kullanıcının toplam portföyü ve $\%1$ risk kuralına göre alması gereken tam lot miktarı.
