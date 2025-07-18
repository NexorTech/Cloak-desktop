/* eslint-disable consistent-return */
/* eslint-disable no-unused-expressions */
/* eslint-disable more/no-then */
/* eslint-disable no-loop-func */
/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-unreachable-loop */
/* eslint-disable no-restricted-syntax */

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { describe } from 'mocha';
import Sinon, * as sinon from 'sinon';

import { PubkeyType } from 'libsession_util_nodejs';
import { randombytes_buf } from 'libsodium-wrappers-sumo';
import { ContentMessage } from '../../../../session/messages/outgoing';
import { MessageSender } from '../../../../session/sending';
import { MessageQueueCl } from '../../../../session/sending/MessageQueue';
import { PubKey } from '../../../../session/types';
import { PromiseUtils, UserUtils } from '../../../../session/utils';
import { TestUtils } from '../../../test-utils';
import { PendingMessageCacheStub } from '../../../test-utils/stubs';

import { SnodeNamespaces } from '../../../../session/apis/snode_api/namespaces';
import { MessageSentHandler } from '../../../../session/sending/MessageSentHandler';
import { TypedStub, generateFakeSnode, stubData } from '../../../test-utils/utils';
import { MessageWrapper } from '../../../../session/sending/MessageWrapper';
import { SnodePool } from '../../../../session/apis/snode_api/snodePool';
import { BatchRequests } from '../../../../session/apis/snode_api/batchRequest';

chai.use(chaiAsPromised as any);
chai.should();

const { expect } = chai;

