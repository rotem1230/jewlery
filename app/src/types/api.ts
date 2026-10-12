/**
 * Shared backend shapes (mirrors Prisma models / service DTOs).
 * Domain modules in `src/api/*` return these; screens map them to UI models.
 */

export type Region = {
  id: string
  code: string
  labelHe: string
  labelEn: string | null
}

export type UploadRef = {
  id: string
  bucket: string
  objectKey: string
  mimeType: string
  /** Presigned/absolute URL when the backend can serve the file. */
  url?: string | null
}

export type PortfolioItem = {
  id: string
  profileId: string
  uploadId: string
  title: string | null
  sortOrder: number
  isSelectedWork: boolean
  createdAt: string
  upload?: UploadRef | null
}

export type JewelerReview = {
  id: string
  jewelerProfileId: string
  reviewerName: string
  rating: number
  comment: string
  isFeatured: boolean
  createdAt: string
}

export type JewelerProfile = {
  id: string
  userId: string
  businessName: string
  bio: string | null
  phone: string
  email: string | null
  regionId: string
  region?: Region | null
  logoUploadId?: string | null
  logoUpload?: UploadRef | null
  portfolio: PortfolioItem[]
  reviews: JewelerReview[]
  ratingAvg: number | string
  reviewCount: number
  publishStatus: string
  verifiedBadge: boolean
}

export type SafeUser = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  phone?: string | null
  roles: Array<'DESIGNER' | 'JEWELER' | 'ADMIN'>
  activeRole: 'DESIGNER' | 'JEWELER' | 'ADMIN'
}

export type AuthTokens = {
  accessToken: string
  refreshToken: string
  expiresIn: string
}

export type AuthResult = {
  user: SafeUser
  tokens: AuthTokens
}

export type ChatPeerUser = {
  id: string
  firstName: string | null
  lastName: string | null
  avatarUploadId: string | null
}

export type ConversationDesign = {
  id: string
  title: string | null
  thumbnailUploadId: string | null
  status: string
}

export type ChatMessageSender = ChatPeerUser

export type QuoteSummary = {
  id: string
  conversationId: string
  designId: string
  designRequestId?: string | null
  authorUserId: string
  materialsCost: string | number
  laborCost: string | number
  laborHours?: string | number | null
  totalPrice: string | number
  currency: string
  etaBusinessDays: number
  notes?: string | null
  status: string
  validUntil?: string | null
  createdAt: string
  author?: { id: string; firstName: string | null; lastName: string | null } | null
  design?: { id: string; title: string | null; thumbnailUploadId: string | null; status: string } | null
  disclaimerPage?: { id: string; title: string; body: unknown } | null
}

export type ChatMessage = {
  id: string
  conversationId: string
  senderId: string | null
  type: 'TEXT' | 'IMAGE' | 'AUDIO' | 'QUOTE_CARD' | 'SYSTEM'
  body: string | null
  imageUploadId: string | null
  quoteId?: string | null
  quote?: QuoteSummary | null
  payload?: unknown
  createdAt: string
  sender?: ChatMessageSender | null
}

export type ConversationParticipant = {
  id: string
  conversationId: string
  userId: string
  lastReadAt: string | null
  user: ChatPeerUser
}

export type ConversationItem = {
  id: string
  designId: string
  createdAt: string
  updatedAt: string
  lastMessageAt: string | null
  design: ConversationDesign
  participants: ConversationParticipant[]
  lastMessage: ChatMessage | null
  unreadCount: number
}

