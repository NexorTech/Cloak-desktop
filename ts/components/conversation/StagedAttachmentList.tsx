import { useDispatch } from 'react-redux';
import styled from 'styled-components';
import {
  removeAllStagedAttachmentsInConversation,
  removeStagedAttachmentInConversation,
} from '../../state/ducks/stagedAttachments';
import { useSelectedConversationKey } from '../../state/selectors/selectedConversation';
import {
  AttachmentType,
  areAllAttachmentsVisual,
  getUrl,
  isVideoAttachment,
} from '../../types/Attachment';
import { isImageTypeSupported, isVideoTypeSupported } from '../../util/GoogleChrome';
import { Image } from './Image';
import { StagedGenericAttachment } from './StagedGenericAttachment';
import { StagedPlaceholderAttachment } from './StagedPlaceholderAttachment';
import { AriaLabels } from '../../util/hardcodedAriaLabels';
import { LUCIDE_ICONS_UNICODE } from '../icon/lucide';
import { SessionLucideIconButton } from '../icon/SessionIconButton';

type Props = {
  attachments: Array<AttachmentType>;
  onClickAttachment: (attachment: AttachmentType) => void;
  onAddAttachment: () => void;
};

const IMAGE_WIDTH = 120;
const IMAGE_HEIGHT = 120;

const StyledRail = styled.div`
  margin-top: 12px;
  margin-inline-start: 16px;
  padding-inline-end: 16px;
  overflow-x: auto;
  max-height: 142px;
  white-space: nowrap;
  overflow-y: hidden;
  margin-bottom: 6px;
`;

export const StagedAttachmentList = (props: Props) => {
  const { attachments, onAddAttachment, onClickAttachment } = props;

  const dispatch = useDispatch();
  const conversationKey = useSelectedConversationKey();

  const onRemoveAllStaged = () => {
    if (!conversationKey) {
      return;
    }
    dispatch(removeAllStagedAttachmentsInConversation({ conversationId: conversationKey }));
  };

  const onRemoveByFilename = (filename: string) => {
    if (!conversationKey) {
      return;
    }
    dispatch(removeStagedAttachmentInConversation({ conversationKey, filename }));
  };

  if (!attachments.length) {
    return null;
  }

  const allVisualAttachments = areAllAttachmentsVisual(attachments);

  return (
    <div className="module-attachments">
      {attachments.length > 1 ? (
        <div className="module-attachments__header">
          <SessionLucideIconButton
            iconSize="huge"
            iconColor="var(--text-primary-color)"
            unicode={LUCIDE_ICONS_UNICODE.X}
            onClick={onRemoveAllStaged}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              zIndex: 1,
            }}
          />
        </div>
      ) : null}
      <StyledRail>
        {(attachments || []).map((attachment, index) => {
          const { contentType } = attachment;
          if (isImageTypeSupported(contentType) || isVideoTypeSupported(contentType)) {
            const imageKey = getUrl(attachment) || attachment.fileName || index;
            const clickCallback = attachments.length > 1 ? onClickAttachment : undefined;

            return (
              <Image
                key={imageKey}
                alt={AriaLabels.stagedAttachment}
                attachment={attachment}
                softCorners={true}
                playIconOverlay={isVideoAttachment(attachment)}
                height={IMAGE_HEIGHT}
                width={IMAGE_WIDTH}
                forceSquare={true}
                url={getUrl(attachment)}
                closeButton={true}
                onClick={clickCallback}
                onClickClose={() => {
                  onRemoveByFilename(attachment.fileName);
                }}
              />
            );
          }

          const genericKey = getUrl(attachment) || attachment.fileName || index;

          return (
            <StagedGenericAttachment
              key={genericKey}
              attachment={attachment}
              onClose={() => {
                onRemoveByFilename(attachment.fileName);
              }}
            />
          );
        })}
        {allVisualAttachments ? <StagedPlaceholderAttachment onClick={onAddAttachment} /> : null}
      </StyledRail>
    </div>
  );
};
