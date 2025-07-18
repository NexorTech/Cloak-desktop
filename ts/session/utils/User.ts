import { PubkeyType } from 'libsession_util_nodejs';
import _ from 'lodash';
import { UserUtils } from '.';
import { Data } from '../../data/data';
import { SessionKeyPair } from '../../receiver/keypairs';
import { ConvoHub } from '../conversations';
import { getOurPubKeyStrFromStorage } from '../../util/storage';
import { PubKey } from '../types';
import { fromHexToArray, toHex } from './String';
import { LokiProfile } from '../../types/message';

export type HexKeyPair = {
  pubKey: string;
  privKey: string;
};

export type ByteKeyPair = {
  pubKeyBytes: Uint8Array;
  privKeyBytes: Uint8Array;
};

/**
 * Check if this pubkey is us, using the cache.
 * This does not check for us blinded. To check for us or us blinded, use isUsAnySogsFromCache()
 * Throws an error if our pubkey is not set
 */
export function isUsFromCache(pubKey: string | PubKey | undefined): boolean {
  if (!pubKey) {
    throw new Error('pubKey is not set');
  }
  const ourNumber = UserUtils.getOurPubKeyStrFromCache();
  const pubKeyStr = pubKey instanceof PubKey ? pubKey.key : pubKey;
  return pubKeyStr === ourNumber;
}

/**
 * Returns the public key of this current device as a STRING, or throws an error
 */
export function getOurPubKeyStrFromCache(): PubkeyType {
  const ourNumber = getOurPubKeyStrFromStorage();
  if (!ourNumber) {
    throw new Error('ourNumber is not set');
  }

  return ourNumber as PubkeyType;
}

/**
 * Returns the public key of this current device as a PubKey, or throws an error
 */
export function getOurPubKeyFromCache(): PubKey {
  const ourNumber = UserUtils.getOurPubKeyStrFromCache();
  if (!ourNumber) {
    throw new Error('ourNumber is not set');
  }
  return PubKey.cast(ourNumber);
}

let cachedIdentityKeyPair: SessionKeyPair | undefined;

/**
 * This return the stored x25519 identity keypair for the current logged in user
 */
export async function getIdentityKeyPair(): Promise<SessionKeyPair | undefined> {
  if (cachedIdentityKeyPair) {
    return cachedIdentityKeyPair;
  }
  const item = await Data.getItemById('identityKey');

  cachedIdentityKeyPair = item?.value;
  return cachedIdentityKeyPair;
}

export async function getUserED25519KeyPair(): Promise<HexKeyPair | undefined> {
  const ed25519KeyPairBytes = await getUserED25519KeyPairBytes();
  if (ed25519KeyPairBytes) {
    const { pubKeyBytes, privKeyBytes } = ed25519KeyPairBytes;
    return {
      pubKey: toHex(pubKeyBytes),
      privKey: toHex(privKeyBytes),
    };
  }
  return undefined;
}

export const getUserED25519KeyPairBytes = async (): Promise<ByteKeyPair> => {
  // 'identityKey' keeps the ed25519KeyPair under a ed25519KeyPair field.
  // it is only set if the user migrated to the ed25519 way of generating a key
  const item = await UserUtils.getIdentityKeyPair();
  const ed25519KeyPair = (item as any)?.ed25519KeyPair;
  if (ed25519KeyPair?.publicKey && ed25519KeyPair?.privateKey) {
    const pubKeyBytes = new Uint8Array(_.map(ed25519KeyPair.publicKey, a => a));
    const privKeyBytes = new Uint8Array(_.map(ed25519KeyPair.privateKey, a => a));
    return {
      pubKeyBytes,
      privKeyBytes,
    };
  }
  throw new Error('getUserED25519KeyPairBytes: user has no keypair');
};

export function getOurProfile(): LokiProfile | undefined {
  try {
    const ourNumber = UserUtils.getOurPubKeyStrFromCache();
    const ourConversation = ConvoHub.use().get(ourNumber);
    const ourProfileKeyHex = ourConversation.getProfileKey();
    const profileKeyAsBytes = ourProfileKeyHex ? fromHexToArray(ourProfileKeyHex) : null;

    const avatarPointer = ourConversation.getAvatarPointer();
    const displayName = ourConversation.getRealSessionUsername() || 'Anonymous';
    return {
      displayName,
      avatarPointer,
      profileKey: profileKeyAsBytes?.length ? profileKeyAsBytes : null,
    };
  } catch (e) {
    window?.log?.error(`Failed to get our profile: ${e}`);
    return undefined;
  }
}
