import { useState } from 'react';
import { useDispatch } from 'react-redux';
import styled from 'styled-components';
import { useMessageReactsPropsById } from '../../hooks/useParamSelector';
import { clearSogsReactionByServerId } from '../../session/apis/open_group_api/sogsv3/sogsV3ClearReaction';
import { ConvoHub } from '../../session/conversations';
import { updateReactClearAllModal } from '../../state/ducks/modalDialog';
import { SessionWrapperModal } from '../SessionWrapperModal';
import { Flex } from '../basic/Flex';
import { SessionButton, SessionButtonColor, SessionButtonType } from '../basic/SessionButton';
import { SessionSpinner } from '../loading';

type Props = {
  reaction: string;
  messageId: string;
};

const StyledButtonContainer = styled.div`
  div:first-child {
    margin-right: 0px;
  }
  div:not(:first-child) {
    margin-left: 20px;
  }
`;

const StyledReactClearAllContainer = styled(Flex)`
  margin: var(--margins-lg);

  .session-button {
    font-size: 16px;
    height: 36px;
    padding-top: 3px;
  }
`;

const StyledDescription = styled.div`
  font-size: var(--font-size-md);
  font-weight: 400;
  padding-bottom: var(--margins-lg);
  margin: var(--margins-md) auto;
`;

export const ReactClearAllModal = (props: Props) => {
  const { reaction, messageId } = props;

  const [clearingInProgress, setClearingInProgress] = useState(false);

  const dispatch = useDispatch();
  const msgProps = useMessageReactsPropsById(messageId);

  if (!msgProps) {
    return <></>;
  }

  const { convoId, serverId } = msgProps;
  const roomInfos = ConvoHub.use().get(convoId).toOpenGroupV2();

  const handleClose = () => {
    dispatch(updateReactClearAllModal(null));
  };

  const handleClearAll = async () => {
    if (roomInfos && serverId) {
      setClearingInProgress(true);
      await clearSogsReactionByServerId(reaction, serverId, roomInfos);
      setClearingInProgress(false);
      handleClose();
    } else {
      window.log.warn('Error for batch removal of', reaction, 'on message', messageId);
    }
  };

  return (
    <SessionWrapperModal
      additionalClassName={'reaction-list-modal'}
      showHeader={false}
      onClose={handleClose}
    >
      <StyledReactClearAllContainer
        $container={true}
        $flexDirection={'column'}
        $alignItems="center"
      >
        <StyledDescription>
          {window.i18n('emojiReactsClearAll', { emoji: reaction })}
        </StyledDescription>
        <StyledButtonContainer className="session-modal__button-group">
          <SessionButton
            text={window.i18n('clear')}
            buttonColor={SessionButtonColor.Danger}
            buttonType={SessionButtonType.Simple}
            onClick={handleClearAll}
            disabled={clearingInProgress}
          />
          <SessionButton
            text={window.i18n('cancel')}
            buttonType={SessionButtonType.Simple}
            onClick={handleClose}
            disabled={clearingInProgress}
          />
        </StyledButtonContainer>
        <SessionSpinner loading={clearingInProgress} />
      </StyledReactClearAllContainer>
    </SessionWrapperModal>
  );
};
