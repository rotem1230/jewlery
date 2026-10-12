import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { DesignerHomeScreen } from '@/src/screens/designer/DesignerHomeScreen'
import { CategorySelectScreen } from '@/src/screens/designer/CategorySelectScreen'
import { SizeSelectScreen } from '@/src/screens/designer/SizeSelectScreen'
import { StyleSelectScreen } from '@/src/screens/designer/StyleSelectScreen'
import { MeasurementGuideScreen } from '@/src/screens/designer/MeasurementGuideScreen'
import { DesignStudioScreen } from '@/src/screens/designer/DesignStudioScreen'
import type { HomeStackParamList } from './types'

const Stack = createNativeStackNavigator<HomeStackParamList>()

/** Home tab + design-creation wizard, kept in one stack so the tab bar stays on "בית". */
export function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HomeMain" component={DesignerHomeScreen} />
      <Stack.Screen name="CategorySelect" component={CategorySelectScreen} />
      <Stack.Screen name="SizeSelect" component={SizeSelectScreen} />
      <Stack.Screen name="StyleSelect" component={StyleSelectScreen} />
      <Stack.Screen name="MeasurementGuide" component={MeasurementGuideScreen} />
      <Stack.Screen name="DesignStudio" component={DesignStudioScreen} />
    </Stack.Navigator>
  )
}
