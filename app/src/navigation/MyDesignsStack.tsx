import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { MyDesignsScreen } from '@/src/screens/designer/MyDesignsScreen'
import { DesignDetailsScreen } from '@/src/screens/designer/DesignDetailsScreen'
import type { MyDesignsStackParamList } from './types'

const Stack = createNativeStackNavigator<MyDesignsStackParamList>()

export function MyDesignsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DesignsList" component={MyDesignsScreen} />
      <Stack.Screen name="DesignDetails" component={DesignDetailsScreen} />
    </Stack.Navigator>
  )
}
