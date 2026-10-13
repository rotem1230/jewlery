import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { Search } from 'lucide-react-native'
import { ScreenTopBar } from '@/src/components/layout/ScreenTopBar'
import { FilterChip } from '@/src/components/designs/FilterChip'
import { ChatRow } from '@/src/components/chats/ChatRow'
import { ChatListSkeleton } from '@/src/components/chats/ChatListSkeleton'
import { ErrorState } from '@/src/components/ui/ErrorState'
import {
  FilterOptionsSheet,
  type FilterOption,
} from '@/src/components/chats/FilterOptionsSheet'
import { useConversations } from '@/src/hooks/useConversations'
import { useAppSelector } from '@/src/store/hooks'
import { colors, radii, spacing } from '@/src/theme/tokens'
import { useTranslation, type TranslationKey } from '@/src/i18n'
import type { ChatsStackParamList } from '@/src/navigation/types'

type ChatFilter = 'all' | 'design' | 'peer' | 'date'
type SheetFilter = Exclude<ChatFilter, 'all'>
type StackNav = NativeStackNavigationProp<ChatsStackParamList>

/** One filter at a time (one chip is highlighted); the search combines with it on the server. */
type ActiveFilter =
  | { kind: 'design'; designId: string }
  | { kind: 'peer'; peerUserId: string }
  | { kind: 'date'; from: string }
  | null

/** How close to the end of the list the next page starts loading. */
const LOAD_MORE_EDGE = 240

function startOfDay(daysAgo: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString()
}

export function ChatsScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<StackNav>()
  const isJeweler = useAppSelector((s) => s.auth.user?.activeRole === 'JEWELER')
  const [sheetFilter, setSheetFilter] = useState<SheetFilter | null>(null)
  const [active, setActive] = useState<ActiveFilter>(null)
  const {
    rows,
    loading,
    refreshing,
    loadingMore,
    error,
    hasMore,
    refresh,
    retry,
    loadMore,
    query,
    setQuery,
    filterOptions,
  } = useConversations({
    designId: active?.kind === 'design' ? active.designId : undefined,
    peerUserId: active?.kind === 'peer' ? active.peerUserId : undefined,
    from: active?.kind === 'date' ? active.from : undefined,
  })
  const selectedChip: ChatFilter = active?.kind ?? 'all'

  const filters: Array<{ id: ChatFilter; labelKey: TranslationKey }> = [
    { id: 'all', labelKey: 'chatFilterAll' },
    { id: 'design', labelKey: 'chatFilterByDesign' },
    // The other side of a jeweler's conversations is a customer.
    { id: 'peer', labelKey: isJeweler ? 'shChatFilterByCustomer' : 'chatFilterByJeweler' },
    { id: 'date', labelKey: 'chatFilterByDate' },
  ]

  const sheetOptions = useMemo<FilterOption[]>(() => {
    if (sheetFilter === 'design') return filterOptions.designs
    if (sheetFilter === 'peer') return filterOptions.peers
    if (sheetFilter === 'date') {
      return [
        { id: 'today', label: t('chatFilterDate1') },
        { id: 'week', label: t('chatFilterDate2') },
        { id: 'month', label: t('chatFilterDate3') },
      ]
    }
    return []
  }, [sheetFilter, filterOptions, t])

  const onChipPress = (id: ChatFilter) => {
    if (id === 'all') {
      setSheetFilter(null)
      setActive(null)
      return
    }
    setSheetFilter(id)
  }

  const onSelectOption = (option: FilterOption) => {
    if (sheetFilter === 'design') setActive({ kind: 'design', designId: option.id })
    if (sheetFilter === 'peer') setActive({ kind: 'peer', peerUserId: option.id })
    if (sheetFilter === 'date') {
      const daysAgo = option.id === 'today' ? 0 : option.id === 'week' ? 7 : 30
      setActive({ kind: 'date', from: startOfDay(daysAgo) })
    }
    setSheetFilter(null)
  }

  const onScroll = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = nativeEvent
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - LOAD_MORE_EDGE) loadMore()
  }

  const showSkeleton = loading && rows.length === 0
  const showError = !loading && rows.length === 0 && error
  const narrowed = query.trim().length > 0 || active !== null

  return (
    <View style={styles.root}>
      <ScreenTopBar
        title={t('chats')}
        onBack={() =>
          isJeweler
            ? navigation.getParent()?.navigate('MyOrders')
            : navigation.getParent()?.navigate('Home')
        }
      />

      <View style={styles.toolbar}>
        <View style={styles.searchShadow}>
          <View style={styles.search}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('shChatSearchPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              style={styles.searchInput}
              textAlign="right"
              returnKeyType="search"
            />
            <Search size={20} color={colors.textSecondary} strokeWidth={1.5} />
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {filters.map((item) => (
            <FilterChip
              key={item.id}
              label={t(item.labelKey)}
              selected={selectedChip === item.id}
              onPress={() => onChipPress(item.id)}
            />
          ))}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        onScroll={hasMore ? onScroll : undefined}
        scrollEventThrottle={200}
      >
        {showSkeleton ? (
          <ChatListSkeleton />
        ) : showError ? (
          <View style={styles.errorWrap}>
            <ErrorState
              title={t('commonLoadingErrorTitle')}
              message={t('commonLoadingErrorMessage')}
              retryLabel={t('commonRetry')}
              onRetry={retry}
            />
          </View>
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>{t(narrowed ? 'shChatFilteredEmpty' : 'chatsEmpty')}</Text>
        ) : (
          <>
            {rows.map((item, index) => (
              <ChatRow
                key={item.id}
                name={item.name}
                design={item.design}
                preview={item.preview}
                time={item.time}
                unread={item.unread}
                avatar={item.avatar}
                showDivider={index < rows.length - 1}
                onPress={() =>
                  navigation.navigate('ChatThread', {
                    chatId: item.id,
                    title: item.name,
                    peerLastReadAt: item.peerLastReadAt,
                  })
                }
              />
            ))}
            {hasMore ? (
              <Pressable
                onPress={loadMore}
                disabled={loadingMore}
                style={styles.loadMore}
                accessibilityRole="button"
              >
                {loadingMore ? (
                  <ActivityIndicator size="small" color={colors.brand} />
                ) : (
                  <Text style={styles.loadMoreLabel}>{t('shChatLoadMore')}</Text>
                )}
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollView>

      <FilterOptionsSheet
        visible={sheetFilter != null}
        options={sheetOptions}
        onSelect={onSelectOption}
        onRequestClose={() => setSheetFilter(null)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.homeBg,
  },
  toolbar: {
    width: '100%',
    paddingHorizontal: spacing.page,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.lg,
    gap: spacing.lg,
    alignItems: 'stretch',
  },
  searchShadow: {
    width: '100%',
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    shadowColor: '#C7C7C7',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  search: {
    width: '100%',
    minHeight: 52,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 22,
    color: colors.ink,
    paddingVertical: 0,
    writingDirection: 'rtl',
  },
  filters: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    minWidth: '100%',
    justifyContent: 'flex-start',
  },
  list: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: spacing.lg,
  },
  errorWrap: {
    paddingHorizontal: spacing.page,
    paddingTop: spacing.lg,
  },
  loadMore: {
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  loadMoreLabel: {
    fontFamily: 'Heebo',
    fontSize: 14,
    fontWeight: '500',
    color: colors.brand,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  empty: {
    paddingTop: spacing.xl,
    fontFamily: 'Heebo',
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
})
