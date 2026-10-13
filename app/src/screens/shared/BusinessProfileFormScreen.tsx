import { useEffect, useState } from 'react'
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { ChevronDown } from 'lucide-react-native'
import { ScreenTopBar } from '@/src/components/layout/ScreenTopBar'
import { Field } from '@/src/components/ui/Field'
import { Button } from '@/src/components/ui/Button'
import { ErrorState } from '@/src/components/ui/ErrorState'
import { GalleryImagePicker, type GalleryImageItem } from '@/src/components/jeweler/GalleryImagePicker'
import { SelectableReviewCard } from '@/src/components/jeweler/SelectableReviewCard'
import { BusinessHoursEditor } from '@/src/components/jeweler/BusinessHoursEditor'
import {
  addPortfolioItem,
  getMyBusinessProfile,
  publishJewelerProfile,
  removePortfolioItem,
  upsertJewelerDraft,
} from '@/src/api/jewelerProfiles'
import {
  DAY_LABEL_KEYS,
  draftPayload,
  hoursFormFromProfile,
  validateHours,
  type DayHours,
  type HoursError,
} from '@/src/lib/businessHours'
import { featureReview, listMyReviews } from '@/src/api/reviews'
import { listRegions } from '@/src/api/masterData'
import { uploadChatFile } from '@/src/api/uploads'
import { pickChatPhoto } from '@/src/lib/chatAttachments'
import { parseApiError } from '@/src/lib/api'
import { formatHeTimeAgo } from '@/src/hooks/useMyBusinessProfile'
import { uploadContentUrl } from '@/src/api/uploads'
import { mediaUrl } from '@/src/lib/media'
import { FilterOptionsSheet } from '@/src/components/chats/FilterOptionsSheet'
import { colors, radii } from '@/src/theme/tokens'
import { useTranslation } from '@/src/i18n'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import { useAppSelector } from '@/src/store/hooks'
import { isValidEmail, toE164Phone } from '@/src/lib/validation'
import type { ProfileStackParamList } from '@/src/navigation/types'
import type { BusinessHour, JewelerReview, Region } from '@/src/types/api'

type Nav = NativeStackNavigationProp<ProfileStackParamList, 'BusinessProfileForm'>
type Route = RouteProp<ProfileStackParamList, 'BusinessProfileForm'>

type GalleryEntry = GalleryImageItem & { uploadId?: string; persisted?: boolean }

/**
 * Figma "בניית פרופיל" / "עריכת פרופיל" — draft upsert, gallery upload, featured reviews.
 */
