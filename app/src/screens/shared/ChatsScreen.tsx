import { useMemo, useState } from 'react'
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
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

type ChatFilter = 'all' | 'design' | 'jeweler' | 'date'
type SheetFilter = Exclude<ChatFilter, 'all'>
type StackNav = NativeStackNavigationProp<ChatsStackParamList>

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
  const [filter, setFilter] = useState<ChatFilter>('all')
  const [sheetFilter, setSheetFilter] = useState<SheetFilter | null>(null)
  const [designId, setDesignId] = useState<string | undefined>()
  const [peerUserId, setPeerUserId] = useState<string | undefined>()
  const [from, setFrom] = useState<string | undefined>()
  const { rows, loading, refreshing, error, refresh, retry, query, setQuery } = useConversations()

  const filters: Array<{ id: ChatFilter; labelKey: TranslationKey }> = [
    { id: 'all', labelKey: 'chatFilterAll' },
    { id: 'design', labelKey: 'chatFilterByDesign' },
    { id: 'jeweler', labelKey: 'chatFilterByJeweler' },
    { id: 'date', labelKey: 'chatFilterByDate' },
  ]

  const sheetOptions = useMemo<FilterOption[]>(() => {
    if (sheetFilter === 'design') {
      const seen = new Set<string>()
      return rows
        .filter((row) => {
          if (seen.has(row.designId) || !row.design) return false
          seen.add(row.designId)
          return true
        })
        .map((row) => ({ id: row.designId, label: row.design }))
    }
    if (sheetFilter === 'jeweler') {
      const seen = new Set<string>()
      return rows
        .filter((row) => {
          if (!row.peerUserId || seen.has(row.peerUserId)) return false
          seen.add(row.peerUserId)
          return true
        })
        .map((row) => ({ id: row.peerUserId as string, label: row.name }))
    }
    if (sheetFilter === 'date') {
      return [
        { id: 'today', label: t('chatFilterDate1') },
        { id: 'week', label: t('chatFilterDate2') },
        { id: 'month', label: t('chatFilterDate3') },
      ]
    }
    return []
  }, [sheetFilter, rows, t])

  const visibleRows = useMemo(() => {
    return rows.filter((row) => {
      if (designId && row.designId !== designId) return false
      if (peerUserId && row.peerUserId !== peerUserId) return false
      if (from && new Date(row.createdAt) < new Date(from)) return false
      return true
    })
  }, [rows, designId, peerUserId, from])

  const onChipPress = (id: ChatFilter) => {
    if (id === 'all') {
      setFilter('all')
      setSheetFilter(null)
      setDesignId(undefined)
      setPeerUserId(undefined)
      setFrom(undefined)
      return
    }
    setFilter(id)
    setSheetFilter(id)
  }

  const onSelectOption = (option: FilterOption) => {
    if (sheetFilter === 'design') setDesignId(option.id)
    if (sheetFilter === 'jeweler') setPeerUserId(option.id)
    if (sheetFilter === 'date') {
      if (option.id === 'today') setFrom(startOfDay(0))
      else if (option.id === 'week') setFrom(startOfDay(7))
      else setFrom(startOfDay(30))
    }
    setSheetFilter(null)
  }

  const showSkeleton = loading && rows.length === 0
  const showError = !loading && rows.length === 0 && error

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
              placeholder={t('chatSearchPlaceholder')}
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
              selected={filter === item.id}
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
        ) : visibleRows.length === 0 ? (
          <Text style={styles.empty}>{t('chatsEmpty')}</Text>
        ) : (
          visibleRows.map((item, index) => (
            <ChatRow
              key={item.id}
              name={item.name}
              design={item.design}
              preview={item.preview}
              time={item.time}
              unread={item.unread}
              avatar={item.avatar}
              showDivider={index < visibleRows.length - 1}
              onPress={() =>
                navigation.navigate('ChatThread', { chatId: item.id, title: item.name })
              }
            />
          ))
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
  empty: {
    paddingTop: spacing.xl,
    fontFamily: 'Heebo',
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
})
