# AutoPulse — Real Messaging (Chat) Sistemi dizayn sənədi

**Tarix:** 2026-08-23
**Status:** Təsdiqlənib (istifadəçi tərəfindən), implementasiya planı gözlənilir

## Kontekst

`IndividualSellerCard`/`BusinessSellerCard` komponentlərində "Mesaj yaz" düyməsi mövcuddur (bax `2026-08-23-avtopulse-seller-contact-cards-design.md`), amma hazırda tamamilə funksionalsızdır — bu, o spec-də şüurlu şəkildə miqyasdan kənarda saxlanılmışdı. İstifadəçi indi real messaging sistemi istəyir: fərdi istifadəçi başqa bir istifadəçinin və ya mağazanın elanını açanda sual yaza bilsin, qarşı tərəf mesajı alsın, iki tərəf bir-birinə mesajlaşsın.

## Miqyas

**Daxildir:**
- Elan-əsaslı (listing-scoped) konuşmalar: hər konuşma konkret bir elana bağlıdır
- Yalnız fərdi istifadəçilər (`avto444.user`) konuşma başlada bilər ("alıcı" rolu) — istənilən elana (mağaza və ya fərdi) yaza bilər
- Satıcı tərəf (mağaza VƏ YA fərdi istifadəçi, elanın sahibi) mesajlara cavab verə bilər
- Polling-əsaslı yeniləmə (WebSocket yoxdur) — chat səhifəsi açıqkən 4 saniyədə bir yeni mesajları yoxlayır
- Oxunmamış mesaj sayğacı (`is_read`), `KabinetLayout`/`MyShop` naviqasiyasında badge
- Yeni səhifələr: `/kabinet/mesajlarim` (fərdi istifadəçi), `/magazam/mesajlar` (mağaza)

**Xaricində:**
- Mağaza-mağazaya və ya mağazanın "alıcı" rolunda konuşma başlatması — yalnız fərdi istifadəçilər konuşma başladır
- Real-time (WebSocket) çatdırma
- Mesajlara şəkil/fayl əlavə etmək
- Push bildirişlər (email/SMS)
- Mesaj silmə/redaktə

## Data model

Yeni migrasiya (`avtopulse-backend/migrations/0011_messaging.sql`):

```sql
CREATE TABLE avto444.conversations (
  id            BIGSERIAL PRIMARY KEY,
  source        TEXT NOT NULL CHECK (source IN ('shop', 'user')),  -- elanın mənbəyi (shop_products/user_products)
  listing_id    BIGINT NOT NULL,
  buyer_user_id BIGINT NOT NULL REFERENCES avto444.user(id),
  seller_type   TEXT NOT NULL CHECK (seller_type IN ('shop', 'user')),
  seller_id     BIGINT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, listing_id, buyer_user_id)
);

CREATE TABLE avto444.messages (
  id              BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES avto444.conversations(id),
  sender_type     TEXT NOT NULL CHECK (sender_type IN ('shop', 'user')),
  sender_id       BIGINT NOT NULL,
  body            TEXT NOT NULL,
  is_read         BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX messages_conversation_id_idx ON avto444.messages (conversation_id, created_at);
```

`seller_id`/`seller_type` konuşma yaradılışında elanın özündən (server-side) təyin olunur — istifadəçi tərəfindən göndərilmir, saxta dəyər riski yoxdur. `is_read`, mesajı GÖNDƏRƏN tərəfin əksi olan tərəf üçün ("qarşı tərəf oxumadı") mənasını daşıyır — `GET .../messages` çağırışı bu konuşmadakı, çağıranın özü göndərmədiyi bütün mesajları `is_read = true` edir.

## Backend

Yeni paket `internal/chat`:

