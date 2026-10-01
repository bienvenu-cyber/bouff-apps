import { Linking, Alert, Platform } from 'react-native'
import { tr } from './tr'

export const callNumber = phone => {
  let phoneNumber = phone
  if (Platform.OS !== 'android') {
    phoneNumber = `telprompt:${phone}`
  } else {
    phoneNumber = `tel:${phone}`
  }
  Linking.canOpenURL(phoneNumber)
    .then(supported => {
      if (!supported) {
        Alert.alert(tr('Numéro de téléphone indisponible', 'Phone number is not available'))
      } else {
        return Linking.openURL(phoneNumber)
      }
    })
    .catch(err => console.log(err))
}
