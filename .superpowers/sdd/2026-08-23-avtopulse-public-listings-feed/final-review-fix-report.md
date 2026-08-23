# Final Review Fix Report — feature/public-listings-feed

Date: 2026-08-23

Three findings from the final whole-branch review were fixed.

## Finding 1: Image URL field inconsistency between card and detail

`src/pages/RealListingDetail.tsx` read `img.minioUrl` directly as the gallery
`<img>` `src`, with no S3-preferred fallback, unlike
`src/components/RealListingCard.tsx` (`image.s3Url || image.minioUrl`). Since
`ApiListingImage.minioUrl` is typed as potentially empty, this could produce a
broken image on the detail page in a case the card would have rendered fine.

Fix: changed the gallery `<img src>` in `RealListingDetail.tsx` to
`img.s3Url || img.minioUrl`, matching `RealListingCard.tsx`.

## Finding 2: Unstable/unsafe React key in RealListingDetail's image gallery

The gallery `.map()` used `key={img.minioUrl}`, which is not guaranteed unique
or non-empty. `ApiListingImage` has no image ID field.

Fix: changed the key to the map's array index (`listing.images.map((img, i) =>
... key={i} ...)`), which is stable and unique for this static,
non-reorderable list.

## Finding 3: No test asserted the user-listing privacy guarantee at the response-body level

`avtopulse-backend/internal/listings/handler_test.go` only asserted HTTP
status codes; nothing decoded the JSON body to confirm a user-sourced
listing's `sellerName` stays empty and `sellerType` stays `"şəxsi"` — the
core privacy guarantee of this feature.

Fix: added two new tests, reusing the existing `fakeShopRepo`/`fakeUserRepo`
fixtures:

- `TestPublicListings_UserListing_HidesIdentity` — calls `GET /`, decodes the
  body into `[]PublicListing`, finds the user-sourced item (`source == "user"`,
  `id == 5`), and asserts `SellerName == ""` and `SellerType == "şəxsi"`.
- `TestPublicListingDetail_ShopSource_ExposesShopIdentity` — calls
  `GET /shop/1`, decodes the body into `PublicListing`, and asserts
  `SellerName == "avto444"` and `SellerType == "diler"`.

## Verification

```
npx tsc -b --noEmit         # no output, passes
npm run build                # succeeds, vite build output produced
cd avtopulse-backend
go build ./...               # no output, passes
go test ./... -v             # all packages PASS, including the 2 new tests:
                              #   TestPublicListings_UserListing_HidesIdentity — PASS
                              #   TestPublicListingDetail_ShopSource_ExposesShopIdentity — PASS
```

All pre-existing tests continue to pass; no regressions observed.
