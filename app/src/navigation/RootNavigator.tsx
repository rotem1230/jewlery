import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useAppSelector } from '@/src/store/hooks'
import { AuthStack } from './AuthStack'
import { DesignerTabs } from './DesignerTabs'
import { JewelerTabs } from './JewelerTabs'
import type { RootStackParamList } from './types'

const Stack = createNativeStackNavigator<RootStackParamList>()

export function RootNavigator() {
  const user = useAppSelector((s) => s.auth.user)
  const role = user?.activeRole

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!user ? (
        <Stack.Screen name="Auth" component={AuthStack} />
      ) : role === 'JEWELER' ? (
        <Stack.Screen name="JewelerMain" component={JewelerTabs} />
      ) : (
        <Stack.Screen name="DesignerMain" component={DesignerTabs} />
      )}
    </Stack.Navigator>
  )
}
