import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { ProfileScreen } from '../screens/shared/ProfileScreen'
import { TermsScreen } from '../screens/shared/TermsScreen'
import { FaqScreen } from '../screens/shared/FaqScreen'
import { PricingScreen } from '../screens/designer/PricingScreen'
import { BusinessProfileFormScreen } from '../screens/shared/BusinessProfileFormScreen'
import { BusinessProfilePreviewScreen } from '../screens/shared/BusinessProfilePreviewScreen'
import { BusinessProfileViewScreen } from '../screens/shared/BusinessProfileViewScreen'
import { AdminFinanceScreen } from '../screens/admin/AdminFinanceScreen'
import { AdminHomeScreen } from '../screens/admin/AdminHomeScreen'
import { AdminJewelryScreen } from '../screens/admin/AdminJewelryScreen'
import { AdminPaymentsScreen } from '../screens/admin/AdminPaymentsScreen'
import { AdminPlanEditScreen } from '../screens/admin/AdminPlanEditScreen'
import { AdminPlansScreen } from '../screens/admin/AdminPlansScreen'
import { AdminReviewScreen } from '../screens/admin/AdminReviewScreen'
import { AdminUsageScreen } from '../screens/admin/AdminUsageScreen'
import { useAppSelector } from '../store/hooks'
import type { ProfileStackParamList } from './types'

const Stack = createNativeStackNavigator<ProfileStackParamList>()

export function ProfileStack() {
  const isJeweler = useAppSelector((s) => s.auth.user?.activeRole === 'JEWELER')

  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false }}
      initialRouteName={isJeweler ? 'BusinessProfileView' : 'ProfileHome'}
    >
      <Stack.Screen name="ProfileHome" component={ProfileScreen} />
      <Stack.Screen name="Terms" component={TermsScreen} />
      <Stack.Screen name="Faq" component={FaqScreen} />
      <Stack.Screen name="Pricing" component={PricingScreen} />
      <Stack.Screen
        name="BusinessProfileForm"
        component={BusinessProfileFormScreen}
        initialParams={{ mode: 'edit' }}
      />
      <Stack.Screen name="BusinessProfilePreview" component={BusinessProfilePreviewScreen} />
      <Stack.Screen name="BusinessProfileView" component={BusinessProfileViewScreen} />
      <Stack.Screen name="AdminHome" component={AdminHomeScreen} />
      <Stack.Screen name="AdminPlans" component={AdminPlansScreen} />
      <Stack.Screen name="AdminPlanEdit" component={AdminPlanEditScreen} />
      <Stack.Screen name="AdminFinance" component={AdminFinanceScreen} />
      <Stack.Screen name="AdminUsage" component={AdminUsageScreen} />
      <Stack.Screen name="AdminPayments" component={AdminPaymentsScreen} />
      <Stack.Screen name="AdminJewelry" component={AdminJewelryScreen} />
      <Stack.Screen name="AdminReview" component={AdminReviewScreen} />
    </Stack.Navigator>
  )
}
