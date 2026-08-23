# Admin Toplu Bildiriş Sistemi — Dizayn Sənədi

**Tarix:** 2026-08-24
**Status:** Təsdiqlənib (dizayn mərhələsi)

## Məqsəd

Admin panelindən (`/admin/dashboard`), filtrlərə əsasən seçilmiş istifadəçi/mağaza qrupuna toplu bildiriş göndərmək. Layihədə real brauzer/mobil push infrastrukturu (Web Push API, FCM, VAPID) yoxdur — yalnız mövcud in-app chat sistemi var. Bu feature yeni infrastruktur qurmadan, in-app bildiriş kimi işləyir: mövcud `internal/chat` unread-badge/polling pattern-inin analoji genişlənməsi.

## Scope-dan kənar

- `internal/chat`-in `conversations`/`messages` sxemasına toxunulmur — o, listing-scoped, iki-tərəfli (buyer/seller) modeldir və admin-mənbəli/broadcast konsepti dəstəkləmir. Tamamilə ayrı cədvəllər istifadə olunur.
- Real brauzer push (Web Push API/VAPID/service worker) — bu request-in scope-u deyil.
- Mock `AuthContext`/`useAuth()` ilə bağlı heç nə dəyişmir — bu feature tam olaraq real backend (`user_session`/`shop_session`) istifadəçiləri üçündür.

## Data Model

```sql
CREATE TABLE avto444.admin_notifications (
  id          BIGSERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  filters     JSONB NOT NULL,       -- admin-in seçdiyi filtr snapshot-u (audit üçün)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE avto444.admin_notification_recipients (
  id                BIGSERIAL PRIMARY KEY,
  notification_id   BIGINT NOT NULL REFERENCES avto444.admin_notifications(id),
  recipient_type    TEXT NOT NULL CHECK (recipient_type IN ('user', 'shop')),
  recipient_id      BIGINT NOT NULL,
  is_read           BOOLEAN NOT NULL DEFAULT false,
  read_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_notif_recipients_lookup
  ON avto444.admin_notification_recipients (recipient_type, recipient_id, is_read);
```

Fanout **send-time**-da olur: admin "Göndər" düyməsinə basanda, backend filtrlərə uyğun bütün `(recipient_type, recipient_id)` cütlərini hesablayır və hər biri üçün `admin_notification_recipients`-ə bir sətir yazır. Bu, "göndərildi/oxundu" sayını sadə `COUNT(*)` / `COUNT(*) FILTER (WHERE is_read)` sorğusu ilə almağa imkan verir.

## Filtrlər

Admin göndərmə formunda seçir (hamısı optional, boş saxlanarsa həmin filtr tətbiq olunmur):

| Filtr | Tətbiq | SQL şərti |
|---|---|---|
| Alıcı tipi | user / shop / hər ikisi | — |
| Balans aralığı (min/max AZN) | `avto444.user.balans` / `avto444.shop.balans` | `balans BETWEEN $min AND $max` |
| Qeydiyyat tarixi aralığı | `created_at` | `created_at BETWEEN $from AND $to` |
| Aktiv elanı var/yoxdur | `user_products`/`shop_products`, `status='saytda'` | `EXISTS (...)` / `NOT EXISTS (...)` |
| VIP olmayan aktiv elanı var | `user_products`/`shop_products`, `status='saytda' AND vip_tier='standart'` | `EXISTS (SELECT 1 FROM ... WHERE status='saytda' AND vip_tier='standart')` |

Filtrlər AND ilə birləşir. Admin formu göndərmədən əvvəl **"Neçə alıcıya çatacaq"** preview sayını göstərir (eyni filtr sorğusu, `COUNT(*)`, göndərmədən).

## Backend API (`internal/adminnotify` yeni paket və ya `internal/admin`-ə əlavə)

- `POST /admin/notifications` — body: `{title, body, filters: {...}}`. Admin auth (`requireAdmin`) tələb olunur. Filtrlərə uyğun alıcıları hesablayır, `admin_notifications` + `admin_notification_recipients` yazır, `{id, recipientCount}` qaytarır.
- `GET /admin/notifications/preview?filters=...` — yalnız `COUNT(*)` qaytarır, yazı etmir.
- `GET /admin/notifications` — admin-in göndərdiyi bütün bildirişlərin siyahısı, hər biri üçün `{id, title, body, createdAt, sentCount, readCount}`.
- `GET /api/users/me/notifications` — real user session ilə, `recipient_type='user' AND recipient_id=$userID` olan bildirişlər (ən yenisi əvvəl).
- `GET /api/users/me/notifications/unread-count` — sadə say (navbar badge üçün, chat-dakı `CountUnreadAsBuyer` pattern-i kimi).
- `POST /api/users/me/notifications/{id}/read` — `is_read=true, read_at=now()`.
- Mağaza tərəfi üçün paralel: `GET /api/shop/me/notifications`, `.../unread-count`, `POST .../{id}/read`.

## Frontend

**Admin (`/admin/dashboard`) — yeni tab "Bildirişlər":**
- Filtr formu (checkbox-lar + aralıq input-ları) yuxarıda təsvir olunan filtrlər üçün.
- "Neçə alıcıya çatacaq: N" canlı preview (filtr dəyişəndə debounce ilə yenilənir).
- Başlıq + mətn sahəsi, "Göndər" düyməsi.
- Aşağıda göndərilmiş bildirişlərin siyahısı: başlıq, tarix, **Göndərildi: N / Oxundu: M** sətri.

**İstifadəçi/mağaza tərəfi:**
- Kabinet-də yeni `/kabinet/bildirisler`, mağaza panelində `/magazam/bildirisler` səhifəsi — sadə siyahı (başlıq/mətn/tarix, oxunmamış üçün nişan), klikləyəndə `is_read=true` işarələnir.
- Naya bar-da zəng ikonu + unread say (chat-in mövcud unread-badge pattern-i eyni şəkildə genişlənir, iki ayrı say göstərilir və ya cəmlənir — implementasiya mərhələsində qərar).

## Xəta İdarəetməsi

- Admin auth olmadan `/admin/notifications/*` → 401.
- Filtr nəticəsində 0 alıcı olsa → göndərmə düyməsi disabled və ya xəbərdarlıq ("Bu filtrlərlə heç bir alıcı tapılmadı").
- User/shop session olmadan `/api/users/me/notifications` → 401 (mövcud pattern).

## Test Planı

- Backend: filtr kombinasiyaları üçün repository-level unit testlər (VIP olmayan filtri, balans aralığı, boş filtr = hamısı).
- Fanout: N alıcı seçiləndə düzgün sayda recipient sətri yaranması.
- Read-tracking: `POST .../{id}/read` sonra `sentCount`/`readCount` düzgün yenilənməsi.
- Frontend: mövcud pattern (tsc + build) ilə growth-check, corruption scan (`Ɛ|Ɔ`).
