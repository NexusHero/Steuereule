/**
 * The autofill hints the app allows on an input (#451 slice 2, decision 6). The type is the
 * whitelist: a field can only ask for one of these, so a typo or an invented token cannot reach
 * the DOM. The web gets the HTML token itself; iOS and Android get their own names for it.
 */
export type InputAutoComplete =
  | 'given-name'
  | 'family-name'
  | 'street-address'
  | 'address-line1'
  | 'postal-code'
  | 'address-level2'
  | 'bday'
  | 'email'
  | 'new-password'
  | 'current-password'
  | 'one-time-code'
  | 'off'

type NativeAutoComplete =
  | 'given-name'
  | 'family-name'
  | 'street-address'
  | 'address-line1'
  | 'postal-code'
  | 'postal-address-locality'
  | 'birthdate-full'
  | 'email'
  | 'new-password'
  | 'current-password'
  | 'one-time-code'
  | 'off'

type IosContentType =
  | 'givenName'
  | 'familyName'
  | 'fullStreetAddress'
  | 'streetAddressLine1'
  | 'postalCode'
  | 'addressCity'
  | 'birthdate'
  | 'emailAddress'
  | 'newPassword'
  | 'password'
  | 'oneTimeCode'
  | 'none'

const NATIVE: Readonly<Record<InputAutoComplete, NativeAutoComplete>> = {
  'given-name': 'given-name',
  'family-name': 'family-name',
  'street-address': 'street-address',
  'address-line1': 'address-line1',
  'postal-code': 'postal-code',
  'address-level2': 'postal-address-locality',
  bday: 'birthdate-full',
  email: 'email',
  'new-password': 'new-password',
  'current-password': 'current-password',
  'one-time-code': 'one-time-code',
  off: 'off',
}

const IOS: Readonly<Record<InputAutoComplete, IosContentType>> = {
  'given-name': 'givenName',
  'family-name': 'familyName',
  'street-address': 'fullStreetAddress',
  'address-line1': 'streetAddressLine1',
  'postal-code': 'postalCode',
  'address-level2': 'addressCity',
  bday: 'birthdate',
  email: 'emailAddress',
  'new-password': 'newPassword',
  'current-password': 'password',
  'one-time-code': 'oneTimeCode',
  off: 'none',
}

export interface AutoCompleteProps {
  readonly autoComplete: string
  readonly textContentType?: IosContentType
}

export function autoCompleteProps(token: InputAutoComplete, os: string): AutoCompleteProps {
  if (os === 'web') return { autoComplete: token }
  if (os === 'ios') return { autoComplete: NATIVE[token], textContentType: IOS[token] }
  return { autoComplete: NATIVE[token] }
}
