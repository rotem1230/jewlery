-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('PASSWORD', 'GOOGLE', 'APPLE');

-- CreateEnum
CREATE TYPE "DesignStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FeasibilityStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DesignAssetKind" AS ENUM ('ELEMENT', 'INSPIRATION', 'THUMBNAIL', 'RENDER', 'AI_INSPIRATION', 'EXPORT');

-- CreateEnum
CREATE TYPE "DesignRequestStatus" AS ENUM ('OPEN', 'QUOTE_SUBMITTED', 'NEGOTIATING', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DesignRequestMode" AS ENUM ('TARGETED', 'BROADCAST');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'QUOTE_CARD', 'SYSTEM', 'IMAGE');

-- CreateEnum
CREATE TYPE "ProfilePublishStatus" AS ENUM ('DRAFT', 'PREVIEW_READY', 'PENDING_REVIEW', 'PUBLISHED', 'UNPUBLISHED');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'ANNUAL', 'PER_ITEM', 'PER_LEAD');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'CONSUMED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('PENDING', 'READY', 'FAILED', 'QUARANTINED', 'DELETED');

-- CreateEnum
CREATE TYPE "PromotionSource" AS ENUM ('PAID_PLACEMENT', 'SUBSCRIPTION_PERK');

-- CreateEnum
CREATE TYPE "PromotionEntityType" AS ENUM ('DESIGN', 'JEWELER', 'BANNER');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('PUSH', 'EMAIL', 'IN_APP');

