import { Inject, Injectable } from '@nestjs/common'
import { USER_KEY_STORE, type UserKeyStore } from '../keystore/user-key-store.js'
import { EnvelopeCryptoService } from '../receipt/storage/envelope-crypto.service.js'

/** The stable facts of a household person (ADR-0062). */
export interface PersonFacts {
  readonly firstName: string
  readonly lastName: string
  /** ISO date. */
  readonly birthDate: string
  readonly taxId: string | null
  /** ISO date of death (spouse, Gnadensplitting); null while alive. */
  readonly diedOn: string | null
}

const keyIdFor = (personId: string) => `household-person:${personId}`
const AAD_SCOPE = 'facts'

/**
 * Seals a household person's facts under that person's own key in the keystore (ADR-0059): one
 * DEK per person, so "Endgültig löschen" destroys exactly that key and the facts become unreadable
 * in every database and backup, without touching anyone else (#452 decision 6, AC 5).
 */
@Injectable()
export class PersonSealService {
  constructor(
    @Inject(USER_KEY_STORE) private readonly keys: UserKeyStore,
    @Inject(EnvelopeCryptoService) private readonly crypto: EnvelopeCryptoService,
  ) {}

  async seal(personId: string, facts: PersonFacts): Promise<string> {
    const keyId = keyIdFor(personId)
    const key =
      (await this.keys.find(keyId)) ??
      (await this.keys.createIfAbsent(keyId, { wrappedDek: this.crypto.generateWrappedDek(keyId, 1), keyVersion: 1 }))
    const blob = this.crypto.encryptForUser({
      userId: keyId,
      receiptId: AAD_SCOPE,
      wrappedDek: key.wrappedDek,
      keyVersion: key.keyVersion,
      plainBytes: Buffer.from(JSON.stringify(facts), 'utf8'),
    })
    return ['v1', blob.iv.toString('base64'), blob.authTag.toString('base64'), blob.cipherBytes.toString('base64')].join('.')
  }

  /** The facts, or null once the person's key is gone (crypto-shredded). */
  async unseal(personId: string, sealed: string): Promise<PersonFacts | null> {
    const keyId = keyIdFor(personId)
    const key = await this.keys.find(keyId)
    if (!key) return null
    const [version, iv, tag, cipher] = sealed.split('.')
    if (version !== 'v1' || !iv || !tag || !cipher) throw new Error('Malformed sealed household person')
    const plain = this.crypto.decryptForUser({
      userId: keyId,
      receiptId: AAD_SCOPE,
      wrappedDek: key.wrappedDek,
      keyVersion: key.keyVersion,
      iv: Buffer.from(iv, 'base64'),
      authTag: Buffer.from(tag, 'base64'),
      cipherBytes: Buffer.from(cipher, 'base64'),
    })
    return JSON.parse(plain.toString('utf8')) as PersonFacts
  }

  async destroy(personId: string): Promise<void> {
    await this.keys.destroy(keyIdFor(personId))
  }
}
