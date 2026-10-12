import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { ChatsScreen } from '@/src/screens/shared/ChatsScreen'
import { ChatThreadScreen } from '@/src/screens/shared/ChatThreadScreen'
import { QuoteDetailsScreen } from '@/src/screens/shared/QuoteDetailsScreen'
import type { ChatsStackParamList } from './types'

const Stack = createNativeStackNavigator<ChatsStackParamList>()

export function ChatsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ChatsList" component={ChatsScreen} />
      <Stack.Screen name="ChatThread" component={ChatThreadScreen} />
      <Stack.Screen name="QuoteDetails" component={QuoteDetailsScreen} />
    </Stack.Navigator>
  )
}
