import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { MyOrdersScreen } from '@/src/screens/jeweler/MyOrdersScreen'
import { OrderDetailsScreen } from '@/src/screens/jeweler/OrderDetailsScreen'
import type { MyOrdersStackParamList } from './types'

const Stack = createNativeStackNavigator<MyOrdersStackParamList>()

export function MyOrdersStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="OrdersList" component={MyOrdersScreen} />
      <Stack.Screen name="OrderDetails" component={OrderDetailsScreen} />
    </Stack.Navigator>
  )
}
