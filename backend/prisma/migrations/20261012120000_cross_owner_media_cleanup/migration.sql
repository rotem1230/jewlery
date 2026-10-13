-- Before ownership checks existed, the id of someone else's upload could be attached as an avatar,
-- design thumbnail, jeweler logo, portfolio image or chat image, which published it or showed it
-- to strangers. Such cross-owner references are removed; a record's own uploads stay attached.
SET LOCAL lock_timeout = '10s';

UPDATE "users" AS u
SET "avatarUploadId" = NULL
FROM "uploads" AS up
WHERE up."id" = u."avatarUploadId" AND up."ownerUserId" <> u."id";

UPDATE "designs" AS d
SET "thumbnailUploadId" = NULL
FROM "uploads" AS up
WHERE up."id" = d."thumbnailUploadId" AND up."ownerUserId" <> d."ownerUserId";

UPDATE "jeweler_profiles" AS p
SET "logoUploadId" = NULL
FROM "uploads" AS up
WHERE up."id" = p."logoUploadId" AND up."ownerUserId" <> p."userId";

UPDATE "jeweler_onboarding_drafts" AS dr
SET "logoUploadId" = NULL
FROM "uploads" AS up
WHERE up."id" = dr."logoUploadId" AND up."ownerUserId" <> dr."userId";

-- A portfolio entry is only its image: an entry showing someone else's upload is removed.
DELETE FROM "portfolio_items" AS pi
USING "jeweler_profiles" AS p, "uploads" AS up
WHERE pi."profileId" = p."id" AND up."id" = pi."uploadId" AND up."ownerUserId" <> p."userId";

UPDATE "messages" AS m
SET "imageUploadId" = NULL
FROM "uploads" AS up
WHERE up."id" = m."imageUploadId" AND (m."senderId" IS NULL OR up."ownerUserId" <> m."senderId");
