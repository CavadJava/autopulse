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

## Backend (avtopulse-backend) deploy-u da bu skriptdə

`deploy.sh` artıq həm frontend-i, həm də `avtopulse-backend` Go servisini
deploy edir (bir addımda). Backend üçün server-də Go toolchain yoxdur —
skript binary-ni **lokal maşında** (`GOOS=linux GOARCH=amd64 go build`)
cross-compile edir, sonra serverə köçürüb `systemctl restart
avtopulse-backend` edir. Servisin öz startup migration runner-i yeni
migration fayllarını avtomatik tətbiq edir.

Skript bu maşından işə salınmalıdır (lokal Go toolchain lazımdır) — serverdə
`curl | bash` ilə deyil:

```bash
bash /Users/frontend/workspace/me-github/autopulse/deploy/deploy.sh
```

Yalnız bir tərəfi deploy etmək üçün:

```bash
SKIP_BACKEND=1 bash deploy/deploy.sh   # yalnız frontend
SKIP_FRONTEND=1 bash deploy/deploy.sh  # yalnız backend
```

Backend rollback lazım olarsa (yeni binary xəta verirsə), köhnə binary
`.bak` kimi saxlanılır:

```bash
ssh root@157.180.73.79 "mv /opt/avtopulse-backend/avtopulse-backend.bak /opt/avtopulse-backend/avtopulse-backend && systemctl restart avtopulse-backend"
```

## Sonrakı yeniləmələr (frontend)

Kod dəyişəndə (yeni commit `main` branch-ə push olunduqdan sonra):

```bash
bash /Users/frontend/workspace/me-github/autopulse/deploy/deploy.sh
```

Bu, ən son kodu çəkib yenidən build edir (frontend + backend). Caddy
konfiqurasiyasını yenidən toxunmaq lazım deyil — o, statik olaraq
`/opt/autopulse/dist`-i göstərir.

## Qeydlər

- Frontend tam statik bir React SPA-dır — `dist/` qovluğu `index.html` +
  `assets/*` fayllarından ibarətdir, Caddy tərəfindən birbaşa serve olunur.
- Backend ayrıca bir Go servisdir (`avtopulse-backend`, systemd altında,
  `:8090` portunda, Caddy arxasında deyil — birbaşa `/api/*` route-larına
  reverse-proxy edilir, bu deploy skriptinin əhatəsi xaricindədir, Caddyfile-da
  artıq mövcuddur).
- `deploy.sh` build uğursuz olarsa (`dist/index.html` yaranmazsa) dayanır
  və köhnə build-i toxunulmaz saxlayır — yarımçıq deploy riski yoxdur.
- Backend tərəfi: yeni binary staged halda köçürülür (`.new` uzantısı ilə),
  yalnız uğurla köçürüldükdən sonra köhnəsinin yerinə keçir — nasaz scp
  köhnə binary-ni silmir.
- Route-lar client-side (React Router) olduğu üçün Caddyfile-dakı
  `try_files`-a bənzər `rewrite` qaydası vacibdir — onsuz `/elanlar` kimi
  səhifələrə birbaşa keçid 404 verər.