export type Paginated<T> = {
  items: T[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

export type MessagePage = {
  items: ChatMessage[]
  nextCursor: string | null
}

export type ItemType = {
  id: string
  code: string
  labelHe: string
  labelEn: string | null
}

export type SizeChartRow = {
  id: string
  itemTypeId: string
  standard: string
  sizeCode: string
  diameterMinMm?: string | number | null
  diameterMaxMm?: string | number | null
  lengthCm?: string | number | null
  sortOrder: number
}

export type MetalPurity = {
  id: string
  metalId: string
  code: string
  labelHe: string | null
}

export type Metal = {
  id: string
  code: string
  labelHe: string
  labelEn: string | null
  purities: MetalPurity[]
}

export type MeasurementGuide = {
  id: string
  itemTypeId: string
  locale: string
  title: string
  body: unknown
}

export type AppNotification = {
  id: string
  eventKey: string
  title: string
  body: string
  payload?: { quoteId?: string; conversationId?: string } | null
  readAt?: string | null
  createdAt: string
}

export type GalleryItem = {
  id: string
  designId: string
  captionHe?: string | null
  design?: {
    id: string
    title: string | null
    status: string
    thumbnailUploadId: string | null
  } | null
}

export type HomeSummary = {
  role: string
  greeting?: { name: string | null }
  newRequests?: number
  inProgress?: number
  recentDesigns?: DesignListItem[]
  recentNotifications?: AppNotification[]
}

export type AtelierBanner = {
  id: string
  placement: string
  meta?: { headline?: string; cta?: string; imageUploadId?: string } | null
}

export type DesignStatus = 'DRAFT' | 'PUBLISHED' | 'COMPLETED' | 'ARCHIVED'

export type DesignListItem = {
  id: string
  title: string | null
  description: string | null
  status: DesignStatus
  thumbnailUploadId: string | null
  parameters: Record<string, unknown>
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  itemType?: ItemType | null
  quoteCount: number
  completedBy?: { id: string; name: string } | null
}

export type DesignTabCounts = {
  all: number
  drafts: number
  published: number
  completed: number
  archive: number
}

export type DesignListResponse = Paginated<DesignListItem> & { tabCounts: DesignTabCounts }

export type DesignDetail = DesignListItem & {
  ownerUserId: string
  itemTypeId: string
  preferredRegionId?: string | null
  version: number
  jewelerNotes?: string | null
  lockedFields?: string[]
  lockedAt?: string | null
  versions?: Array<{ id: string; versionNumber: number; status: string; createdAt: string }>
}

export type SettingItem = {
  id: string
  code: string
  labelHe: string
  labelEn: string | null
  minBandWidthMm?: string | number | null
  itemTypes?: Array<{ itemType?: ItemType | null; itemTypeId?: string }>
}

export type StoneOption = {
  id: string
  stoneId: string
  kind: string
  value: string
  labelHe: string | null
}

export type StoneItem = {
  id: string
  code: string
  nameHe: string
  nameEn: string | null
  options: StoneOption[]
}

export type ElementItem = {
  id: string
  code: string
  labelHe: string
  labelEn: string | null
}

export type DesignRequestStatus = 'OPEN' | 'QUOTE_SUBMITTED' | 'NEGOTIATING' | 'COMPLETED' | 'CANCELLED'

export type DesignRequest = {
  id: string
  designId: string
  requesterId: string
  mode: string
  status: DesignRequestStatus
  message: string | null
  createdAt: string
  design?: {
    id: string
    title: string | null
    thumbnailUploadId: string | null
    ownerUserId?: string
    itemType?: ItemType | null
    parameters?: Record<string, unknown>
    description?: string | null
  } | null
  requester?: { id: string; firstName: string | null; lastName: string | null } | null
  quotes?: QuoteSummary[]
  targets?: Array<{
    jewelerProfileId: string
    jewelerProfile?: { id: string; businessName: string; userId: string }
  }>
}

export type AtelierDesign = {
  id: string
  title: string | null
  description: string | null
  ownerUserId: string
  thumbnailUploadId: string | null
  publishedAt: string | null
  preferredRegionId: string | null
  parameters: Record<string, unknown>
  itemType?: ItemType | null
  preferredRegion?: Region | null
  sponsored?: boolean
}

export type AtelierJeweler = JewelerProfile & {
  matchScore?: number
}

export type PlanCatalog = {
  id: string
  code: string
  role: 'DESIGNER' | 'JEWELER' | 'ADMIN'
  nameHe: string
  nameEn: string | null
  billingCycle: string
  price: string | number
  currency: string
  leadQuota: number
  extraLeadPrice?: string | number | null
  trialDays: number
  inclusions: unknown
  sortOrder: number
}

export type SubscriptionMe = {
  id: string
  status: string
  plan?: PlanCatalog | null
  currentPeriodEnd?: string | null
} | null

export type ContentPage = {
  id: string
  slug: string
  locale: string
  title: string
  body: unknown
}

export type JewelerDraft = {
  id: string
  userId: string
  regionId?: string | null
  logoUploadId?: string | null
  payload: {
    businessName?: string
    bio?: string
    phone?: string
    email?: string
    specialties?: string[]
  } | null
}
