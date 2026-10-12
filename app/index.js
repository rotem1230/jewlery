import 'react-native-gesture-handler'
import { AppRegistry, I18nManager } from 'react-native'
import App from './App'
import { name as appName } from './app.json'

// Hebrew copy uses manual textAlign:'right'. Keep layout LTR so alignment is physical.
I18nManager.allowRTL(false)
I18nManager.swapLeftAndRightInRTL(false)
if (I18nManager.isRTL) {
  I18nManager.forceRTL(false)
}

AppRegistry.registerComponent(appName, () => App)
