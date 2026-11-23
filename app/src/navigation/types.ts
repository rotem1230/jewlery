import type { NavigatorScreenParams } from '@react-navigation/native'

/** The terms screen, opened at its privacy part from the sign-up link 'מדיניות הפרטיות'. */
export type TermsParams = { section?: 'privacy' } | undefined

export type AuthStackParamList = {
  Splash: undefined
  RoleSelect: undefined
  Login: { role?: 'DESIGNER' | 'JEWELER' } | undefined
  Signup: { role?: 'DESIGNER' | 'JEWELER' } | undefined
  ForgotPassword: undefined
  Terms: TermsParams
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
  /** `start`: a design just made in the wizard (the studio opens on its first step). */
  DesignStudio: { designId: string; start?: boolean }
}

export type ChatsStackParamList = {
  ChatsList: undefined
  ChatThread: {
    chatId: string
    title?: string
    quoteApproved?: boolean
    /** The other participant's last read (from the inbox row): read ticks start from it. */
    peerLastReadAt?: string | null
  }
  QuoteDetails: { quoteId: string; chatId: string }
}

export type AtelierStackParamList = {
  /** `tab`: open on the designs or the jewelers; `refreshAt`: load the lists again (after publishing). */
  AtelierList: { tab?: 'designs' | 'jewelers'; refreshAt?: number } | undefined
  JewelerProfile: { jewelerId: string }
  AddRecommendation: { jewelerId: string; jewelerName: string }
  SubmitQuote: { designId: string; conversationId?: string; requestId?: string; quoteId?: string }
  DesignPreview: { designId: string }
}

export type BusinessProfileFormMode = 'create' | 'edit'

export type ProfileStackParamList = {
  ProfileHome: undefined
  Terms: TermsParams
  Faq: undefined
  Pricing: undefined
  BusinessProfileForm: { mode: BusinessProfileFormMode }
  BusinessProfilePreview: {
    name: string
    about: string
    /** persisted: already in the portfolio (the form saved it); publishing adds only the others. */
    gallery: Array<{ id: string; uri?: string; title?: string; uploadId?: string; persisted?: boolean }>
  }
  BusinessProfileView: undefined
  AdminHome: undefined
  AdminPlans: undefined
  AdminSubscriptions: undefined
  AdminPlanEdit: { code?: string; role?: 'DESIGNER' | 'JEWELER' }
  AdminFinance: undefined
  AdminUsage: undefined
  AdminPayments: undefined
  AdminJewelry: undefined
  AdminReview: undefined
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
  /** The accessibility page (the accessibility icon on every header). */
  Accessibility: undefined
}
