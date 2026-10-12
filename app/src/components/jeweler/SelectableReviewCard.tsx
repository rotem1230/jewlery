import { StyleSheet, TouchableOpacity, View } from 'react-native'
import { Check } from 'lucide-react-native'
import { ReviewCard } from '@/src/components/atelier/ReviewCard'
import { colors, radii } from '@/src/theme/tokens'

type SelectableReviewCardProps = {
  body: string
  author: string
  timeAgo: string
  selected: boolean
  onToggle: () => void
}

/** ReviewCard + a feature-on-profile checkbox, for the profile-edit reviews list. */
export function SelectableReviewCard({
  body,
  author,
  timeAgo,
  selected,
  onToggle,
}: SelectableReviewCardProps) {
  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[styles.checkbox, selected && styles.checkboxChecked]}
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
      >
        {selected ? <Check size={14} color={colors.textInverse} strokeWidth={3} /> : null}
      </TouchableOpacity>
      <View style={styles.cardSlot}>
        <ReviewCard body={body} author={author} timeAgo={timeAgo} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    marginTop: 4,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.brand,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.brand,
  },
  cardSlot: {
    flex: 1,
    minWidth: 0,
  },
})
