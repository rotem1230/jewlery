import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { AdminCard, AdminScreen, AdminTitle } from '@/src/components/admin/AdminLayout'
import type { ProfileStackParamList } from '@/src/navigation/types'
import type { TranslationKey } from '@/src/i18n'
import { useTranslation } from '@/src/i18n'

type Route = 'AdminPlans' | 'AdminFinance' | 'AdminUsage' | 'AdminPayments' | 'AdminJewelry' | 'AdminReview'

const ENTRIES: Array<{ route: Route; label: TranslationKey }> = [
  { route: 'AdminPlans', label: 'admPlans' },
  { route: 'AdminFinance', label: 'admFinance' },
  { route: 'AdminUsage', label: 'admUsage' },
  { route: 'AdminPayments', label: 'admPayments' },
  { route: 'AdminJewelry', label: 'admJewelry' },
  { route: 'AdminReview', label: 'admReview' },
]

/** The admin menu: plans and prices, reports, payments and refunds, jewelry payouts, review. */
export function AdminHomeScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>()
  return (
    <AdminScreen title={t('admTitle')}>
      {ENTRIES.map((entry) => (
        <AdminCard key={entry.route} onPress={() => navigation.navigate(entry.route)}>
          <AdminTitle>{t(entry.label)}</AdminTitle>
        </AdminCard>
      ))}
    </AdminScreen>
  )
}
