# AutoPulse — Deploy to 157.180.73.79

Bu qovluqda AutoPulse-u `157.180.73.79` serverinə (Caddy ilə,
`autopulse.157.180.73.79.sslip.io` adında) deploy etmək üçün lazım olan
skript və konfiqurasiya var.

**Qeyd:** Bu sessiyadan serverə birbaşa SSH əlaqəsi yoxdur (şəbəkə icazəsi
yoxdur), ona görə aşağıdakı addımları serverdə özünüz icra etməlisiniz.
Bir dəfə qurulduqdan sonra, sonrakı yeniləmələr üçün yalnız `deploy.sh`-i
yenidən işə salmaq kifayətdir.

## İlk qurulum (bir dəfəlik)

Serverə SSH ilə qoşulun:

```bash
ssh root@157.180.73.79
```

### 1. Node.js quraşdırın (əgər yoxdursa)

```bash
node -v   # v20+ olmalıdır
```

Yoxdursa:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
```

### 2. Deploy skriptini işə salın

```bash
curl -fsSL https://raw.githubusercontent.com/CavadJava/autopulse/main/deploy/deploy.sh | bash
```

Bu, repo-nu `/opt/autopulse`-ə clone edir, `npm ci && npm run build` işlədir və
`/opt/autopulse/dist` qovluğunda production build yaradır.

### 3. Caddy route əlavə edin

`deploy/Caddyfile.snippet` faylının məzmununu serverin əsas Caddyfile-ına
əlavə edin:

```bash
cat /opt/autopulse/deploy/Caddyfile.snippet >> /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

### 4. Yoxlayın

```
https://autopulse.157.180.73.79.sslip.io
```

Caddy sslip.io subdomain-lər üçün HTTPS-i avtomatik təmin edir — əlavə
sertifikat işi lazım deyil.

## Sonrakı yeniləmələr

Kod dəyişəndə (yeni commit `main` branch-ə push olunduqdan sonra):

```bash
bash /opt/autopulse/deploy/deploy.sh
```

Bu, ən son kodu çəkib yenidən build edir. Caddy konfiqurasiyasını yenidən
toxunmaq lazım deyil — o, statik olaraq `/opt/autopulse/dist`-i göstərir.

## Qeydlər

- Bu, tam statik bir React SPA-dır (backend yoxdur) — `dist/` qovluğu
  `index.html` + `assets/*` fayllarından ibarətdir.
- `deploy.sh` build uğursuz olarsa (`dist/index.html` yaranmazsa) dayanır
  və köhnə build-i toxunulmaz saxlayır — yarımçıq deploy riski yoxdur.
- Route-lar client-side (React Router) olduğu üçün Caddyfile-dakı
  `try_files`-a bənzər `rewrite` qaydası vacibdir — onsuz `/elanlar` kimi
  səhifələrə birbaşa keçid 404 verər.
