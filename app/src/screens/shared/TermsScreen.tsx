import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { ScreenTopBar } from '@/src/components/layout/ScreenTopBar'
import { colors } from '@/src/theme/tokens'
import { useTranslation } from '@/src/i18n'
import { useNavigation } from '@react-navigation/native'
import { getContentPage } from '@/src/api/subscriptions'
import { contentBodyText } from '@/src/lib/format'
import { useAsyncData } from '@/src/hooks/useAsyncData'

type LegalBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'section'; text: string }
  | { type: 'item'; text: string }

/**
 * Figma תקנון — scrollable legal copy on #EDF3FA.
 */
export function TermsScreen() {
  const { t, locale } = useTranslation()
  const navigation = useNavigation()
  const cms = useAsyncData(
    (signal) => getContentPage('tos', locale, signal),
    { deps: [locale] },
  )
  const cmsText = contentBodyText(cms.data?.body, '')

  const blocks: LegalBlock[] = cmsText
    ? [{ type: 'paragraph', text: cmsText }]
    : [
    { type: 'heading', text: t('termsDocTitle') },
    { type: 'paragraph', text: t('termsIntro1') },
    { type: 'paragraph', text: t('termsIntro2') },
    { type: 'paragraph', text: t('termsIntro3') },
    { type: 'section', text: t('termsPartA') },
    { type: 'item', text: t('termsItem1') },
    { type: 'item', text: t('termsItem1_1') },
    { type: 'item', text: t('termsItem1_2') },
    { type: 'item', text: t('termsItem2') },
    { type: 'item', text: t('termsItem2_1') },
    { type: 'section', text: t('termsPartB') },
    { type: 'paragraph', text: t('termsPrivacy') },
  ]

  return (
    <View style={styles.root}>
      <ScreenTopBar title={t('termsTitle')} onBack={() => navigation.goBack()} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.column}>
          {blocks.map((block, index) => {
            if (block.type === 'heading') {
              return (
                <Text key={`h-${index}`} style={styles.docTitle}>
                  {block.text}
                </Text>
              )
            }
            if (block.type === 'section') {
              return (
                <Text key={`s-${index}`} style={styles.section}>
                  {block.text}
                </Text>
              )
            }
            if (block.type === 'item') {
              return (
                <Text key={`i-${index}`} style={styles.item}>
                  {block.text}
                </Text>
              )
            }
            return (
              <Text key={`p-${index}`} style={styles.paragraph}>
                {block.text}
              </Text>
            )
          })}
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
    gap: 16,
  },
  docTitle: {
    fontFamily: 'Heebo',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: 4,
  },
  paragraph: {
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 22,
    color: '#454654',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  section: {
    fontFamily: 'Heebo',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 8,
  },
  item: {
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 22,
    color: '#454654',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
})
