import { useEffect, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { ChevronLeft, User } from 'lucide-react-native'
import { HomeHeader } from '@/src/components/home/HomeHeader'
import { Field } from '@/src/components/ui/Field'
import { PhoneField } from '@/src/components/auth/PhoneField'
import { Button } from '@/src/components/ui/Button'
import { colors } from '@/src/theme/tokens'
import { useTranslation, type TranslationKey } from '@/src/i18n'
import { useAppDispatch, useAppSelector } from '@/src/store/hooks'
import { listDesigns } from '@/src/api/designs'
import { listConversations } from '@/src/api/chat'
import { changePassword, getMe, login, logout, switchRole, updateMe } from '@/src/api/auth'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import { displayName as formatDisplayName, splitFullName } from '@/src/lib/format'
import { parseApiError } from '@/src/lib/api'
import { sessionFromAuth } from '@/src/lib/session'
import { passwordIssue, toE164Phone } from '@/src/lib/validation'
import { clearSession, setSession } from '@/src/store/store'
import type { ProfileStackParamList } from '@/src/navigation/types'

type NoParamProfileRoute = {
  [K in keyof ProfileStackParamList]: ProfileStackParamList[K] extends undefined ? K : never
}[keyof ProfileStackParamList]

type MenuItem = {
  id: string
  labelKey: TranslationKey
  route?: NoParamProfileRoute
}

const DESIGNER_MENU_ITEMS: MenuItem[] = [
  { id: 'pricing', labelKey: 'profilePricing', route: 'Pricing' },
  { id: 'about', labelKey: 'profileAbout', route: 'Terms' },
  { id: 'help', labelKey: 'profileHelp', route: 'Faq' },
  { id: 'faq', labelKey: 'profileFaq', route: 'Faq' },
  { id: 'terms', labelKey: 'profileTerms', route: 'Terms' },
]

const JEWELER_MENU_ITEMS: MenuItem[] = [
  { id: 'help', labelKey: 'profileHelp', route: 'Faq' },
  { id: 'faq', labelKey: 'profileFaq', route: 'Faq' },
  { id: 'terms', labelKey: 'profileTerms', route: 'Terms' },
]

type ProfileNav = NativeStackNavigationProp<ProfileStackParamList, 'ProfileHome'>

/**
 * Figma פרופיל מעצב — curved header + avatar, stats, menu, logout.
 */
export function ProfileScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<ProfileNav>()
  const user = useAppSelector((s) => s.auth.user)
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const refreshToken = useAppSelector((s) => s.auth.refreshToken)
  const dispatch = useAppDispatch()

  const isJeweler = user?.activeRole === 'JEWELER'
  const menuItems = isJeweler ? JEWELER_MENU_ITEMS : DESIGNER_MENU_ITEMS
  const isDemo = user?.id === 'demo'
  const displayName = isDemo
    ? t(isJeweler ? 'profileDemoNameJeweler' : 'profileDemoName')
    : formatDisplayName(user?.firstName, user?.lastName, t('profile'))
  const displayEmail = isDemo
    ? t(isJeweler ? 'profileDemoEmailJeweler' : 'profileDemoEmail')
    : (user?.email ?? '')

  const [fullName, setFullName] = useState(
    [user?.firstName, user?.lastName].filter(Boolean).join(' '),
  )
  const [phone, setPhone] = useState('')
  const [phoneError, setPhoneError] = useState<string>()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (isDemo) return
    void getMe()
      .then((me) => {
        setFullName([me.firstName, me.lastName].filter(Boolean).join(' '))
        if (me.phone) setPhone(me.phone.replace(/^\+972/, ''))
      })
      .catch(() => undefined)
  }, [isDemo, accessToken])

  const designsQuery = useAsyncData(
    (signal) => listDesigns(undefined, signal),
    { deps: [accessToken], immediate: !isJeweler && !isDemo },
  )
  const chatsQuery = useAsyncData(
    (signal) => listConversations(undefined, signal),
    { deps: [accessToken], immediate: !isJeweler && !isDemo },
  )
  const designsCount = designsQuery.data?.tabCounts.all ?? designsQuery.data?.pagination.total ?? 0
  const dealsCount = chatsQuery.data?.pagination.total ?? 0

  const onSaveAccount = async () => {
    const e164 = phone.trim() ? toE164Phone(phone) : null
    if (phone.trim() && !e164) {
      setPhoneError(t('validationPhone'))
      return
    }
    if (!user || !accessToken || !refreshToken) return
    setBusy(true)
    try {
      const { firstName, lastName } = splitFullName(fullName)
      const updated = await updateMe({
        firstName: firstName || undefined,
        lastName,
        phone: e164 ?? undefined,
      })
      dispatch(
        setSession({
          user: {
            id: updated.id,
            email: updated.email,
            firstName: updated.firstName,
            lastName: updated.lastName,
            roles: updated.roles as typeof user.roles,
            activeRole: updated.activeRole as typeof user.activeRole,
          },
          accessToken,
          refreshToken,
        }),
      )
      Alert.alert(t('profileAccountSave'), t('profileAccountSaved'))
    } catch (err) {
      Alert.alert(t('authErrorTitle'), parseApiError(err))
    } finally {
      setBusy(false)
    }
  }

  const otherRole = user?.roles.includes('JEWELER') && user.roles.includes('DESIGNER')
    ? user.activeRole === 'JEWELER'
      ? 'DESIGNER'
      : 'JEWELER'
    : null

  const onSwitchRole = async () => {
    if (!otherRole) return
    setBusy(true)
    try {
      const result = await switchRole(otherRole)
      dispatch(setSession(sessionFromAuth(result)))
    } catch (err) {
      Alert.alert(t('authErrorTitle'), parseApiError(err))
    } finally {
      setBusy(false)
    }
  }

  const onChangePassword = async () => {
    const issue = passwordIssue(newPassword)
    if (!currentPassword.trim()) {
      setPasswordError(t('validationRequired'))
      return
    }
    if (issue === 'empty' || issue === 'short' || issue === 'letter' || issue === 'number') {
      setPasswordError(t('authPasswordTooShort'))
      return
    }
    if (!user?.email) return
    setBusy(true)
    try {
      await changePassword({ currentPassword, newPassword })
      const result = await login(user.email, newPassword)
      dispatch(setSession(sessionFromAuth(result)))
      setCurrentPassword('')
      setNewPassword('')
      setPasswordError(undefined)
      Alert.alert(t('profileChangePassword'), t('profilePasswordChanged'))
    } catch (err) {
      Alert.alert(t('authErrorTitle'), parseApiError(err))
    } finally {
      setBusy(false)
    }
  }

  const onLogout = async () => {
    const token = refreshToken
    dispatch(clearSession())
    if (token && token !== 'demo') {
      try {
        await logout(token)
      } catch {
        /* session already cleared */
      }
    }
  }

  return (
    <View style={styles.root}>
      <HomeHeader
        backdropColor="#EDF3FA"
        showLogo={false}
        center={
          <View style={styles.avatar}>
            <User size={40} color={colors.textInverse} strokeWidth={1.75} />
          </View>
        }
      />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.column}>
          <View style={styles.identity}>
            <Text style={styles.name}>{displayName}</Text>
            <Text style={styles.email}>{displayEmail}</Text>
          </View>

          {isDemo ? null : (
            <View style={styles.accountForm}>
              <Field label={t('fullName')} value={fullName} onChangeText={setFullName} />
              <PhoneField
                label={t('phone')}
                value={phone}
                error={phoneError}
                onChangeText={(value) => {
                  setPhone(value)
                  setPhoneError(undefined)
                }}
              />
              <Button fullWidth disabled={busy} onPress={() => void onSaveAccount()}>
                {t('profileAccountSave')}
              </Button>
              <Field
                label={t('profileCurrentPassword')}
                value={currentPassword}
                onChangeText={(value) => {
                  setCurrentPassword(value)
                  setPasswordError(undefined)
                }}
                secureTextEntry
                autoCapitalize="none"
              />
              <Field
                label={t('profileNewPassword')}
                value={newPassword}
                error={passwordError}
                onChangeText={(value) => {
                  setNewPassword(value)
                  setPasswordError(undefined)
                }}
                secureTextEntry
                autoCapitalize="none"
              />
              <Button fullWidth disabled={busy} onPress={() => void onChangePassword()}>
                {t('profileChangePassword')}
              </Button>
              {otherRole ? (
                <Button fullWidth disabled={busy} onPress={() => void onSwitchRole()}>
                  {t(otherRole === 'JEWELER' ? 'profileSwitchToJeweler' : 'profileSwitchToDesigner')}
                </Button>
              ) : null}
            </View>
          )}

          {isJeweler ? null : (
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{isDemo ? '3' : String(dealsCount)}</Text>
                <Text style={styles.statLabel}>{t('profileStatDeals')}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{isDemo ? '5' : String(designsCount)}</Text>
                <Text style={styles.statLabel}>{t('profileStatDesigns')}</Text>
              </View>
            </View>
          )}

          <View style={styles.menu}>
            {menuItems.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => {
                  if (item.route) navigation.navigate(item.route)
                }}
                style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
                accessibilityRole="button"
              >
                <View style={styles.chevronSlot}>
                  <ChevronLeft size={20} color="#767686" strokeWidth={1.75} />
                </View>
                <Text style={styles.menuLabel}>{t(item.labelKey)}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={() => void onLogout()}
            style={({ pressed }) => [styles.logoutPressable, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Text style={styles.logout}>{t('logout')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#EDF3FA',
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
  },
  column: {
    width: '100%',
    maxWidth: 343,
    alignItems: 'center',
    gap: 28,
  },
  avatar: {
    width: 88,
    height: 88,
    marginTop: 40,
    borderRadius: 44,
    backgroundColor: colors.brand,
    borderWidth: 3,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: {
    width: '100%',
    alignItems: 'center',
    gap: 6,
  },
  accountForm: {
    width: '100%',
    gap: 16,
  },
  name: {
    fontFamily: 'Heebo',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
    color: colors.ink,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  email: {
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
    color: '#767686',
    textAlign: 'center',
  },
  statsRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minHeight: 88,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.ink,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
    gap: 4,
  },
  statValue: {
    fontFamily: 'Heebo',
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 34,
    color: colors.ink,
    textAlign: 'center',
  },
  statLabel: {
    fontFamily: 'Heebo',
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
    color: colors.ink,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  menu: {
    width: '100%',
    gap: 0,
  },
  pressed: {
    opacity: 0.75,
  },
  menuRow: {
    width: '100%',
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
  },
  chevronSlot: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    flex: 1,
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 22,
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  logoutPressable: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'stretch',
  },
  logout: {
    width: '100%',
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
})
