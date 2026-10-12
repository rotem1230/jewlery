import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { getFocusedRouteNameFromRoute } from '@react-navigation/native'
import { FileText, Gem, MessageCircle, User } from 'lucide-react-native'
import { TabBar } from '@/src/components/layout/TabBar'
import { MyOrdersStack } from './MyOrdersStack'
import { AtelierStack } from './AtelierStack'
import { ChatsStack } from './ChatsStack'
import { ProfileStack } from './ProfileStack'
import { useTranslation } from '@/src/i18n'
import type { JewelerTabParamList } from './types'

const Tab = createBottomTabNavigator<JewelerTabParamList>()

export function JewelerTabs() {
  const { t } = useTranslation()
  return (
    <Tab.Navigator tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tab.Screen
        name="MyOrders"
        component={MyOrdersStack}
        options={{
          title: t('myOrders'),
          tabBarIcon: ({ color, size }) => <FileText color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Atelier"
        component={AtelierStack}
        options={{
          title: t('atelier'),
          tabBarIcon: ({ color, size }) => <Gem color={color} size={size} />,
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
            tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size} />,
          }
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{
          title: t('profile'),
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  )
}
