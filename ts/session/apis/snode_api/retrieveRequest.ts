import { GroupPubkeyType } from 'libsession_util_nodejs';
import { isArray } from 'lodash';
import { Snode } from '../../../data/types';
import { updateIsOnline } from '../../../state/ducks/onions';
import { GetNetworkTime } from './getNetworkTime';
import { SnodeNamespace, SnodeNamespaces, SnodeNamespacesGroup } from './namespaces';

import { UserGroupsWrapperActions } from '../../../webworker/workers/browser/libsession_worker_interface';
import { PubKey } from '../../types';
import { DURATION, TTL_DEFAULT } from '../../constants';
import { SnodeResponseError } from '../../utils/errors';
import {
  RetrieveGroupSubRequest,
  RetrieveUserSubRequest,
  UpdateExpiryOnNodeGroupSubRequest,
  UpdateExpiryOnNodeUserSubRequest,
} from './SnodeRequestTypes';
import { BatchRequests } from './batchRequest';
import { RetrieveMessagesResultsBatched, RetrieveMessagesResultsContent } from './types';
import { ERROR_CODE_NO_CONNECT } from './SNodeAPI';
import { ed25519Str } from '../../utils/String';
import { NetworkTime } from '../../../util/NetworkTime';
import { ReduxOnionSelectors } from '../../../state/selectors/onions';

type RetrieveParams = {
  pubkey: string;
  last_hash: string;
  timestamp: number;
  max_size: number | undefined;
};

async function retrieveRequestForUs({
  namespace,
  retrieveParam,
}: {
  namespace: SnodeNamespaces;
  retrieveParam: RetrieveParams;
}) {
  if (!SnodeNamespace.isUserConfigNamespace(namespace) && namespace !== SnodeNamespaces.Default) {
    throw new Error(`retrieveRequestForUs not a valid namespace to retrieve as us:${namespace}`);
  }
  return new RetrieveUserSubRequest({
    last_hash: retrieveParam.last_hash,
    max_size: retrieveParam.max_size,
    namespace,
  });
}

type NamespaceAndLastHash = { lastHash: string | null; namespace: SnodeNamespaces };

/**
 * Retrieve for groups (03-prefixed) are authenticated with the admin key if we have it, or with our sub key auth
 */
async function retrieveRequestForGroup({
  namespace,
  groupPk,
  retrieveParam,
}: {
  groupPk: GroupPubkeyType;
  namespace: SnodeNamespacesGroup;
  retrieveParam: RetrieveParams;
}) {
  if (!PubKey.is03Pubkey(groupPk)) {
    throw new Error('retrieveRequestForGroup: not a 03 group');
  }
  if (!SnodeNamespace.isGroupNamespace(namespace)) {
    throw new Error(`retrieveRequestForGroup: not a groupNamespace: ${namespace}`);
  }
  const group = await UserGroupsWrapperActions.getGroup(groupPk);

  return new RetrieveGroupSubRequest({
    last_hash: retrieveParam.last_hash,
    namespace,
    max_size: retrieveParam.max_size,
    groupDetailsNeededForSignature: group,
  });
}

type RetrieveSubRequestType =
  | RetrieveUserSubRequest
  | RetrieveGroupSubRequest
  | UpdateExpiryOnNodeUserSubRequest
  | UpdateExpiryOnNodeGroupSubRequest;

/**
 * build the Array of retrieveRequests to do on the next poll, given the specified namespaces, lastHash, pubkey and hashes to bump (expiry)
 * Note: exported only for testing purposes
 * @param namespacesAndLastHashes
 * @param pubkey
 * @param ourPubkey
 * @param configHashesToBump
 * @returns
 */
async function buildRetrieveRequest(
  namespacesAndLastHashes: Array<NamespaceAndLastHash>,
  pubkey: string,
  ourPubkey: string,
  configHashesToBump: Array<string> | null
) {
  const isUs = pubkey === ourPubkey;
  const maxSizeMap = SnodeNamespace.maxSizeMap(namespacesAndLastHashes.map(m => m.namespace));
  const now = NetworkTime.now();

  const retrieveRequestsParams: Array<RetrieveSubRequestType> = await Promise.all(
    namespacesAndLastHashes.map(async ({ lastHash, namespace }) => {
      const foundMaxSize = maxSizeMap.find(m => m.namespace === namespace)?.maxSize;
      const retrieveParam = {
        pubkey,
        last_hash: lastHash || '',
        timestamp: now,
        max_size: foundMaxSize,
      };

      if (PubKey.is03Pubkey(pubkey)) {
        if (!SnodeNamespace.isGroupNamespace(namespace)) {
          // either config or messages namespaces for 03 groups
          throw new Error(`tried to poll from a non 03 group namespace ${namespace}`);
        }
        return retrieveRequestForGroup({ namespace, groupPk: pubkey, retrieveParam });
      }

      // all legacy closed group retrieves are unauthenticated and run above.
      // if we get here, this can only be a retrieve for our own swarm, which must be authenticated
      return retrieveRequestForUs({ namespace, retrieveParam });
    })
  );

  const expiryMs = NetworkTime.now() + TTL_DEFAULT.CONFIG_MESSAGE;

  if (configHashesToBump?.length && isUs) {
    const request = new UpdateExpiryOnNodeUserSubRequest({
      expiryMs,
      messagesHashes: configHashesToBump,
      shortenOrExtend: '',
    });
    retrieveRequestsParams.push(request);
    return retrieveRequestsParams;
  }

  if (configHashesToBump?.length && PubKey.is03Pubkey(pubkey)) {
    const group = await UserGroupsWrapperActions.getGroup(pubkey);

    if (!group) {
      window.log.warn(
        `trying to retrieve for group ${ed25519Str(
          pubkey
        )} but we are missing the details in the user group wrapper`
      );
      throw new Error('retrieve request is missing group details');
    }

    retrieveRequestsParams.push(
      new UpdateExpiryOnNodeGroupSubRequest({
        expiryMs,
        messagesHashes: configHashesToBump,
        shortenOrExtend: '',
        groupDetailsNeededForSignature: group,
      })
    );
  }
  return retrieveRequestsParams;
}

