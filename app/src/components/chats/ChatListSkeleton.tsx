import { StyleSheet, View } from 'react-native'
import { Skeleton } from '@/src/components/ui/Skeleton'
import { colors } from '@/src/theme/tokens'

function ChatRowSkeleton() {
  return (
    <View style={styles.row}>
      <View style={styles.meta}>
        <Skeleton width={40} height={14} borderRadius={4} />
        <Skeleton width={22} height={22} borderRadius={11} />
      </View>
      <View style={styles.copy}>
        <Skeleton width="55%" height={18} borderRadius={6} />
        <Skeleton width="40%" height={14} borderRadius={6} />
        <Skeleton width="75%" height={14} borderRadius={6} />
      </View>
      <View style={styles.avatarSlot}>
        <Skeleton width={56} height={56} borderRadius={28} />
      </View>
    </View>
  )
}

/** Loading placeholder mirroring the ChatRow layout (no layout shift). */
export function ChatListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <View testID="chat-list-skeleton">
      {Array.from({ length: rows }).map((_, index) => (
        <ChatRowSkeleton key={`chat-skeleton-${index}`} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
    minHeight: 84,
    position: 'relative',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 24,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  meta: {
    position: 'absolute',
    left: 24,
    top: 0,
    bottom: 0,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  copy: {
    width: '100%',
    paddingLeft: 52,
    paddingRight: 68,
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 4,
  },
  avatarSlot: {
    position: 'absolute',
    right: 24,
    top: 0,
    bottom: 0,
    width: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
