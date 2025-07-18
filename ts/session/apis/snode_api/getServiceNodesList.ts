import { compact, intersectionWith, sampleSize } from 'lodash';
import { BatchRequests } from './batchRequest';
import { GetNetworkTime } from './getNetworkTime';
import { SnodePool } from './snodePool';
import { Snode } from '../../../data/types';
import { GetServiceNodesSubRequest } from './SnodeRequestTypes';
import { SnodePoolConstants } from './snodePoolConstants';
import { DURATION } from '../../constants';

/**
 * Returns a list of unique snodes got from the specified targetNode.
 * This function won't try to rebuild a path if at some point we don't have enough snodes.
 * This is exported for testing purpose only.
 */
async function getSnodePoolFromSnode(targetNode: Snode): Promise<Array<Snode>> {
  const subRequest = new GetServiceNodesSubRequest();

  const results = await BatchRequests.doUnsignedSnodeBatchRequestNoRetries({
    unsignedSubRequests: [subRequest],
    targetNode,
    timeoutMs: 10 * DURATION.SECONDS,
    associatedWith: null,
    allow401s: false,
    method: 'batch',
    abortSignal: null,
  });

  const firstResult = results[0];

  if (!firstResult || firstResult.code !== 200) {
    throw new Error('Invalid result');
  }

  try {
    const json = firstResult.body;

    if (!json || !json.result || !json.result.service_node_states?.length) {
      window?.log?.error('getSnodePoolFromSnode - invalid result from snode', firstResult);
      return [];
    }

    // NOTE Filter out nodes that have missing ip addresses since they are not valid or 0.0.0.0 nodes which haven't submitted uptime proofs
    const snodes: Array<Snode> = json.result.service_node_states
      .filter((snode: any) => snode.public_ip && snode.public_ip !== '0.0.0.0')
      .map((snode: any) => ({
        ip: snode.public_ip,
        port: snode.storage_port,
        pubkey_x25519: snode.pubkey_x25519,
        pubkey_ed25519: snode.pubkey_ed25519,
        storage_server_version: snode.storage_server_version,
      }));
    GetNetworkTime.handleTimestampOffsetFromNetwork('get_service_nodes', json.t);

    // we the return list by the snode is already made of uniq snodes
    return compact(snodes);
  } catch (e) {
    window?.log?.error('Invalid json response');
    return [];
  }
}

/**
 * Try to fetch from 3 different snodes an updated list of snodes.
 * If we get less than 24 common snodes in those result, we consider the request to failed and an exception is thrown.
 * The three snode we make the request to is randomized.
 * This function is to be called with a pRetry so that if one snode does not reply anything, another might be choose next time.
 * Return the list of nodes all snodes agreed on.
 */
async function getSnodePoolFromSnodes() {
  const existingSnodePool = await SnodePool.getSnodePoolFromDBOrFetchFromSeed();
  if (existingSnodePool.length <= SnodePoolConstants.minSnodePoolCount) {
    window?.log?.warn(
      'getSnodePoolFromSnodes: Cannot get snodes list from snodes; not enough snodes',
      existingSnodePool.length
    );
    throw new Error(
      `Cannot get snodes list from snodes; not enough snodes even after refetching from seed', ${existingSnodePool.length}`
    );
  }

  // Note intersectionWith only works with 3 at most array to find the common snodes.
  const nodesToRequest = sampleSize(existingSnodePool, 3);
  const results = await Promise.all(
    nodesToRequest.map(async node => {
      /**
       * this call is already retried if the snode does not reply
       * (at least when onion requests are enabled)
       * this request might want to rebuild a path if the snode length gets < minSnodePoolCount during the
       * retries, so we need to make sure this does not happen.
       *
       * Remember that here, we are trying to fetch from snodes the updated list of snodes to rebuild a path.
       * If we don't disable rebuilding a path below, this gets to a chicken and egg problem.
       */
      return ServiceNodesList.getSnodePoolFromSnode(node);
    })
  );

  // we want those at least `requiredSnodesForAgreement` snodes common between all the results
  const commonSnodes = intersectionWith(
    results[0],
    results[1],
    results[2],
    (s1: Snode, s2: Snode) => {
      return s1.ip === s2.ip && s1.port === s2.port;
    }
  );
  // We want the snodes to agree on at least this many snodes
  if (commonSnodes.length < SnodePoolConstants.requiredSnodesForAgreement) {
    throw new Error(
      `Inconsistent snode pools. We did not get at least ${SnodePoolConstants.requiredSnodesForAgreement} in common`
    );
  }
  return commonSnodes;
}

export const ServiceNodesList = { getSnodePoolFromSnode, getSnodePoolFromSnodes };
