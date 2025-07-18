import { AbortController } from 'abort-controller';

import { MessageSender } from '.';
import { OutgoingRawMessage, PubKey } from '../types';
import { JobQueue, MessageUtils, UserUtils } from '../utils';
import { PendingMessageCache } from './PendingMessageCache';

import { ContentMessage } from '../messages/outgoing';
import { ClosedGroupV2VisibleMessage } from '../messages/outgoing/visibleMessage/ClosedGroupVisibleMessage';
import { SyncMessageType } from '../utils/sync/syncUtils';
import { MessageSentHandler } from './MessageSentHandler';

import { OpenGroupMessageV2 } from '../apis/open_group_api/opengroupV2/OpenGroupMessageV2';
import { sendSogsReactionOnionV4 } from '../apis/open_group_api/sogsv3/sogsV3SendReaction';
import { SnodeNamespaces, SnodeNamespacesUser } from '../apis/snode_api/namespaces';
import { CallMessage } from '../messages/outgoing/controlMessage/CallMessage';
import { DataExtractionNotificationMessage } from '../messages/outgoing/controlMessage/DataExtractionNotificationMessage';
import { TypingMessage } from '../messages/outgoing/controlMessage/TypingMessage';
import { UnsendMessage } from '../messages/outgoing/controlMessage/UnsendMessage';
import { GroupUpdateDeleteMemberContentMessage } from '../messages/outgoing/controlMessage/group_v2/to_group/GroupUpdateDeleteMemberContentMessage';
import { GroupUpdateInfoChangeMessage } from '../messages/outgoing/controlMessage/group_v2/to_group/GroupUpdateInfoChangeMessage';
import { GroupUpdateMemberChangeMessage } from '../messages/outgoing/controlMessage/group_v2/to_group/GroupUpdateMemberChangeMessage';
import { GroupUpdateMemberLeftMessage } from '../messages/outgoing/controlMessage/group_v2/to_group/GroupUpdateMemberLeftMessage';
import { GroupUpdateInviteMessage } from '../messages/outgoing/controlMessage/group_v2/to_user/GroupUpdateInviteMessage';
import { GroupUpdatePromoteMessage } from '../messages/outgoing/controlMessage/group_v2/to_user/GroupUpdatePromoteMessage';
import { OpenGroupVisibleMessage } from '../messages/outgoing/visibleMessage/OpenGroupVisibleMessage';
import { OpenGroupRequestCommonType } from '../../data/types';

export class MessageQueueCl {
  private readonly jobQueues: Map<string, JobQueue> = new Map();
  private readonly pendingMessageCache: PendingMessageCache;

  constructor(cache?: PendingMessageCache) {
    this.pendingMessageCache = cache ?? new PendingMessageCache();
    void this.processAllPending();
  }

  public async sendToPubKey(
    destinationPubKey: PubKey,
    message: ContentMessage,
    namespace: SnodeNamespaces,
    sentCb?: (message: OutgoingRawMessage) => Promise<void>,
    isGroup = false
  ): Promise<void> {
    if ((message as any).syncTarget) {
      throw new Error('SyncMessage needs to be sent with sendSyncMessage');
    }
    await this.process(destinationPubKey, message, namespace, sentCb, isGroup);
  }

  /**
   * This function is synced. It will wait for the message to be delivered to the open
   * group to return.
   * So there is no need for a sendCb callback
   *
   *
   * fileIds is the array of ids this message is linked to. If we upload files as part of a message but do not link them with this, the files will be deleted much sooner
   */
  public async sendToOpenGroupV2({
    blinded,
    filesToLink,
    message,
    roomInfos,
  }: {
    message: OpenGroupVisibleMessage;
    roomInfos: OpenGroupRequestCommonType;
    blinded: boolean;
    filesToLink: Array<number>;
  }) {
    // Skipping the MessageQueue for Open Groups v2; the message is sent directly

    try {
      // NOTE Reactions are handled separately
      if (message.reaction) {
        await sendSogsReactionOnionV4(
          roomInfos.serverUrl,
          roomInfos.roomId,
          new AbortController().signal,
          message.reaction,
          blinded
        );
        return;
      }

      const result = await MessageSender.sendToOpenGroupV2(
        message,
        roomInfos,
        blinded,
        filesToLink
      );

      const { sentTimestamp, serverId } = result as OpenGroupMessageV2;
      if (!serverId || serverId === -1) {
        throw new Error(`Invalid serverId returned by server: ${serverId}`);
      }

      await MessageSentHandler.handlePublicMessageSentSuccess(message.identifier, {
        serverId,
        serverTimestamp: sentTimestamp,
      });
    } catch (e) {
      window?.log?.warn(
        `Failed to send message to open group: ${roomInfos.serverUrl}:${roomInfos.roomId}:`,
        e
      );
      await MessageSentHandler.handlePublicMessageSentFailure(
        message,
        e || new Error('Failed to send message to open group.')
      );
    }
  }

