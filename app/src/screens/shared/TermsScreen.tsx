import { useRef } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import { ScreenTopBar } from '@/src/components/layout/ScreenTopBar'
import { colors } from '@/src/theme/tokens'
import { useTranslation } from '@/src/i18n'
import { getContentPage } from '@/src/api/subscriptions'
import { useAsyncData } from '@/src/hooks/useAsyncData'
import { legalBlocks, type LegalBlock } from '@/src/lib/legal'
import type { TermsParams } from '@/src/navigation/types'

/**
 * Figma תקנון — the terms of use and privacy policy as published in the CMS (page "tos"), block by
 * block; the built-in summary only when none is published. Opened from the sign-up link "מדיניות
 * הפרטיות", it scrolls to the privacy part.
 */
export function TermsScreen() {
  const { t, locale } = useTranslation()
  const navigation = useNavigation()
  const route = useRoute<RouteProp<{ Terms: TermsParams }, 'Terms'>>()
  const target = route.params?.section
  const cms = useAsyncData((signal) => getContentPage('tos', locale, signal), { deps: [locale] })

  const scroll = useRef<ScrollView>(null)
  const columnY = useRef(0)
  const scrolled = useRef(false)

  const blocks: LegalBlock[] = legalBlocks(cms.data?.body) ?? [
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
    { type: 'section', text: t('termsPartB'), id: 'privacy' },
    { type: 'paragraph', text: t('termsPrivacy') },
  ]

  /** The part asked for is laid out: scroll to it, once. */
  const onBlockLayout = (id: string | undefined) => (event: LayoutChangeEvent) => {
    if (!target || id !== target || scrolled.current) return
    scrolled.current = true
    scroll.current?.scrollTo({ y: columnY.current + event.nativeEvent.layout.y, animated: false })
  }

  return (
    <View style={styles.root}>
      <ScreenTopBar title={t('termsTitle')} onBack={() => navigation.goBack()} />
      <ScrollView ref={scroll} style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {cms.loading && !cms.data ? (
          <ActivityIndicator style={styles.loading} color={colors.brand} />
        ) : (
          <View
            style={styles.column}
            onLayout={(event) => {
              columnY.current = event.nativeEvent.layout.y
            }}
          >
            {blocks.map((block, index) => (
              <Text key={`${block.type}-${index}`} style={STYLE_OF[block.type]} onLayout={block.id ? onBlockLayout(block.id) : undefined}>
                {block.text}
              </Text>
            ))}
          </View>
        )}
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
  loading: {
    paddingVertical: 32,
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
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 12,
  },
  subheading: {
    fontFamily: 'Heebo',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    color: colors.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 4,
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

const STYLE_OF: Record<LegalBlock['type'], (typeof styles)[keyof typeof styles]> = {
  heading: styles.docTitle,
  section: styles.section,
  subheading: styles.subheading,
  paragraph: styles.paragraph,
  item: styles.item,
}