-- CreateEnum
CREATE TYPE "ContentPageStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "authProvider" "AuthProvider" NOT NULL DEFAULT 'PASSWORD',
ADD COLUMN     "authProviderSub" TEXT,
ADD COLUMN     "avatarUploadId" UUID,
ADD COLUMN     "phone" TEXT,
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "familyId" UUID;
UPDATE "refresh_tokens" SET "familyId" = gen_random_uuid() WHERE "familyId" IS NULL;
ALTER TABLE "refresh_tokens" ALTER COLUMN "familyId" SET NOT NULL;

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'he',
    "preferredSizeStandard" TEXT,
    "preferredRingSizeCode" TEXT,
    "notifyPushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "notifyEmailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "notifyChatEnabled" BOOLEAN NOT NULL DEFAULT true,
    "notifyMarketingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "appVersion" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploads" (
    "id" UUID NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "bucket" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" TEXT,
    "status" "UploadStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_configs" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_pages" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'he',
    "title" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "status" "ContentPageStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rolloutPct" INTEGER NOT NULL DEFAULT 100,
    "audience" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "labelHe" TEXT NOT NULL,
    "labelEn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_message_templates" (
    "id" UUID NOT NULL,
    "eventKey" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'he',
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" UUID NOT NULL,
    "eventKey" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'he',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "eventKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_logs" (
    "id" UUID NOT NULL,
    "eventKey" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseCode" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "labelHe" TEXT NOT NULL,
    "labelEn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "item_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_type_configs" (
    "id" UUID NOT NULL,
    "itemTypeId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "steps" JSONB NOT NULL,
    "parametersSchema" JSONB NOT NULL,
    "lockFields" TEXT[],
    "compatibilityRules" JSONB NOT NULL,
    "defaults" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_type_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "size_charts" (
    "id" UUID NOT NULL,
    "itemTypeId" UUID NOT NULL,
    "standard" TEXT NOT NULL,
    "sizeCode" TEXT NOT NULL,
    "diameterMinMm" DECIMAL(6,2),
    "diameterMaxMm" DECIMAL(6,2),
    "lengthCm" DECIMAL(6,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "size_charts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurement_guides" (
    "id" UUID NOT NULL,
    "itemTypeId" UUID NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'he',
    "title" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "measurement_guides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "earring_styles" (
    "id" UUID NOT NULL,
    "itemTypeId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "labelHe" TEXT NOT NULL,
    "labelEn" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "earring_styles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metals" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "labelHe" TEXT NOT NULL,
    "labelEn" TEXT,
    "priceModifier" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "metals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metal_purities" (
    "id" UUID NOT NULL,
    "metalId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "labelHe" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "metal_purities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "labelHe" TEXT NOT NULL,
    "labelEn" TEXT,
    "minBandWidthMm" DECIMAL(6,2),
    "imageUploadId" UUID,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setting_item_types" (
    "settingId" UUID NOT NULL,
    "itemTypeId" UUID NOT NULL,

    CONSTRAINT "setting_item_types_pkey" PRIMARY KEY ("settingId","itemTypeId")
);

-- CreateTable
CREATE TABLE "stones" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameHe" TEXT NOT NULL,
    "nameEn" TEXT,
    "imageUploadId" UUID,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "stones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stone_options" (
    "id" UUID NOT NULL,
    "stoneId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "labelHe" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "stone_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finish_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "labelHe" TEXT NOT NULL,
    "labelEn" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "finish_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "element_catalog" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "labelHe" TEXT NOT NULL,
    "labelEn" TEXT,
    "imageUploadId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "element_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "designs" (
    "id" UUID NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "itemTypeId" UUID NOT NULL,
    "preferredRegionId" UUID,
    "title" TEXT,
    "description" TEXT,
    "status" "DesignStatus" NOT NULL DEFAULT 'DRAFT',
    "parameters" JSONB NOT NULL,
    "parametersSchemaVersion" INTEGER NOT NULL DEFAULT 1,
    "jewelerNotes" TEXT,
    "thumbnailUploadId" UUID,
    "lockedAt" TIMESTAMP(3),
    "lockedFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "feasibilityStatus" "FeasibilityStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "feasibilityReviewedAt" TIMESTAMP(3),
    "feasibilityReviewerId" UUID,
    "publishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedByJewelerId" UUID,
    "acceptedQuoteId" UUID,
    "isCurated" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "designs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "design_versions" (
    "id" UUID NOT NULL,
    "designId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "DesignStatus" NOT NULL,
    "parameters" JSONB NOT NULL,
    "jewelerNotes" TEXT,
    "createdById" UUID NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "design_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "design_assets" (
    "id" UUID NOT NULL,
    "designId" UUID NOT NULL,
    "uploadId" UUID NOT NULL,
    "kind" "DesignAssetKind" NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "design_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gallery_items" (
    "id" UUID NOT NULL,
    "designId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "captionHe" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gallery_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "render_jobs" (
    "id" UUID NOT NULL,
    "designId" UUID NOT NULL,
    "designVersionId" UUID NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "providerRef" TEXT,
    "outputUploadId" UUID,
    "exportFormat" TEXT,
    "applyWatermark" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "render_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_generation_jobs" (
    "id" UUID NOT NULL,
    "designId" UUID,
    "requestedById" UUID NOT NULL,
    "prompt" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "outputUploadId" UUID,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ai_generation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visualization_jobs" (
    "id" UUID NOT NULL,
    "designId" UUID NOT NULL,
    "requestedById" UUID NOT NULL,
    "inputUploadId" UUID NOT NULL,
    "outputUploadId" UUID,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "retentionExpiresAt" TIMESTAMP(3) NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "visualization_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jeweler_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "businessName" TEXT NOT NULL,
    "regionId" UUID NOT NULL,
    "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bio" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "businessHours" JSONB,
    "serviceAreaText" TEXT,
    "logoUploadId" UUID,
    "ratingAvg" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "publishStatus" "ProfilePublishStatus" NOT NULL DEFAULT 'DRAFT',
    "verifiedBadge" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jeweler_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jeweler_crm_notes" (
    "id" UUID NOT NULL,
    "jewelerProfileId" UUID NOT NULL,
    "designRequestId" UUID,
    "body" TEXT NOT NULL,
    "productionStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jeweler_crm_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jeweler_onboarding_drafts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "regionId" UUID,
    "logoUploadId" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jeweler_onboarding_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_items" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "uploadId" UUID NOT NULL,
    "title" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isSelectedWork" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "jewelerProfileId" UUID NOT NULL,
    "authorUserId" UUID,
    "reviewerName" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "design_requests" (
    "id" UUID NOT NULL,
    "designId" UUID NOT NULL,
    "requesterId" UUID NOT NULL,
    "mode" "DesignRequestMode" NOT NULL,
    "status" "DesignRequestStatus" NOT NULL DEFAULT 'OPEN',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "design_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "design_request_targets" (
    "requestId" UUID NOT NULL,
    "jewelerProfileId" UUID NOT NULL,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "design_request_targets_pkey" PRIMARY KEY ("requestId","jewelerProfileId")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" UUID NOT NULL,
    "entityType" "PromotionEntityType" NOT NULL,
    "entityId" UUID NOT NULL,
    "placement" TEXT NOT NULL,
    "source" "PromotionSource" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "budget" DECIMAL(12,2),
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "designId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3),

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_participants" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "lastReadAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "senderId" UUID,
    "type" "MessageType" NOT NULL,
    "body" TEXT,
    "payload" JSONB,
    "quoteId" UUID,
    "imageUploadId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "designId" UUID NOT NULL,
    "designRequestId" UUID,
    "authorUserId" UUID NOT NULL,
    "materialsCost" DECIMAL(12,2) NOT NULL,
    "laborCost" DECIMAL(12,2) NOT NULL,
    "laborHours" DECIMAL(8,2),
    "totalPrice" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "etaBusinessDays" INTEGER NOT NULL,
    "notes" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'PENDING',
    "validUntil" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "disclaimerPageId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_events" (
    "id" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "fromStatus" "QuoteStatus",
    "toStatus" "QuoteStatus" NOT NULL,
    "actorUserId" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entitlement_definitions" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "entitlement_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_catalog" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "nameHe" TEXT NOT NULL,
    "nameEn" TEXT,
    "billingCycle" "BillingCycle" NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "leadQuota" INTEGER NOT NULL DEFAULT 0,
    "extraLeadPrice" DECIMAL(12,2),
    "trialDays" INTEGER NOT NULL DEFAULT 0,
    "inclusions" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,

    CONSTRAINT "plan_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_entitlements" (
    "planId" UUID NOT NULL,
    "entitlementId" UUID NOT NULL,
    "limitValue" INTEGER,

    CONSTRAINT "plan_entitlements_pkey" PRIMARY KEY ("planId","entitlementId")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "billingCycle" "BillingCycle" NOT NULL,
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "paymentProviderRef" TEXT,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "sourceRequestId" UUID,
    "status" "LeadStatus" NOT NULL DEFAULT 'AVAILABLE',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "reservedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "extraLeadPrice" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_overage_charges" (
    "id" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "leadId" UUID,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "providerRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_overage_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL,
    "subscriptionId" UUID,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_events" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "subscriptionId" UUID,
    "designId" UUID,
    "meterKey" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2),
    "currency" CHAR(3),
    "providerRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_tokenHash_key" ON "email_verification_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "email_verification_tokens_userId_idx" ON "email_verification_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_userId_key" ON "user_preferences"("userId");

-- CreateIndex
CREATE INDEX "device_tokens_userId_idx" ON "device_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_userId_token_key" ON "device_tokens"("userId", "token");

-- CreateIndex
CREATE INDEX "uploads_ownerUserId_status_idx" ON "uploads"("ownerUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uploads_bucket_objectKey_key" ON "uploads"("bucket", "objectKey");

-- CreateIndex
CREATE UNIQUE INDEX "app_configs_key_key" ON "app_configs"("key");

-- CreateIndex
CREATE INDEX "content_pages_slug_locale_status_idx" ON "content_pages"("slug", "locale", "status");

-- CreateIndex
CREATE UNIQUE INDEX "content_pages_slug_locale_version_key" ON "content_pages"("slug", "locale", "version");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_key_key" ON "feature_flags"("key");

-- CreateIndex
CREATE UNIQUE INDEX "regions_code_key" ON "regions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "system_message_templates_eventKey_locale_key" ON "system_message_templates"("eventKey", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_eventKey_channel_locale_key" ON "notification_templates"("eventKey", "channel", "locale");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_createdAt_idx" ON "notifications"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_actorUserId_createdAt_idx" ON "audit_logs"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "event_logs_eventKey_createdAt_idx" ON "event_logs"("eventKey", "createdAt");

-- CreateIndex
CREATE INDEX "event_logs_entityType_entityId_idx" ON "event_logs"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_userId_key_key" ON "idempotency_keys"("userId", "key");

-- CreateIndex
CREATE INDEX "outbox_events_processedAt_createdAt_idx" ON "outbox_events"("processedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "item_types_code_key" ON "item_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "item_type_configs_itemTypeId_key" ON "item_type_configs"("itemTypeId");

-- CreateIndex
CREATE INDEX "size_charts_itemTypeId_standard_idx" ON "size_charts"("itemTypeId", "standard");

-- CreateIndex
CREATE UNIQUE INDEX "size_charts_itemTypeId_standard_sizeCode_key" ON "size_charts"("itemTypeId", "standard", "sizeCode");

-- CreateIndex
CREATE UNIQUE INDEX "measurement_guides_itemTypeId_locale_key" ON "measurement_guides"("itemTypeId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "earring_styles_itemTypeId_code_key" ON "earring_styles"("itemTypeId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "metals_code_key" ON "metals"("code");

-- CreateIndex
CREATE UNIQUE INDEX "metal_purities_metalId_code_key" ON "metal_purities"("metalId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "settings_code_key" ON "settings"("code");

-- CreateIndex
CREATE UNIQUE INDEX "stones_code_key" ON "stones"("code");

-- CreateIndex
CREATE INDEX "stone_options_stoneId_kind_idx" ON "stone_options"("stoneId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "stone_options_stoneId_kind_value_key" ON "stone_options"("stoneId", "kind", "value");

-- CreateIndex
CREATE UNIQUE INDEX "finish_types_code_key" ON "finish_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "element_catalog_code_key" ON "element_catalog"("code");

-- CreateIndex
CREATE UNIQUE INDEX "designs_acceptedQuoteId_key" ON "designs"("acceptedQuoteId");

-- CreateIndex
CREATE INDEX "designs_ownerUserId_status_idx" ON "designs"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX "designs_status_publishedAt_idx" ON "designs"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "designs_itemTypeId_idx" ON "designs"("itemTypeId");

-- CreateIndex
CREATE INDEX "designs_preferredRegionId_status_idx" ON "designs"("preferredRegionId", "status");

-- CreateIndex
CREATE INDEX "designs_expiresAt_idx" ON "designs"("expiresAt");

-- CreateIndex
CREATE INDEX "design_versions_designId_createdAt_idx" ON "design_versions"("designId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "design_versions_designId_versionNumber_key" ON "design_versions"("designId", "versionNumber");

-- CreateIndex
CREATE INDEX "design_assets_designId_kind_idx" ON "design_assets"("designId", "kind");

-- CreateIndex
CREATE INDEX "gallery_items_isActive_sortOrder_idx" ON "gallery_items"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "render_jobs_status_priority_createdAt_idx" ON "render_jobs"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "render_jobs_designId_status_idx" ON "render_jobs"("designId", "status");

-- CreateIndex
CREATE INDEX "ai_generation_jobs_requestedById_createdAt_idx" ON "ai_generation_jobs"("requestedById", "createdAt");

-- CreateIndex
CREATE INDEX "visualization_jobs_requestedById_status_idx" ON "visualization_jobs"("requestedById", "status");

-- CreateIndex
CREATE INDEX "visualization_jobs_retentionExpiresAt_idx" ON "visualization_jobs"("retentionExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "jeweler_profiles_userId_key" ON "jeweler_profiles"("userId");

-- CreateIndex
CREATE INDEX "jeweler_profiles_regionId_publishStatus_idx" ON "jeweler_profiles"("regionId", "publishStatus");

-- CreateIndex
CREATE INDEX "jeweler_profiles_publishStatus_ratingAvg_idx" ON "jeweler_profiles"("publishStatus", "ratingAvg");

-- CreateIndex
CREATE INDEX "jeweler_crm_notes_jewelerProfileId_updatedAt_idx" ON "jeweler_crm_notes"("jewelerProfileId", "updatedAt");

-- CreateIndex
CREATE INDEX "jeweler_crm_notes_designRequestId_idx" ON "jeweler_crm_notes"("designRequestId");

-- CreateIndex
CREATE INDEX "jeweler_onboarding_drafts_userId_idx" ON "jeweler_onboarding_drafts"("userId");

-- CreateIndex
CREATE INDEX "portfolio_items_profileId_sortOrder_idx" ON "portfolio_items"("profileId", "sortOrder");

-- CreateIndex
CREATE INDEX "reviews_jewelerProfileId_isFeatured_idx" ON "reviews"("jewelerProfileId", "isFeatured");

-- CreateIndex
CREATE INDEX "design_requests_requesterId_status_idx" ON "design_requests"("requesterId", "status");

-- CreateIndex
CREATE INDEX "design_requests_designId_status_idx" ON "design_requests"("designId", "status");

-- CreateIndex
CREATE INDEX "design_requests_status_createdAt_idx" ON "design_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "design_request_targets_jewelerProfileId_deliveredAt_idx" ON "design_request_targets"("jewelerProfileId", "deliveredAt");

-- CreateIndex
CREATE INDEX "promotions_placement_isActive_startAt_endAt_idx" ON "promotions"("placement", "isActive", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "conversations_designId_idx" ON "conversations"("designId");

-- CreateIndex
CREATE INDEX "conversations_lastMessageAt_idx" ON "conversations"("lastMessageAt");

-- CreateIndex
CREATE INDEX "conversation_participants_userId_idx" ON "conversation_participants"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_participants_conversationId_userId_key" ON "conversation_participants"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "quotes_designId_status_idx" ON "quotes"("designId", "status");

-- CreateIndex
CREATE INDEX "quotes_authorUserId_status_idx" ON "quotes"("authorUserId", "status");

-- CreateIndex
CREATE INDEX "quotes_conversationId_idx" ON "quotes"("conversationId");

-- CreateIndex
CREATE INDEX "quote_events_quoteId_createdAt_idx" ON "quote_events"("quoteId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "entitlement_definitions_key_key" ON "entitlement_definitions"("key");

-- CreateIndex
CREATE UNIQUE INDEX "plan_catalog_code_key" ON "plan_catalog"("code");

-- CreateIndex
CREATE INDEX "plan_catalog_role_isActive_idx" ON "plan_catalog"("role", "isActive");

-- CreateIndex
CREATE INDEX "subscriptions_userId_status_idx" ON "subscriptions"("userId", "status");

-- CreateIndex
CREATE INDEX "subscriptions_planId_idx" ON "subscriptions"("planId");

-- CreateIndex
CREATE INDEX "leads_subscriptionId_status_periodStart_idx" ON "leads"("subscriptionId", "status", "periodStart");

-- CreateIndex
CREATE INDEX "leads_sourceRequestId_idx" ON "leads"("sourceRequestId");

-- CreateIndex
CREATE INDEX "lead_overage_charges_subscriptionId_createdAt_idx" ON "lead_overage_charges"("subscriptionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_providerEventId_key" ON "payment_events"("providerEventId");

-- CreateIndex
CREATE INDEX "payment_events_subscriptionId_idx" ON "payment_events"("subscriptionId");

-- CreateIndex
CREATE INDEX "usage_events_userId_meterKey_createdAt_idx" ON "usage_events"("userId", "meterKey", "createdAt");

-- CreateIndex
CREATE INDEX "usage_events_subscriptionId_idx" ON "usage_events"("subscriptionId");

-- CreateIndex
CREATE INDEX "users_phone_idx" ON "users"("phone");

-- CreateIndex
CREATE INDEX "refresh_tokens_familyId_idx" ON "refresh_tokens"("familyId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_avatarUploadId_fkey" FOREIGN KEY ("avatarUploadId") REFERENCES "uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_type_configs" ADD CONSTRAINT "item_type_configs_itemTypeId_fkey" FOREIGN KEY ("itemTypeId") REFERENCES "item_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "size_charts" ADD CONSTRAINT "size_charts_itemTypeId_fkey" FOREIGN KEY ("itemTypeId") REFERENCES "item_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurement_guides" ADD CONSTRAINT "measurement_guides_itemTypeId_fkey" FOREIGN KEY ("itemTypeId") REFERENCES "item_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earring_styles" ADD CONSTRAINT "earring_styles_itemTypeId_fkey" FOREIGN KEY ("itemTypeId") REFERENCES "item_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metal_purities" ADD CONSTRAINT "metal_purities_metalId_fkey" FOREIGN KEY ("metalId") REFERENCES "metals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setting_item_types" ADD CONSTRAINT "setting_item_types_settingId_fkey" FOREIGN KEY ("settingId") REFERENCES "settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setting_item_types" ADD CONSTRAINT "setting_item_types_itemTypeId_fkey" FOREIGN KEY ("itemTypeId") REFERENCES "item_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stone_options" ADD CONSTRAINT "stone_options_stoneId_fkey" FOREIGN KEY ("stoneId") REFERENCES "stones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designs" ADD CONSTRAINT "designs_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designs" ADD CONSTRAINT "designs_itemTypeId_fkey" FOREIGN KEY ("itemTypeId") REFERENCES "item_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designs" ADD CONSTRAINT "designs_preferredRegionId_fkey" FOREIGN KEY ("preferredRegionId") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designs" ADD CONSTRAINT "designs_completedByJewelerId_fkey" FOREIGN KEY ("completedByJewelerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designs" ADD CONSTRAINT "designs_feasibilityReviewerId_fkey" FOREIGN KEY ("feasibilityReviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designs" ADD CONSTRAINT "designs_acceptedQuoteId_fkey" FOREIGN KEY ("acceptedQuoteId") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_versions" ADD CONSTRAINT "design_versions_designId_fkey" FOREIGN KEY ("designId") REFERENCES "designs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_assets" ADD CONSTRAINT "design_assets_designId_fkey" FOREIGN KEY ("designId") REFERENCES "designs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_assets" ADD CONSTRAINT "design_assets_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "uploads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gallery_items" ADD CONSTRAINT "gallery_items_designId_fkey" FOREIGN KEY ("designId") REFERENCES "designs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "render_jobs" ADD CONSTRAINT "render_jobs_designId_fkey" FOREIGN KEY ("designId") REFERENCES "designs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "render_jobs" ADD CONSTRAINT "render_jobs_designVersionId_fkey" FOREIGN KEY ("designVersionId") REFERENCES "design_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "render_jobs" ADD CONSTRAINT "render_jobs_outputUploadId_fkey" FOREIGN KEY ("outputUploadId") REFERENCES "uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_designId_fkey" FOREIGN KEY ("designId") REFERENCES "designs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_outputUploadId_fkey" FOREIGN KEY ("outputUploadId") REFERENCES "uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visualization_jobs" ADD CONSTRAINT "visualization_jobs_designId_fkey" FOREIGN KEY ("designId") REFERENCES "designs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visualization_jobs" ADD CONSTRAINT "visualization_jobs_inputUploadId_fkey" FOREIGN KEY ("inputUploadId") REFERENCES "uploads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visualization_jobs" ADD CONSTRAINT "visualization_jobs_outputUploadId_fkey" FOREIGN KEY ("outputUploadId") REFERENCES "uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jeweler_profiles" ADD CONSTRAINT "jeweler_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jeweler_profiles" ADD CONSTRAINT "jeweler_profiles_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jeweler_profiles" ADD CONSTRAINT "jeweler_profiles_logoUploadId_fkey" FOREIGN KEY ("logoUploadId") REFERENCES "uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jeweler_crm_notes" ADD CONSTRAINT "jeweler_crm_notes_jewelerProfileId_fkey" FOREIGN KEY ("jewelerProfileId") REFERENCES "jeweler_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jeweler_crm_notes" ADD CONSTRAINT "jeweler_crm_notes_designRequestId_fkey" FOREIGN KEY ("designRequestId") REFERENCES "design_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jeweler_onboarding_drafts" ADD CONSTRAINT "jeweler_onboarding_drafts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jeweler_onboarding_drafts" ADD CONSTRAINT "jeweler_onboarding_drafts_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jeweler_onboarding_drafts" ADD CONSTRAINT "jeweler_onboarding_drafts_logoUploadId_fkey" FOREIGN KEY ("logoUploadId") REFERENCES "uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_items" ADD CONSTRAINT "portfolio_items_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "jeweler_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_items" ADD CONSTRAINT "portfolio_items_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "uploads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_jewelerProfileId_fkey" FOREIGN KEY ("jewelerProfileId") REFERENCES "jeweler_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_requests" ADD CONSTRAINT "design_requests_designId_fkey" FOREIGN KEY ("designId") REFERENCES "designs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_requests" ADD CONSTRAINT "design_requests_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_request_targets" ADD CONSTRAINT "design_request_targets_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "design_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_request_targets" ADD CONSTRAINT "design_request_targets_jewelerProfileId_fkey" FOREIGN KEY ("jewelerProfileId") REFERENCES "jeweler_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_designId_fkey" FOREIGN KEY ("designId") REFERENCES "designs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_imageUploadId_fkey" FOREIGN KEY ("imageUploadId") REFERENCES "uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_designId_fkey" FOREIGN KEY ("designId") REFERENCES "designs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_designRequestId_fkey" FOREIGN KEY ("designRequestId") REFERENCES "design_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_disclaimerPageId_fkey" FOREIGN KEY ("disclaimerPageId") REFERENCES "content_pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_events" ADD CONSTRAINT "quote_events_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_entitlements" ADD CONSTRAINT "plan_entitlements_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plan_catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_entitlements" ADD CONSTRAINT "plan_entitlements_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "entitlement_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plan_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_sourceRequestId_fkey" FOREIGN KEY ("sourceRequestId") REFERENCES "design_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_overage_charges" ADD CONSTRAINT "lead_overage_charges_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_designId_fkey" FOREIGN KEY ("designId") REFERENCES "designs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