  public async sendToOpenGroupV2BlindedRequest({
    encryptedContent,
    message,
    recipientBlindedId,
    roomInfos,
  }: {
    encryptedContent: Uint8Array;
    roomInfos: OpenGroupRequestCommonType;
    message: OpenGroupVisibleMessage;
    recipientBlindedId: string;
  }) {
    try {
      // TODO we will need to add the support for blinded25 messages requests
      if (!PubKey.isBlinded(recipientBlindedId)) {
        throw new Error('sendToOpenGroupV2BlindedRequest needs a blindedId');
      }
      const { serverTimestamp, serverId } = await MessageSender.sendToOpenGroupV2BlindedRequest(
        encryptedContent,
        roomInfos,
        recipientBlindedId
      );
      if (!serverId || serverId === -1) {
        throw new Error(`Invalid serverId returned by server: ${serverId}`);
      }
      await MessageSentHandler.handlePublicMessageSentSuccess(message.identifier, {
        serverId,
        serverTimestamp,
      });
    } catch (e) {
      window?.log?.warn(
        `Failed to send message to open group: ${roomInfos.serverUrl}:${roomInfos.roomId}:`,
        e.message
      );
      await MessageSentHandler.handlePublicMessageSentFailure(
        message,
        e || new Error('Failed to send message to open group.')
      );
    }
  }

  public async sendToGroupV2({
    message,
    sentCb,
  }: {
    message:
      | ClosedGroupV2VisibleMessage
      | GroupUpdateMemberChangeMessage
      | GroupUpdateInfoChangeMessage
      | GroupUpdateDeleteMemberContentMessage
      | GroupUpdateMemberLeftMessage;
    sentCb?: (message: OutgoingRawMessage) => Promise<void>;
  }): Promise<void> {
    if (!message.destination) {
      throw new Error('Invalid group message passed in sendToGroupV2.');
    }

    return this.sendToPubKey(
      PubKey.cast(message.destination),
      message,
      message.namespace,
      sentCb,
      true
    );
  }

  public async sendToGroupV2NonDurably({
    message,
  }: {
    message:
      | ClosedGroupV2VisibleMessage
      | GroupUpdateMemberChangeMessage
      | GroupUpdateInfoChangeMessage
      | GroupUpdateDeleteMemberContentMessage
      | GroupUpdateMemberLeftMessage;
  }) {
    if (!message.destination || !PubKey.is03Pubkey(message.destination)) {
      throw new Error('Invalid group message passed in sendToGroupV2NonDurably.');
    }

    return this.sendToPubKeyNonDurably({
      message,
      namespace: message.namespace,
      pubkey: PubKey.cast(message.destination),
      isSyncMessage: false,
    });
  }

  public async sendSyncMessage({
    namespace,
    message,
    sentCb,
  }: {
    namespace: SnodeNamespacesUser;
    message?: SyncMessageType;
    sentCb?: (message: OutgoingRawMessage) => Promise<void>;
  }): Promise<void> {
    if (!message) {
      return;
    }
    if (!(message instanceof UnsendMessage) && !(message as any)?.syncTarget) {
      throw new Error('Invalid message given to sendSyncMessage');
    }

    const ourPubKey = UserUtils.getOurPubKeyStrFromCache();
    await this.process(PubKey.cast(ourPubKey), message, namespace, sentCb);
  }

  /**
   * Send a message to a 1o1 swarm
   * @param user user pub key to send to
   * @param message Message to be sent
   */
  public async sendTo1o1NonDurably({
    namespace,
    message,
    pubkey,
  }: {
    pubkey: PubKey;
    message:
      | TypingMessage // no point of caching the typing message, they are very short lived
      | DataExtractionNotificationMessage
      | CallMessage
      | GroupUpdateInviteMessage
      | GroupUpdatePromoteMessage;
    namespace: SnodeNamespaces.Default;
  }): Promise<number | null> {
    return this.sendToPubKeyNonDurably({ message, namespace, pubkey, isSyncMessage: false });
  }

