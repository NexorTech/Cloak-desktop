import { expect } from 'chai';

import Sinon from 'sinon';
import { ConversationModel } from '../../../../models/conversation';
import { CONVERSATION_PRIORITIES, ConversationTypeEnum } from '../../../../models/types';
import { UserUtils } from '../../../../session/utils';
import { SessionUtilUserGroups } from '../../../../session/utils/libsession/libsession_utils_user_groups';
import { TestUtils } from '../../../test-utils';

describe('libsession_groups', () => {
  describe('filter user groups for wrapper', () => {
    const ourNumber = '051234567890acbdef';
    const validArgs = {
      id: 'http://example.org/roomId1234',
      type: ConversationTypeEnum.GROUP,
      active_at: 1234,
    };
    beforeEach(() => {
      Sinon.stub(UserUtils, 'getOurPubKeyStrFromCache').returns(ourNumber);
    });
    afterEach(() => {
      Sinon.restore();
    });

    describe('communities', () => {
      it('includes public group/community', () => {
        expect(
          SessionUtilUserGroups.isUserGroupToStoreInWrapper(
            new ConversationModel({ ...validArgs } as any)
          )
        ).to.be.eq(true);
      });

      it('excludes public group/community inactive', () => {
        expect(
          SessionUtilUserGroups.isUserGroupToStoreInWrapper(
            new ConversationModel({ ...validArgs, active_at: undefined } as any)
          )
        ).to.be.eq(false);
      });
    });

    describe('legacy closed groups', () => {
      const validLegacyGroupArgs = {
        ...validArgs,
        type: ConversationTypeEnum.GROUP,
        id: TestUtils.generateFakePubKeyStr(),
      } as any;

      it('includes legacy group', () => {
        expect(
          SessionUtilUserGroups.isUserGroupToStoreInWrapper(
            new ConversationModel({
              ...validLegacyGroupArgs,
            })
          )
        ).to.be.eq(true);
      });

      it('exclude legacy group left', () => {
        // we cannot have a left group anymore. It's removed entirely when we leave it
      });
      it('exclude legacy group kicked', () => {
        expect(
          SessionUtilUserGroups.isUserGroupToStoreInWrapper(
            new ConversationModel({
              ...validLegacyGroupArgs,
              isKickedFromGroup: true,
            })
          )
        ).to.be.eq(false);
      });

      it('exclude legacy group not active', () => {
        expect(
          SessionUtilUserGroups.isUserGroupToStoreInWrapper(
            new ConversationModel({
              ...validLegacyGroupArgs,
              active_at: undefined,
            })
          )
        ).to.be.eq(false);
      });

      it('include hidden legacy group', () => {
        expect(
          SessionUtilUserGroups.isUserGroupToStoreInWrapper(
            new ConversationModel({
              ...validLegacyGroupArgs,
              priority: CONVERSATION_PRIORITIES.hidden,
            })
          )
        ).to.be.eq(true);
      });
    });

    it('excludes closed group v3 (for now)', () => {
      expect(
        SessionUtilUserGroups.isUserGroupToStoreInWrapper(
          new ConversationModel({
            ...validArgs,
            type: ConversationTypeEnum.GROUPV2,
            id: '03123456564',
          } as any)
        )
      ).to.be.eq(false);
    });

    it('excludes empty id', () => {
      expect(
        SessionUtilUserGroups.isUserGroupToStoreInWrapper(
          new ConversationModel({
            ...validArgs,
            id: '',
          } as any)
        )
      ).to.be.eq(false);

      expect(
        SessionUtilUserGroups.isUserGroupToStoreInWrapper(
          new ConversationModel({
            ...validArgs,
            id: '9871',
          } as any)
        )
      ).to.be.eq(false);
    });

    it('excludes private', () => {
      expect(
        SessionUtilUserGroups.isUserGroupToStoreInWrapper(
          new ConversationModel({
            ...validArgs,
            id: '0511111',
            type: ConversationTypeEnum.PRIVATE,
          } as any)
        )
      ).to.be.eq(false);
    });
  });
});