- `Repository` interfeysi: `FindOrCreateConversation`, `ListMyConversations` (buyer və seller hər ikisi üçün, `who` parametri ilə), `GetConversation`, `ListMessages` (oxunmuş kimi işarələməklə), `SendMessage`, `CountUnread`.
- `Conversation` modeli: elanın başlığı/şəkli/qiyməti sorğu zamanı `shop_products`/`user_products`-dan join edilir ki, siyahıda "hansı elan haqqında" göstərilə bilsin.
- Handler-lər hər iki auth middleware-ə mount olunur:
  - `POST /api/users/me/conversations` `{source, listingId}` — `FindOrCreateConversation`, `buyer_user_id` = sessiyadan
  - `GET /api/users/me/conversations` — fərdi istifadəçi hər iki roldan konuşmalara sahib ola bilər (özü alıcı olduğu — `buyer_user_id = sessiyanın user id-si` — VƏ özünün elanına kimsə yazdığı — `seller_type = 'user' AND seller_id = sessiyanın user id-si`); bu endpoint hər iki dəstəni birləşdirib qaytarır
  - `GET /api/shops/me/conversations` — mağaza yalnız satıcı ola bilər (`seller_type = 'shop' AND seller_id = sessiyanın shop id-si`) — mağazanın konuşmaları həmişə bu tək sorğu ilə tapılır
  - `GET /api/{users|shops}/me/conversations/{id}/messages` — mülkiyyət yoxlaması (bu konuşmanın iki tərəfindən biri olduğunu təsdiqlə), mesajları qaytar, qarşı-tərəf-mesajlarını oxunmuş et
  - `POST /api/{users|shops}/me/conversations/{id}/messages` `{body}` — mülkiyyət yoxlaması, mesaj yarat
  - `GET /api/{users|shops}/me/conversations/unread-count` — badge üçün yüngül sayğac

## Frontend

- `src/api/chat.ts` — yeni, ayrıca API modulu (mövcud `api/auth.ts`/`api/shop.ts` pattern-i ilə eyni tərzdə), hər iki tərəf üçün funksiyalar (`startConversation`, `getMyConversations`, `getMessages`, `sendMessage`, `getUnreadCount`)
- `IndividualSellerCard`/`BusinessSellerCard`-ın "Mesaj yaz" düyməsi: kliklənəndə `startConversation({source, listingId})` çağırılır, nəticədə `/kabinet/mesajlarim?c={conversationId}` səhifəsinə yönləndirilir (fərdi istifadəçi sessiyası aktivdirsə; deyilsə `/giris`-ə yönləndirilir)
- `src/pages/kabinet/KabinetMesajlarim.tsx` — yeni səhifə, `KabinetLayout`-a tab olaraq əlavə olunur: sol panel konuşma siyahısı (hər biri elan başlığı+şəkli+qarşı tərəfin adı+son mesaj), sağ panel seçilən konuşmanın mesaj tarixçəsi + mesaj yazma qutusu, 4 saniyəlik polling
- `src/pages/shop/MyShopMesajlar.tsx` — eyni struktur, mağaza tərəfi üçün, `/magazam/mesajlar` route-u
- `KabinetLayout`/`MyShop`-un naviqasiyasına unread-count badge (4 saniyəlik polling ilə yenilənir)

## Test və yoxlama

- Backend: httptest — konuşma yaradılışı (eyni alıcı+elan ikinci dəfə eyni konuşmanı qaytarır, `UNIQUE` constraint-ə uyğun), mesaj göndərmə, mülkiyyət-yoxlaması rədd etməsi (üçüncü tərəf başqa konuşmaya mesaj yaza bilməməli), `is_read` düzgün işarələnməsi, unread-count düzgün hesablanması.
- Frontend: `npx tsc -b --noEmit`, `npm run build`, korrupsiya scan.
- Manual/live: real bir fərdi istifadəçi bir mağaza elanına "Mesaj yaz" ilə sual yazsın, mağaza `/magazam/mesajlar`-da mesajı görsün və cavab versin, istifadəçi `/kabinet/mesajlarim`-da cavabı görsün (polling ilə), unread badge-in hər iki tərəfdə düzgün işlədiyini təsdiqlə.