  /**
   * Sends a message that awaits until the message is completed sending
   * @param user user pub key to send to
   * @param message Message to be sent
   */
  private async sendToPubKeyNonDurably({
    namespace,
    message,
    pubkey,
    isSyncMessage,
  }: {
    pubkey: PubKey;
    message: ContentMessage;
    namespace: SnodeNamespaces;
    isSyncMessage: boolean;
  }): Promise<number | null> {
    const rawMessage = await MessageUtils.toRawMessage(pubkey, message, namespace);
    return this.sendSingleMessageAndHandleResult({ rawMessage, isSyncMessage });
  }

  private async sendSingleMessageAndHandleResult({
    rawMessage,
    isSyncMessage,
  }: {
    rawMessage: OutgoingRawMessage;
    isSyncMessage: boolean;
  }) {
    const start = Date.now();

    try {
      const { effectiveTimestamp } = await MessageSender.sendSingleMessage({
        message: rawMessage,
        isSyncMessage,
        abortSignal: null,
      });
      window.log.debug(`sendSingleMessage took ${Date.now() - start}ms`);

      const cb = this.pendingMessageCache.callbacks.get(rawMessage.identifier);

      if (cb) {
        await cb(rawMessage);
      }
      this.pendingMessageCache.callbacks.delete(rawMessage.identifier);

      return effectiveTimestamp;
    } catch (error) {
      window.log.error(
        'sendSingleMessageAndHandleResult: failed to send message with: ',
        error.message
      );

      await MessageSentHandler.handleSwarmMessageSentFailure(
        { device: rawMessage.device, identifier: rawMessage.identifier },
        error
      );

      return null;
    } finally {
      // Remove from the cache because retrying is done in the sender
      void this.pendingMessageCache.remove(rawMessage);
    }
  }

  /**
   * processes pending jobs in the message sending queue.
   * @param device - target device to send to
   */
  public async processPending(device: PubKey, isSyncMessage: boolean = false) {
    const messages = await this.pendingMessageCache.getForDevice(device);

    const jobQueue = this.getJobQueue(device);
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    messages.forEach(async message => {
      const messageId = message.identifier;

      if (!jobQueue.has(messageId)) {
        // We put the event handling inside this job to avoid sending duplicate events
        const job = async () => {
          await this.sendSingleMessageAndHandleResult({ rawMessage: message, isSyncMessage });
        };
        await jobQueue.addWithId(messageId, job);
      }
    });
  }

  /**
   * This method should be called when the app is started and the user logged in to fetch
   * existing message waiting to be sent in the cache of message
   */
  public async processAllPending() {
    const devices = await this.pendingMessageCache.getDevices();
    const promises = devices.map(async device => this.processPending(device));

    return Promise.all(promises);
  }

  /**
   * This method should not be called directly. Only through sendToPubKey.
   */
  private async process(
    destinationPk: PubKey,
    message: ContentMessage,
    namespace: SnodeNamespaces,
    sentCb?: (message: OutgoingRawMessage) => Promise<void>,
    isGroup = false
  ): Promise<void> {
    // Don't send to ourselves
    let isSyncMessage = false;
    if (UserUtils.isUsFromCache(destinationPk)) {
      // We allow a message for ourselves only if it's a message with a syncTarget set.
      if (MessageSender.isContentSyncMessage(message)) {
        window?.log?.info('OutgoingMessageQueue: Processing sync message');
        isSyncMessage = true;
      } else {
        window?.log?.warn('Dropping message in process() to be sent to ourself');
        return;
      }
    }

    await this.pendingMessageCache.add(destinationPk, message, namespace, sentCb, isGroup);
    void this.processPending(destinationPk, isSyncMessage);
  }

  private getJobQueue(device: PubKey): JobQueue {
    let queue = this.jobQueues.get(device.key);
    if (!queue) {
      queue = new JobQueue();
      this.jobQueues.set(device.key, queue);
    }

    return queue;
  }
}

let messageQueueSingleton: MessageQueueCl;

function use(): MessageQueueCl {
  if (!messageQueueSingleton) {
    messageQueueSingleton = new MessageQueueCl();
  }
  return messageQueueSingleton;
}

export const MessageQueue = {
  use,
};
