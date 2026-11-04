import { useTranslation } from 'react-i18next'
import { APP_NS } from '../../i18n/resources'

export type Tr = ReturnType<typeof useTranslation<typeof APP_NS>>['t']
