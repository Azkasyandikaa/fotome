import { PhotoEditor } from '../../components/PhotoEditor';
import { getTemplate } from '../../services/template';
import { requireSession } from '../../services/session';
import { navigate } from '../../app/router';
import { toast } from '../../components/toast';

/** /edit — guarded: without a live session there is nothing to edit. */
export function mountEditorPage(host: HTMLElement): () => void {
  const session = requireSession();
  const template = session ? getTemplate(session.templateId) : undefined;

  if (!session || !template) {
    toast('No photos to edit yet — take some first.', 'info');
    navigate('/capture');
    return () => undefined;
  }

  const editor = new PhotoEditor(host, template, session, {
    onFinished: () => undefined,
  });

  return () => {
    editor.destroy();
  };
}
