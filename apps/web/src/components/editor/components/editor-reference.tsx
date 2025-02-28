import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LexicalEditor } from "lexical";

interface EditorReferenceProps {
  onChange: (editor: LexicalEditor) => void;
}

export function EditorReference({ onChange }: EditorReferenceProps) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    onChange(editor);
  }, [editor, onChange]);

  return null;
}