export function BusinessProfileFormScreen() {
  const { t, locale } = useTranslation()
  const navigation = useNavigation<Nav>()
  const route = useRoute<Route>()
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const isEditRoute = route.params.mode === 'edit'

  const profileQuery = useAsyncData((signal) => getMyBusinessProfile(signal), { deps: [accessToken] })
  const regionsQuery = useAsyncData((signal) => listRegions(signal), { deps: [] })
  const raw = profileQuery.data
  const isEdit = isEditRoute && Boolean(raw?.id)
  const profileId = raw?.id

  // The owner's own reviews (also while the profile is offline), not the public listing.
  const reviewsQuery = useAsyncData(
    (signal) => (profileId ? listMyReviews(signal) : Promise.resolve({ items: [] as JewelerReview[], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 } })),
    { deps: [profileId], immediate: Boolean(profileId) },
  )

  const [name, setName] = useState('')
  const [regionId, setRegionId] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [bio, setBio] = useState('')
  const [hours, setHours] = useState<DayHours[]>(() => hoursFormFromProfile(null))
  const [hoursErrors, setHoursErrors] = useState<Partial<Record<number, HoursError>>>({})
  const [serviceArea, setServiceArea] = useState('')
  const [gallery, setGallery] = useState<GalleryEntry[]>([])
  const [featuredReviewIds, setFeaturedReviewIds] = useState<string[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [busy, setBusy] = useState(false)
  const [regionOpen, setRegionOpen] = useState(false)
  const [logoUploadId, setLogoUploadId] = useState<string | null>(null)
  /** Signed link for the (private until published) logo, from the API. */
  const [logoLink, setLogoLink] = useState<string | null>(null)
  const [errors, setErrors] = useState<{
    name?: string
    region?: string
    phone?: string
    email?: string
  }>({})

  const regions: Region[] = regionsQuery.data ?? []

  useEffect(() => {
    if (hydrated || profileQuery.loading) return
    if (raw) {
      setName(raw.businessName ?? '')
      setRegionId(raw.regionId ?? raw.region?.id ?? null)
      setPhone(raw.phone ?? '')
      setEmail(raw.email ?? '')
      setBio(raw.bio ?? '')
      setHours(hoursFormFromProfile(raw.businessHours))
      setServiceArea(raw.serviceAreaText ?? '')
      setLogoUploadId(raw.logoUploadId ?? raw.logoUpload?.id ?? null)
      setLogoLink(raw.logoUrl ?? null)
      setGallery(
        raw.portfolio.map((item) => ({
          id: item.id,
          image: item.contentUrl
            ? { uri: mediaUrl(item.contentUrl) }
            : item.uploadId
              ? { uri: uploadContentUrl(item.uploadId) }
              : { uri: item.upload?.url ?? '' },
          uploadId: item.uploadId,
          persisted: true,
        })),
      )
      setFeaturedReviewIds(raw.reviews.filter((r) => r.isFeatured).map((r) => r.id))
    }
    setHydrated(true)
  }, [hydrated, profileQuery.loading, raw])

  useEffect(() => {
    const items = reviewsQuery.data?.items
    if (!items) return
    setFeaturedReviewIds(items.filter((r) => r.isFeatured).map((r) => r.id))
  }, [reviewsQuery.data])

  const regionLabel =
    regions.find((r) => r.id === regionId)?.labelHe ?? t('businessProfileRegionLabel')

  const addGalleryImage = async () => {
    try {
      const file = await pickChatPhoto()
      if (!file) return
      const upload = await uploadChatFile(file)
      setGallery((prev) => [
        ...prev,
        {
          id: `local-${upload.id}`,
          image: { uri: mediaUrl(upload.contentUrl) ?? uploadContentUrl(upload.id) },
          uploadId: upload.id,
          persisted: false,
        },
      ])
    } catch (err) {
      Alert.alert(t('authErrorTitle'), parseApiError(err))
    }
  }

  const removeGalleryImage = async (id: string) => {
    const item = gallery.find((g) => g.id === id)
    setGallery((prev) => prev.filter((g) => g.id !== id))
    if (item?.persisted) {
      try {
        await removePortfolioItem(id)
      } catch (err) {
        Alert.alert(t('authErrorTitle'), parseApiError(err))
      }
    }
  }

  const toggleReview = async (id: string) => {
    const next = featuredReviewIds.includes(id)
      ? featuredReviewIds.filter((r) => r !== id)
      : [...featuredReviewIds, id]
    setFeaturedReviewIds(next)
    try {
      await featureReview(id, next.includes(id))
    } catch (err) {
      Alert.alert(t('authErrorTitle'), parseApiError(err))
    }
  }

  const pickLogo = async () => {
    try {
      const file = await pickChatPhoto()
      if (!file) return
      const upload = await uploadChatFile(file)
      setLogoUploadId(upload.id)
      setLogoLink(upload.contentUrl ?? null)
    } catch (err) {
      Alert.alert(t('authErrorTitle'), parseApiError(err))
    }
  }

  /** Saves the draft, and the new gallery pictures when the profile exists; true when it saved them. */
  const persistDraftAndGallery = async (e164: string, businessHours: BusinessHour[]): Promise<boolean> => {
    await upsertJewelerDraft({
      // The whole draft: what the form edits, plus the specialties it does not, so saving keeps them.
      payload: draftPayload({
        businessName: name,
        bio,
        phone: e164,
        email,
        businessHours,
        serviceAreaText: serviceArea,
        specialties: raw?.specialties,
      }),
      regionId: regionId ?? undefined,
      logoUploadId: logoUploadId ?? undefined,
    })
    if (!raw?.id) {
      return false
    }
    const pending = gallery.filter((g) => !g.persisted && g.uploadId)
    for (const [index, item] of pending.entries()) {
      await addPortfolioItem({
        uploadId: item.uploadId as string,
        sortOrder: gallery.length + index,
      })
    }
    setGallery((prev) => prev.map((g) => ({ ...g, persisted: true })))
    return true
  }

  const onSubmit = async () => {
    const trimmedEmail = email.trim()
    const e164 = toE164Phone(phone)
    const next: typeof errors = {}
    if (!name.trim()) next.name = t('validationRequired')
    if (!regionId) next.region = t('validationRegion')
    if (!phone.trim()) next.phone = t('validationRequired')
    else if (!e164) next.phone = t('validationPhone')
    if (trimmedEmail && !isValidEmail(trimmedEmail)) next.email = t('validationEmail')
    const checkedHours = validateHours(hours)
    setErrors(next)
    setHoursErrors(checkedHours.errors)
    if (Object.keys(next).length > 0 || Object.keys(checkedHours.errors).length > 0 || !e164) return
    setBusy(true)
    try {
      const gallerySaved = await persistDraftAndGallery(e164, checkedHours.hours)
      if (isEdit) {
        await publishJewelerProfile()
        navigation.navigate('BusinessProfileView')
      } else {
        // The preview screen loads the saved draft as it would be published.
        navigation.navigate('BusinessProfilePreview', {
          name: name.trim(),
          about: bio.trim(),
          gallery: gallery.map((g) => ({
            id: g.id,
            uri: typeof g.image === 'object' && g.image && 'uri' in g.image ? g.image.uri : undefined,
            title: name.trim(),
            uploadId: g.uploadId,
            persisted: gallerySaved || g.persisted,
          })),
        })
      }
    } catch (err) {
      Alert.alert(t('authErrorTitle'), parseApiError(err) || t('profileSaveFailed'))
    } finally {
      setBusy(false)
    }
  }

  const reviews = reviewsQuery.data?.items ?? raw?.reviews ?? []

  if (profileQuery.loading && !hydrated) {
    return (
      <View style={styles.root}>
        <ScreenTopBar
          title={t(isEditRoute ? 'businessProfileEditTitle' : 'businessProfileBuildTitle')}
          onBack={() => navigation.goBack()}
        />
      </View>
    )
  }

  if (profileQuery.error && isEditRoute) {
    return (
      <View style={styles.root}>
        <ScreenTopBar title={t('businessProfileEditTitle')} onBack={() => navigation.goBack()} />
        <View style={styles.content}>
          <ErrorState
            title={t('commonLoadingErrorTitle')}
            message={t('commonLoadingErrorMessage')}
            retryLabel={t('commonRetry')}
            onRetry={profileQuery.retry}
          />
        </View>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <ScreenTopBar
        title={t(isEdit ? 'businessProfileEditTitle' : 'businessProfileBuildTitle')}
        onBack={() => navigation.goBack()}
      />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.column}>
          <Text style={styles.heading}>{t('businessProfileHeading')}</Text>

          <Field
            label={t('businessProfileNameLabel')}
            value={name}
            error={errors.name}
            onChangeText={(value) => {
              setName(value)
              setErrors((prev) => ({ ...prev, name: undefined }))
            }}
          />

          <View style={styles.field}>
            <Text style={styles.label}>{t('businessProfileLogoLabel')}</Text>
            <TouchableOpacity style={styles.logoRow} onPress={() => void pickLogo()} activeOpacity={0.8}>
              {logoUploadId ? (
                <Image
                  source={{ uri: mediaUrl(logoLink) ?? uploadContentUrl(logoUploadId) }}
                  style={styles.logoPreview}
                  resizeMode="cover"
                />
              ) : null}
              <Text style={styles.logoCta}>{t('businessProfileLogoCta')}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{t('businessProfileRegionLabel')}</Text>
            <TouchableOpacity
              style={[styles.pickerBox, errors.region ? styles.pickerError : null]}
              onPress={() => setRegionOpen(true)}
              activeOpacity={0.8}
            >
              <ChevronDown size={16} color={colors.textSecondary} strokeWidth={2} />
              <Text style={styles.pickerValue}>{regionLabel}</Text>
            </TouchableOpacity>
            {errors.region ? <Text style={styles.fieldError}>{errors.region}</Text> : null}
          </View>

          <Field
            label={t('businessProfilePhoneLabel')}
            value={phone}
            onChangeText={(value) => {
              setPhone(value)
              setErrors((prev) => ({ ...prev, phone: undefined }))
            }}
            keyboardType="phone-pad"
            placeholder="XXXXXXXXX"
            error={errors.phone}
          />

          <Field
            label={t('businessProfileEmailLabel')}
            value={email}
            onChangeText={(value) => {
              setEmail(value)
              setErrors((prev) => ({ ...prev, email: undefined }))
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            error={errors.email}
          />

          <View style={styles.field}>
            <Text style={styles.label}>{t('businessProfileBioLabel')}</Text>
            <TextInput
              value={bio}
              onChangeText={setBio}
              placeholder={t('businessProfileBioPlaceholder')}
              placeholderTextColor={colors.formPlaceholder}
              multiline
              textAlign="right"
              style={styles.bioInput}
            />
          </View>

          <Field
            label={t('jwServiceAreaLabel')}
            value={serviceArea}
            onChangeText={setServiceArea}
            placeholder={t('jwServiceAreaPlaceholder')}
            maxLength={500}
          />

          <View style={styles.field}>
            <Text style={styles.label}>{t('jwHoursLabel')}</Text>
            <Text style={styles.hint}>{t('jwHoursHint')}</Text>
            <BusinessHoursEditor
              rows={hours}
              dayLabel={(day) => t(DAY_LABEL_KEYS[day])}
              openLabel={t('jwHoursOpenLabel')}
              closeLabel={t('jwHoursCloseLabel')}
              errors={Object.fromEntries(
                Object.entries(hoursErrors).map(([day, error]) => [
                  day,
                  t(error === 'order' ? 'jwHoursCloseBeforeOpen' : 'jwHoursInvalidTime'),
                ]),
              )}
              onChange={(next) => {
                setHours(next)
                setHoursErrors({})
              }}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{t('businessProfileGalleryLabel')}</Text>
            <GalleryImagePicker
              images={gallery}
              onAdd={() => void addGalleryImage()}
              onRemove={(id) => void removeGalleryImage(id)}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{t('businessProfileReviewsLabel')}</Text>
            {isEdit && reviews.length > 0 ? (
              <>
                <Text style={styles.hint}>{t('businessProfileReviewsPickHint')}</Text>
                <View style={styles.reviewsList}>
                  {reviews.map((review) => (
                    <SelectableReviewCard
                      key={review.id}
                      body={review.comment}
                      author={review.reviewerName}
                      timeAgo={formatHeTimeAgo(review.createdAt, locale)}
                      selected={featuredReviewIds.includes(review.id)}
                      onToggle={() => void toggleReview(review.id)}
                    />
                  ))}
                </View>
              </>
            ) : (
              <Text style={styles.hint}>{t('businessProfileReviewsEmpty')}</Text>
            )}
          </View>

          <Button variant="primary" fullWidth disabled={busy} onPress={() => void onSubmit()}>
            {t(isEdit ? 'businessProfileSaveCta' : 'businessProfilePreviewCta')}
          </Button>
        </View>
      </ScrollView>
      <FilterOptionsSheet
        visible={regionOpen}
        options={regions.map((region) => ({ id: region.id, label: region.labelHe }))}
        onSelect={(option) => {
          setRegionId(option.id)
          setErrors((prev) => ({ ...prev, region: undefined }))
          setRegionOpen(false)
        }}
        onRequestClose={() => setRegionOpen(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.homeBg,
  },
  flex: {
    flex: 1,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
  },
  column: {
    width: '100%',
    maxWidth: 343,
    gap: 20,
  },
  heading: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 20,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  logoRow: {
    width: '100%',
    minHeight: 44,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.formBorder,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  logoPreview: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  logoCta: {
    flex: 1,
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '500',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  field: {
    width: '100%',
    gap: 6,
  },
  label: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 12,
    fontWeight: '400',
    color: colors.formLabel,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  pickerBox: {
    width: '100%',
    minHeight: 40,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.formBorder,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
  },
  pickerError: {
    borderColor: '#F04438',
  },
  fieldError: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 12,
    color: '#F04438',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  pickerValue: {
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '400',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  bioInput: {
    width: '100%',
    minHeight: 100,
    borderWidth: 1,
    borderColor: colors.formBorder,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: 'Heebo',
    fontSize: 14,
    color: colors.ink,
    textAlignVertical: 'top',
    writingDirection: 'rtl',
  },
  hint: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  reviewsList: {
    width: '100%',
    gap: 12,
  },
})
