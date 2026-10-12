import type { NavigatorScreenParams } from '@react-navigation/native'

export type AuthStackParamList = {
  Splash: undefined
  RoleSelect: undefined
  Login: { role?: 'DESIGNER' | 'JEWELER' } | undefined
  Signup: { role?: 'DESIGNER' | 'JEWELER' } | undefined
  ForgotPassword: undefined
  Terms: undefined
}

export type JewelryCategory = 'ring' | 'earrings' | 'bracelet' | 'necklace'

export type MyDesignsStackParamList = {
  DesignsList: undefined
  DesignDetails: { designId: string }
}

// Design-creation wizard lives under the Home tab so the tab bar stays on
// "בית" throughout — it's reached from the Home hero card, not from My Designs.
export type HomeStackParamList = {
  HomeMain: undefined
  CategorySelect: undefined
  SizeSelect: { category: JewelryCategory }
  StyleSelect: { category: JewelryCategory }
  MeasurementGuide: { category: JewelryCategory }
  DesignStudio: { designId: string }
}

export type ChatsStackParamList = {
  ChatsList: undefined
  ChatThread: { chatId: string; title?: string; quoteApproved?: boolean }
  QuoteDetails: { quoteId: string; chatId: string }
}

export type AtelierStackParamList = {
  AtelierList: undefined
  JewelerProfile: { jewelerId: string }
  AddRecommendation: { jewelerId: string; jewelerName: string }
  SubmitQuote: { designId: string; conversationId?: string; requestId?: string; quoteId?: string }
  DesignPreview: { designId: string }
}

export type BusinessProfileFormMode = 'create' | 'edit'

export type ProfileStackParamList = {
  ProfileHome: undefined
  Terms: undefined
  Faq: undefined
  Pricing: undefined
  BusinessProfileForm: { mode: BusinessProfileFormMode }
  BusinessProfilePreview: {
    name: string
    about: string
    gallery: Array<{ id: string; uri?: string; title?: string; uploadId?: string }>
  }
  BusinessProfileView: undefined
}

export type DesignerTabParamList = {
  Home: NavigatorScreenParams<HomeStackParamList> | undefined
  MyDesigns: NavigatorScreenParams<MyDesignsStackParamList> | undefined
  Atelier: NavigatorScreenParams<AtelierStackParamList> | undefined
  Chats: NavigatorScreenParams<ChatsStackParamList> | undefined
  Profile: NavigatorScreenParams<ProfileStackParamList> | undefined
}

export type MyOrdersStackParamList = {
  OrdersList: undefined
  OrderDetails: { orderId: string }
}

export type JewelerTabParamList = {
  MyOrders: NavigatorScreenParams<MyOrdersStackParamList> | undefined
  Atelier: NavigatorScreenParams<AtelierStackParamList> | undefined
  Chats: NavigatorScreenParams<ChatsStackParamList> | undefined
  Profile: NavigatorScreenParams<ProfileStackParamList> | undefined
}

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>
  DesignerMain: NavigatorScreenParams<DesignerTabParamList>
  JewelerMain: NavigatorScreenParams<JewelerTabParamList>
}