/**
 *
 * @param targetNode the node to make the request to
 * @param associatedWith the pubkey for which this request is, used to handle 421 errors
 * @param namespacesAndLastHashes the details of the retrieve request to make
 * @param ourPubkey our current user pubkey
 * @param configHashesToBump the config hashes to update the expiry of
 * @param allow401s for groups we allow a 401 to not throw as we can be removed from it, but we still need to process part of the result.
 * @returns an array of results with exactly namespacesAndLastHashes.length items in it.
 *
 * Note: Even if configHashesToBump is set, its result will be excluded from the return of this function, so what you get is always of namespacesAndLastHashes.length
 */
async function retrieveNextMessagesNoRetries(
  targetNode: Snode,
  associatedWith: string,
  namespacesAndLastHashes: Array<NamespaceAndLastHash>,
  ourPubkey: string,
  configHashesToBump: Array<string> | null,
  allow401s: boolean
): Promise<RetrieveMessagesResultsBatched> {
  const rawRequests = await buildRetrieveRequest(
    namespacesAndLastHashes,
    associatedWith,
    ourPubkey,
    configHashesToBump
  );

  // let exceptions bubble up
  // no retry for this one as this a call we do every few seconds while polling for messages

  // just to make sure that we don't hang for more than timeOutMs
  const results = await BatchRequests.doUnsignedSnodeBatchRequestNoRetries({
    unsignedSubRequests: rawRequests,
    targetNode,
    // yes this is a long timeout for just messages, but 4s timeouts way to often...
    timeoutMs: 10 * DURATION.SECONDS,
    associatedWith,
    allow401s,
    method: 'batch',
    abortSignal: null,
  });
  try {
    if (!results || !isArray(results) || !results.length) {
      window?.log?.warn(
        `_retrieveNextMessages - sessionRpc could not talk to ${targetNode.ip}:${targetNode.port}`
      );
      throw new SnodeResponseError(
        `_retrieveNextMessages - sessionRpc could not talk to ${targetNode.ip}:${targetNode.port}`
      );
    }

    // the +1 is to take care of the extra `expire` method added once user config is released
    if (
      results.length !== namespacesAndLastHashes.length &&
      results.length !== namespacesAndLastHashes.length + 1
    ) {
      throw new Error(
        `We asked for updates about ${namespacesAndLastHashes.length} messages but got results of length ${results.length}`
      );
    }

    // do a basic check to know if we have something kind of looking right (status 200 should always be there for a retrieve)
    const firstResult = results[0];

    if (firstResult.code !== 200) {
      window?.log?.warn(`retrieveNextMessagesNoRetries result is not 200 but ${firstResult.code}`);
      throw new Error(
        `_retrieveNextMessages - retrieve result is not 200 with ${targetNode.ip}:${targetNode.port} but ${firstResult.code}`
      );
    }
    if (configHashesToBump?.length) {
      const lastResult = results[results.length - 1];
      if (lastResult?.code !== 200) {
        // the update expiry of our config messages didn't work.
        window.log.warn(
          `the update expiry of our tracked config hashes didn't work: ${JSON.stringify(lastResult)}`
        );
      }
    }

    // we rely on the code of the first one to check for online status
    const bodyFirstResult = firstResult.body;

    GetNetworkTime.handleTimestampOffsetFromNetwork('retrieve', bodyFirstResult.t);

    // merge results with their corresponding namespaces
    // NOTE: We don't want to sort messages here because the ordering depends on the snode and when it received each message.
    // The last_hash for that snode has to be the last one we've received from that same snode, otherwise we end up fetching the same messages over and over again.
    const toRet = namespacesAndLastHashes.map((n, index) => ({
      code: results[index].code,
      messages: results[index].body as RetrieveMessagesResultsContent,
      namespace: n.namespace,
    }));
    return toRet;
  } catch (e) {
    window?.log?.warn('exception while parsing json of nextMessage:', e);
    if (e.message === ERROR_CODE_NO_CONNECT || !navigator.onLine) {
      if (ReduxOnionSelectors.isOnlineOutsideRedux()) {
        window.inboxStore?.dispatch(updateIsOnline(false));
      }
    } else if (!ReduxOnionSelectors.isOnlineOutsideRedux()) {
      window.inboxStore?.dispatch(updateIsOnline(true));
    }

    throw new Error(
      `_retrieveNextMessages - exception while parsing json of nextMessage ${targetNode.ip}:${targetNode.port}: ${e?.message}`
    );
  }
}

export const SnodeAPIRetrieve = { retrieveNextMessagesNoRetries, buildRetrieveRequest };
