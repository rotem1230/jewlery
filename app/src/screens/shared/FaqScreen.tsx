import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { ScreenTopBar } from '@/src/components/layout/ScreenTopBar'
import { colors } from '@/src/theme/tokens'
import { useTranslation, type TranslationKey } from '@/src/i18n'
import { getContentPage } from '@/src/api/subscriptions'
import { contentBodyText } from '@/src/lib/format'
import { useAsyncData } from '@/src/hooks/useAsyncData'

const FAQ_ITEMS: Array<{ q: TranslationKey; a: TranslationKey }> = [
  { q: 'faq1Q', a: 'faq1A' },
  { q: 'faq2Q', a: 'faq2A' },
  { q: 'faq3Q', a: 'faq3A' },
  { q: 'faq4Q', a: 'faq4A' },
  { q: 'faq5Q', a: 'faq5A' },
  { q: 'faq6Q', a: 'faq6A' },
]

/**
 * Figma שאלות נפוצות — bold questions + regular answers, RTL.
 */
export function FaqScreen() {
  const { t, locale } = useTranslation()
  const navigation = useNavigation()
  const cms = useAsyncData(
    (signal) => getContentPage('faq', locale, signal),
    { deps: [locale] },
  )
  const cmsText = contentBodyText(cms.data?.body, '')

  return (
    <View style={styles.root}>
      <ScreenTopBar title={t('faqTitle')} onBack={() => navigation.goBack()} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.column}>
          {cmsText ? (
            <View style={styles.block}>
              <Text style={styles.answer}>{cmsText}</Text>
            </View>
          ) : (
            FAQ_ITEMS.map((item) => (
            <View key={item.q} style={styles.block}>
              <Text style={styles.question}>{t(item.q)}</Text>
              <Text style={styles.answer}>{t(item.a)}</Text>
            </View>
            ))
          )}
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
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
    alignItems: 'center',
  },
  column: {
    width: '100%',
    maxWidth: 343,
    gap: 28,
  },
  block: {
    width: '100%',
    gap: 8,
  },
  question: {
    fontFamily: 'Heebo',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  answer: {
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 21,
    color: '#454654',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
})
