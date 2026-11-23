import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { ScreenTopBar } from '@/src/components/layout/ScreenTopBar'
import { colors } from '@/src/theme/tokens'
import { useTranslation, type TranslationKey } from '@/src/i18n'

/** Whom to write about accessibility: the contact address of the terms of use (section 4.3). */
export const ACCESSIBILITY_CONTACT_EMAIL = 'litvak_tzilla@hotmail.com'

const SECTIONS: Array<{ title: TranslationKey; body: TranslationKey }> = [
  { title: 'a11yFeaturesTitle', body: 'a11yFeaturesBody' },
  { title: 'a11yHowTitle', body: 'a11yHowBody' },
  { title: 'a11yLimitsTitle', body: 'a11yLimitsBody' },
]

/**
 * The accessibility page, opened from the accessibility icon on every screen's header (the
 * client's notes of 23.11): what the app supports, how to enlarge text and use a screen reader,
 * known limits, and whom to contact.
 */
export function AccessibilityScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation()

  return (
    <View style={styles.root}>
      <ScreenTopBar title={t('a11yTitle')} onBack={() => navigation.goBack()} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.column}>
          <Text style={styles.heading} accessibilityRole="header">
            {t('a11yTitle')}
          </Text>
          <Text style={styles.body}>{t('a11yIntro')}</Text>
          {SECTIONS.map((section) => (
            <View key={section.title} style={styles.block}>
              <Text style={styles.title} accessibilityRole="header">
                {t(section.title)}
              </Text>
              <Text style={styles.body}>{t(section.body)}</Text>
            </View>
          ))}
          <View style={styles.block}>
            <Text style={styles.title} accessibilityRole="header">
              {t('a11yContactTitle')}
            </Text>
            <Text style={styles.body}>{t('a11yContactBody')}</Text>
            <Pressable
              onPress={() => void Linking.openURL(`mailto:${ACCESSIBILITY_CONTACT_EMAIL}`).catch(() => undefined)}
              accessibilityRole="link"
            >
              <Text style={styles.link}>{ACCESSIBILITY_CONTACT_EMAIL}</Text>
            </Pressable>
          </View>
          <Text style={styles.note}>{t('a11yUpdated')}</Text>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EDF3FA' },
  flex: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40, alignItems: 'center' },
  column: { width: '100%', maxWidth: 343, gap: 22 },
  block: { width: '100%', gap: 8 },
  heading: {
    fontFamily: 'Heebo',
    fontSize: 22,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  title: {
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  body: {
    fontFamily: 'Heebo',
    fontSize: 15,
    lineHeight: 23,
    color: '#454654',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  link: {
    fontFamily: 'Heebo',
    fontSize: 15,
    color: colors.brand,
    textDecorationLine: 'underline',
    textAlign: 'right',
  },
  note: {
    fontFamily: 'Heebo',
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
})