describe('MessageQueue', () => {
  // Initialize new stubbed cache
  const ourDevice = TestUtils.generateFakePubKey();
  const ourNumber = ourDevice.key as PubkeyType;

  // Initialize new stubbed queue
  let pendingMessageCache: PendingMessageCacheStub;
  let messageSentHandlerFailedStub: TypedStub<
    typeof MessageSentHandler,
    'handleSwarmMessageSentFailure'
  >;
  let messageSentHandlerSuccessStub: TypedStub<
    typeof MessageSentHandler,
    'handleSwarmMessageSentSuccess'
  >;
  let messageSentPublicHandlerSuccessStub: TypedStub<
    typeof MessageSentHandler,
    'handlePublicMessageSentSuccess'
  >;
  let handlePublicMessageSentFailureStub: TypedStub<
    typeof MessageSentHandler,
    'handlePublicMessageSentFailure'
  >;

  let messageQueueStub: MessageQueueCl;

  // Message Sender Stubs
  let sendStub: sinon.SinonStub;

  beforeEach(() => {
    // Utils Stubs
    Sinon.stub(UserUtils, 'getOurPubKeyStrFromCache').returns(ourNumber);

    // Message Sender Stubs
    sendStub = Sinon.stub(MessageSender, 'sendSingleMessage');
    messageSentHandlerFailedStub = Sinon.stub(
      MessageSentHandler,
      'handleSwarmMessageSentFailure'
    ).resolves();
    messageSentHandlerSuccessStub = Sinon.stub(
      MessageSentHandler,
      'handleSwarmMessageSentSuccess'
    ).resolves();
    messageSentPublicHandlerSuccessStub = Sinon.stub(
      MessageSentHandler,
      'handlePublicMessageSentSuccess'
    ).resolves();
    handlePublicMessageSentFailureStub = Sinon.stub(
      MessageSentHandler,
      'handlePublicMessageSentFailure'
    ).resolves();

    // Init Queue
    pendingMessageCache = new PendingMessageCacheStub();
    messageQueueStub = new MessageQueueCl(pendingMessageCache);
    TestUtils.stubWindowLog();
  });

  afterEach(() => {
    Sinon.restore();
  });

  describe('processPending', () => {
    it('will send messages', done => {
      const device = TestUtils.generateFakePubKey();

      const waitForMessageSentEvent = new Promise(resolve => {
        resolve(true);
        done();
      });

      void pendingMessageCache
        .add(device, TestUtils.generateVisibleMessage(), waitForMessageSentEvent as any)
        .then(async () => {
          return messageQueueStub.processPending(device);
        })
        .then(() => {
          expect(waitForMessageSentEvent).to.be.fulfilled;
        });
    });

    it('should remove message from cache', async () => {
      const events = ['sendSuccess', 'sendFail'];
      for (const event of events) {
        if (event === 'sendSuccess') {
          sendStub.resolves();
        } else {
          sendStub.throws(new Error('fail'));
        }

        const device = TestUtils.generateFakePubKey();
        await pendingMessageCache.add(
          device,
          TestUtils.generateVisibleMessage(),
          SnodeNamespaces.Default
        );

        const initialMessages = await pendingMessageCache.getForDevice(device);
        expect(initialMessages).to.have.length(1);
        await messageQueueStub.processPending(device);

        const promise = PromiseUtils.waitUntil(async () => {
          const messages = await pendingMessageCache.getForDevice(device);
          return messages.length === 0;
        }, 100);
        return promise.should.be.fulfilled;
      }
    }).timeout(15000);

    describe('events', () => {
      it('should send a success event if message was sent', done => {
        stubData('getMessageById').resolves();
        TestUtils.stubWindowLog();
        const message = TestUtils.generateVisibleMessage();

        sendStub.restore();
        const device = TestUtils.generateFakePubKey();
        stubData('saveSeenMessageHashes').resolves();
        Sinon.stub(MessageSender, 'getMinRetryTimeout').returns(10);
        Sinon.stub(MessageSender, 'destinationIsClosedGroup').returns(false);
        Sinon.stub(SnodePool, 'getNodeFromSwarmOrThrow').resolves(generateFakeSnode());
        Sinon.stub(BatchRequests, 'doUnsignedSnodeBatchRequestNoRetries').resolves([
          {
            body: { t: message.createAtNetworkTimestamp, hash: 'whatever', code: 200 },
            code: 200,
          },
        ]);
        Sinon.stub(MessageWrapper, 'encryptMessagesAndWrap').resolves([
          {
            encryptedAndWrappedData: randombytes_buf(100),
            identifier: message.identifier,
            isSyncMessage: false,
            namespace: SnodeNamespaces.Default,
            networkTimestamp: message.createAtNetworkTimestamp,
            plainTextBuffer: message.plainTextBuffer(),
            ttl: message.ttl(),
          },
        ]);
        const waitForMessageSentEvent = async () =>
          new Promise<void>(resolve => {
            resolve();
            try {
              expect(messageSentHandlerSuccessStub.callCount).to.be.equal(1);
              expect(messageSentHandlerSuccessStub.lastCall.args[0].identifier).to.be.equal(
                message.identifier
              );
              done();
            } catch (e) {
              console.warn('messageSentHandlerSuccessStub was not called, but should have been');
              done(e);
            }
          });

        void pendingMessageCache
          .add(device, message, SnodeNamespaces.Default, waitForMessageSentEvent)
          .then(() => messageQueueStub.processPending(device));
      });

      it('should send a fail event if something went wrong while sending', async () => {
        sendStub.throws(new Error('failure'));

        const device = TestUtils.generateFakePubKey();
        const message = TestUtils.generateVisibleMessage();
        void pendingMessageCache
          .add(device, message, SnodeNamespaces.Default)
          .then(() => messageQueueStub.processPending(device));
        // The cb is only invoke is all reties fails. Here we poll until the messageSentHandlerFailed was invoked as this is what we want to do

        return PromiseUtils.poll(
          done => {
            if (messageSentHandlerFailedStub.callCount === 1) {
              try {
                expect(messageSentHandlerFailedStub.callCount).to.be.equal(1);
                expect(messageSentHandlerFailedStub.lastCall.args[0].identifier).to.be.equal(
                  message.identifier
                );
                expect(messageSentHandlerFailedStub.lastCall.args[1].message).to.equal('failure');
                done();
              } catch (e) {
                done(e);
              }
            }
          },
          { interval: 5 }
        );
      });
    });
  });

  describe('sendToPubKey', () => {
    it('should send the message to the device', async () => {
      const device = TestUtils.generateFakePubKey();
      const stub = Sinon.stub(messageQueueStub as any, 'process').resolves();

      const message = TestUtils.generateVisibleMessage();
      await messageQueueStub.sendToPubKey(device, message, SnodeNamespaces.Default);

      const args = stub.lastCall.args as [Array<PubKey>, ContentMessage];
      expect(args[0]).to.be.equal(device);
      expect(args[1]).to.equal(message);
    });
  });

  describe('sendToOpenGroupV2', () => {
    let sendToOpenGroupV2Stub: sinon.SinonStub;
    beforeEach(() => {
      sendToOpenGroupV2Stub = Sinon.stub(MessageSender, 'sendToOpenGroupV2').resolves(
        TestUtils.generateOpenGroupMessageV2()
      );
    });

    it('can send to open group', async () => {
      const message = TestUtils.generateOpenGroupVisibleMessage();
      const roomInfos = TestUtils.generateOpenGroupV2RoomInfos();

      await messageQueueStub.sendToOpenGroupV2({
        message,
        roomInfos,
        blinded: false,
        filesToLink: [],
      });
      expect(sendToOpenGroupV2Stub.callCount).to.equal(1);
    });

    it('should emit a success event when send was successful', async () => {
      sendToOpenGroupV2Stub.resolves({
        serverId: 5125,
        sentTimestamp: 5127,
      });

      const message = TestUtils.generateOpenGroupVisibleMessage();
      const roomInfos = TestUtils.generateOpenGroupV2RoomInfos();
      await messageQueueStub.sendToOpenGroupV2({
        message,
        roomInfos,
        blinded: false,
        filesToLink: [],
      });

      expect(messageSentPublicHandlerSuccessStub.callCount).to.equal(1);
      expect(messageSentPublicHandlerSuccessStub.lastCall.args[0]).to.equal(message.identifier);
      expect(messageSentPublicHandlerSuccessStub.lastCall.args[1].serverId).to.equal(5125);
      expect(messageSentPublicHandlerSuccessStub.lastCall.args[1].serverTimestamp).to.equal(5127);
    });

    it('should emit a fail event if something went wrong', async () => {
      sendToOpenGroupV2Stub.resolves({ serverId: -1, serverTimestamp: -1 });
      stubData('getMessageById').resolves();
      const message = TestUtils.generateOpenGroupVisibleMessage();
      const roomInfos = TestUtils.generateOpenGroupV2RoomInfos();

      await messageQueueStub.sendToOpenGroupV2({
        message,
        roomInfos,
        blinded: false,
        filesToLink: [],
      });
      expect(handlePublicMessageSentFailureStub.callCount).to.equal(1);
      expect(handlePublicMessageSentFailureStub.lastCall.args[0].identifier).to.equal(
        message.identifier
      );
    });
  });
});
