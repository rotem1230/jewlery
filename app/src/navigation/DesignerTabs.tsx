import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { getFocusedRouteNameFromRoute } from '@react-navigation/native'
import { Home, Sparkles, Gem, MessageCircle, User } from 'lucide-react-native'
import { TabBar } from '@/src/components/layout/TabBar'
import { HomeStack } from './HomeStack'
import { MyDesignsStack } from './MyDesignsStack'
import { ChatsStack } from './ChatsStack'
import { AtelierStack } from './AtelierStack'
import { ProfileStack } from './ProfileStack'
import { useTranslation } from '@/src/i18n'
import type { DesignerTabParamList } from './types'

const Tab = createBottomTabNavigator<DesignerTabParamList>()

export function DesignerTabs() {
  const { t } = useTranslation()
  return (
    <Tab.Navigator tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tab.Screen
        name="Home"
        component={HomeStack}
        options={({ route }) => {
          const focused = getFocusedRouteNameFromRoute(route) ?? 'HomeMain'
          return {
            title: t('home'),
            tabBarStyle: focused === 'DesignStudio' ? { display: 'none' } : undefined,
            tabBarIcon: ({ color, size }) => <Home color={color} size={size} strokeWidth={1.75} />,
          }
        }}
      />
      <Tab.Screen
        name="MyDesigns"
        component={MyDesignsStack}
        options={{
          title: t('myDesigns'),
          tabBarIcon: ({ color, size }) => (
            <Sparkles color={color} size={size} strokeWidth={1.75} />
          ),
        }}
      />
      <Tab.Screen
        name="Atelier"
        component={AtelierStack}
        options={{
          title: t('atelier'),
          tabBarIcon: ({ color, size }) => <Gem color={color} size={size} strokeWidth={1.75} />,
        }}
      />
      <Tab.Screen
        name="Chats"
        component={ChatsStack}
        options={({ route }) => {
          const focused = getFocusedRouteNameFromRoute(route) ?? 'ChatsList'
          const hideTab = focused === 'ChatThread' || focused === 'QuoteDetails'
          return {
            title: t('chats'),
            tabBarStyle: hideTab ? { display: 'none' } : undefined,
            tabBarIcon: ({ color, size }) => (
              <MessageCircle color={color} size={size} strokeWidth={1.75} />
            ),
          }
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{
          title: t('profile'),
          tabBarIcon: ({ color, size }) => <User color={color} size={size} strokeWidth={1.75} />,
        }}
      />
    </Tab.Navigator>
  )
}
