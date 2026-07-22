import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import ScreenPlaceholder from '../../components/ui/ScreenPlaceholder'
import type { AuthStackParamList } from '../../navigation/types'

type Props = NativeStackScreenProps<AuthStackParamList, 'Landing'>

export default function Landing({ navigation }: Props) {
  return (
    <ScreenPlaceholder
      title="Landing"
      actions={[
        { label: 'Se connecter', onPress: () => navigation.navigate('Login') },
        { label: "S'inscrire", onPress: () => navigation.navigate('Register') },
      ]}
    />
  )
}
