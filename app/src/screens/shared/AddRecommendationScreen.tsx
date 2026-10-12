import { useState } from 'react'
import { Alert } from 'react-native'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { ChevronDown, Star } from 'lucide-react-native'
import { ScreenTopBar } from '@/src/components/layout/ScreenTopBar'
import { FilterOptionsSheet } from '@/src/components/chats/FilterOptionsSheet'
import { colors, radii } from '@/src/theme/tokens'
import { useTranslation } from '@/src/i18n'
import { createReview } from '@/src/api/reviews'
import { parseApiError } from '@/src/lib/api'
import type { AtelierStackParamList } from '@/src/navigation/types'

type Nav = NativeStackNavigationProp<AtelierStackParamList, 'AddRecommendation'>
type Route = RouteProp<AtelierStackParamList, 'AddRecommendation'>

const STAR_OPTIONS = [5, 4, 3, 2, 1] as const

/**
 * Figma המלצה על צורף — name, body textarea, star select, submit.
 */
export function AddRecommendationScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<Nav>()
  const route = useRoute<Route>()
  const [name, setName] = useState('')
  const [body, setBody] = useState('')
  const [stars, setStars] = useState(5)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<{ name?: string; body?: string }>({})

  const starLabel = `${stars} ${t('addReviewStarsUnit')}`

  const onSubmit = async () => {
    const next: { name?: string; body?: string } = {}
    if (!name.trim()) next.name = t('validationRequired')
    if (!body.trim()) next.body = t('validationRequired')
    setErrors(next)
    if (next.name || next.body) return
    setBusy(true)
    try {
      await createReview({
        jewelerProfileId: route.params.jewelerId,
        reviewerName: name.trim(),
        rating: stars,
        comment: body.trim(),
      })
      navigation.goBack()
    } catch (err) {
      Alert.alert(t('authErrorTitle'), parseApiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.root}>
      <ScreenTopBar title={t('addReviewTitle')} onBack={() => navigation.goBack()} />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.column}>
          <Text style={styles.heading}>
            {t('addReviewHeadingPrefix')}
            {route.params.jewelerName}
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>{t('addReviewNameLabel')}</Text>
            <View style={[styles.inputShell, errors.name ? styles.inputError : null]}>
              <TextInput
                value={name}
                onChangeText={(value) => {
                  setName(value)
                  setErrors((prev) => ({ ...prev, name: undefined }))
                }}
                placeholder={t('addReviewNamePlaceholder')}
                placeholderTextColor="#767686"
                style={styles.input}
                textAlign="right"
              />
            </View>
            {errors.name ? <Text style={styles.fieldError}>{errors.name}</Text> : null}
          </View>

          <View style={styles.textareaField}>
            <Text style={styles.labelMuted}>{t('addReviewBodyLabel')}</Text>
            <View style={[styles.textareaShell, errors.body ? styles.inputError : null]}>
              <TextInput
                value={body}
                onChangeText={(value) => {
                  setBody(value)
                  setErrors((prev) => ({ ...prev, body: undefined }))
                }}
                placeholder={t('addReviewBodyPlaceholder')}
                placeholderTextColor="#767686"
                style={styles.textarea}
                textAlign="right"
                textAlignVertical="top"
                multiline
              />
            </View>
            {errors.body ? <Text style={styles.fieldError}>{errors.body}</Text> : null}
          </View>

          <View style={styles.selectField}>
            <Text style={styles.label}>{t('addReviewStarsLabel')}</Text>
            <Pressable
              onPress={() => setSheetOpen(true)}
              style={({ pressed }) => pressed && styles.pressed}
              accessibilityRole="button"
            >
              <View style={styles.selectShell}>
                <ChevronDown size={20} color={colors.ink} strokeWidth={1.75} />
                <View style={styles.selectContent}>
                  <Text style={styles.selectText}>{starLabel}</Text>
                  <Star size={20} color="#E8B95B" fill="#E8B95B" strokeWidth={0} />
                </View>
              </View>
            </Pressable>
          </View>
        </View>

        <Pressable
          onPress={() => void onSubmit()}
          disabled={busy}
          style={({ pressed }) => [styles.ctaPressable, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <View style={styles.cta}>
            <Text style={styles.ctaLabel}>{t('addReviewSubmit')}</Text>
          </View>
        </Pressable>
      </ScrollView>

      <FilterOptionsSheet
        visible={sheetOpen}
        options={STAR_OPTIONS.map((value) => ({
          id: String(value),
          label: `${value} ${t('addReviewStarsUnit')}`,
        }))}
        onSelect={(option) => {
          setStars(Number(option.id))
          setSheetOpen(false)
        }}
        onRequestClose={() => setSheetOpen(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
    gap: 24,
  },
  column: {
    width: '100%',
    maxWidth: 327,
    alignSelf: 'center',
    gap: 24,
  },
  heading: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 20,
    fontWeight: '500',
    lineHeight: 22,
    letterSpacing: -0.2,
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  field: {
    width: '100%',
    gap: 4,
    alignItems: 'stretch',
  },
  textareaField: {
    width: '100%',
    gap: 6,
    alignItems: 'stretch',
  },
  selectField: {
    width: '100%',
    gap: 6,
    alignItems: 'stretch',
  },
  label: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 13,
    letterSpacing: -0.12,
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  labelMuted: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 13,
    letterSpacing: -0.12,
    color: '#454654',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  inputShell: {
    width: '100%',
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    backgroundColor: colors.surface,
    shadowColor: '#0A0D12',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    justifyContent: 'center',
  },
  inputError: {
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
  input: {
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 19,
    letterSpacing: -0.16,
    color: colors.ink,
    writingDirection: 'rtl',
  },
  textareaShell: {
    width: '100%',
    minHeight: 138,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    backgroundColor: colors.surface,
    shadowColor: '#0A0D12',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  textarea: {
    width: '100%',
    minHeight: 118,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 19,
    letterSpacing: -0.16,
    color: colors.ink,
    writingDirection: 'rtl',
  },
  pressed: {
    opacity: 0.9,
  },
  selectShell: {
    width: '100%',
    minHeight: 40,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  selectText: {
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 19,
    letterSpacing: -0.16,
    color: colors.ink,
    writingDirection: 'rtl',
  },
  ctaPressable: {
    width: '100%',
    maxWidth: 327,
    alignSelf: 'center',
  },
  cta: {
    width: '100%',
    minHeight: 42,
    borderRadius: radii.md,
    backgroundColor: colors.brand,
    borderWidth: 1,
    borderColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  ctaLabel: {
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 18,
    letterSpacing: -0.16,
    color: colors.textInverse,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
})
